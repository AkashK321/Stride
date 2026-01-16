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
Note: gradle -version should show something like this:  
Launcher JVM:  21.0.9 (Microsoft 21.0.9+10-LTS)  
Daemon JVM:    C:\Program Files\Java\jdk-21.0.9.10-hotspot (no JDK specified, using current Java home)  