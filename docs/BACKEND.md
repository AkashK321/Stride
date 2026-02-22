# Dependencies
The backend requires aws-cli, and aws cdk to be installed globally.
To setup kotlin, ensure you have JDK 21 installed (anything newer won't run in lambda so best to use this for development as well).
Install the kotlin compiler and set it up in your PATH. Instructions can be found [here](https://kotlinlang.org/docs/command-line.html).
Additionally, you will need to have gradle installed. Instructions can be found [here](https://gradle.org/install/).
To check that all these are installed correctly, run the following commands:
```bash
aws --version
cdk --version
java -version
kotlinc -version
gradle -version
```
To install python dependencies, run:
```bash
pip install -r requirements.txt
```
Note: Make sure to install the schema_intializer requirements to the schema_initializer directory if you are trying to run a manual aws deployment.

Note: gradle -version should show something like this:  
Launcher JVM:  21.0.9 (Microsoft 21.0.9+10-LTS)  
Daemon JVM:    C:\Program Files\Java\jdk-21.0.9.10-hotspot (no JDK specified, using current Java home)  

# Deploying Changes
To deploy changes to the backend, run the following command from the aws_resources directory:
```bash
cdk deploy
```

# Database Specific Setup
Be careful when making changes to the database schema, the current initialization script will clean up the old database completely if any updates are made.
The schema_initializer lambda is triggered on creation of the lambda and on update. You can also manually trigger it through the test window within the AWS Lambda console.
To verify the databse schema after making any changes, run the following command from the aws_resources/schema_initializer directory:
```bash
python verify_db_init.py
```
