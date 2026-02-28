import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import boto3
from botocore.exceptions import ClientError

LOGGER = logging.getLogger()
LOGGER.setLevel(logging.INFO)

sagemaker_client = boto3.client("sagemaker")
cloudwatch_client = boto3.client("cloudwatch")
sqs_client = boto3.client("sqs")


def _to_float(value) -> float:
    if value is None:
        return 0.0
    return float(value)


def _get_invocation_sum(endpoint_name: str, window_minutes: int) -> float:
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(minutes=window_minutes)
    response = cloudwatch_client.get_metric_statistics(
        Namespace="AWS/SageMaker",
        MetricName="Invocations",
        Dimensions=[{"Name": "EndpointName", "Value": endpoint_name}],
        StartTime=start_time,
        EndTime=end_time,
        Period=60,
        Statistics=["Sum"],
    )
    datapoints = response.get("Datapoints", [])
    return sum(_to_float(point.get("Sum")) for point in datapoints)


def _get_last_hit_timestamp(endpoint_name: str) -> Optional[str]:
    end_time = datetime.now(timezone.utc)
    # Limit lookup range for bounded API cost.
    start_time = end_time - timedelta(days=7)
    response = cloudwatch_client.get_metric_statistics(
        Namespace="AWS/SageMaker",
        MetricName="Invocations",
        Dimensions=[{"Name": "EndpointName", "Value": endpoint_name}],
        StartTime=start_time,
        EndTime=end_time,
        Period=300,
        Statistics=["Sum"],
    )
    datapoints = response.get("Datapoints", [])
    hits = [point for point in datapoints if _to_float(point.get("Sum")) > 0]
    if not hits:
        return None
    latest = max(hits, key=lambda item: item["Timestamp"])
    return latest["Timestamp"].isoformat()


def _is_async_queue_idle(queue_name: str, window_minutes: int) -> bool:
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(minutes=window_minutes)
    response = cloudwatch_client.get_metric_statistics(
        Namespace="AWS/SQS",
        MetricName="ApproximateNumberOfMessagesVisible",
        Dimensions=[{"Name": "QueueName", "Value": queue_name}],
        StartTime=start_time,
        EndTime=end_time,
        Period=60,
        Statistics=["Maximum"],
    )
    datapoints = response.get("Datapoints", [])
    if not datapoints:
        # No signal; fall back to current queue attributes.
        queue_url_response = sqs_client.get_queue_url(QueueName=queue_name)
        attrs = sqs_client.get_queue_attributes(
            QueueUrl=queue_url_response["QueueUrl"],
            AttributeNames=[
                "ApproximateNumberOfMessages",
                "ApproximateNumberOfMessagesNotVisible",
            ],
        )
        visible = int(attrs["Attributes"].get("ApproximateNumberOfMessages", "0"))
        in_flight = int(
            attrs["Attributes"].get("ApproximateNumberOfMessagesNotVisible", "0")
        )
        return visible == 0 and in_flight == 0

    max_visible = max(_to_float(point.get("Maximum")) for point in datapoints)
    return max_visible == 0


def _delete_endpoint_and_config(endpoint_name: str) -> dict:
    try:
        describe = sagemaker_client.describe_endpoint(EndpointName=endpoint_name)
    except ClientError as exc:
        error_code = exc.response.get("Error", {}).get("Code")
        if error_code == "ValidationException":
            LOGGER.info(
                "Endpoint already missing; nothing to delete",
                extra={"endpoint_name": endpoint_name},
            )
            return {"deleted_endpoint": False, "deleted_config": False}
        raise

    endpoint_status = describe.get("EndpointStatus")
    endpoint_config_name = describe.get("EndpointConfigName")
    if endpoint_status == "Deleting":
        LOGGER.info(
            "Endpoint already deleting",
            extra={
                "endpoint_name": endpoint_name,
                "endpoint_status": endpoint_status,
                "endpoint_config_name": endpoint_config_name,
            },
        )
        return {"deleted_endpoint": False, "deleted_config": False}

    sagemaker_client.delete_endpoint(EndpointName=endpoint_name)
    deleted_config = False
    if endpoint_config_name:
        try:
            sagemaker_client.delete_endpoint_config(
                EndpointConfigName=endpoint_config_name
            )
            deleted_config = True
        except ClientError as exc:
            # Endpoint config can still be "in use" right after DeleteEndpoint.
            LOGGER.warning(
                "DeleteEndpointConfig deferred until endpoint fully deleted",
                extra={
                    "endpoint_name": endpoint_name,
                    "endpoint_config_name": endpoint_config_name,
                    "error": str(exc),
                },
            )

    LOGGER.info(
        "Issued idle decommission",
        extra={
            "endpoint_name": endpoint_name,
            "endpoint_status": endpoint_status,
            "endpoint_config_name": endpoint_config_name,
            "deleted_config": deleted_config,
        },
    )
    return {"deleted_endpoint": True, "deleted_config": deleted_config}


def handler(event, context):
    endpoint_name = os.getenv("SAGEMAKER_ENDPOINT_NAME")
    if not endpoint_name:
        raise ValueError("SAGEMAKER_ENDPOINT_NAME environment variable is required")

    endpoint_type = os.getenv("SAGEMAKER_ENDPOINT_TYPE", "realtime").lower()
    async_queue_name = os.getenv("ASYNC_SQS_QUEUE_NAME", "")
    idle_window_minutes = int(os.getenv("IDLE_WINDOW_MINUTES", "30"))

    invocation_sum = _get_invocation_sum(endpoint_name, idle_window_minutes)
    last_hit_timestamp = _get_last_hit_timestamp(endpoint_name)

    idle_invocations = invocation_sum == 0
    async_queue_idle = True
    if endpoint_type == "async":
        if not async_queue_name:
            raise ValueError(
                "ASYNC_SQS_QUEUE_NAME is required when SAGEMAKER_ENDPOINT_TYPE=async"
            )
        async_queue_idle = _is_async_queue_idle(async_queue_name, idle_window_minutes)

    should_decommission = idle_invocations and async_queue_idle

    log_payload = {
        "endpoint_name": endpoint_name,
        "endpoint_type": endpoint_type,
        "idle_window_minutes": idle_window_minutes,
        "invocations_sum_last_window": invocation_sum,
        "last_hit_timestamp": last_hit_timestamp,
        "async_queue_name": async_queue_name or None,
        "async_queue_idle": async_queue_idle,
        "should_decommission": should_decommission,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if not should_decommission:
        LOGGER.info("Endpoint active; skipping decommission: %s", json.dumps(log_payload))
        return {
            "status": "active",
            "should_decommission": False,
            **log_payload,
        }

    delete_result = _delete_endpoint_and_config(endpoint_name)
    LOGGER.info(
        "Endpoint decommission workflow completed: %s",
        json.dumps({**log_payload, **delete_result}),
    )
    return {
        "status": "decommissioned",
        "should_decommission": True,
        **log_payload,
        **delete_result,
    }
