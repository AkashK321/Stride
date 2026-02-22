"""
Persistent shared infrastructure stack.
"""

from aws_cdk import (
    CfnOutput,
    RemovalPolicy,
    Stack,
    aws_ecr as ecr,
    aws_iam as iam,
    aws_sagemaker as sagemaker,
)
from constructs import Construct


class SharedPersistentStack(Stack):
    """Persistent stack for singleton infra (SageMaker today, RDS later)."""

    ECR_REPOSITORY_NAME = "stride-yolov11-inference"
    SAGEMAKER_MODEL_NAME = "stride-yolov11-nano-model"
    SAGEMAKER_ENDPOINT_CONFIG_NAME = "stride-yolov11-nano-config"
    SAGEMAKER_ENDPOINT_NAME = "stride-yolov11-nano-endpoint"

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

        # TODO: RDS resources belong in this persistent stack when enabled.
