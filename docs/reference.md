# Reference Stride

## System Structure



### Component Index

| Component | Responsibility | Platform | Source | Depends On |
| --- | --- | --- | --- | --- |
| Frontend mobile app | UI, auth input, REST requests, and live navigation client | Expo / React Native | `frontend/app/_layout.tsx`, `frontend/services/api.ts`, `frontend/services/navigationWebSocket.ts` | API Gateway REST + WebSocket endpoints |
| REST API | Public HTTPS entrypoint for login, registration, search, and navigation start | AWS API Gateway (REST) | `docs/openapi.yaml`, `aws_resources/cdk/cdk_stack.py` | Lambda handlers, Cognito, RDS |
| WebSocket API | Bidirectional live navigation/object-detection message transport | AWS API Gateway (WebSocket) | `docs/openapi.yaml`, `aws_resources/cdk/cdk_stack.py` | WebSocket Lambda handlers, DynamoDB session state |
| Backend Lambda handlers | Request handling for auth, navigation, and object detection | AWS Lambda  | `aws_resources/backend/src/main/kotlin/com/handlers/AuthHandler.kt`, `aws_resources/backend/src/main/kotlin/com/handlers/StaticNavigationHandler.kt`, `aws_resources/backend/src/main/kotlin/com/handlers/LiveNavigationHandler.kt`, `aws_resources/backend/src/main/kotlin/com/handlers/ObjectDetectionHandler.kt` | API Gateway, Cognito, RDS, DynamoDB, SageMaker inference endpoint |
| Identity service | User registration/authentication and token issuance | AWS Cognito User Pool | `aws_resources/cdk/cdk_stack.py`, `docs/openapi.yaml` | Auth Lambda handler |
| Relational map datastore | Persistent indoor map graph and landmark metadata | Amazon RDS (PostgreSQL) | `aws_resources/cdk/cdk_stack.py`, `aws_resources/schema_initializer/populate_rds.py` | Backend map/navigation services |
| Runtime state/config store | Session state, feature flags, and object-class height config | Amazon DynamoDB | `aws_resources/cdk/cdk_stack.py`, `aws_resources/schema_initializer/populate_obj_ddb.py` | Live/object-detection handlers |
| Inference service | Computer vision inference used by object detection handlers | Amazon SageMaker | `aws_resources/sagemaker/inference.py`, `aws_resources/sagemaker/serve`, `aws_resources/sagemaker/nginx.conf` | Object detection and live navigation handlers |


## Key APIs

### REST Endpoints

| Method | Path | Operation ID | Auth Requirement | Source |
| --- | --- | --- | --- | --- |
| `POST` | `/login` | `login` | No (credential exchange) | [aws_resources/backend/src/main/kotlin/com/handlers/AuthHandler.kt](../aws_resources/backend/src/main/kotlin/com/handlers/AuthHandler.kt) |
| `POST` | `/register` | `register` | No (account creation) | `aws_resources/backend/src/main/kotlin/com/handlers/AuthHandler.kt` |
| `GET` | `/search` | `searchLandmarks` | Bearer token expected at runtime | `aws_resources/backend/src/main/kotlin/com/handlers/StaticNavigationHandler.kt` |
| `POST` | `/navigation/start` | `startNavigation` | Bearer token expected at runtime | `aws_resources/backend/src/main/kotlin/com/handlers/StaticNavigationHandler.kt` |

### WebSocket Contracts

| Direction | Contract / Type | Required Fields | Trigger / When Sent | Consumer Behavior | Source |
| --- | --- | --- | --- | --- | --- |
| Client -> Server | `NavigationFrameMessage` | `session_id`, `image_base64`, `heading_degrees`, `accelerometer`, `gyroscope`, `focal_length_pixels`, `request_id` | Sent repeatedly during active navigation on WS route key (`navigation`) | Backend uses frame + sensors to localize and update instructions | `frontend/services/navigationWebSocket.ts` |
| Server -> Client | `NavigationUpdateMessage` (`type: navigation_update`) | `type`, `session_id`, `current_step`, `remaining_instructions` | Returned after valid frame processing | Client updates current step, instruction list, and may compute latency via echoed `request_id` | `frontend/services/navigationWebSocket.ts` |


## Configuration

### Core Env Variables

