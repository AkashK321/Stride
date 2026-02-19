'''
CloudFormation stack definition
'''

from time import time
from aws_cdk import (
    Stack,
    Duration,
    CfnOutput,
    aws_lambda as _lambda,
    aws_apigateway as apigw,
    aws_apigatewayv2 as apigw_v2,
    aws_apigatewayv2_integrations as integrations,
    aws_ec2 as ec2,
    aws_rds as rds,
    aws_dynamodb as ddb,
    RemovalPolicy,
    aws_cognito as cognito,
    custom_resources as cr,
    BundlingOptions,
    aws_iam as iam,
    CustomResource,
    aws_ecr as ecr,
    aws_sagemaker as sagemaker,
)
from constructs import Construct
import os
import subprocess
import platform

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

        # Define the Authentication Lambda function
        auth_handler = _lambda.Function(
            self, "AuthHandler",
            runtime=_lambda.Runtime.JAVA_21,
            handler="com.handlers.AuthHandler",
            code=code_asset,  # Uses either the local JAR or the Docker builder
            memory_size=1024,
            timeout=Duration.seconds(15),
            snap_start=_lambda.SnapStartConf.ON_PUBLISHED_VERSIONS,
        )

        # Define the Object Detection Lambda function
        object_detection_handler = _lambda.Function(
            self, "ObjectDetectionHandler",
            runtime=_lambda.Runtime.JAVA_21,
            handler="com.handlers.ObjectDetectionHandler",
            code=code_asset,  # Uses either the local JAR or the Docker builder
            memory_size=3008,
            timeout=Duration.seconds(29),  # Match API Gateway WebSocket timeout (29s max)
            snap_start=_lambda.SnapStartConf.ON_PUBLISHED_VERSIONS,
        )

        # Define Cognito User Pool
        user_pool = cognito.UserPool(
            self, "StrideUserPool",
            user_pool_name="stride-users",
            sign_in_aliases=cognito.SignInAliases(
                username=True,
                email=True,
            ),
            auto_verify=cognito.AutoVerifiedAttrs(email=True),
            password_policy=cognito.PasswordPolicy(
                min_length=8,
                require_lowercase=True,
                require_uppercase=True,
                require_digits=True,
                require_symbols=True
            ),
            removal_policy=RemovalPolicy.DESTROY,  # For dev/testing only
        )

        # Define Cognito User Pool Client (for app authentication)
        user_pool_client = user_pool.add_client(
            "StrideUserPoolClient",
            user_pool_client_name="stride-app-client",
            generate_secret=False,  # Set to True if you need a client secret
            auth_flows=cognito.AuthFlow(
                user_password=True,
                user_srp=True
            )
        )

        # Grant Lambda permissions to interact with Cognito
        user_pool.grant(
            auth_handler,
            "cognito-idp:AdminInitiateAuth",
            "cognito-idp:AdminGetUser",
            "cognito-idp:AdminCreateUser",
            "cognito-idp:AdminSetUserPassword",
            "cognito-idp:AdminDeleteUser",  # For cleanup on registration failure
            "cognito-idp:ListUsers"  # For checking duplicate email/phone
        )

        # Add Cognito configuration to Lambda environment
        auth_handler.add_environment("USER_POOL_ID", user_pool.user_pool_id)
        auth_handler.add_environment("USER_POOL_CLIENT_ID", user_pool_client.user_pool_client_id)

        # # ========================================
        # # SageMaker Resources for YOLOv11
        # # ========================================

        # # ECR Repository for YOLOv11 inference container
        # # The ECR repository is created separately by GitHub Actions workflow (build-sagemaker-image.yaml)
        # # Here we just reference it by name
        # ecr_repo_name = "stride-yolov11-inference"

        # # Reference the ECR repository by name (created by GitHub Actions or manually)
        # # This avoids CloudFormation trying to create/manage the repository
        # ecr_repo = ecr.Repository.from_repository_name(
        #     self, "YoloV11InferenceRepo",
        #     repository_name=ecr_repo_name
        # )

        # # Note: The ECR repository must exist before deploying this stack
        # # Run the "Build and Push SageMaker Docker Image" GitHub Action first

        # # Create IAM Role for SageMaker Endpoint
        # sagemaker_role = iam.Role(
        #     self, "SageMakerExecutionRole",
        #     assumed_by=iam.ServicePrincipal("sagemaker.amazonaws.com"),
        #     managed_policies=[
        #         iam.ManagedPolicy.from_aws_managed_policy_name("AmazonSageMakerFullAccess")
        #     ]
        # )

        # # Grant SageMaker role permission to pull from ECR
        # ecr_repo.grant_pull(sagemaker_role)

        # # Get AWS account and region for ECR image URI
        # account = Stack.of(self).account
        # region = Stack.of(self).region

        # # Construct ECR image URI (will be populated after docker build/push)
        # ecr_image_uri = f"{account}.dkr.ecr.{region}.amazonaws.com/{ecr_repo.repository_name}:latest"

        # # Create SageMaker Model
        # sagemaker_model = sagemaker.CfnModel(
        #     self, "YoloV11Model",
        #     execution_role_arn=sagemaker_role.role_arn,
        #     model_name="stride-yolov11-nano-model",
        #     primary_container=sagemaker.CfnModel.ContainerDefinitionProperty(
        #         image=ecr_image_uri,
        #         mode="SingleModel"
        #         # Note: No ModelDataUrl needed - model weights are baked into the container
        #     )
        # )

        # # Create SageMaker Endpoint Configuration
        # endpoint_config = sagemaker.CfnEndpointConfig(
        #     self, "YoloV11EndpointConfig",
        #     endpoint_config_name="stride-yolov11-nano-config",
        #     production_variants=[
        #         sagemaker.CfnEndpointConfig.ProductionVariantProperty(
        #             variant_name="AllTraffic",
        #             model_name=sagemaker_model.model_name,
        #             initial_instance_count=1,
        #             instance_type="ml.g4dn.xlarge",  # GPU instance
        #             initial_variant_weight=1.0
        #         )
        #     ]
        # )
        # endpoint_config.add_dependency(sagemaker_model)

        # # Create SageMaker Endpoint
        # sagemaker_endpoint = sagemaker.CfnEndpoint(
        #     self, "YoloV11Endpoint",
        #     endpoint_name="stride-yolov11-nano-endpoint",
        #     endpoint_config_name=endpoint_config.endpoint_config_name
        # )
        # sagemaker_endpoint.add_dependency(endpoint_config)

        # # Grant Lambda permission to invoke SageMaker endpoint
        # object_detection_handler.add_to_role_policy(
        #     iam.PolicyStatement(
        #         effect=iam.Effect.ALLOW,
        #         actions=["sagemaker:InvokeEndpoint"],
        #         resources=[
        #             f"arn:aws:sagemaker:{region}:{account}:endpoint/{sagemaker_endpoint.endpoint_name}"
        #         ]
        #     )
        # )

        # # Add environment variables to Lambda for SageMaker endpoint
        # object_detection_handler.add_environment(
        #     "SAGEMAKER_ENDPOINT_NAME",
        #     sagemaker_endpoint.endpoint_name
        # )
        # object_detection_handler.add_environment(
        #     "AWS_REGION_SAGEMAKER",
        #     region
        # )

        # Define the API Gateway REST API
        api = apigw.LambdaRestApi(
            self, "BusinessApi",
            handler=auth_handler,
            proxy=False
        )

        items = api.root.add_resource("items")
        items.add_method("GET")

        login = api.root.add_resource("login")
        login.add_method("POST", integration=apigw.LambdaIntegration(auth_handler))

        register = api.root.add_resource("register")
        register.add_method("POST", integration=apigw.LambdaIntegration(auth_handler))

        # Define the API Gateway WebSocket API
        ws_api = apigw_v2.WebSocketApi(self, "StreamAPI")
        # Create a Stage (required for WebSockets)
        apigw_v2.WebSocketStage(self, "ProdStage",
            web_socket_api=ws_api,
            stage_name="prod",
            auto_deploy=True
        )
        # Add Routes
        # $connect and $disconnect are special AWS routes
        # TODO: uncomment below route definition with auth is ready
        # ws_api.add_route(
        #     route_key="$connect",
        #     integration=integrations.WebSocketLambdaIntegration("ConnectIntegration", auth_handler)
        # )
        # "frame" is the custom route for sending video frames
        ws_api.add_route(
            route_key="frame",
            integration=integrations.WebSocketLambdaIntegration("FrameIntegration", object_detection_handler)
        )
        # Add $default route to catch unmatched messages (for debugging)
        ws_api.add_route(
            route_key="$default",
            integration=integrations.WebSocketLambdaIntegration("DefaultIntegration", object_detection_handler)
        )
        ws_api.grant_manage_connections(object_detection_handler)

        # Add stack outputs for reporting to CICD
        CfnOutput(self, "RestAPIEndpointURL",
            value=api.url,
            description="API Gateway endpoint URL"
        )

        CfnOutput(self, "WebSocketURL",
            value=ws_api.api_endpoint,
            description="The WSS URL for Object Detection"
        )

        CfnOutput(self, "StackName",
            value=self.stack_name,
            description="Stack name used for this deployment"
        )

        # # SageMaker Outputs
        # CfnOutput(self, "ECRRepositoryURI",
        #     value=ecr_repo.repository_uri,
        #     description="ECR repository URI for YOLOv11 inference container"
        # )

        # CfnOutput(self, "SageMakerEndpointName",
        #     value=sagemaker_endpoint.endpoint_name,
        #     description="SageMaker endpoint name for YOLOv11 inference"
        # )

        # CfnOutput(self, "SageMakerEndpointArn",
        #     value=f"arn:aws:sagemaker:{region}:{account}:endpoint/{sagemaker_endpoint.endpoint_name}",
        #     description="SageMaker endpoint ARN"
        # )

        # Setup DynamoDB Table to map Object Avg Heights for distance estimation
        coco_config_table = ddb.Table(
            self, "CocoConfigTable",
            partition_key=ddb.Attribute(
                name="class_id",
                type=ddb.AttributeType.NUMBER
            ),
            removal_policy=RemovalPolicy.DESTROY, # For dev/testing
            billing_mode=ddb.BillingMode.PAY_PER_REQUEST
        )

        coco_config_table.grant_read_data(object_detection_handler)
        object_detection_handler.add_environment("HEIGHT_MAP_TABLE_NAME", coco_config_table.table_name)

        init_coco_config = _lambda.Function(
            self, "ObjDetectionConfigLambda",
            runtime=_lambda.Runtime.PYTHON_3_10,
            handler="populate_obj_ddb.handler",
            code=_lambda.Code.from_asset("schema_initializer"),
            timeout=Duration.seconds(30),
            environment={
                "TABLE_NAME": coco_config_table.table_name
            }
        )

        coco_config_table.grant_write_data(init_coco_config)

        CustomResource(
            self, "TriggerCOCOConfigInit",
            service_token=init_coco_config.function_arn,
            properties={
                "RunOnDeploy": str(time())
            }
        )

        # Setup DynamoDB Table for manual feature flags (e.g. to toggle object detection on/off without redeploying)
        feature_flags_table = ddb.Table(
            self, "FeatureFlagsTable",
            partition_key=ddb.Attribute(
                name="feature_name",
                type=ddb.AttributeType.STRING
            ),
            # RETAIN = If you delete the stack, this table (and its manual flags) 
            # will stay in AWS so you don't lose your settings.
            removal_policy=RemovalPolicy.RETAIN, 
            billing_mode=ddb.BillingMode.PAY_PER_REQUEST
        )

        CfnOutput(
            self, "FeatureFlagsTableName",
            value=feature_flags_table.table_name,
            description="Table for manual feature toggles"
        )

        feature_flags_table.grant_read_data(object_detection_handler)
        object_detection_handler.add_environment("FEATURE_FLAGS_TABLE_NAME", feature_flags_table.table_name)

        CfnOutput(self, "UserPoolId",
            value=user_pool.user_pool_id,
            description="Cognito User Pool ID"
        )

        CfnOutput(self, "UserPoolClientId",
            value=user_pool_client.user_pool_client_id,
            description="Cognito User Pool Client ID"
        )

        # TODO: RDS setup disabled for now - to be re-enabled when ready
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

        # Define the lambda to initialize the DB schema
        schema_lambda = _lambda.Function(
            self, "SchemaInitializer",
            runtime=_lambda.Runtime.PYTHON_3_9,
            handler="populate_rds.handler",
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

