'''
CloudFormation stack definition
'''


from aws_cdk import (
    Stack,
    Duration,
    aws_lambda as _lambda,
    aws_apigateway as apigw,
    aws_ec2 as ec2,
    aws_rds as rds,
    RemovalPolicy,
    custom_resources as cr,
    BundlingOptions,
    aws_iam as iam,
    aws_s3 as s3,
    aws_sagemaker as sagemaker,
    aws_s3_assets as s3_assets,
)
from constructs import Construct
import os
import subprocess
import platform
import tarfile
import tempfile
import shutil

class CdkStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)
        default_vpc = ec2.Vpc.from_lookup(self, "DefaultVPC", is_default=True)

        # Path to the Kotlin backend project
        this_dir = os.path.dirname(__file__)
        backend_dir = os.path.join(this_dir, "..", "backend")
        jar_name = "kotlin_app-1.0-all.jar"
        local_jar_path = os.path.join(backend_dir, "build", "libs", jar_name)

        # Try local build first
        build_succeeded = False
        is_windows = platform.system() == "Windows"
        gradle_script = "gradlew.bat" if is_windows else "gradlew"
        script_path = os.path.join(backend_dir, gradle_script)

        # Only attempt local build if the wrapper exists
        if os.path.exists(script_path):
            print(f"⚡ Attempting local build with {gradle_script}...")
            
            # Fix permissions on Mac/Linux
            if not is_windows:
                try:
                    os.chmod(script_path, 0o755)
                except OSError:
                    pass

            try:
                # Run the build
                subprocess.run(
                    [script_path, "shadowJar", "--no-daemon"], 
                    cwd=backend_dir,
                    check=True,
                    shell=is_windows
                )
                print("✅ Local build successful! Using local JAR.")
                build_succeeded = True
            except subprocess.CalledProcessError:
                print("⚠️ Local build failed. Switching to Docker bundling...")
        else:
            print("⚠️ Gradle wrapper not found. Switching to Docker bundling...")

        # Define the code asset based on build result
        if build_succeeded and os.path.exists(local_jar_path):
            code_asset = _lambda.Code.from_asset(local_jar_path)
        else:
            # Build with docker if local build failed
            print("🐳 Using Docker for deployment...")
            code_asset = _lambda.Code.from_asset(
                path=backend_dir,
                bundling=BundlingOptions(
                    image=_lambda.Runtime.JAVA_21.bundling_image,
                    user="root",
                    command=[
                        "/bin/sh", "-c", 
                        f"chmod +x gradlew && ./gradlew shadowJar && cp build/libs/{jar_name} /asset-output/"
                    ]
                )
            )

        # Define the Backend Lambda function
        backend_handler = _lambda.Function(
            self, "BackendHandler",
            runtime=_lambda.Runtime.JAVA_21,
            handler="com.handler.Handler", 
            code=code_asset,  # Uses either the local JAR or the Docker builder
            memory_size=1024, 
            timeout=Duration.seconds(15),
            snap_start=_lambda.SnapStartConf.ON_PUBLISHED_VERSIONS,
        )

        # Define the API Gateway REST API
        api = apigw.LambdaRestApi(
            self, "APIEndpoint",
            handler=backend_handler,
            proxy=False 
        )

        items = api.root.add_resource("items")
        items.add_method("GET")

        # Define RDS Resource
        db_instance = rds.DatabaseInstance(
            self, "StrideDB",
            engine=rds.DatabaseInstanceEngine.postgres(
                version=rds.PostgresEngineVersion.VER_16_3
            ),
            vpc=default_vpc,  # Mandatory, but now using the free default one
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
            instance_type=ec2.InstanceType.of(
                ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO
            ),
            allocated_storage=20,
            max_allocated_storage=50, # Autoscaling storage
            database_name="StrideCore",
            publicly_accessible=True, # Allows Lambda to connect via standard internet
            removal_policy=RemovalPolicy.DESTROY, # For dev/testing only
        )

        db_instance.connections.allow_from_any_ipv4(ec2.Port.tcp(5432), "Allow public access for Lambda")

        # --- BENCHMARKING INFRASTRUCTURE ---
        
        # 1. S3 Bucket for models (The Warehouse)
        model_bucket = s3.Bucket(
            self, "YoloModelBucket",
            versioned=True,
            removal_policy=RemovalPolicy.DESTROY, 
            auto_delete_objects=True
        )

        # 2. IAM Role for SageMaker (The Security Badge)
        sagemaker_role = iam.Role(
            self, "SageMakerExecutionRole",
            assumed_by=iam.ServicePrincipal("sagemaker.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name("AmazonSageMakerFullAccess"),
                iam.ManagedPolicy.from_aws_managed_policy_name("AmazonS3ReadOnlyAccess"),
                iam.ManagedPolicy.from_aws_managed_policy_name("CloudWatchLogsFullAccess"),
            ]
        )

        # 3. Model Definitions (The Recipe + Hardware)
        # Using ml.m5.large real-time endpoints for benchmarking
        # Each model includes the weights file to bundle (standard CV deployment pattern)
        models_to_benchmark = [
            {"name": "yolov11-nano", "instance": "ml.m5.large", "weights_url": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt", "weights_file": "yolo11n.pt"},
            {"name": "yolo-nas", "instance": "ml.m5.large", "weights_url": "https://sghub.deci.ai/models/yolo_nas_s_coco.pth", "weights_file": "yolo_nas_s_coco.pth"},
            {"name": "yolo-realtime", "instance": "ml.m5.large", "weights_url": "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11s.pt", "weights_file": "yolo11s.pt"},
        ]

        # Standard PyTorch Inference Image (for us-east-1)
        image_uri = "763104351884.dkr.ecr.us-east-1.amazonaws.com/pytorch-inference:2.1.0-cpu-py310-ubuntu20.04-sagemaker"

        # Create model.tar.gz files for each model and upload to S3
        benchmarking_dir = os.path.join(this_dir, "..", "benchmarking")
        
        # Cache directory for downloaded weights (reuse across deploys)
        weights_cache_dir = os.path.join(benchmarking_dir, ".weights_cache")
        os.makedirs(weights_cache_dir, exist_ok=True)
        
        for model_info in models_to_benchmark:
            m_name = model_info["name"]
            m_instance = model_info["instance"]
            weights_url = model_info["weights_url"]
            weights_file = model_info["weights_file"]

            # Create a temporary directory to build the model artifact
            temp_dir = tempfile.mkdtemp()
            code_dir = os.path.join(temp_dir, "code")
            os.makedirs(code_dir)
            
            # Copy inference.py to the code directory
            shutil.copy(
                os.path.join(benchmarking_dir, "inference.py"),
                os.path.join(code_dir, "inference.py")
            )
            
            # Copy requirements.txt to the code directory
            shutil.copy(
                os.path.join(benchmarking_dir, "requirements.txt"),
                os.path.join(code_dir, "requirements.txt")
            )
            
            # Download and bundle model weights (the standard approach for CV models)
            weights_bundled = False
            if weights_url and weights_file:
                cached_weights = os.path.join(weights_cache_dir, weights_file)
                
                # Download if not already cached
                if not os.path.exists(cached_weights):
                    print(f"📥 Downloading {weights_file} for {m_name}...")
                    try:
                        import urllib.request
                        urllib.request.urlretrieve(weights_url, cached_weights)
                        print(f"✅ Downloaded {weights_file} ({os.path.getsize(cached_weights) / 1024 / 1024:.1f} MB)")
                        weights_bundled = True
                    except Exception as e:
                        print(f"⚠️  Failed to download {weights_file}: {e}")
                        print(f"   Container will attempt to download at runtime")
                        # Remove partial download if any
                        if os.path.exists(cached_weights):
                            os.remove(cached_weights)
                else:
                    print(f"📦 Using cached {weights_file} for {m_name}")
                    weights_bundled = True
                
                # Copy weights to temp_dir root (will be at /opt/ml/model/ after extraction)
                if weights_bundled:
                    shutil.copy(cached_weights, os.path.join(temp_dir, weights_file))
            
            # Create the model.tar.gz file with both code/ and weights at root
            tar_path = os.path.join(temp_dir, "model.tar.gz")
            with tarfile.open(tar_path, "w:gz") as tar:
                tar.add(code_dir, arcname="code")
                # Add weights file at root level if it was successfully downloaded
                if weights_bundled and weights_file:
                    weights_path = os.path.join(temp_dir, weights_file)
                    if os.path.exists(weights_path):
                        tar.add(weights_path, arcname=weights_file)
                        print(f"   📦 Bundled {weights_file} into model.tar.gz")
            
            # Upload the model artifact using S3 Asset
            model_asset = s3_assets.Asset(
                self, f"ModelAsset-{m_name}",
                path=tar_path
            )

            # Define the SageMaker Model
            sm_model = sagemaker.CfnModel(
                self, f"Model-{m_name}",
                execution_role_arn=sagemaker_role.role_arn,
                primary_container=sagemaker.CfnModel.ContainerDefinitionProperty(
                    image=image_uri,
                    model_data_url=model_asset.s3_object_url,
                    environment={
                        "MODEL_TYPE": m_name,
                        "SAGEMAKER_PROGRAM": "inference.py",
                        "SAGEMAKER_SUBMIT_DIRECTORY": "/opt/ml/model/code"
                    }
                )
            )
            
            # Grant SageMaker role access to read the model artifact
            model_asset.grant_read(sagemaker_role)

            # Define the Endpoint Config with real-time instances
            sm_config = sagemaker.CfnEndpointConfig(
                self, f"Config-{m_name}",
                production_variants=[
                    sagemaker.CfnEndpointConfig.ProductionVariantProperty(
                        initial_instance_count=1,
                        instance_type=m_instance,
                        model_name=sm_model.attr_model_name,
                        variant_name="AllTraffic"
                    )
                ]
            )

            # Define the Endpoint (The Front Door)
            sagemaker.CfnEndpoint(
                self, f"Endpoint-{m_name}",
                endpoint_config_name=sm_config.attr_endpoint_config_name,
                endpoint_name=f"benchmark-{m_name}"
            )

        # Define the lambda to initialize the DB schema
        schema_lambda = _lambda.Function(
            self, "SchemaInitializer",
            runtime=_lambda.Runtime.PYTHON_3_9,
            handler="handler.handler",
            code=_lambda.Code.from_asset("schema_initializer"),
            timeout=Duration.seconds(30),
            environment={
                # Retrieve connection details from the secret
                "DB_SECRET_ARN": db_instance.secret.secret_arn
            }
        )  
        db_instance.secret.grant_read(schema_lambda)

        # Trigger the schema initialization during deployment
        invoke_schema_lambda = cr.AwsSdkCall(
            service="Lambda",
            action="invoke",
            parameters={
                "FunctionName": schema_lambda.function_name
            },
            physical_resource_id=cr.PhysicalResourceId.of("SchemaInit_Update")
        )
        cr.AwsCustomResource(
            self, "InitDBSchema",
            on_create=invoke_schema_lambda,
            on_update=invoke_schema_lambda,
            policy=cr.AwsCustomResourcePolicy.from_statements([
                iam.PolicyStatement(
                    actions=["lambda:InvokeFunction"],
                    resources=[schema_lambda.function_arn]
                )
            ])
        )

