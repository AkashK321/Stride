# Test Inventory

| Test Case ID | Level (Unit/Int/System) | Requirement ID | Tool | Automated | CI Integrated | Description | Link |
|--------------|-------------------------|----------------|------|------------|----------------|-------------|------|
| CD-01 | Integration | FR-1 | postman | No | No | Validates core collision detection API flow | [link](./Stride_API.postman_collection.json) |
| CD-02 | Integration | FR-2 | postman | No | No | Verifies collision response schema and statuses | [link](./Stride_API.postman_collection.json) |
| NAV-01 | System | FR-3/FR-4 | Full System | No | Planned | End-to-end navigation behavior in real environment | [link](./manual_test_reports/report_001_feature12.md) |
| NAV-02 | Unit | FR-3 | mockk | Yes | Yes | Validates static navigation instruction generation logic | [link](../aws_resources/backend/src/test/kotlin/com/handlers/StaticNavigationHandlerTest.kt) |
| NAV-03 | Integration | FR-3 | pytest | Yes | Yes | Verifies static navigation API request handling | [link](../aws_resources/backend/tests/integration/test_static_navigation_api.py) |
| CD-03 | Unit | FR-1/FR-2 | mockk | Yes | Yes | Checks object detection handler decision branches | [link](../aws_resources/backend/src/test/kotlin/com/handlers/ObjectDetectionHandlerTest.kt) |
| CD-04 | Integration | FR-1/FR-2 | pytest | Yes | Yes | Validates streaming inference integration behavior | [link](../aws_resources/backend/tests/integration/test_stream_api.py) |
| CD-05 | System | FR-1/FR-2 | manual | No | No | | |
| AUTH-04 | Integration/Unit | FR-5 | Pytest, mock | Yes | Yes | Tests auth validation and token issuance | [link](../aws_resources/backend/src/test/kotlin/com/handlers/AuthHandlerTest.kt) |
| AUTH-05 | Integration/Unit | FR-6 | Pytest, mock | Yes | Yes | Verifies login endpoint integration and errors | [link](../aws_resources/backend/tests/integration/test_login_api.py) |
| UI-06 | Integration | FR-7 | React Native Testing Library | Yes | Planned | Checks registration UI flow interactions work | [link](../frontend/__tests__/register.test.tsx) |
| UI-07 | Integration | FR-8 | React Native Testing Library | Yes | Planned | Verifies route guard behavior by auth | [link](../frontend/__tests__/AuthGuard.test.tsx) |
| WCAG-09 | Integration, Unit | NFR-2 | React Native Testing Library, Jest | Yes | Planned | Validates accessible labels and assistive text | [link](../frontend/__tests__/Label.test.tsx) |
| DEPLOY-10 | System | NFR-3 | Detox | Yes | Planned | Tracks deployment validation and release checks | [link](./manual_test_reports/TEMPLATE.md) |
| MT-01 | Unit | FR-1 | Pytest | Yes | Yes | Validates map dataset structural constraints rules | [link](../aws_resources/data_population/tests/test_data_validation.py) |
| MT-02 | Integration | FR-1 | Pytest | Yes | Yes | Tests map population pipeline integration behavior | [link](../aws_resources/data_population/tests/test_populate.py) |
| NAV-04 | Unit | FR-3 | mockk | Yes | Yes | Ensures live navigation schema contract correctness | [link](../aws_resources/backend/src/test/kotlin/com/handlers/LiveNavigationHandlerTest.kt) |
| NAV-05 | Integration | FR-4 | pytest | Yes | Yes | Validates live navigation recalculation integration path | [link](../aws_resources/backend/tests/integration/test_live_navigation_api.py) |
| DATA-03 | Unit | FR-3 | pytest | Yes | Yes | Tests bearing offsets and map transform logic | [link](../aws_resources/data_population/tests/test_populate.py) |
| DATA-04 | Unit | FR-3 | pytest | Yes | Yes | Verifies floor data landmark validation rules | [link](../aws_resources/data_population/tests/test_data_validation.py) |
| UI-08 | Unit | FR-7 | Jest | Yes | Yes | Tests register contact field validation states | [link](../frontend/__tests__/register-contact.test.tsx) |
| UI-09 | Integration | FR-6 | React Native Testing Library, Jest | Yes | Yes | Verifies auth context startup decision paths | [link](../frontend/__tests__/AuthContext.test.tsx) |
| AUTH-06 | Unit | FR-5 | Jest (expo-local-authentication mocks) | Yes | Yes | Tests biometric preference persistence and defaults | [link](../frontend/services/__tests__/tokenStorage.test.ts) |
| AUTH-07 | Integration | FR-5 | React Native Testing Library, Jest | Yes | Yes | Validates biometric startup with refresh fallback | [link](../frontend/__tests__/AuthContext.test.tsx) |
| AUTH-08 | Unit | FR-5 | Jest (SecureStore mocks) | Yes | Yes | Verifies secure storage biometric toggle behavior | [link](../frontend/services/__tests__/tokenStorage.test.ts) |
| AUTH-09 | Unit | FR-6 | mockk | Yes | Yes | Tests backend identifier requirements during register | [link](../aws_resources/backend/src/test/kotlin/com/handlers/AuthHandlerTest.kt) |
| AUTH-10 | Integration | FR-6 | pytest | Yes | Yes | Validates register endpoint email/phone edge cases | [link](../aws_resources/backend/tests/integration/test_register_api.py) |
| API-01 | Unit | FR-6 | Jest | Yes | Yes | Verifies frontend API payload shape handling | [link](../frontend/services/__tests__/api.test.ts) |
| INF-01 | Unit | FR-1 | pytest | Yes | Yes | Tests inference request and contract validations | [link](../inference_server/tests/test_invocations_contract.py) |
| INF-02 | Unit | FR-1 | pytest | Yes | Yes | Verifies session gate authorization and lifecycle | [link](../inference_server/tests/test_session_gate.py) |
| INF-03 | Unit | FR-1 | pytest | Yes | Yes | Tests sqlite metrics persistence and cleanup | [link](../inference_server/tests/test_sqlite_store.py) |
| DR-01 | System | FR-4/NFR-1 | Python scripts + CSV/plot evidence | No | No | Documents dead-reckoning runs and plotted evidence | [link](../test_results/dead_reckoning/README.md) |
| UI-10 | Unit | FR-7 | Jest | Yes | Yes | Tests door side detection variants and arrival instruction formatting with door cue integration | [link](../frontend/__tests__/NavigationInstructionItem.test.tsx) |
| UI-11 | Unit | NFR-2 | Jest | Yes | Yes | Tests tilt-compensated heading calculation, circular mean wraparound, and magnetometer hard-iron calibration | [link](../frontend/__tests__/SensorService.heading.test.ts) |
| UI-12 | Integration | FR-7 | React Native Testing Library, Jest | Yes | Yes | Tests useHeading hook subscription lifecycle, rolling average smoothing, trueHeading/magHeading fallback, and getAlignment across 0°/360° boundary | [link](../frontend/__tests__/useHeading.integration.test.ts) |