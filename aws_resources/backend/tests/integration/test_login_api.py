"""
Integration tests for the authentication API endpoints.
Tests the deployed login and register endpoints.
"""
import os
import pytest
import requests
import json
import time
import random
import string


@pytest.fixture
def api_base_url():
    """Get the API base URL from environment variable."""
    url = os.getenv("API_BASE_URL")
    if not url:
        pytest.skip("API_BASE_URL environment variable not set")
    # Remove trailing slash if present
    return url.rstrip("/")


@pytest.fixture
def test_user_credentials():
    """Generate unique test user credentials for each test run."""
    timestamp = int(time.time())
    random_suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
    return {
        "username": f"testuser_{timestamp}_{random_suffix}",
        "password": "TestPass123!",
        "passwordConfirm": "TestPass123!",
        "email": f"test_{timestamp}_{random_suffix}@example.com",
        "phoneNumber": f"+1555{timestamp % 10000000:07d}",  # Generate unique phone number
        "firstName": "Test",
        "lastName": "User"
    }


def test_login_success(api_base_url, test_user_credentials):
    """Test successful login after registration."""
    # First register a user
    register_response = requests.post(
        f"{api_base_url}/register",
        json={
            "username": test_user_credentials["username"],
            "password": test_user_credentials["password"],
            "passwordConfirm": test_user_credentials["passwordConfirm"],
            "email": test_user_credentials["email"],
            "phoneNumber": test_user_credentials["phoneNumber"],
            "firstName": test_user_credentials["firstName"],
            "lastName": test_user_credentials["lastName"]
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )
    assert register_response.status_code == 201

    # Now login
    response = requests.post(
        f"{api_base_url}/login",
        json={
            "username": test_user_credentials["username"],
            "password": test_user_credentials["password"]
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()
    assert "accessToken" in data
    assert "idToken" in data
    assert "refreshToken" in data
    assert "expiresIn" in data
    assert "tokenType" in data
    assert data["tokenType"] == "Bearer"


def test_login_invalid_credentials(api_base_url):
    """Test login with invalid credentials."""
    response = requests.post(
        f"{api_base_url}/login",
        json={
            "username": "nonexistentuser",
            "password": "WrongPassword123!"
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
    data = response.json()
    assert "error" in data
    # Should be either "Invalid username or password" or "User not found"
    assert data["error"] in ["Invalid username or password", "User not found"]


def test_login_missing_fields(api_base_url):
    """Test login with missing required fields."""
    # Missing password
    response = requests.post(
        f"{api_base_url}/login",
        json={
            "username": "testuser"
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
    data = response.json()
    assert "error" in data
    assert "required" in data["error"].lower()


def test_login_invalid_json(api_base_url):
    """Test login with invalid JSON."""
    response = requests.post(
        f"{api_base_url}/login",
        data="invalid json",
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
    data = response.json()
    assert "error" in data


def test_login_whitespace_normalization(api_base_url, test_user_credentials):
    """Test that whitespace in username/password is trimmed."""
    # Register a user
    register_response = requests.post(
        f"{api_base_url}/register",
        json={
            "username": test_user_credentials["username"],
            "password": test_user_credentials["password"],
            "passwordConfirm": test_user_credentials["passwordConfirm"],
            "email": test_user_credentials["email"],
            "phoneNumber": test_user_credentials["phoneNumber"],
            "firstName": test_user_credentials["firstName"],
            "lastName": test_user_credentials["lastName"]
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )
    assert register_response.status_code == 201

    # Login with whitespace in username (should be trimmed)
    response = requests.post(
        f"{api_base_url}/login",
        json={
            "username": f"  {test_user_credentials['username']}  ",
            "password": test_user_credentials["password"]
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    # Should succeed (whitespace trimmed)
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"


def test_invalid_endpoint(api_base_url):
    """Test that invalid endpoints return 404 or 403 (API Gateway behavior)."""
    response = requests.post(
        f"{api_base_url}/invalid",
        json={"username": "test", "password": "test"},
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    # API Gateway returns 403 for missing routes, not 404
    assert response.status_code in [403, 404], f"Expected 403 or 404, got {response.status_code}: {response.text}"
    if response.status_code == 403:
        # API Gateway returns {"message": "Missing Authentication Token"} for 403
        data = response.json()
        assert "message" in data or "error" in data
    else:
        data = response.json()
        assert "error" in data
        assert "not found" in data["error"].lower()
