"""
Integration tests for the API Gateway endpoints.
Tests the deployed backend infrastructure and the RDS database integration.
"""
import os
import pytest
import requests

@pytest.fixture
def api_base_url():
    """Get the API base URL from environment variable."""
    url = os.getenv("API_BASE_URL")
    if not url:
        pytest.skip("API_BASE_URL environment variable not set")
    # Remove trailing slash if present
    return url.rstrip("/")

# --- GET /search Tests ---

## TODO: add tests once db population is done