| Key | Purpose | Required | Source |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | Frontend base URL for REST API calls | Yes (for live backend) | `frontend/.env.example`, `frontend/services/api.ts` |
| `EXPO_PUBLIC_WS_API_URL` | Frontend WebSocket URL for live navigation stream | Yes (for live navigation) | `frontend/.env.example`, `frontend/services/navigationWebSocket.ts` |
| `EXPO_PUBLIC_DEV_LOGGER_URL` | Optional dev-only WS response logger endpoint | No | `frontend/.env.example`, `frontend/services/navigationWebSocket.ts` |

### Feature Flags

| Setting | Purpose | Source |
| --- | --- | --- |
| `FEATURE_FLAGS_TABLE_NAME` | DynamoDB table that controls manual runtime feature toggles (e.g., inference routing behavior) | `aws_resources/cdk/cdk_stack.py`, `inference_server/.env.inference` |
| `feature_name` (partition key) | Identifier for a toggle in the feature flags table | `aws_resources/cdk/cdk_stack.py` |

### Inference Server Settings

| Key | Purpose | Required | Source |
| --- | --- | --- | --- |
| `OBJECT_DETECTION_LAMBDA_NAME` | Target Lambda function for dev inference integration | Yes | `inference_server/.env.inference` |
| `AWS_REGION` | AWS region for Lambda/feature-flag operations | Yes | `inference_server/.env.inference` |
| `INFERENCE_PORT` | Local inference HTTP port | Yes | `inference_server/.env.inference` |
| `INFERENCE_REQUIRE_SESSION` | Enables dashboard-session/secret enforcement when set to `1` | No | `inference_server/.env.inference` |
| `SKIP_TUNNEL` | Skip ngrok tunnel startup when set to `1` | No | `inference_server/.env.inference` |

## DB Schemas

### RDS

| Table | Primary Key | Key Relationships | Important Columns | Used By | Source |
| --- | --- | --- | --- | --- | --- |
| `Buildings` | `BuildingID` | Parent of `Floors.BuildingID` | `BuildingName`, `BuildingAddress` | Map data loading and navigation context | `aws_resources/schema_initializer/populate_rds.py`, `docs/DATABASE_SCHEMA_REPORT.md` |
| `Floors` | `FloorID` | `BuildingID -> Buildings.BuildingID` | `FloorName`, `FloorNumber`, `ImageURL`, `Scale` | Floor-level map and search context | `aws_resources/schema_initializer/populate_rds.py`, `docs/DATABASE_SCHEMA_REPORT.md` |
| `MapNodes` | `NodeIDString` | `FloorID -> Floors.FloorID`, `BuildingID -> Buildings.BuildingID` | `CoordinateX`, `CoordinateY`, `NodeType` | Pathfinding graph nodes and landmark nearest-node linkage | `aws_resources/schema_initializer/populate_rds.py`, `docs/DATABASE_SCHEMA_REPORT.md` |
| `MapEdges` | (composite edge by row) | `StartNodeID/EndNodeID -> MapNodes.NodeIDString`, `FloorID -> Floors.FloorID` | `Distance`, `Direction` | Pathfinding graph edges for navigation | `aws_resources/schema_initializer/populate_rds.py`, `docs/DATABASE_SCHEMA_REPORT.md` |
| `Landmarks` | `LandmarkID` | `FloorID -> Floors.FloorID`, `NearestNodeID -> MapNodes.NodeIDString` | `Name`, `LandmarkType`, `CoordinateX`, `CoordinateY` | Search results and destination mapping | `aws_resources/schema_initializer/populate_rds.py`, `docs/DATABASE_SCHEMA_REPORT.md` |

### DynamoDB

| Table (CDK Logical Name) | Partition Key | TTL | Purpose | Source |
| --- | --- | --- | --- | --- |
| `CocoConfigTable` | `class_id` (number) | No | Object class configuration (e.g., height map for distance estimation) | `aws_resources/cdk/cdk_stack.py` |
| `FeatureFlagsTable` | `feature_name` (string) | No | Runtime feature toggles (manual flags) | `aws_resources/cdk/cdk_stack.py` |
| `NavigationSessionTable` | `session_id` (string) | `ttl` | Live navigation session state and expiration cleanup | `aws_resources/cdk/cdk_stack.py` |

### Schema Invariants

