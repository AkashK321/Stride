import subprocess
from aws_cdk import (
    Stack,
    Duration,
    aws_lambda as _lambda,
    aws_apigateway as apigw,
)
from constructs import Construct
import os  # <--- Added this import

class CdkStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ---------------------------------------------------------------------
        # 0. AUTOMATED BUILD STEP
        # ---------------------------------------------------------------------
        # This allows 'cdk deploy' to build your Kotlin code automatically.
        
        # Define paths
        this_dir = os.path.dirname(__file__)
        # Go up one level from 'cdk' to 'aws_resources', then into 'backend'
        backend_dir = os.path.join(this_dir, "..", "backend")
        gradlew_bat = os.path.join(backend_dir, "gradlew.bat")

        print(f"🔨 Building Kotlin project in {backend_dir}...")
        
        # Run the Gradle Wrapper
        # check=True will verify the build succeeded (stops deploy if build fails)
        try:
            subprocess.run(
                [gradlew_bat, "shadowJar"], 
                cwd=backend_dir, 
                shell=True, 
                check=True
            )
            print("✅ Build successful!")
        except subprocess.CalledProcessError:
            print("❌ Gradle build failed. Deployment aborted.")
            raise Exception("Gradle build failed. Check the logs above.")

        # ---------------------------------------------------------------------
        # 1. The Kotlin Lambda Function
        # ---------------------------------------------------------------------
        
        # Path to the compiled JAR (created by the step above)
        jar_path = os.path.join(backend_dir, "build", "libs", "kotlin_app-1.0-all.jar")
        
        backend_handler = _lambda.Function(
            self, "BackendHandler",
            
            # Use Java 21 for modern Kotlin support
            runtime=_lambda.Runtime.JAVA_21,
            
            # CRITICAL FIX: Must match 'package com.example.project' in Handler.kt
            handler="com.handler.Handler", 

            # Point to the calculated JAR path
            code=_lambda.Code.from_asset(jar_path),

            # JVM Optimization
            memory_size=1024, 
            timeout=Duration.seconds(15),
            
            # SnapStart reduces Cold Start times significantly for Java/Kotlin
            snap_start=_lambda.SnapStartConf.ON_PUBLISHED_VERSIONS
        )

        # ---------------------------------------------------------------------
        # 2. The API Gateway
        # ---------------------------------------------------------------------
        api = apigw.LambdaRestApi(
            self, "APIEndpoint",
            handler=backend_handler,
            proxy=False 
        )

        # 3. Define the route (GET /items)
        items = api.root.add_resource("items")
        items.add_method("GET")