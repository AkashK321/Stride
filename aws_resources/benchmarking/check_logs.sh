#!/bin/bash

# Helper script to check CloudWatch logs for all benchmark endpoints
# Usage: ./check_logs.sh [time_window]
# Example: ./check_logs.sh 1h  (default is 30m)

TIME_WINDOW=${1:-30m}
REGION=${AWS_REGION:-us-east-1}

ENDPOINTS=(
    "benchmark-yolov11-nano"
    "benchmark-yolo-nas"
    "benchmark-yolo-realtime"
)

echo "================================================"
echo "Checking SageMaker Endpoint Logs"
echo "Time Window: ${TIME_WINDOW}"
echo "Region: ${REGION}"
echo "================================================"

for endpoint in "${ENDPOINTS[@]}"; do
    LOG_GROUP="/aws/sagemaker/Endpoints/${endpoint}"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📊 Endpoint: ${endpoint}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Check if log group exists
    if aws logs describe-log-groups --log-group-name-prefix "${LOG_GROUP}" --region "${REGION}" --query 'logGroups[0].logGroupName' --output text 2>/dev/null | grep -q "${LOG_GROUP}"; then
        echo "✅ Log group found: ${LOG_GROUP}"
        
        # Get recent logs
        echo ""
        echo "Recent logs (last ${TIME_WINDOW}):"
        echo "---"
        aws logs tail "${LOG_GROUP}" --since "${TIME_WINDOW}" --region "${REGION}" --format short 2>/dev/null || echo "⚠️  No logs in the specified time window"
    else
        echo "❌ Log group not found: ${LOG_GROUP}"
        echo "   This could mean:"
        echo "   - The endpoint hasn't been created yet"
        echo "   - The endpoint was never invoked"
        echo "   - The endpoint is in a different region"
    fi
    
    echo ""
done

echo "================================================"
echo "Done! To monitor logs in real-time, use:"
echo "  aws logs tail /aws/sagemaker/Endpoints/benchmark-yolov11-nano --follow"
echo "================================================"
