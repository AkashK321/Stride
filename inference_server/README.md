# Local inference server

FastAPI app exposing Stride's HTTP inference contract:

- `GET /ping`
- `POST /invocations`

Use it to run YOLO locally and point the AWS object-detection Lambda to your endpoint via `INFERENCE_HTTP_URL`.

## Model weights

| Use case | Configuration |
|----------|----------------|
| **Trained checkpoint** | Set `YOLO_MODEL_PATH` to your `.pt` file (Ultralytics format). |
| **Quick testing / baseline** | Omit `YOLO_MODEL_PATH` and run `python scripts/download_model.py` to fetch `yolo11l.pt` into `inference_server/.cache/`. |

If `YOLO_MODEL_PATH` is set but missing, the server falls back to `.cache/yolo11l.pt`.

## Setup

```bash
cd inference_server
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python scripts/download_model.py   # optional: generic yolo11l for smoke tests
```

**CPU vs GPU:** `pip install -r requirements.txt` pulls CPU-capable PyTorch by default on supported platforms. For GPU, install a CUDA build of PyTorch that matches your environment (see [PyTorch install matrix](https://pytorch.org/get-started/locally/)), then reinstall `ultralytics` if needed.

## One-command dev loop (`start_inference_server`)

Use this when you want the AWS object-detection Lambda to call your machine over HTTPS (ngrok) without manual env-merging steps.

### Prerequisites

- AWS credentials for the account hosting your stack (`AWS_PROFILE`, SSO, or env vars). Script validates identity with `sts get-caller-identity`.
- `ngrok` installed and authenticated (`ngrok` on `PATH`, or set `NGROK_CMD` in `.env.inference`).
- Physical Lambda function name for object detection (CloudFormation resource physical ID).

### Configure

```bash
cp .env.inference.example .env.inference
# Edit OBJECT_DETECTION_LAMBDA_NAME and AWS_REGION
```

### Run

```bash
./start_inference_server.sh
```

With session gating enabled:

```bash
INFERENCE_REQUIRE_SESSION=1 ./start_inference_server.sh
```

Manual tunnel mode:

```bash
SKIP_TUNNEL=1 ./start_inference_server.sh --public-url https://your-tunnel-url
```

Teardown (removes `INFERENCE_HTTP_URL` and `INFERENCE_HTTP_SECRET` from Lambda env):

```bash
python scripts/start_dev_inference.py --teardown --yes
```

The script starts ngrok (unless skipped), waits for `/ping`, optionally starts a session token flow, merges Lambda env vars (without wiping unrelated keys), then runs uvicorn in the foreground.

## Run manually

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8080

# Require dashboard session + secret header:
INFERENCE_REQUIRE_SESSION=1 uvicorn app.main:app --host 127.0.0.1 --port 8080
```

- Inference API: `http://127.0.0.1:8080/ping`, `POST http://127.0.0.1:8080/invocations`
- Dev dashboard: `http://127.0.0.1:8080/`
- Dashboard API: `GET /api/logs`, `GET /api/logs/{id}`, `GET /api/logs/{id}/image`, `GET /api/logs/{id}/overlay`, `POST /api/logs/clear`

## Environment

| Variable | Description |
|----------|-------------|
| `YOLO_MODEL_PATH` | Path to trained `.pt` (optional). |
| `INFERENCE_DATA_DIR` | Base directory for local dashboard persistence (SQLite + artifacts). Default: `inference_server/.data/`. |
| `INFERENCE_DB_PATH` | Full path to the dashboard SQLite DB file. Default: `${INFERENCE_DATA_DIR}/dashboard.sqlite3`. |
| `INFERENCE_REQUIRE_SESSION` | If `1` / `true` / `yes`, `POST /invocations` requires active dashboard session + `X-Stride-Inference-Secret`. |

## Lambda integration notes

The mobile app never calls your local inference URL directly. The object-detection Lambda calls it when `INFERENCE_HTTP_URL` is set.

1. Start server with `INFERENCE_REQUIRE_SESSION=1` before exposing a public tunnel.
2. Start a dashboard session and copy token.
3. Set Lambda env `INFERENCE_HTTP_SECRET` to that token.
4. End session when done.

In CDK, context key `inferenceHttpUrl` can set `INFERENCE_HTTP_URL` during deploy. Do not commit secrets in git.

## Contract checklist (`POST /invocations`)

- Allowed `Content-Type`: `image/jpeg`, `image/png`, `application/octet-stream`
- Success JSON: `success`, `predictions[]` (`class`, `confidence`, `box.x1..y2`), `image.width`, `image.height`
- Status codes: `400` bad input, `500` model/internal error, `200` success

## Tests

```bash
pytest
```

Most tests use mocks. A full forward pass runs when `.cache/yolo11l.pt` exists.
