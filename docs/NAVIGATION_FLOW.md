# Navigation Flow Documentation

This document explains the high-level flow of the indoor navigation system, how it maps to the API specification, and the state management involved.

## High-Level Flow

### 1. Start Button Pressed

#### Step 1a: Call REST endpoint `/navigation/start`

**Note (MVP):** The user must specify their starting node. Automatic localization from sensor data is not yet implemented.

```http
POST /navigation/start
Content-Type: application/json

{
  "destination": {
    "landmark_id": "landmark_123"
  },
  "start_location": {
    "node_id": "staircase_main_2S01"
  }
}
```

**Response:**
```json
{
  "session_id": "nav_session_abc123",
  "instructions": [
    {
      "step": 1,
      "distance_feet": 13.0,
      "direction": "west",
      "node_id": "staircase_main_2S01",
      "coordinates": {
        "x_feet": 0,
        "y_feet": 0
      }
    },
    {
      "step": 2,
      "distance_feet": 0,
      "direction": "west",
      "node_id": "stair_west_corner",
      "coordinates": {
        "x_feet": -13,
        "y_feet": 0
      }
    },
    {
      "step": 3,
      "distance_feet": 15.0,
      "direction": "west",
      "node_id": "r226_door",
      "coordinates": {
        "x_feet": -28,
        "y_feet": 0
      }
    },
    {
      "step": 4,
      "distance_feet": 5.0,
      "direction": "south",
      "node_id": "r226_door",
      "coordinates": {
        "x_feet": -28,
        "y_feet": -5
      }
    }
  ]
}
```

#### Step 1b: Connect to WebSocket

```
Connect to: wss://{wsApiId}.execute-api.{region}.amazonaws.com/prod
Route: "navigation" (configured in CDK stack)
```

#### Step 1c: Store session state

- Save `session_id` from REST response
- Store initial `instructions` array
- Mark WebSocket as "active"

---

### 2. While WebSocket is Active (Continuous Loop)

#### Step 2a: Capture frame and sensor data

- Capture camera frame → encode as base64
- Read device heading (degrees: 0-360)
- Read accelerometer (ax, ay, az)

#### Step 2b: Send `NavigationFrameMessage` via WebSocket

```json
{
  "session_id": "nav_session_abc123",
  "image_base64": "<base64-encoded-image>",
  "heading_degrees": 270.0,
  "accelerometer": {
    "ax": 0.1,
    "ay": 0.0,
    "az": 9.8
  },
  "timestamp_ms": 1739052345123
}
```

#### Step 2c: Receive `NavigationUpdateMessage` from WebSocket

```json
{
  "type": "navigation_update",
  "session_id": "nav_session_abc123",
  "current_step": 2,
  "remaining_instructions": [
    {
      "step": 2,
      "distance_feet": 5.0,
      "direction": "west",
      "node_id": "stair_west_corner",
      "coordinates": {
        "x_feet": -13,
        "y_feet": 0
      }
    },
    {
      "step": 3,
      "distance_feet": 15.0,
      "direction": "west",
      "node_id": "r226_door",
      "coordinates": {
        "x_feet": -28,
        "y_feet": 0
      }
    }
  ],
  "estimated_position": {
    "node_id": "stair_west_corner",
    "coordinates": {
      "x_feet": -13,
      "y_feet": 0
    }
  },
  "confidence": 0.87
}
```

#### Step 2d: Update UI/audio feedback

- Update `current_step` in state
- Replace `instructions` array with `remaining_instructions`
- Provide audio feedback: "Walk 5 feet west"
- Update estimated position on map (if applicable)

#### Step 2e: Repeat (every 1-2 seconds)

- Loop back to Step 2a

---

### 3. End Button Pressed

#### Step 3a: Disconnect WebSocket

```
WebSocket.close()
```

#### Step 3b: Cleanup

- Clear `session_id`
- Clear `instructions`
- Stop frame capture loop
- Mark WebSocket as "inactive"

---

## How It Maps API Spec

### REST Endpoint (from spec)

```yaml
POST /navigation/start
Request: NavigationStartRequest
Response: NavigationStartResponse {
  session_id: string
  instructions: NavigationInstruction[]
}
```

**Schema Reference:**
- Request: `NavigationStartRequest` (destination, start_location)
- Response: `NavigationStartResponse` (session_id, instructions)
- Instruction: `NavigationInstruction` (step, distance_feet, direction, node_id, coordinates)

### WebSocket Messages (from spec)

#### Client → Server

```yaml
NavigationFrameMessage {
  session_id: string
  image_base64: string
  heading_degrees: number
  accelerometer: { ax, ay, az }
  timestamp_ms?: number
}
```

#### Server → Client

```yaml
NavigationUpdateMessage {
  type: "navigation_update"
  session_id: string
  current_step: number
  remaining_instructions: NavigationInstruction[]
  estimated_position?: { node_id, coordinates }
  confidence?: number
  message?: string
}
```

**Other Server Message Types:**
- `NavigationErrorMessage` - `type: "navigation_error"`
- `NavigationCompleteMessage` - `type: "navigation_complete"`

---

## State Management Flow

