"""
Idle SageMaker endpoint decommission handler.

Triggered by CloudWatch Alarm notifications (via SNS) when endpoint
Invocations remain idle for the configured window.
"""

import json
import os
from typing import Any

import boto3
from botocore.exceptions import ClientError


def _extract_alarm_messages(event: dict[str, Any]) -> list[str]:
    records = event.get("Records", [])
    messages: list[str] = []
    for record in records:
        sns = record.get("Sns", {})
        msg = sns.get("Message")
        if isinstance(msg, str):
            messages.append(msg)
    return messages


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    endpoint_name = os.environ["SAGEMAKER_ENDPOINT_NAME"]
    region = os.environ.get("AWS_REGION")

    client = boto3.client("sagemaker", region_name=region)

    alarm_messages = _extract_alarm_messages(event)
    for msg in alarm_messages:
        # CloudWatch alarm notifications pass JSON as a string in SNS message.
        try:
            payload = json.loads(msg)
            state = payload.get("NewStateValue")
            if state and state != "ALARM":
                return {
                    "statusCode": 200,
                    "body": f"Ignored notification with state={state}",
                }
        except json.JSONDecodeError:
            # If format is unexpected, continue with conservative deletion flow.
            pass

    try:
        desc = client.describe_endpoint(EndpointName=endpoint_name)
        status = desc.get("EndpointStatus", "UNKNOWN")
        if status in {"Deleting", "DeleteFailed"}:
            return {
                "statusCode": 200,
                "body": f"Endpoint already in terminal delete flow: {status}",
            }

        client.delete_endpoint(EndpointName=endpoint_name)
        return {
            "statusCode": 200,
            "body": f"DeleteEndpoint triggered for {endpoint_name}",
        }
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "")
        if code in {"ValidationException", "ResourceNotFound"}:
            # Endpoint may already be deleted; treat as success for idempotency.
            return {
                "statusCode": 200,
                "body": f"Endpoint not deletable/already gone: {endpoint_name}",
            }
        raise
