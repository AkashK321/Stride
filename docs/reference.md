# Stride Reference

## Table of Contents

- [System Structure](#system-structure)
  - [Component Index](#component-index)
- [Key APIs](#key-apis)
  - [REST Endpoints](#rest-endpoints)
  - [WebSocket Contracts](#websocket-contracts)
- [Configuration](#configuration)
  - [Core Env Variables](#core-env-variables)
  - [Feature Flags](#feature-flags)
  - [Inference Server Settings](#inference-server-settings)
- [DB Schemas](#db-schemas)
  - [RDS](#rds)
  - [DynamoDB](#dynamodb)
- [Inference Server](#inference-server)
  - [Interface Surface](#interface-surface)
  - [Inference Settings (Quick Index)](#inference-settings-quick-index)
- [Frontend](#frontend)
  - [Entrypoints and Routing](#entrypoints-and-routing)
  - [Core Interfaces](#core-interfaces)
  - [Frontend Runtime Variables](#frontend-runtime-variables)

## System Structure

### Component Index

| Component | Responsibility | Platform | Source | Depends On |
| --- | --- | --- | --- | --- |
| Frontend mobile app | UI, auth input, REST requests, and live navigation client | Expo / React Native | [_layout.tsx](../frontend/app/_layout.tsx), [api.ts](../frontend/services/api.ts), [navigationWebSocket.ts](../frontend/services/navigationWebSocket.ts) | API Gateway REST + WebSocket endpoints |
| REST API | Public HTTPS entrypoint for login, registration, search, and navigation start | AWS API Gateway (REST) | [openapi.yaml](./openapi.yaml), [cdk_stack.py](../aws_resources/cdk/cdk_stack.py) | Lambda handlers, Cognito, RDS |
| WebSocket API | Bidirectional live navigation/object-detection message transport | AWS API Gateway (WebSocket) | [openapi.yaml](./openapi.yaml), [cdk_stack.py](../aws_resources/cdk/cdk_stack.py) | WebSocket Lambda handlers, DynamoDB session state |
| Backend Lambda handlers | Request handling for auth, navigation, and object detection | AWS Lambda  | [AuthHandler.kt](../aws_resources/backend/src/main/kotlin/com/handlers/AuthHandler.kt), [StaticNavigationHandler.kt](../aws_resources/backend/src/main/kotlin/com/handlers/StaticNavigationHandler.kt), [LiveNavigationHandler.kt](../aws_resources/backend/src/main/kotlin/com/handlers/LiveNavigationHandler.kt), [ObjectDetectionHandler.kt](../aws_resources/backend/src/main/kotlin/com/handlers/ObjectDetectionHandler.kt) | API Gateway, Cognito, RDS, DynamoDB, SageMaker inference endpoint |
| Identity service | User registration/authentication and token issuance | AWS Cognito User Pool | [cdk_stack.py](../aws_resources/cdk/cdk_stack.py), [openapi.yaml](./openapi.yaml) | Auth Lambda handler |
| Relational map datastore | Persistent indoor map graph and landmark metadata | Amazon RDS (PostgreSQL) | [cdk_stack.py](../aws_resources/cdk/cdk_stack.py), [populate_rds.py](../aws_resources/schema_initializer/populate_rds.py) | Backend map/navigation services |
| Runtime state/config store | Session state, feature flags, and object-class height config | Amazon DynamoDB | [cdk_stack.py](../aws_resources/cdk/cdk_stack.py), [populate_obj_ddb.py](../aws_resources/schema_initializer/populate_obj_ddb.py) | Live/object-detection handlers |
| Inference service | Computer vision inference used by object detection handlers | Amazon SageMaker | [inference.py](../aws_resources/sagemaker/inference.py), [serve](../aws_resources/sagemaker/serve), [nginx.conf](../aws_resources/sagemaker/nginx.conf) | Object detection and live navigation handlers |


## Key APIs

### REST Endpoints

| Method | Path | Operation ID | Auth Requirement | Source |
| --- | --- | --- | --- | --- |
| `POST` | `/login` | `login` | No (credential exchange) | [AuthHandler.kt](../aws_resources/backend/src/main/kotlin/com/handlers/AuthHandler.kt) |
| `POST` | `/register` | `register` | No (account creation) | [AuthHandler.kt](../aws_resources/backend/src/main/kotlin/com/handlers/AuthHandler.kt) |
| `GET` | `/search` | `searchLandmarks` | Bearer token expected at runtime | [StaticNavigationHandler.kt](../aws_resources/backend/src/main/kotlin/com/handlers/StaticNavigationHandler.kt) |
| `POST` | `/navigation/start` | `startNavigation` | Bearer token expected at runtime | [StaticNavigationHandler.kt](../aws_resources/backend/src/main/kotlin/com/handlers/StaticNavigationHandler.kt) |

### WebSocket Contracts

API Gateway selects the Lambda integration using **`$request.body.action`** (see [cdk_stack.py](../aws_resources/cdk/cdk_stack.py)). The client must send JSON whose top-level **`action`** is exactly **`"navigation"`** or **`"frame"`** so the message routes to the correct handler.

| Direction | `action` | Contract / response | Typical interval (app) | Purpose | Source |
| --- | --- | --- | --- | --- | --- |
| Client → Server | `"navigation"` | `NavigationFrameMessage` (camera + IMU + GPS + `request_id`) | ~1 s (`LIVE_NAV_WS_INTERVAL_MS` in [navigation.tsx](../frontend/app/navigation/navigation.tsx)) | Live localization: PDR + landmark fusion, closest node, path/instruction updates | [LiveNavigationHandler.kt](../aws_resources/backend/src/main/kotlin/com/handlers/LiveNavigationHandler.kt), [navigationWebSocket.ts](../frontend/services/navigationWebSocket.ts) |
| Server → Client | — | `NavigationUpdateMessage` (`type: navigation_update`) | Per navigation frame | Echoes `request_id`, returns `estimated_position`, `remaining_instructions` (often empty when still on-path), **`current_step`** | Same |
| Client → Server | `"frame"` | Same frame shape as navigation (image + sensors + `request_id`) | ~500 ms (collision loop in [navigation.tsx](../frontend/app/navigation/navigation.tsx)) | Object detection only; response has **`estimatedDistances`**, not `navigation_update` | [ObjectDetectionHandler.kt](../aws_resources/backend/src/main/kotlin/com/handlers/ObjectDetectionHandler.kt) |
| Server → Client | — | Object-detection payload (`estimatedDistances`, `frameSize`, `valid`, `request_id`) | Per frame message | Client uses distances for collision / person detection signaling | Same |

**Semantics notes**

- **`current_step`**: The live handler increments a stored counter on **every processed `navigation` message**; it does **not** indicate completion of a turn-by-turn instruction leg. Treat it as a session tick counter unless/until instruction-based progression is implemented.
- **`remaining_instructions`**: When the user’s estimated node stays on the original path, the backend often returns an **empty** list and only updates stored position; new instructions appear after **off-path** recalculation.


## Configuration

### Core Env Variables

| Key | Purpose | Required | Source |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | Frontend base URL for REST API calls | Yes (for live backend) | [.env.example](../frontend/.env.example), [api.ts](../frontend/services/api.ts) |
| `EXPO_PUBLIC_WS_API_URL` | Frontend WebSocket URL for live navigation stream | Yes (for live navigation) | [.env.example](../frontend/.env.example), [navigationWebSocket.ts](../frontend/services/navigationWebSocket.ts) |
| `EXPO_PUBLIC_DEV_LOGGER_URL` | Optional dev-only WS response logger endpoint | No | [.env.example](../frontend/.env.example), [navigationWebSocket.ts](../frontend/services/navigationWebSocket.ts) |

### Feature Flags

| Setting | Purpose | Source |
| --- | --- | --- |
| `FEATURE_FLAGS_TABLE_NAME` | DynamoDB table that controls manual runtime feature toggles (e.g., inference routing behavior) | [cdk_stack.py](../aws_resources/cdk/cdk_stack.py), [.env.inference](../inference_server/.env.inference) |
| `feature_name` (partition key) | Identifier for a toggle in the feature flags table | [cdk_stack.py](../aws_resources/cdk/cdk_stack.py) |

### Inference Server Settings

| Key | Purpose | Required | Source |
| --- | --- | --- | --- |
| `OBJECT_DETECTION_LAMBDA_NAME` | Target Lambda function for dev inference integration | Yes | [.env.inference](../inference_server/.env.inference) |
| `AWS_REGION` | AWS region for Lambda/feature-flag operations | Yes | [.env.inference](../inference_server/.env.inference) |
| `INFERENCE_PORT` | Local inference HTTP port | Yes | [.env.inference](../inference_server/.env.inference) |
| `INFERENCE_REQUIRE_SESSION` | Enables dashboard-session/secret enforcement when set to `1` | No | [.env.inference](../inference_server/.env.inference) |
| `SKIP_TUNNEL` | Skip ngrok tunnel startup when set to `1` | No | [.env.inference](../inference_server/.env.inference) |

## DB Schemas

### RDS

| Table | Primary Key | Key Relationships | Important Columns | Used By | Source |
| --- | --- | --- | --- | --- | --- |
| `Buildings` | `BuildingID` | Parent of `Floors.BuildingID` | `BuildingName`, `BuildingAddress` | Map data loading and navigation context | [populate_rds.py](../aws_resources/schema_initializer/populate_rds.py), [DATABASE_SCHEMA_REPORT.md](./DATABASE_SCHEMA_REPORT.md) |
| `Floors` | `FloorID` | `BuildingID -> Buildings.BuildingID` | `FloorName`, `FloorNumber`, `ImageURL`, `Scale` | Floor-level map and search context | [populate_rds.py](../aws_resources/schema_initializer/populate_rds.py), [DATABASE_SCHEMA_REPORT.md](./DATABASE_SCHEMA_REPORT.md) |
| `MapNodes` | `NodeIDString` | `FloorID -> Floors.FloorID`, `BuildingID -> Buildings.BuildingID` | `CoordinateX`, `CoordinateY`, `NodeType` | Pathfinding graph nodes and landmark nearest-node linkage | [populate_rds.py](../aws_resources/schema_initializer/populate_rds.py), [DATABASE_SCHEMA_REPORT.md](./DATABASE_SCHEMA_REPORT.md) |
| `MapEdges` | (composite edge by row) | `StartNodeID/EndNodeID -> MapNodes.NodeIDString`, `FloorID -> Floors.FloorID` | `Distance`, `Direction` | Pathfinding graph edges for navigation | [populate_rds.py](../aws_resources/schema_initializer/populate_rds.py), [DATABASE_SCHEMA_REPORT.md](./DATABASE_SCHEMA_REPORT.md) |
| `Landmarks` | `LandmarkID` | `FloorID -> Floors.FloorID`, `NearestNodeID -> MapNodes.NodeIDString` | `Name`, `LandmarkType`, `CoordinateX`, `CoordinateY` | Search results and destination mapping | [populate_rds.py](../aws_resources/schema_initializer/populate_rds.py), [DATABASE_SCHEMA_REPORT.md](./DATABASE_SCHEMA_REPORT.md) |

### DynamoDB

| Table (CDK Logical Name) | Partition Key  | Purpose | Source |
| --- | --- | --- | --- |
| `CocoConfigTable` | `class_id` (number) | Object class configuration (e.g., height map for distance estimation) | [cdk_stack.py](../aws_resources/cdk/cdk_stack.py) |
| `FeatureFlagsTable` | `feature_name` (string) | Runtime feature toggles (manual flags) | [cdk_stack.py](../aws_resources/cdk/cdk_stack.py) |
| `NavigationSessionTable` | `session_id` (string) | Live navigation session state and expiration cleanup | [cdk_stack.py](../aws_resources/cdk/cdk_stack.py) |


## Inference Server

### Interface Surface

| Endpoint / Interface | Input | Output | Failure Modes | Source |
| --- | --- | --- | --- | --- |
| `GET /ping` | none | `200` with `{status: healthy}` when model loaded | `503` when model is not loaded | [inference.py](../aws_resources/sagemaker/inference.py) |
| `POST /invocations` | Raw image bytes (`image/jpeg`, `image/png`, or `application/octet-stream`) | `200` JSON with `success`, `predictions[]`, `image{width,height}` | `400` unsupported/empty/invalid image, `500` model/inference errors | [inference.py](../aws_resources/sagemaker/inference.py) |

### Inference Settings

| Key | Purpose | Required | Source |
| --- | --- | --- | --- |
| `OBJECT_DETECTION_LAMBDA_NAME` | Physical Lambda target used by local inference tooling | Yes | [.env.inference](../inference_server/.env.inference) |
| `FEATURE_FLAGS_TABLE_NAME` | Feature-flag table used to toggle inference routing behavior | Optional (required for `--set-sagemaker-off` flow) | [.env.inference](../inference_server/.env.inference), [ObjectDetectionHandler.kt](../aws_resources/backend/src/main/kotlin/com/handlers/ObjectDetectionHandler.kt) |
| `INFERENCE_PORT` | Local inference server port | Yes | [.env.inference](../inference_server/.env.inference) |
| `INFERENCE_REQUIRE_SESSION` | Enables session/secret enforcement in inference flow when `1` | No | [.env.inference](../inference_server/.env.inference) |
| `SKIP_TUNNEL` | Disables tunnel startup for local/public URL workflows when `1` | No | [.env.inference](../inference_server/.env.inference) |

## Frontend

### Entrypoints and Routing

| Area | Responsibility | Source |
| --- | --- | --- |
| Root layout | App bootstrap, font load, providers, and stack config | [app/_layout.tsx](../frontend/app/_layout.tsx) |
| Auth route group | Sign-in and registration flows | [(auth)/index.tsx](../frontend/app/(auth)/index.tsx), [(auth)/register-contact.tsx](../frontend/app/(auth)/register-contact.tsx) |
| Main tab routes | Post-auth app surfaces (home/navigation/settings) | [(tabs)/home.tsx](../frontend/app/(tabs)/home.tsx), [(tabs)/navigation.tsx](../frontend/app/(tabs)/navigation.tsx), [(tabs)/settings.tsx](../frontend/app/(tabs)/settings.tsx) |

### Core Interfaces

| Interface Family | Key Symbols | Purpose | Source |
| --- | --- | --- | --- |
| Auth context | `AuthProvider`, `useAuth`, `login`, `logout`, `refreshTokens`, `devBypass` | Route protection and auth/session state for the app | [AuthContext.tsx](../frontend/contexts/AuthContext.tsx) |
| REST API client | `login`, `register`, `searchLandmarks`, `startNavigation` + request/response interfaces | Typed HTTP contract for backend endpoints | [api.ts](../frontend/services/api.ts) |
| WebSocket navigation client | `NavigationWebSocket`, `NavigationFrameMessage`, `NavigationResponse` | Live navigation frame send/receive with reconnect and latency tracking | [navigationWebSocket.ts](../frontend/services/navigationWebSocket.ts) |
| Token persistence | `storeTokens`, `getTokens`, `clearTokens`, `isAuthenticated` | Secure token storage via Expo SecureStore | [tokenStorage.ts](../frontend/services/tokenStorage.ts) |

### Frontend Runtime Variables

| Key | Used By | Purpose | Source |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_API_BASE_URL` | `services/api.ts` | REST base URL | [.env.example](../frontend/.env.example) |
| `EXPO_PUBLIC_WS_API_URL` | `services/navigationWebSocket.ts` | WebSocket URL for live navigation messages | [.env.example](../frontend/.env.example) |
| `EXPO_PUBLIC_DEV_LOGGER_URL` | `services/navigationWebSocket.ts` (dev mode) | Optional local response logging endpoint | [.env.example](../frontend/.env.example) |