```
┌─────────────────────────────────────────────────────────┐
│ Initial State:                                          │
│ - session_id: null                                      │
│ - instructions: []                                      │
│ - current_step: 0                                       │
│ - websocket: null                                       │
│ - is_active: false                                      │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ [Start Button Pressed]                                  │
│ 1. POST /navigation/start                               │
│    → Get session_id + initial instructions              │
│ 2. WebSocket.connect()                                  │
│ 3. Set is_active = true                                 │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ [Active Loop - Every 1-2 seconds]                       │
│                                                         │
│  ┌────────────────────────────────────────────┐         │
│  │ 1. Capture frame + sensors                 │         │
│  │ 2. Send NavigationFrameMessage             │         │
│  │ 3. Wait for NavigationUpdateMessage        │         │
│  │ 4. Update state:                           │         │
│  │    - current_step = update.current_step    │         │
│  │    - instructions = update.remaining_...   │         │
│  │ 5. Provide audio feedback                  │         │
│  └────────────────────────────────────────────┘         │
│                                                         │
│  ┌────────────────────────────────────────────┐         │
│  │ Check for completion:                      │         │
│  │ if (update.type === "navigation_complete") │         │
│  │   → Stop loop, show "Arrived" message      │         │
│  └────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────┐
│ [End Button Pressed]                                    │
│ 1. WebSocket.close()                                    │
│ 2. Stop frame capture loop                              │
│ 3. Clear session_id, instructions                       │
│ 4. Set is_active = false                                │
└─────────────────────────────────────────────────────────┘
```

---

## Key Interactions with API Spec

### 1. REST endpoint provides initial state

- `/navigation/start` requires the user to specify a `start_location.node_id` (MVP requirement)
- Returns `session_id` and initial `instructions` based on the specified start node
- Frontend stores these for the session
- Initial instructions represent the complete path from start node to destination
- **Future Enhancement:** Automatic localization from sensor data (heading, accelerometer, GPS) will eliminate the need for users to specify a start node

### 2. WebSocket uses `session_id` for context

- Every `NavigationFrameMessage` includes `session_id`
- Server uses it to track the user's navigation session
- Allows server to maintain state across multiple frame updates

### 3. WebSocket updates replace initial instructions

- Initial `instructions` from REST are replaced by `remaining_instructions` from WebSocket
- `current_step` tracks progress through the path
- As user progresses, `remaining_instructions` shrinks until completion

### 4. Server handles localization

- Server receives frame + sensors → processes → returns updated position and next steps
- Frontend doesn't need to calculate position; it receives it from the server
- Server uses computer vision (object detection) + sensor fusion to localize user

### 5. Completion detection

- Server sends `type: "navigation_complete"` when user arrives
- Frontend stops the loop and shows completion message
- User can then disconnect or start a new navigation session

---

## Implementation Notes

### Frontend Responsibilities

1. **Frame Capture**: Periodically capture camera frames (every 1-2 seconds)
2. **Sensor Reading**: Read device heading and accelerometer data
3. **Message Sending**: Send `NavigationFrameMessage` via WebSocket
4. **Message Handling**: Process `NavigationUpdateMessage` responses
5. **Audio Feedback**: Convert instructions to audio for blind users
6. **State Management**: Maintain session state and update UI

### Backend Responsibilities

1. **Pathfinding**: Calculate initial path using A* algorithm on MapNodes/MapEdges from the user-specified start node
2. **Localization**: Process camera frames + sensors to estimate user position during navigation (after initial start)
3. **Progress Tracking**: Track which step user is on based on position
4. **Instruction Updates**: Recalculate remaining instructions as user progresses
5. **Completion Detection**: Detect when user reaches destination

**Note (MVP):** The backend requires a start node to be provided. Future versions will support automatic localization from sensor data to determine the starting position.

### Error Handling

- **WebSocket Connection Failure**: Retry connection or show error to user
- **Invalid Session**: Server may return `navigation_error` if session_id is invalid
- **Localization Failure**: Server may return low confidence or request more frames
- **Network Issues**: Frontend should handle timeouts and reconnection

---

## Example User Flow

1. User searches for "Room 226" → Gets landmark with `nearest_node: "r226_door"`
2. User selects destination
3. **User selects or enters their starting node** (e.g., "staircase_main_2S01") - MVP requirement
4. User presses "Start Navigation"
5. Frontend calls `/navigation/start` with destination and start node
6. Frontend receives initial instructions and connects to WebSocket
7. Frontend starts sending frames every 1-2 seconds
8. Backend processes frames and returns updated instructions
9. Frontend provides audio feedback: "Walk 13 feet west"
10. User walks, backend tracks progress, updates instructions
11. Frontend provides next instruction: "Walk 5 feet west"
12. User arrives → Backend sends `navigation_complete`
13. Frontend announces: "You have arrived at Room 226"
14. User presses "End" → WebSocket disconnects, session cleared

**Note:** In future versions, step 3 will be automated - the backend will determine the starting position from sensor data (heading, accelerometer, GPS) without requiring user input.

---

## Related Documentation

- [OpenAPI Specification](./openapi.yaml) - Complete API contract
- [Frontend Documentation](./FRONTEND.md) - Frontend setup and architecture
- [Backend Documentation](./BACKEND.md) - Backend implementation details
