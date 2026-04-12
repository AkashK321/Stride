'''
CloudFormation stack definition
'''

from aws_cdk import (
    Stack,
    Duration,
    CfnOutput,
    aws_lambda as _lambda,
    aws_apigateway as apigw,
    aws_apigatewayv2 as apigw_v2,
    aws_apigatewayv2_integrations as integrations,
    aws_dynamodb as ddb,
    RemovalPolicy,
    aws_cognito as cognito,
    custom_resources as cr,
    BundlingOptions,
    CustomResource,
)
from constructs import Construct
import os
import subprocess
import platform

from cdk.shared_stack import SHARED_DB_NAME, SharedPersistentStack


class CdkStack(Stack):

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        shared_persistent_stack: SharedPersistentStack,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)
        shared_db = shared_persistent_stack.shared_db

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

        # Define the Static Navigation Lambda function
        static_navigation_handler = _lambda.Function(
            self, "StaticNavigationHandler",
            runtime=_lambda.Runtime.JAVA_21,
            handler="com.handlers.StaticNavigationHandler",
            code=code_asset,  # Uses either the local JAR or the Docker builder
            memory_size=3008,
            timeout=Duration.seconds(29),  # Match API Gateway WebSocket timeout (29s max)
            snap_start=_lambda.SnapStartConf.ON_PUBLISHED_VERSIONS,
        )

        # Define the Live Navigation Lambda function (WebSocket route: navigation)
        live_navigation_handler = _lambda.Function(
            self, "LiveNavigationHandler",
            runtime=_lambda.Runtime.JAVA_21,
            handler="com.handlers.LiveNavigationHandler",
            code=code_asset,
            memory_size=3008,
            timeout=Duration.seconds(29),
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
            "cognito-idp:ListUsers",  # For checking duplicate email/phone
            "cognito-idp:ConfirmSignUp",
            "cognito-idp:ResendConfirmationCode",
        )

        # Add Cognito configuration to Lambda environment
        auth_handler.add_environment("USER_POOL_ID", user_pool.user_pool_id)
        auth_handler.add_environment("USER_POOL_CLIENT_ID", user_pool_client.user_pool_client_id)

        # Optional: HTTP POST /invocations (Ultralytics-compatible JSON).
        # Set in cdk.context.json, e.g. "inferenceHttpUrl": "http://internal-host:8080" (VPC/LB/tunnel).
        inference_http_url = self.node.try_get_context("inferenceHttpUrl")
        if inference_http_url:
            object_detection_handler.add_environment(
                "INFERENCE_HTTP_URL",
                str(inference_http_url),
            )

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
        register_confirm = register.add_resource("confirm")
        register_confirm.add_method("POST", integration=apigw.LambdaIntegration(auth_handler))
        register_resend_code = register.add_resource("resend-code")
        register_resend_code.add_method("POST", integration=apigw.LambdaIntegration(auth_handler))

        search = api.root.add_resource("search")
        search.add_method("GET", integration=apigw.LambdaIntegration(static_navigation_handler))

        navigation = api.root.add_resource("navigation")
        start = navigation.add_resource("start")
        start.add_method("POST", integration=apigw.LambdaIntegration(static_navigation_handler))

        # Define the API Gateway WebSocket API
        # Explicit selection: client JSON must include "action": "frame" | "navigation" (etc.)
        ws_api = apigw_v2.WebSocketApi(
            self,
            "StreamAPI",
            route_selection_expression="$request.body.action",
        )
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
        ws_api.add_route(
            route_key="navigation",
            integration=integrations.WebSocketLambdaIntegration("NavigationIntegration", live_navigation_handler)
        )
        # Add $default route to catch unmatched messages (for debugging)
        ws_api.add_route(
            route_key="$default",
            integration=integrations.WebSocketLambdaIntegration("DefaultIntegration", object_detection_handler)
        )
        ws_api.grant_manage_connections(object_detection_handler)
        ws_api.grant_manage_connections(live_navigation_handler)

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

        CfnOutput(
            self, "CocoConfigTableName",
            value=coco_config_table.table_name,
            description="DynamoDB Table for Object Detection Heights"
        )

        CfnOutput(self, "UserPoolId",
            value=user_pool.user_pool_id,
            description="Cognito User Pool ID"
        )

        CfnOutput(self, "UserPoolClientId",
            value=user_pool_client.user_pool_client_id,
            description="Cognito User Pool Client ID"
        )

        navigation_session_table = ddb.Table(
            self, "NavigationSessionTable",
            partition_key=ddb.Attribute(
                name="session_id",
                type=ddb.AttributeType.STRING
            ),
            time_to_live_attribute="ttl", # Automatically cleans up old sessions
            removal_policy=RemovalPolicy.DESTROY,
            billing_mode=ddb.BillingMode.PAY_PER_REQUEST
        )

        navigation_session_table.grant_read_write_data(live_navigation_handler)
        live_navigation_handler.add_environment("SESSION_TABLE_NAME", navigation_session_table.table_name)

        navigation_session_table.grant_read_write_data(static_navigation_handler)
        static_navigation_handler.add_environment("SESSION_TABLE_NAME", navigation_session_table.table_name)

        static_navigation_handler.add_environment(
            "DB_HOST", shared_db.db_instance_endpoint_address
        )
        static_navigation_handler.add_environment(
            "DB_PORT", shared_db.db_instance_endpoint_port
        )
        static_navigation_handler.add_environment("DB_NAME", SHARED_DB_NAME)
        static_navigation_handler.add_environment(
            "DB_SECRET_ARN", shared_db.secret.secret_arn
        )
        shared_db.secret.grant_read(static_navigation_handler)

        live_navigation_handler.add_environment(
            "DB_HOST", shared_db.db_instance_endpoint_address
        )
        live_navigation_handler.add_environment(
            "DB_PORT", shared_db.db_instance_endpoint_port
        )
        live_navigation_handler.add_environment("DB_NAME", SHARED_DB_NAME)
        live_navigation_handler.add_environment(
            "DB_SECRET_ARN", shared_db.secret.secret_arn
        )
        shared_db.secret.grant_read(live_navigation_handler)
