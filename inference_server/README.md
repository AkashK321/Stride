# Local inference server

FastAPI app that exposes the same HTTP surface as the SageMaker container (`GET /ping`, `POST /invocations`) so you can develop and test YOLO inference without invoking AWS. See [aws_resources/sagemaker/inference.py](../aws_resources/sagemaker/inference.py) for the production Flask implementation.

## Model weights

| Use case | Configuration |
|----------|----------------|
| **Trained checkpoint** | Set `YOLO_MODEL_PATH` to your `.pt` file (Ultralytics format, same as SageMaker). |
| **Quick testing / baseline** | Omit `YOLO_MODEL_PATH` and use generic YOLOv11 nano: run `python scripts/download_model.py` to fetch `yolo11n.pt` into `inference_server/.cache/`. |

If `YOLO_MODEL_PATH` is set but the file is missing, the server falls back to `.cache/yolo11n.pt`.

## Setup

```bash
cd inference_server
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/download_model.py   # optional: generic yolo11n for smoke tests
```

**CPU vs GPU:** `pip install -r requirements.txt` pulls a CPU-capable PyTorch by default on supported platforms. For GPU, install a CUDA build of PyTorch that matches your environment (see [PyTorch install matrix](https://pytorch.org/get-started/locally/)), then reinstall `ultralytics` if needed.

## One-command dev loop (`start_inference_server`)

Use this when you want the **object-detection Lambda** in AWS to call your laptop over HTTPS (ngrok) without juggling multiple terminals and manual Lambda env edits.

### Prerequisites

- **AWS credentials** for the account that hosts the stack (`AWS_PROFILE`, SSO, or environment variables). The script runs `sts get-caller-identity` first so you can confirm the account.
- **ngrok** installed and authenticated (`ngrok` on `PATH`, or set `NGROK_CMD` in `.env.inference` to the binary path).
- **Physical Lambda name** for the object-detection function (CloudFormation → stack → Resources → handler → Physical ID), not the logical ID.
- Optional: **`FEATURE_FLAGS_TABLE_NAME`** if you use `--set-sagemaker-off` so DynamoDB `enable_sagemaker_inference` is written as `false` (same shape as [integration tests](../aws_resources/backend/tests/integration/test_stream_api.py): partition key `feature_name`, attribute `value`).

### Configure

```bash
cp .env.inference.example .env.inference
# Edit OBJECT_DETECTION_LAMBDA_NAME, AWS_REGION, and optionally FEATURE_FLAGS_TABLE_NAME
```

### Run

From `inference_server/`:

```bash
./start_inference_server.sh
```

With session gating (Lambda must send `X-Stride-Inference-Secret`; the script starts a session and merges `INFERENCE_HTTP_SECRET` on the Lambda):

```bash
INFERENCE_REQUIRE_SESSION=1 ./start_inference_server.sh
```

First time forcing HTTP instead of SageMaker (writes the feature flag; requires `FEATURE_FLAGS_TABLE_NAME`):

```bash
./start_inference_server.sh --set-sagemaker-off
```

**Manual tunnel:** set `SKIP_TUNNEL=1` and either `PUBLIC_URL=https://...` in `.env.inference` or pass `--public-url https://...` (for cloudflared or an existing ngrok session).

**Teardown** (removes `INFERENCE_HTTP_URL` and `INFERENCE_HTTP_SECRET` from the Lambda only):

```bash
python scripts/start_dev_inference.py --teardown --yes
```

The script starts **ngrok** (unless skipped), waits for **`/ping`**, optionally **`POST /api/session/start`**, merges environment variables on the Lambda (never wipes unrelated keys), then runs **uvicorn** in the foreground. **Ctrl+C** stops uvicorn and the ngrok child.

### Mobile app WebSocket URL

This script does **not** change the Expo app. The app must still use the **same backend stack** WebSocket endpoint: set **`EXPO_PUBLIC_WS_API_URL`** in the frontend env (see [`frontend/.env.example`](../frontend/.env.example) and [`docs/FRONTEND.md`](../docs/FRONTEND.md)).

### Troubleshooting

| Symptom | What to check |
|--------|-----------------|
| `Lambda not found` | `OBJECT_DETECTION_LAMBDA_NAME` and `AWS_REGION` match the deployed function. |
| Wrong AWS account | `aws sts get-caller-identity` / the identity line printed at startup. |
| ngrok URL never appears | ngrok running; local API `http://127.0.0.1:4040/api/tunnels` reachable; free-tier session limits. |
| Lambda still hits SageMaker | Run with `--set-sagemaker-off` (and correct `FEATURE_FLAGS_TABLE_NAME`), or set `enable_sagemaker_inference` to false manually in DynamoDB. |
| `503` from `/invocations` with session mode | Start session from the dashboard or use `INFERENCE_REQUIRE_SESSION=0` for local-only testing; ensure `INFERENCE_HTTP_SECRET` on Lambda matches the current token. |

## Run

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8080

# When using a tunnel to AWS Lambda, require dashboard session + secret header:
INFERENCE_REQUIRE_SESSION=1 uvicorn app.main:app --host 127.0.0.1 --port 8080
```

- **SageMaker-compatible API:** `http://127.0.0.1:8080/ping`, `POST http://127.0.0.1:8080/invocations`
- **Dev dashboard:** `http://127.0.0.1:8080/` — recent request/response pairs, images, and detection overlays
- **API:** `GET /api/logs`, `GET /api/logs/{id}`, `GET /api/logs/{id}/image`, `GET /api/logs/{id}/overlay`, `POST /api/logs/clear`

Bind on all interfaces (e.g. LAN): `--host 0.0.0.0`. This tooling is for local development only; do not expose it on untrusted networks.

### Environment

| Variable | Description |
|----------|-------------|
| `YOLO_MODEL_PATH` | Path to trained `.pt` (optional). |
| `LOG_MAX_ENTRIES` | Max invocation rows in memory (default `100`). |
| `LOG_MAX_IMAGE_BYTES` | Max stored request bytes per log entry (default `2` MiB). |
| `INFERENCE_REQUIRE_SESSION` | If `1` / `true` / `yes`, `POST /invocations` is allowed only while a dashboard session is active **and** the client sends header `X-Stride-Inference-Secret` matching the session token. Recommended when using a public tunnel. Default (unset) = off for local curl. |

### Tunnel + session security

The **mobile app never calls** your inference URL. Only the **object-detection Lambda** does (when SageMaker is off and `INFERENCE_HTTP_URL` is set).

1. Run the server with `INFERENCE_REQUIRE_SESSION=1` before exposing a tunnel.
2. Open the dashboard → **Start session** → copy the generated token.
3. Set Lambda environment **`INFERENCE_HTTP_SECRET`** to that exact value (dev function only). The Kotlin client sends it as **`X-Stride-Inference-Secret`** on each `POST /invocations`.
4. **End session** on the dashboard when done; Lambda calls will get `503` until you start again (and you must update `INFERENCE_HTTP_SECRET` if you rotate the token).

`GET /ping` stays **ungated** so tunnel health checks still work. Do not put secrets in `cdk.context.json` or commit them; use the Lambda console, AWS CLI with a merged env map, or Secrets Manager for teams.

### Smoke test (curl)

```bash
# With INFERENCE_REQUIRE_SESSION unset (default):
curl -sS -X POST http://127.0.0.1:8080/invocations \
  -H "Content-Type: image/jpeg" \
  --data-binary @path/to/image.jpg | jq .

# With INFERENCE_REQUIRE_SESSION=1, after starting a session on the dashboard:
curl -sS -X POST http://127.0.0.1:8080/invocations \
  -H "Content-Type: image/jpeg" \
  -H "X-Stride-Inference-Secret: YOUR_TOKEN" \
  --data-binary @path/to/image.jpg | jq .
```

OpenAPI is available at `/docs` for auxiliary routes; for `/invocations` contract testing, prefer `curl` or scripts because the raw binary body is awkward in Swagger UI.

## Tests

```bash
pytest
```

The suite uses mocks for most contract checks. A full forward pass runs only when `.cache/yolo11n.pt` exists (after `download_model.py`).

On pull requests that touch `inference_server/`, GitHub Actions runs the same tests (see [.github/workflows/inference-server.yaml](../.github/workflows/inference-server.yaml)); the real-YOLO case may skip in CI if weights are not cached.

## Parity checklist (vs SageMaker)

Keep in sync with `aws_resources/sagemaker/inference.py`:

- Allowed `Content-Type` values: `image/jpeg`, `image/png`, `application/octet-stream`
- Success JSON: `success`, `predictions[]` (`class`, `confidence`, `box.x1..y2`), `image.width`, `image.height`
- HTTP status codes: 400 (bad input), 500 (model error / not loaded), 200 (success)

The Kotlin client that parses responses is [SageMakerClient.kt](../aws_resources/backend/src/main/kotlin/com/services/SageMakerClient.kt).

## AWS Lambda (WebSocket) integration

The object-detection Lambda can call this server instead of SageMaker when:

1. DynamoDB feature flag `enable_sagemaker_inference` is **false**, and  
2. Lambda env **`INFERENCE_HTTP_URL`** is set to your server base URL (no trailing slash), e.g. `http://10.0.1.50:8080`.

The handler then `POST`s to `{INFERENCE_HTTP_URL}/invocations` with the same JSON as SageMaker. If Lambda has **`INFERENCE_HTTP_SECRET`** set, it sends header **`X-Stride-Inference-Secret`** (must match an active dashboard session when the server runs with **`INFERENCE_REQUIRE_SESSION=1`**).

In CDK, context key `inferenceHttpUrl` can inject `INFERENCE_HTTP_URL` on deploy. **Do not** commit `INFERENCE_HTTP_SECRET` in git; set it manually or via Secrets Manager for dev.

**Note:** Lambda cannot reach `127.0.0.1` on your laptop. Use a reachable host (VPC private IP, ECS/ALB, API Gateway HTTP integration, VPN, or a tunnel such as ngrok) for that URL.

## Optional: shared inference core

The SageMaker Docker image still uses its own `inference.py`. To deduplicate logic, you could extract shared prediction code into this tree and adjust the Docker build context to `COPY` it—see plan notes; not required for local use.
