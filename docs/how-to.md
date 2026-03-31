# How-To Guide for Stride

---

## End User How-Tos

---

### How to Sign Up and Log In
 
**Purpose:** Create a Stride account and authenticate so you can access navigation features.
 
**Preconditions:**
- The Stride app is installed on your iOS or Android device
- This is your first time opening the app (for sign up) or you have an existing account (for login)
 
**Sign Up Steps:**
1. Open the Stride app
2. Register with an email/password
3. You will then be taken directly to the home screen
 
**Log In Steps:**
1. Open the Stride app
2. Enter your registered email and password
3. The app will verify your credentials and log you in within 1 second
4. You will be taken to the home screen
 
**Expected Result:** A new account is created on first sign up, and returning users are authenticated and brought to the home screen within 1 second.


---

### How to Start a Navigation Session

**Purpose:** Begin turn-by-turn indoor navigation from your current location to a destination inside BHEE.

**Preconditions:**
- The Stride app is installed and open on your device
- You are logged in
- You are physically inside the BHEE building
- Wi-Fi is connected
- You have granted location, camera and microphone permissions

**Steps:**
1. On the home screen, select or speak your destination (i.e "Room 226")
2. Tap or say **"Start Navigation"**
3. Wait for the app to connect, you will hear a confirmation tone when the session is active
4. Follow the audio instructions (i.e "Walk 13 feet", "Turn left")
5. Continue walking; the app will update your instructions at every turn/change automatically

**Expected Result:** Audio instructions begin playing and update as you move through the building toward your destination.

---

### How to End a Navigation Session

**Purpose:** Stop an active navigation session and return the app to its idle state.

**Preconditions:**
- A navigation session is currently active

**Steps:**
1. Tap the **"End Navigation"** button on screen, or say **"End Navigation"** if voice control is active
2. Wait for the confirmation tone indicating the session has ended
3. The app will return to the home screen
4. If you need to navigate somewhere else, you may start a new session from Step 1 of *How to Start a Navigation Session*

**Expected Result:** The app returns to its idle state.

---

### How to Interpret Navigation Feedback During a Session

**Purpose:** Understand what the audio and haptic cues mean while navigating so you can follow instructions confidently.

**Preconditions:**
- A navigation session is currently active
- Device volume is turned up
- Haptic feedback is enabled on your device

**Steps:**
1. Listen for the audio instruction. It will state a direction and distance (i.e "Turn right. Walk 5 feet")
2. Walk in the stated direction for the stated distance
3. When you approach the next point, a new instruction will be given automatically
4. As you approach an obstacle, listen for the tone. The frequency increases as you get closer:
   - **10–20 feet:** slow, low-frequency beeps —> an obstacle is ahead, stay alert
   - **5–10 feet:** faster beeps —> slow down and prepare to stop or reroute
   - **0–5 feet:** rapid, high-frequency beeps  —> stop immediately and wait for the path to clear or adjust your direction
5. When you arrive, you will hear **"You have arrived at [destination]"**

**Expected Result:** You reach your destination safely by following instructional prompts, with real-time collision alerts if obstacles appear in your path.

---

## Developer How-Tos

---

### How to Set Up the Development Environment

**Purpose:** Get the Stride codebase running locally on your machine for development and testing.

**Preconditions:**
- Node.js and npm are installed
- Expo CLI is installed globally (`npm install -g expo-cli`)
- You have cloned the repository: `git clone https://github.com/AkashK321/Stride.git`
- Android Studio or Xcode is installed for device simulation

**Steps:**
1. Navigate to the project root:
   ```bash
   cd Stride
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npx expo start
   ```
5. Press `a` to open on Android emulator or `i` for iOS simulator, or scan the QR code with the Expo Go app on a physical device
6. Navigate to the **Sensor Dev** tab to verify sensors are initializing correctly

**Expected Result:** The app launches on your target device or emulator, the Sensor Dev tab displays live accelerometer, gyroscope, and magnetometer readings.

---
 
### How to Configure Environment Variables
 
**Purpose:** Set the correct API URLs and environment-specific values so the frontend can communicate with the deployed AWS backend.
 
**Preconditions:**
- The backend has been deployed to AWS and you have the WebSocket and REST API URLs from the CDK stack outputs
- You are in the project root directory
 
**Steps:**
1. In the project root, locate or create a `.env` file:
   ```bash
   touch .env
   ```
2. Add the following variables, replacing the placeholder values with your CDK stack outputs:
   ```env
   EXPO_PUBLIC_REST_API_URL=https://{restApiId}.execute-api.{region}.amazonaws.com/prod
   EXPO_PUBLIC_WS_API_URL=wss://{wsApiId}.execute-api.{region}.amazonaws.com/prod
   ```
3. Save the file. Expo will automatically load variables prefixed with `EXPO_PUBLIC_` at build time
4. Restart the development server for the changes to take effect:
   ```bash
   npx expo start
   ```
5. Verify the connection by starting a navigation session in the app and confirming that the WebSocket connects without error
 
**Expected Result:** The frontend successfully connects to the correct REST and WebSocket endpoints. Navigation sessions initialize without connection errors.

---

### How to Deploy the Backend to AWS

**Purpose:** Deploy the serverless backend including the WebSocket API Gateway, Lambda handlers, and SageMaker YOLO inference endpoint.

**Preconditions:**
- AWS CLI is installed and configured with appropriate credentials
- AWS CDK is installed (`npm install -g aws-cdk`)
- Python 3.x and pip are installed
- You are in the `aws_resources/` directory of the repository

**Steps:**
1. Install backend Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Bootstrap the CDK environment (first time only):
   ```bash
   cdk bootstrap
   ```
3. Deploy the full CDK stack:
   ```bash
   cdk deploy
   ```
4. Note the outputs: copy the **WebSocket API URL** (format: `wss://{wsApiId}.execute-api.{region}.amazonaws.com/prod`) and the **REST API base URL**
5. Update the frontend environment config with these URLs (see *How to Configure Environment Variables*)

**Expected Result:** The WebSocket endpoint accepts connections on the `navigation` route, the `/navigation/start` REST endpoint returns a valid `session_id` and `instructions` array, and the YOLO model processes inference requests successfully.

---

### How to Export the Sensor Data

**Purpose:** Capture IMU sensor data from a device session and export it as a CSV.

**Preconditions:**
- The Stride app is running on a physical device and not a simulator (sensor data requires real hardware)
- The **Sensor Dev** tab is accessible

**Steps:**

**Capturing Data:**
1. Open the **Sensor-Dev** tab
2. Tap **"Start Logging"** before beginning your test movement
3. Perform the test (walk a known path, rotate, or tilt the device as needed)
4. Tap **"Stop Logging"** when done

**Exporting the CSV:**
1. Tap **"View & Export Sessions"**
2. Select your session from the list
3. Tap **"Export"**. This opens the share sheet (email, AirDrop, Files app)
4. Save or send the file

**Expected Result:** A CSV file showing the sensor data.