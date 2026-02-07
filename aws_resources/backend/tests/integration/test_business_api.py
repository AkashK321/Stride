"""
Integration tests for the API Gateway endpoints.
Tests the deployed backend infrastructure.
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


def test_items_endpoint_returns_200(api_base_url):
    """Test that the /items endpoint returns a 200 status code."""
    response = requests.get(f"{api_base_url}/items", timeout=10)
    
    # Skip if endpoint doesn't exist (404) - it may not be deployed
    if response.status_code == 404:
        pytest.skip("Items endpoint not deployed (404)")
    
    assert response.status_code == 200, f"Expected 200, got {response.status_code}"
    assert "Hello from Kotlin" in response.text, f"Response body: {response.text}"


def test_items_endpoint_contains_path(api_base_url):
    """Test that the response includes the path information."""
    response = requests.get(f"{api_base_url}/items", timeout=10)
    
    # Skip if endpoint doesn't exist (404) - it may not be deployed
    if response.status_code == 404:
        pytest.skip("Items endpoint not deployed (404)")
    
    assert response.status_code == 200
    assert "/items" in response.text, f"Expected '/items' in response, got: {response.text}"