from aws_cdk import (
    Stack,
    Duration,
    aws_lambda as _lambda,
    aws_apigateway as apigw,
    BundlingOptions,
)
from constructs import Construct
import os
import subprocess
import platform

class CdkStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ---------------------------------------------------------------------
        # PATH CONFIGURATION
        # ---------------------------------------------------------------------
        this_dir = os.path.dirname(__file__)
        backend_dir = os.path.join(this_dir, "..", "backend")
        jar_name = "kotlin_app-1.0-all.jar"
        local_jar_path = os.path.join(backend_dir, "build", "libs", jar_name)

        # ---------------------------------------------------------------------
        # 1. ATTEMPT LOCAL BUILD (The "Pre-Build" Step)
        # ---------------------------------------------------------------------
        # We try to build locally first. If this works, we bypass Docker AND 
        # the CDK bundling logic that is causing EPERM errors on Windows.
        
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

        # ---------------------------------------------------------------------
        # 2. DEFINE THE LAMBDA CODE ASSET
        # ---------------------------------------------------------------------
        if build_succeeded and os.path.exists(local_jar_path):
            # OPTION A: Local Build worked. 
            # We point DIRECTLY to the JAR file. This avoids the folder renaming 
            # bugs in CDK because we aren't using the 'bundling' parameter.
            code_asset = _lambda.Code.from_asset(local_jar_path)
        else:
            # OPTION B: Local Build failed (or we are on a machine without Java).
            # We fall back to Docker. This ensures your teammates on Mac/Linux 
            # can still deploy even if they don't have Gradle installed.
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

        # ---------------------------------------------------------------------
        # 3. CREATE LAMBDA & API
        # ---------------------------------------------------------------------
        backend_handler = _lambda.Function(
            self, "BackendHandler",
            runtime=_lambda.Runtime.JAVA_21,
            handler="com.handler.Handler", 
            code=code_asset,  # Uses either the local JAR or the Docker builder
            memory_size=1024, 
            timeout=Duration.seconds(15),
            snap_start=_lambda.SnapStartConf.ON_PUBLISHED_VERSIONS,
        )

        api = apigw.LambdaRestApi(
            self, "APIEndpoint",
            handler=backend_handler,
            proxy=False 
        )

        items = api.root.add_resource("items")
        items.add_method("GET")