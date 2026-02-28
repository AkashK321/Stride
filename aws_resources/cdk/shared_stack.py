"""
Persistent shared infrastructure stack.
"""

from aws_cdk import (
    BundlingOptions,
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
    aws_ec2 as ec2,
    aws_ecr as ecr,
    aws_iam as iam,
    aws_lambda as _lambda,
    aws_rds as rds,
    aws_sagemaker as sagemaker,
    custom_resources as cr,
)
from constructs import Construct


class SharedPersistentStack(Stack):
    """Persistent stack for singleton infrastructure resources."""

    ECR_REPOSITORY_NAME = "stride-yolov11-inference"
    SAGEMAKER_MODEL_NAME = "stride-yolov11-nano-model"
    SAGEMAKER_ENDPOINT_CONFIG_NAME = "stride-yolov11-nano-config"
    SAGEMAKER_ENDPOINT_NAME = "stride-yolov11-nano-endpoint"
    RDS_INSTANCE_IDENTIFIER = "stride-core-db"
    RDS_DATABASE_NAME = "StrideCore"

    EXPORT_RDS_ENDPOINT_ADDRESS = "StrideShared-RdsEndpointAddress"
    EXPORT_RDS_ENDPOINT_PORT = "StrideShared-RdsEndpointPort"
    EXPORT_RDS_DATABASE_NAME = "StrideShared-RdsDatabaseName"
    EXPORT_RDS_SECRET_ARN = "StrideShared-RdsSecretArn"

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        account = Stack.of(self).account
        region = Stack.of(self).region

        # SageMaker resources (shared + persistent)
        ecr_repo = ecr.Repository.from_repository_name(
            self,
            "YoloV11InferenceRepo",
            repository_name=self.ECR_REPOSITORY_NAME,
        )

        sagemaker_role = iam.Role(
            self,
            "SageMakerExecutionRole",
            assumed_by=iam.ServicePrincipal("sagemaker.amazonaws.com"),
            managed_policies=[
                iam.ManagedPolicy.from_aws_managed_policy_name(
                    "AmazonSageMakerFullAccess"
                )
            ],
        )
        sagemaker_role.apply_removal_policy(RemovalPolicy.RETAIN)
        ecr_repo.grant_pull(sagemaker_role)

        ecr_image_uri = (
            f"{account}.dkr.ecr.{region}.amazonaws.com/{ecr_repo.repository_name}:latest"
        )

        sagemaker_model = sagemaker.CfnModel(
            self,
            "YoloV11Model",
            execution_role_arn=sagemaker_role.role_arn,
            model_name=self.SAGEMAKER_MODEL_NAME,
            primary_container=sagemaker.CfnModel.ContainerDefinitionProperty(
                image=ecr_image_uri,
                mode="SingleModel",
            ),
        )
        sagemaker_model.apply_removal_policy(RemovalPolicy.RETAIN)

        endpoint_config = sagemaker.CfnEndpointConfig(
            self,
            "YoloV11EndpointConfig",
            endpoint_config_name=self.SAGEMAKER_ENDPOINT_CONFIG_NAME,
            production_variants=[
                sagemaker.CfnEndpointConfig.ProductionVariantProperty(
                    variant_name="AllTraffic",
                    model_name=sagemaker_model.model_name,
                    initial_instance_count=1,
                    instance_type="ml.g4dn.xlarge",
                    initial_variant_weight=1.0,
                )
            ],
        )
        endpoint_config.apply_removal_policy(RemovalPolicy.RETAIN)
        endpoint_config.add_dependency(sagemaker_model)

        sagemaker_endpoint = sagemaker.CfnEndpoint(
            self,
            "YoloV11Endpoint",
            endpoint_name=self.SAGEMAKER_ENDPOINT_NAME,
            endpoint_config_name=endpoint_config.endpoint_config_name,
        )
        sagemaker_endpoint.apply_removal_policy(RemovalPolicy.RETAIN)
        sagemaker_endpoint.add_dependency(endpoint_config)

        CfnOutput(
            self,
            "SageMakerEndpointName",
            value=self.SAGEMAKER_ENDPOINT_NAME,
            description="SageMaker endpoint name for YOLOv11 inference",
        )
        CfnOutput(
            self,
            "SageMakerEndpointArn",
            value=f"arn:aws:sagemaker:{region}:{account}:endpoint/{self.SAGEMAKER_ENDPOINT_NAME}",
            description="SageMaker endpoint ARN",
        )
        CfnOutput(
            self,
            "ECRRepositoryURI",
            value=ecr_repo.repository_uri,
            description="ECR repository URI for YOLOv11 inference container",
        )

        # RDS resources (shared + persistent)
        default_vpc = ec2.Vpc.from_lookup(self, "DefaultVPC", is_default=True)

        rds_security_group = ec2.SecurityGroup(
            self,
            "StrideRdsSecurityGroup",
            vpc=default_vpc,
            description="Security group for shared Stride RDS instance",
            allow_all_outbound=True,
        )
        rds_security_group.apply_removal_policy(RemovalPolicy.RETAIN)

        # Keep public for current integration setup.
        rds_security_group.add_ingress_rule(
            ec2.Peer.any_ipv4(),
            ec2.Port.tcp(5432),
            "Allow PostgreSQL access",
        )

        rds_instance = rds.DatabaseInstance(
            self,
            "StrideSharedDb",
            instance_identifier=self.RDS_INSTANCE_IDENTIFIER,
            engine=rds.DatabaseInstanceEngine.postgres(
                version=rds.PostgresEngineVersion.VER_16_3
            ),
            vpc=default_vpc,
            vpc_subnets=ec2.SubnetSelection(subnet_type=ec2.SubnetType.PUBLIC),
            instance_type=ec2.InstanceType.of(
                ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.MICRO
            ),
            allocated_storage=20,
            max_allocated_storage=50,
            database_name=self.RDS_DATABASE_NAME,
            credentials=rds.Credentials.from_generated_secret("postgres"),
            publicly_accessible=True,
            security_groups=[rds_security_group],
            removal_policy=RemovalPolicy.RETAIN,
            delete_automated_backups=False,
        )

        if not rds_instance.secret:
            raise ValueError("Expected RDS instance to have a generated secret.")

        CfnOutput(
            self,
            "RdsInstanceIdentifier",
            value=self.RDS_INSTANCE_IDENTIFIER,
            description="Shared RDS instance identifier",
        )
        CfnOutput(
            self,
            "RdsDatabaseName",
            value=self.RDS_DATABASE_NAME,
            description="Shared RDS database name",
            export_name=self.EXPORT_RDS_DATABASE_NAME,
        )
        CfnOutput(
            self,
            "RdsEndpointAddress",
            value=rds_instance.instance_endpoint.hostname,
            description="Shared RDS endpoint hostname",
            export_name=self.EXPORT_RDS_ENDPOINT_ADDRESS,
        )
        CfnOutput(
            self,
            "RdsEndpointPort",
            value=str(rds_instance.instance_endpoint.port),
            description="Shared RDS endpoint port",
            export_name=self.EXPORT_RDS_ENDPOINT_PORT,
        )
        CfnOutput(
            self,
            "RdsSecretArn",
            value=rds_instance.secret.secret_arn,
            description="Secrets Manager ARN for shared RDS credentials",
            export_name=self.EXPORT_RDS_SECRET_ARN,
        )

        # Shared-stack deploy: initialize schema and populate floor data.
        schema_init_code = _lambda.Code.from_asset(
            "schema_initializer",
            bundling=BundlingOptions(
                image=_lambda.Runtime.PYTHON_3_10.bundling_image,
                command=[
                    "bash",
                    "-lc",
                    "pip install -r requirements.txt -t /asset-output && cp -au . /asset-output",
                ],
            ),
        )
        schema_lambda = _lambda.Function(
            self,
            "SchemaInitializer",
            runtime=_lambda.Runtime.PYTHON_3_10,
            handler="populate_rds.handler",
            code=schema_init_code,
            timeout=Duration.seconds(60),
            environment={"DB_SECRET_ARN": rds_instance.secret.secret_arn},
        )
        rds_instance.secret.grant_read(schema_lambda)

        data_population_code = _lambda.Code.from_asset(
            "data_population",
            bundling=BundlingOptions(
                image=_lambda.Runtime.PYTHON_3_10.bundling_image,
                command=[
                    "bash",
                    "-lc",
                    "pip install -r requirements.txt -t /asset-output && cp -au . /asset-output",
                ],
            ),
        )
        data_population_lambda = _lambda.Function(
            self,
            "FloorDataPopulation",
            runtime=_lambda.Runtime.PYTHON_3_10,
            handler="populate_floor_data_lambda.handler",
            code=data_population_code,
            timeout=Duration.seconds(120),
            environment={"DB_SECRET_ARN": rds_instance.secret.secret_arn},
        )
        rds_instance.secret.grant_read(data_population_lambda)

        invoke_schema_lambda = cr.AwsSdkCall(
            service="Lambda",
            action="invoke",
            parameters={"FunctionName": schema_lambda.function_name},
            physical_resource_id=cr.PhysicalResourceId.of("StrideSharedSchemaInit"),
        )
        schema_init_custom_resource = cr.AwsCustomResource(
            self,
            "InitRdsSchema",
            on_create=invoke_schema_lambda,
            on_update=invoke_schema_lambda,
            policy=cr.AwsCustomResourcePolicy.from_statements(
                [
                    iam.PolicyStatement(
                        actions=["lambda:InvokeFunction"],
                        resources=[schema_lambda.function_arn],
                    )
                ]
            ),
        )

        invoke_data_population_lambda = cr.AwsSdkCall(
            service="Lambda",
            action="invoke",
            parameters={"FunctionName": data_population_lambda.function_name},
            physical_resource_id=cr.PhysicalResourceId.of("StrideSharedFloorDataPopulation"),
        )
        data_population_custom_resource = cr.AwsCustomResource(
            self,
            "PopulateRdsFloorData",
            on_create=invoke_data_population_lambda,
            on_update=invoke_data_population_lambda,
            policy=cr.AwsCustomResourcePolicy.from_statements(
                [
                    iam.PolicyStatement(
                        actions=["lambda:InvokeFunction"],
                        resources=[data_population_lambda.function_arn],
                    )
                ]
            ),
        )
        data_population_custom_resource.node.add_dependency(schema_init_custom_resource)
