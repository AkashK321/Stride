#!/usr/bin/env python3
"""
Orchestrate local inference dev: tunnel (ngrok), Lambda env merge, optional DynamoDB flag, uvicorn.

Run from inference_server root (or use start_inference_server.sh). Loads .env.inference if present.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen

import boto3
import httpx
from botocore.exceptions import ClientError
from dotenv import load_dotenv

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parent

NGROK_API = "http://127.0.0.1:4040/api/tunnels"
FEATURE_FLAG_KEY = "enable_sagemaker_inference"
FEATURE_FLAG_PK = "feature_name"


def _chdir_root() -> None:
    os.chdir(ROOT)


def _load_env() -> None:
    env_path = ROOT / ".env.inference"
    if env_path.is_file():
        load_dotenv(env_path)


def _bool_env(name: str, default: bool = False) -> bool:
    v = os.environ.get(name, "").strip().lower()
    if not v:
        return default
    return v in ("1", "true", "yes", "on")


def _preflight_aws(region: str) -> None:
    sts = boto3.client("sts", region_name=region)
    ident = sts.get_caller_identity()
    acct = ident.get("Account", "?")
    arn = ident.get("Arn", "?")
    print(f"AWS identity: {arn} (account {acct})")


def _lambda_exists(client, name: str) -> None:
    try:
        client.get_function_configuration(FunctionName=name)
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("ResourceNotFoundException",):
            print(f"Lambda not found: {name!r} (wrong region or name?)", file=sys.stderr)
            raise SystemExit(1) from e
        raise


def _merge_lambda_env(
    client,
    function_name: str,
    *,
    inference_url: str | None = None,
    inference_secret: str | None = None,
    clear_secret: bool = False,
) -> dict[str, str]:
    cfg = client.get_function_configuration(FunctionName=function_name)
    env_block = cfg.get("Environment") or {}
    variables: dict[str, str] = dict(env_block.get("Variables") or {})

    if inference_url is not None:
        variables["INFERENCE_HTTP_URL"] = inference_url.rstrip("/")
    if inference_secret is not None:
        variables["INFERENCE_HTTP_SECRET"] = inference_secret
    if clear_secret and "INFERENCE_HTTP_SECRET" in variables:
        del variables["INFERENCE_HTTP_SECRET"]

    client.update_function_configuration(
        FunctionName=function_name,
        Environment={"Variables": variables},
    )
    return variables


def _teardown_lambda(client, function_name: str, *, yes: bool) -> None:
    if not yes:
        print("Refusing teardown without --yes", file=sys.stderr)
        raise SystemExit(1)
    cfg = client.get_function_configuration(FunctionName=function_name)
    env_block = cfg.get("Environment") or {}
    variables: dict[str, str] = dict(env_block.get("Variables") or {})
    for key in ("INFERENCE_HTTP_URL", "INFERENCE_HTTP_SECRET"):
        variables.pop(key, None)
    client.update_function_configuration(
        FunctionName=function_name,
        Environment={"Variables": variables},
    )
    print("Removed INFERENCE_HTTP_URL and INFERENCE_HTTP_SECRET from Lambda environment.")


def _put_sagemaker_flag_off(ddb, table_name: str) -> None:
    ddb.put_item(
        TableName=table_name,
        Item={
            FEATURE_FLAG_PK: {"S": FEATURE_FLAG_KEY},
            "value": {"BOOL": False},
        },
    )
    print(f"DynamoDB {table_name!r}: {FEATURE_FLAG_KEY} = false (HTTP inference path).")


def _wait_http_ok(url: str, timeout_s: float = 120.0, interval: float = 0.5) -> None:
    deadline = time.monotonic() + timeout_s
    last_err: str | None = None
    while time.monotonic() < deadline:
        try:
            r = httpx.get(url, timeout=5.0)
            if r.status_code < 500:
                return
            last_err = f"HTTP {r.status_code}"
        except httpx.RequestError as e:
            last_err = str(e)
        time.sleep(interval)
    raise RuntimeError(f"Timeout waiting for {url}: {last_err}")


def _fetch_ngrok_public_url() -> str:
    with urlopen(NGROK_API, timeout=5) as resp:
        data: dict[str, Any] = json.loads(resp.read().decode())
    tunnels = data.get("tunnels") or []
    for t in tunnels:
        pub = t.get("public_url") or ""
        if pub.startswith("https://"):
            return pub.rstrip("/")
    raise RuntimeError("No https tunnel in ngrok API response; is ngrok running?")


def _poll_ngrok_public_url(timeout_s: float = 60.0, interval: float = 0.4) -> str:
    deadline = time.monotonic() + timeout_s
    last: str | None = None
    while time.monotonic() < deadline:
        try:
            return _fetch_ngrok_public_url()
        except (URLError, OSError, json.JSONDecodeError, RuntimeError) as e:
            last = str(e)
        time.sleep(interval)
    raise RuntimeError(f"Timed out waiting for ngrok tunnel URL: {last}")


def _start_ngrok(port: int, ngrok_bin: str) -> subprocess.Popen:
    if not shutil.which(ngrok_bin):
        print(
            f"{ngrok_bin!r} not on PATH. Install ngrok or set SKIP_TUNNEL=1 and pass --public-url.",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return subprocess.Popen(
        [ngrok_bin, "http", str(port)],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _start_session_token(base: str) -> str:
    r = httpx.post(f"{base.rstrip('/')}/api/session/start", timeout=30.0)
    r.raise_for_status()
    body = r.json()
    token = body.get("token")
    if not token or not isinstance(token, str):
        raise RuntimeError(f"Unexpected session response: {body!r}")
    return token


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Start local inference with tunnel and Lambda wiring.")
    p.add_argument(
        "--public-url",
        help="Public https base URL (skips starting ngrok; use with SKIP_TUNNEL or external tunnel).",
    )
    p.add_argument(
        "--set-sagemaker-off",
        action="store_true",
        help=f"Write {FEATURE_FLAG_KEY}=false to FEATURE_FLAGS_TABLE_NAME (DynamoDB).",
    )
    p.add_argument(
        "--teardown",
        action="store_true",
        help="Remove INFERENCE_HTTP_URL and INFERENCE_HTTP_SECRET from the Lambda; exit (no server).",
    )
    p.add_argument(
        "--yes",
        action="store_true",
        help="Required with --teardown to confirm Lambda env changes.",
    )
    return p.parse_args()


def main() -> None:
    _chdir_root()
    _load_env()
    args = _parse_args()

    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-1"
    lambda_name = os.environ.get("OBJECT_DETECTION_LAMBDA_NAME", "").strip()
    port = int(os.environ.get("INFERENCE_PORT", "8080"))
    flags_table = os.environ.get("FEATURE_FLAGS_TABLE_NAME", "").strip()
    ngrok_bin = os.environ.get("NGROK_CMD", "ngrok").strip() or "ngrok"
    use_tunnel = not _bool_env("SKIP_TUNNEL") and not args.public_url
    public_url_from_env = os.environ.get("PUBLIC_URL", "").strip()

    if args.teardown:
        if not lambda_name:
            print("OBJECT_DETECTION_LAMBDA_NAME is required.", file=sys.stderr)
            raise SystemExit(1)
        _preflight_aws(region)
        lam = boto3.client("lambda", region_name=region)
        _lambda_exists(lam, lambda_name)
        _teardown_lambda(lam, lambda_name, yes=args.yes)
        return

    if not lambda_name:
        print("Set OBJECT_DETECTION_LAMBDA_NAME in .env.inference (see .env.inference.example).", file=sys.stderr)
        raise SystemExit(1)

    _preflight_aws(region)
    lam = boto3.client("lambda", region_name=region)
    _lambda_exists(lam, lambda_name)

    tunnel_proc: subprocess.Popen | None = None
    public_url: str | None = None

    if args.public_url:
        public_url = args.public_url.rstrip("/")
    elif not use_tunnel:
        if not public_url_from_env:
            print(
                "SKIP_TUNNEL is set but no URL: use --public-url or set PUBLIC_URL in .env.inference.",
                file=sys.stderr,
            )
            raise SystemExit(1)
        public_url = public_url_from_env.rstrip("/")
    else:
        tunnel_proc = _start_ngrok(port, ngrok_bin)
        try:
            public_url = _poll_ngrok_public_url()
        except Exception:
            if tunnel_proc.poll() is None:
                tunnel_proc.terminate()
                tunnel_proc.wait(timeout=5)
            raise
        print(f"Tunnel public URL: {public_url}")

    require_session = _bool_env("INFERENCE_REQUIRE_SESSION")

    child_env = os.environ.copy()
    child_env.setdefault("PYTHONUNBUFFERED", "1")

    uvicorn_cmd = [
        sys.executable,
        "-m",
        "uvicorn",
        "app.main:app",
        "--host",
        "0.0.0.0",
        "--port",
        str(port),
    ]
    uvicorn_proc = subprocess.Popen(
        uvicorn_cmd,
        cwd=str(ROOT),
        env=child_env,
    )

    def stop_tunnel() -> None:
        nonlocal tunnel_proc
        if tunnel_proc is not None and tunnel_proc.poll() is None:
            tunnel_proc.terminate()
            try:
                tunnel_proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                tunnel_proc.kill()
            tunnel_proc = None

    def stop_uvicorn() -> None:
        if uvicorn_proc.poll() is None:
            uvicorn_proc.terminate()
            try:
                uvicorn_proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                uvicorn_proc.kill()

    def on_signal(signum: int, frame: Any) -> None:
        stop_uvicorn()
        stop_tunnel()
        sys.exit(128 + signum)

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    session_secret: str | None = None
    try:
        _wait_http_ok(f"http://127.0.0.1:{port}/ping")
        if require_session:
            session_secret = _start_session_token(f"http://127.0.0.1:{port}")
            print("Session started; merging INFERENCE_HTTP_SECRET onto Lambda.")

        _merge_lambda_env(
            lam,
            lambda_name,
            inference_url=public_url,
            inference_secret=session_secret,
            clear_secret=not require_session,
        )
        print(f"Lambda {lambda_name!r}: INFERENCE_HTTP_URL={public_url!r}")

        if args.set_sagemaker_off:
            if not flags_table:
                print(
                    "--set-sagemaker-off requires FEATURE_FLAGS_TABLE_NAME in .env.inference.",
                    file=sys.stderr,
                )
                raise SystemExit(1)
            ddb = boto3.client("dynamodb", region_name=region)
            _put_sagemaker_flag_off(ddb, flags_table)

        print(f"Uvicorn on http://127.0.0.1:{port}/ (Ctrl+C stops server and tunnel).")
        code = uvicorn_proc.wait()
        stop_tunnel()
        raise SystemExit(code)
    except BaseException:
        stop_uvicorn()
        stop_tunnel()
        raise


if __name__ == "__main__":
    main()
