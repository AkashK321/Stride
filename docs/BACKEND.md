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
Note: Schema init now lives in `map_population`; installing `aws_resources/map_population/requirements.txt` covers both schema and map seed tooling.

Note: gradle -version should show something like this:  
Launcher JVM:  21.0.9 (Microsoft 21.0.9+10-LTS)  
Daemon JVM:    C:\Program Files\Java\jdk-21.0.9.10-hotspot (no JDK specified, using current Java home)  

# Deploying Changes
To deploy changes to the backend, run the following command from the aws_resources directory:
```bash
cdk deploy
```

# Database Specific Setup
Be careful when making changes to the database schema: the current initializer still uses a drop/recreate flow.
Schema DDL init and map data tooling now live under `map_population`:
- `populate_rds.py` handles DDL reset/init
- `cli.py` handles map validation and map data seeding

Run schema initialization manually from `aws_resources/map_population` with explicit destructive opt-in:

```bash
SCHEMA_INIT_ALLOW_DESTRUCTIVE_RESET=true python populate_rds.py
```

Then run map seeding from the same directory:

```bash
python cli.py populate
```

To verify the database schema after making any changes, run the following command from `aws_resources/schema_initializer`:
```bash
python verify_db_init.py
```
