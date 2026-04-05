"""
Deployment stack - stable RDS instance for peer review deployment.
"""

from aws_cdk import (
    CfnOutput,
    RemovalPolicy,
    Stack,
    aws_ec2 as ec2,
    aws_rds as rds,
)
from constructs import Construct

DEPLOYMENT_DB_NAME = "StrideCore"


class DeploymentStack(Stack):
    """Stable stack for peer review deployment - separate from dev shared stack."""

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        default_vpc = ec2.Vpc.from_lookup(self, "DefaultVPC", is_default=True)

        self.shared_db = rds.DatabaseInstance(
            self,
            "StrideDeploymentDB",
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
            database_name=DEPLOYMENT_DB_NAME,
            publicly_accessible=True,
            removal_policy=RemovalPolicy.DESTROY,
        )

        self.shared_db.connections.allow_from_any_ipv4(
            ec2.Port.tcp(5432), "Allow Postgres from internet-facing Lambdas"
        )

        CfnOutput(self, "RdsSecretArn",
            value=self.shared_db.secret.secret_arn,
            description="Secrets Manager ARN for deployment RDS credentials",
        )
        CfnOutput(self, "RdsEndpointAddress",
            value=self.shared_db.db_instance_endpoint_address,
            description="Deployment RDS hostname",
        )
        CfnOutput(self, "RdsEndpointPort",
            value=self.shared_db.db_instance_endpoint_port,
            description="Deployment RDS port",
        )
        CfnOutput(self, "RdsDatabaseName",
            value=DEPLOYMENT_DB_NAME,
            description="Postgres database name",
        )