- Navigation node identifiers are string-based (`NodeIDString`) and referenced by `Landmarks.NearestNodeID`, `MapEdges.StartNodeID`, and `MapEdges.EndNodeID`.
- `LandmarkID` is the stable destination identifier returned by search and consumed by navigation start flows.


## Inference Server

### Interface Surface

| Endpoint / Interface | Input | Output | Failure Modes | Source |
| --- | --- | --- | --- | --- |
| `GET /ping` | none | `200` with `{status: healthy}` when model loaded | `503` when model is not loaded | `aws_resources/sagemaker/inference.py` |
| `POST /invocations` | Raw image bytes (`image/jpeg`, `image/png`, or `application/octet-stream`) | `200` JSON with `success`, `predictions[]`, `image{width,height}` | `400` unsupported/empty/invalid image, `500` model/inference errors | `aws_resources/sagemaker/inference.py` |
| `ObjectDetectionHandler` -> inference call path | WebSocket message payload with base64 frame and metadata | Detection results merged into navigation/object response flow | Inference invocation failure logged and returned as error payload | `aws_resources/backend/src/main/kotlin/com/handlers/ObjectDetectionHandler.kt` |

### Runtime Assumptions

- Model file is loaded from `/opt/program/yolo11n.pt` at process startup.
- Prediction format is Ultralytics-style (`class`, `confidence`, `box{x1,y1,x2,y2}`).
- SageMaker usage is feature-flag controlled (`enable_sagemaker_inference`) via DynamoDB feature flags table.

### Inference Settings (Quick Index)

| Key | Purpose | Required | Source |
| --- | --- | --- | --- |
| `OBJECT_DETECTION_LAMBDA_NAME` | Physical Lambda target used by local inference tooling | Yes | `inference_server/.env.inference` |
| `FEATURE_FLAGS_TABLE_NAME` | Feature-flag table used to toggle inference routing behavior | Optional (required for `--set-sagemaker-off` flow) | `inference_server/.env.inference`, `aws_resources/backend/src/main/kotlin/com/handlers/ObjectDetectionHandler.kt` |
| `INFERENCE_PORT` | Local inference server port | Yes | `inference_server/.env.inference` |
| `INFERENCE_REQUIRE_SESSION` | Enables session/secret enforcement in inference flow when `1` | No | `inference_server/.env.inference` |
| `SKIP_TUNNEL` | Disables tunnel startup for local/public URL workflows when `1` | No | `inference_server/.env.inference` |

## Frontend

### Entrypoints and Routing

| Area | Responsibility | Source |
| --- | --- | --- |
| Root layout | App bootstrap, font load, providers, and stack config | `frontend/app/_layout.tsx` |
| Auth route group | Sign-in and registration flows | `frontend/app/(auth)/index.tsx`, `frontend/app/(auth)/register-contact.tsx` |
| Main tab routes | Post-auth app surfaces (home/navigation/settings) | `frontend/app/(tabs)/home.tsx`, `frontend/app/(tabs)/navigation.tsx`, `frontend/app/(tabs)/settings.tsx` |

### Core Interfaces

| Interface Family | Key Symbols | Purpose | Source |
| --- | --- | --- | --- |
| Auth context | `AuthProvider`, `useAuth`, `login`, `logout`, `refreshTokens`, `devBypass` | Route protection and auth/session state for the app | `frontend/contexts/AuthContext.tsx` |
| REST API client | `login`, `register`, `searchLandmarks`, `startNavigation` + request/response interfaces | Typed HTTP contract for backend endpoints | `frontend/services/api.ts` |
| WebSocket navigation client | `NavigationWebSocket`, `NavigationFrameMessage`, `NavigationResponse` | Live navigation frame send/receive with reconnect and latency tracking | `frontend/services/navigationWebSocket.ts` |
| Token persistence | `storeTokens`, `getTokens`, `clearTokens`, `isAuthenticated` | Secure token storage via Expo SecureStore | `frontend/services/tokenStorage.ts` |

### Frontend Runtime Variables

| Key | Used By | Purpose | Source |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `services/api.ts` | REST base URL | `frontend/.env.example` |
| `EXPO_PUBLIC_WS_API_URL` | `services/navigationWebSocket.ts` | WebSocket URL for live navigation messages | `frontend/.env.example` | `EXPO_PUBLIC_DEV_LOGGER_URL` | `services/navigationWebSocket.ts` (dev mode) | Optional local response logging endpoint | `frontend/.env.example` |