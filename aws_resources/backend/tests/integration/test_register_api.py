"""
Integration tests for the registration API endpoint.
Tests the deployed register endpoint.
"""
import os
import pytest
import requests
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


def test_register_success(api_base_url, test_user_credentials):
    """Test successful user registration."""
    response = requests.post(
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

    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
    data = response.json()
    assert "message" in data
    assert "User registered successfully" in data["message"]
    assert "username" in data


def test_register_missing_fields(api_base_url):
    """Test registration with missing required fields."""
    # Missing email
    response = requests.post(
        f"{api_base_url}/register",
        json={
            "username": "testuser",
            "password": "TestPass123!"
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
    data = response.json()
    assert "error" in data
    assert "required" in data["error"].lower()


def test_register_invalid_json(api_base_url):
    """Test registration with invalid JSON."""
    response = requests.post(
        f"{api_base_url}/register",
        data="invalid json",
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
    data = response.json()
    assert "error" in data


def test_register_duplicate_username(api_base_url, test_user_credentials):
    """Test registration with existing username."""
    # Register first time
    response1 = requests.post(
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
    assert response1.status_code == 201

    # Try to register again with same username
    timestamp = int(time.time())
    response2 = requests.post(
        f"{api_base_url}/register",
        json={
            "username": test_user_credentials["username"],
            "password": "DifferentPass123!",
            "passwordConfirm": "DifferentPass123!",
            "email": f"different_{timestamp}@example.com",
            "phoneNumber": f"+1555{timestamp % 10000000:07d}",
            "firstName": "Different",
            "lastName": "User"
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    assert response2.status_code == 409, f"Expected 409, got {response2.status_code}: {response2.text}"
    data = response2.json()
    assert "error" in data
    assert data["error"] == "Username already exists"


def test_register_email_lowercase_normalization(api_base_url, test_user_credentials):
    """Test that email is converted to lowercase."""
    timestamp = int(time.time())
    random_suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
    uppercase_email = f"TEST_{timestamp}_{random_suffix}@EXAMPLE.COM"

    response = requests.post(
        f"{api_base_url}/register",
        json={
            "username": f"{test_user_credentials['username']}_email",
            "password": test_user_credentials["password"],
            "passwordConfirm": test_user_credentials["passwordConfirm"],
            "email": uppercase_email,
            "phoneNumber": test_user_credentials["phoneNumber"],
            "firstName": test_user_credentials["firstName"],
            "lastName": test_user_credentials["lastName"]
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    # Should succeed (email normalized to lowercase)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"


def test_register_whitespace_normalization(api_base_url, test_user_credentials):
    """Test that whitespace in fields is trimmed."""
    timestamp = int(time.time())
    random_suffix = ''.join(random.choices(string.ascii_lowercase, k=4))

    response = requests.post(
        f"{api_base_url}/register",
        json={
            "username": f"  {test_user_credentials['username']}_ws  ",
            "password": f"  {test_user_credentials['password']}  ",
            "passwordConfirm": f"  {test_user_credentials['password']}  ",
            "email": f"  {test_user_credentials['email']}  ",
            "phoneNumber": f"  {test_user_credentials['phoneNumber']}  ",
            "firstName": f"  {test_user_credentials['firstName']}  ",
            "lastName": f"  {test_user_credentials['lastName']}  "
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    # Should succeed (whitespace trimmed)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"
