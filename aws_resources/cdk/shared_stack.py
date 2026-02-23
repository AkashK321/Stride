"""
Persistent shared infrastructure stack.
"""

import os

from aws_cdk import (
    CfnOutput,
    Duration,
    RemovalPolicy,
    Stack,
    aws_cloudwatch as cloudwatch,
    aws_cloudwatch_actions as cloudwatch_actions,
    aws_ec2 as ec2,
    aws_ecr as ecr,
    aws_iam as iam,
    aws_lambda as _lambda,
    aws_rds as rds,
    aws_sagemaker as sagemaker,
    aws_sns as sns,
    aws_sns_subscriptions as sns_subscriptions,
)
from constructs import Construct


class SharedPersistentStack(Stack):
    """Persistent stack for singleton infra (SageMaker + RDS)."""

    ECR_REPOSITORY_NAME = "stride-yolov11-inference"
    SAGEMAKER_MODEL_NAME = "stride-yolov11-nano-model"
    SAGEMAKER_ENDPOINT_CONFIG_NAME = "stride-yolov11-nano-config"
    SAGEMAKER_ENDPOINT_NAME = "stride-yolov11-nano-endpoint"
    SAGEMAKER_VARIANT_NAME = "AllTraffic"
    RDS_INSTANCE_IDENTIFIER = "stride-core-db"
    RDS_DATABASE_NAME = "StrideCore"

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

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

        account = Stack.of(self).account
        region = Stack.of(self).region
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
                    variant_name=self.SAGEMAKER_VARIANT_NAME,
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

        # Auto-decommission workflow:
        # If endpoint receives no Invocations for 30 minutes, trigger deletion.
        endpoint_arn = (
            f"arn:aws:sagemaker:{region}:{account}:endpoint/{self.SAGEMAKER_ENDPOINT_NAME}"
        )
        decommission_handler = _lambda.Function(
            self,
            "SageMakerIdleDecommissionHandler",
            runtime=_lambda.Runtime.PYTHON_3_10,
            handler="sagemaker_idle_decommission.handler",
            code=_lambda.Code.from_asset(
                os.path.join(os.path.dirname(__file__), "lambdas")
            ),
            timeout=Duration.seconds(30),
            memory_size=256,
            environment={
                "SAGEMAKER_ENDPOINT_NAME": self.SAGEMAKER_ENDPOINT_NAME,
            },
        )
        decommission_handler.add_to_role_policy(
            iam.PolicyStatement(
                effect=iam.Effect.ALLOW,
                actions=["sagemaker:DescribeEndpoint", "sagemaker:DeleteEndpoint"],
                resources=[endpoint_arn],
            )
        )

        idle_decommission_topic = sns.Topic(
            self,
            "SageMakerEndpointIdleDecommissionTopic",
            display_name="Stride SageMaker idle decommission",
        )
        idle_decommission_topic.add_subscription(
            sns_subscriptions.LambdaSubscription(decommission_handler)
        )

        idle_invocations_alarm = cloudwatch.Alarm(
            self,
            "SageMakerEndpointNoInvocations30MinAlarm",
            alarm_description=(
                "Triggers endpoint decommission when SageMaker endpoint has no "
                "Invocations for a continuous 30-minute window."
            ),
            metric=cloudwatch.Metric(
                namespace="AWS/SageMaker",
                metric_name="Invocations",
                statistic="Sum",
                period=Duration.minutes(5),
                dimensions_map={
                    "EndpointName": self.SAGEMAKER_ENDPOINT_NAME,
                    "VariantName": self.SAGEMAKER_VARIANT_NAME,
                },
            ),
            threshold=1,
            comparison_operator=cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
            evaluation_periods=6,
            datapoints_to_alarm=6,
            treat_missing_data=cloudwatch.TreatMissingData.BREACHING,
        )
        idle_invocations_alarm.add_alarm_action(
            cloudwatch_actions.SnsAction(idle_decommission_topic)
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
            "SageMakerIdleDecommissionAlarmName",
            value=idle_invocations_alarm.alarm_name,
            description="CloudWatch alarm name for idle SageMaker endpoint decommission",
        )
        CfnOutput(
            self,
            "ECRRepositoryURI",
            value=ecr_repo.repository_uri,
            description="ECR repository URI for YOLOv11 inference container",
        )

        # RDS shared resource (persistent, manually managed stack lifecycle).
        default_vpc = ec2.Vpc.from_lookup(self, "DefaultVPC", is_default=True)

        rds_security_group = ec2.SecurityGroup(
            self,
            "StrideRdsSecurityGroup",
            vpc=default_vpc,
            description="Security group for shared Stride RDS instance",
            allow_all_outbound=True,
        )
        rds_security_group.apply_removal_policy(RemovalPolicy.RETAIN)

        # Keep public access for current workflow compatibility.
        # Tighten to private networking + Lambda VPC integration when ready.
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
        )
        CfnOutput(
            self,
            "RdsEndpointAddress",
            value=rds_instance.instance_endpoint.hostname,
            description="Shared RDS endpoint hostname",
        )
        CfnOutput(
            self,
            "RdsEndpointPort",
            value=str(rds_instance.instance_endpoint.port),
            description="Shared RDS endpoint port",
        )
        CfnOutput(
            self,
            "RdsSecretArn",
            value=rds_instance.secret.secret_arn,
            description="Secrets Manager ARN for shared RDS credentials",
        )
