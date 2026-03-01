"""
Persistent shared infrastructure stack.
"""

from aws_cdk import (
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
    aws_ec2 as ec2,
    aws_ecr as ecr,
    aws_events as events,
    aws_events_targets as events_targets,
    aws_iam as iam,
    aws_lambda as _lambda,
    aws_rds as rds,
    aws_sagemaker as sagemaker,
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

        sagemaker_idle_decommission_lambda = _lambda.Function(
            self,
            "SageMakerIdleDecommission",
            runtime=_lambda.Runtime.PYTHON_3_10,
            handler="sagemaker_idle_decommission.handler",
            code=_lambda.Code.from_asset("cdk/lambdas"),
            timeout=Duration.seconds(60),
            environment={
                "SAGEMAKER_ENDPOINT_NAME": self.SAGEMAKER_ENDPOINT_NAME,
                "IDLE_WINDOW_MINUTES": "30",
            },
        )
        sagemaker_idle_decommission_lambda.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=[
                    "sagemaker:DescribeEndpoint",
                    "sagemaker:DeleteEndpoint",
                    "sagemaker:DeleteEndpointConfig",
                    "cloudwatch:GetMetricStatistics",
                    "sqs:GetQueueAttributes",
                ],
                resources=["*"],
            )
        )

        events.Rule(
            self,
            "SageMakerIdleDecommissionSchedule",
            schedule=events.Schedule.rate(Duration.minutes(1)),
            targets=[
                events_targets.LambdaFunction(
                    sagemaker_idle_decommission_lambda
                )
            ],
        )

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

        # Schema initialization and floor-data population are executed in CI/CD
        # as post-deploy scripts, not as deploy-time custom resources.
