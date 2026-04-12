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

REGISTER_TIMEOUT_SECONDS = 10
REGISTER_RETRY_ATTEMPTS = 3
REGISTER_INITIAL_BACKOFF_SECONDS = 1.0


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
        "firstName": "Test",
        "lastName": "User"
    }


def register_user_with_retry(api_base_url, payload):
    """Register test users with retry/backoff when Cognito returns transient 429."""
    delay_seconds = REGISTER_INITIAL_BACKOFF_SECONDS
    last_response = None

    for attempt in range(REGISTER_RETRY_ATTEMPTS):
        response = requests.post(
            f"{api_base_url}/register",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=REGISTER_TIMEOUT_SECONDS
        )
        last_response = response

        if response.status_code != 429:
            return response

        if attempt < REGISTER_RETRY_ATTEMPTS - 1:
            time.sleep(delay_seconds)
            delay_seconds *= 2

    pytest.skip(
        "Registration endpoint remained rate-limited "
        f"after {REGISTER_RETRY_ATTEMPTS} attempts: {last_response.text}"
    )


def test_login_requires_confirmation_after_registration(api_base_url, test_user_credentials):
    """Test login is blocked until a newly registered user is confirmed."""
    # First register a user
    register_response = register_user_with_retry(
        api_base_url,
        {
            "username": test_user_credentials["username"],
            "password": test_user_credentials["password"],
            "passwordConfirm": test_user_credentials["passwordConfirm"],
            "email": test_user_credentials["email"],
            "firstName": test_user_credentials["firstName"],
            "lastName": test_user_credentials["lastName"]
        }
    )
    assert register_response.status_code == 201

    # Newly registered user should not be able to login until confirmed
    response = requests.post(
        f"{api_base_url}/login",
        json={
            "username": test_user_credentials["username"],
            "password": test_user_credentials["password"]
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
    data = response.json()
    assert "error" in data
    assert "not confirmed" in data["error"].lower()


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


def test_login_whitespace_normalization_for_unconfirmed_user(api_base_url, test_user_credentials):
    """Test that whitespace in username is trimmed before unconfirmed-user login check."""
    # Register a user
    register_response = register_user_with_retry(
        api_base_url,
        {
            "username": test_user_credentials["username"],
            "password": test_user_credentials["password"],
            "passwordConfirm": test_user_credentials["passwordConfirm"],
            "email": test_user_credentials["email"],
            "firstName": test_user_credentials["firstName"],
            "lastName": test_user_credentials["lastName"]
        }
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

    # Should still hit the same unconfirmed account response (username was trimmed)
    assert response.status_code == 403, f"Expected 403, got {response.status_code}: {response.text}"
    data = response.json()
    assert "error" in data
    assert "not confirmed" in data["error"].lower()


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
