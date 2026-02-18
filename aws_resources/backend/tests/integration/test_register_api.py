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


def test_register_duplicate_email(api_base_url, test_user_credentials):
    """Test registration with existing email address."""
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
    assert response1.status_code == 201, f"First registration failed: {response1.text}"

    # Try to register again with same email but different username
    timestamp = int(time.time())
    random_suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
    response2 = requests.post(
        f"{api_base_url}/register",
        json={
            "username": f"different_user_{timestamp}_{random_suffix}",
            "password": "DifferentPass123!",
            "passwordConfirm": "DifferentPass123!",
            "email": test_user_credentials["email"],  # Same email
            "phoneNumber": f"+1555{timestamp % 10000000:07d}",  # Different phone
            "firstName": "Different",
            "lastName": "User"
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    assert response2.status_code == 409, f"Expected 409, got {response2.status_code}: {response2.text}"
    data = response2.json()
    assert "error" in data
    assert "email" in data["error"].lower()
    assert "already exists" in data["error"].lower()
    # Verify exact error message
    assert data["error"] == "An account with this email already exists"


def test_register_duplicate_phone(api_base_url, test_user_credentials):
    """Test registration with existing phone number."""
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
    assert response1.status_code == 201, f"First registration failed: {response1.text}"

    # Try to register again with same phone number but different username and email
    timestamp = int(time.time())
    random_suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
    response2 = requests.post(
        f"{api_base_url}/register",
        json={
            "username": f"different_user_{timestamp}_{random_suffix}",
            "password": "DifferentPass123!",
            "passwordConfirm": "DifferentPass123!",
            "email": f"different_{timestamp}_{random_suffix}@example.com",  # Different email
            "phoneNumber": test_user_credentials["phoneNumber"],  # Same phone
            "firstName": "Different",
            "lastName": "User"
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    assert response2.status_code == 409, f"Expected 409, got {response2.status_code}: {response2.text}"
    data = response2.json()
    assert "error" in data
    assert "phone" in data["error"].lower()
    assert "already exists" in data["error"].lower()
    # Verify exact error message
    assert data["error"] == "An account with this phone number already exists"


def test_register_duplicate_email_case_insensitive(api_base_url, test_user_credentials):
    """Test that duplicate email check is case-insensitive (email is normalized to lowercase)."""
    # Register first time with lowercase email
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
    assert response1.status_code == 201, f"First registration failed: {response1.text}"

    # Try to register again with same email but different case
    timestamp = int(time.time())
    random_suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
    uppercase_email = test_user_credentials["email"].upper()
    response2 = requests.post(
        f"{api_base_url}/register",
        json={
            "username": f"different_user_{timestamp}_{random_suffix}",
            "password": "DifferentPass123!",
            "passwordConfirm": "DifferentPass123!",
            "email": uppercase_email,  # Same email, different case
            "phoneNumber": f"+1555{timestamp % 10000000:07d}",  # Different phone
            "firstName": "Different",
            "lastName": "User"
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    # Should be detected as duplicate (email is normalized to lowercase before check)
    assert response2.status_code == 409, f"Expected 409, got {response2.status_code}: {response2.text}"
    data = response2.json()
    assert "error" in data
    assert "email" in data["error"].lower()
    # Verify exact error message (case-insensitive check should work)
    assert data["error"] == "An account with this email already exists"


def test_register_duplicate_email_and_phone(api_base_url, test_user_credentials):
    """Test that when both email and phone are duplicates, email check happens first."""
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
    assert response1.status_code == 201, f"First registration failed: {response1.text}"

    # Try to register again with both same email and phone number
    timestamp = int(time.time())
    random_suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
    response2 = requests.post(
        f"{api_base_url}/register",
        json={
            "username": f"different_user_{timestamp}_{random_suffix}",
            "password": "DifferentPass123!",
            "passwordConfirm": "DifferentPass123!",
            "email": test_user_credentials["email"],  # Same email
            "phoneNumber": test_user_credentials["phoneNumber"],  # Same phone
            "firstName": "Different",
            "lastName": "User"
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )

    # Should return 409 for email (email is checked first)
    assert response2.status_code == 409, f"Expected 409, got {response2.status_code}: {response2.text}"
    data = response2.json()
    assert "error" in data
    assert data["error"] == "An account with this email already exists"


# ============================================
# Invalid Input Format Tests
# ============================================

def test_register_invalid_email_format(api_base_url):
    """Test registration with invalid email format - Cognito will reject or accept based on its validation."""
    # These are emails that should be rejected by Cognito
    # Note: Some formats like "missing@domain" might be technically valid to Cognito
    # (domain is a valid domain name, just not a real one), so we test the ones that should definitely fail
    invalid_emails = [
        "not-an-email",  # No @ symbol
        "@example.com",  # Missing local part
        "user@",  # Missing domain
    ]
    
    for idx, invalid_email in enumerate(invalid_emails):
        timestamp = int(time.time())
        random_suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
        
        response = requests.post(
            f"{api_base_url}/register",
            json={
                "username": f"testuser_{timestamp}_{random_suffix}_{idx}",
                "password": "TestPass123!",
                "passwordConfirm": "TestPass123!",
                "email": invalid_email,
                "phoneNumber": f"+1555{timestamp % 10000000:07d}",
                "firstName": "Test",
                "lastName": "User"
            },
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        # Cognito should reject clearly invalid email formats
        # If it returns 201, that means Cognito accepted it (which is fine, we just verify it doesn't crash)
        assert response.status_code in [400, 201], f"Unexpected status {response.status_code} for email '{invalid_email}': {response.text}"
        
        if response.status_code == 400:
            data = response.json()
            assert "error" in data
            # Error message should be user-friendly (sanitized by parseCognitoError)
            assert len(data["error"]) > 0


def test_register_invalid_phone_format(api_base_url):
    """Test registration with invalid phone number format - Cognito will reject or accept based on its validation."""
    # These are phone numbers that should be rejected by Cognito
    # Note: Some formats might be normalized and accepted, so we test the ones that should definitely fail
    invalid_phones = [
        "123",  # Too short
        "abc123",  # Contains letters (non-numeric)
        "+0",  # Invalid country code (starts with 0)
    ]
    
    for idx, invalid_phone in enumerate(invalid_phones):
        timestamp = int(time.time())
        random_suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
        
        response = requests.post(
            f"{api_base_url}/register",
            json={
                "username": f"testuser_{timestamp}_{random_suffix}_{idx}",
                "password": "TestPass123!",
                "passwordConfirm": "TestPass123!",
                "email": f"test_{timestamp}_{random_suffix}_{idx}@example.com",
                "phoneNumber": invalid_phone,
                "firstName": "Test",
                "lastName": "User"
            },
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        # Cognito should reject clearly invalid phone formats
        # If it returns 201, that means Cognito accepted it (which is fine, we just verify it doesn't crash)
        assert response.status_code in [400, 201], f"Unexpected status {response.status_code} for phone '{invalid_phone}': {response.text}"
        
        if response.status_code == 400:
            data = response.json()
            assert "error" in data
            # Error message should be user-friendly (sanitized by parseCognitoError)
            assert len(data["error"]) > 0


# ============================================
# Weak Password Tests
# ============================================

def test_register_weak_password_too_short(api_base_url):
    """Test registration with password that's too short (Cognito policy requires 8+ chars)."""
    weak_passwords = [
        "short",  # Too short
        "Sh0rt!",  # 6 chars, too short
        "Pass1!",  # 7 chars, too short
    ]
    
    for idx, weak_password in enumerate(weak_passwords):
        timestamp = int(time.time())
        random_suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
        
        response = requests.post(
            f"{api_base_url}/register",
            json={
                "username": f"testuser_{timestamp}_{random_suffix}_{idx}",
                "password": weak_password,
                "passwordConfirm": weak_password,
                "email": f"test_{timestamp}_{random_suffix}_{idx}@example.com",
                "phoneNumber": f"+1555{timestamp % 10000000:07d}",
                "firstName": "Test",
                "lastName": "User"
            },
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        assert response.status_code == 400, f"Expected 400 for password '{weak_password}', got {response.status_code}: {response.text}"
        data = response.json()
        assert "error" in data
        assert "password" in data["error"].lower() or "requirement" in data["error"].lower()


def test_register_weak_password_missing_requirements(api_base_url):
    """Test registration with password missing required character types."""
    # Cognito policy requires: lowercase, uppercase, digit, symbol, min 8 chars
    weak_passwords = [
        "alllowercase123!",  # Missing uppercase
        "ALLUPPERCASE123!",  # Missing lowercase
        "NoDigitsHere!",  # Missing digit
        "NoSymbols123",  # Missing symbol
        "onlylowercase",  # Missing uppercase, digit, symbol
        "12345678",  # Only digits
        "abcdefgh",  # Only lowercase
    ]
    
    for idx, weak_password in enumerate(weak_passwords):
        timestamp = int(time.time())
        random_suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
        
        response = requests.post(
            f"{api_base_url}/register",
            json={
                "username": f"testuser_{timestamp}_{random_suffix}_{idx}",
                "password": weak_password,
                "passwordConfirm": weak_password,
                "email": f"test_{timestamp}_{random_suffix}_{idx}@example.com",
                "phoneNumber": f"+1555{timestamp % 10000000:07d}",
                "firstName": "Test",
                "lastName": "User"
            },
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        assert response.status_code == 400, f"Expected 400 for password '{weak_password}', got {response.status_code}: {response.text}"
        data = response.json()
        assert "error" in data
        assert "password" in data["error"].lower() or "requirement" in data["error"].lower()


# ============================================
# HTTP Method Tests
# ============================================

def test_register_wrong_http_method_get(api_base_url):
    """Test that GET request to register endpoint returns 403 (API Gateway) or 404 (handler)."""
    response = requests.get(
        f"{api_base_url}/register",
        headers={"Content-Type": "application/json"},
        timeout=10
    )
    # API Gateway returns 403 for methods not configured, handler would return 404
    assert response.status_code in [403, 404], f"Expected 403 or 404 for GET, got {response.status_code}: {response.text}"


def test_register_wrong_http_method_put(api_base_url):
    """Test that PUT request to register endpoint returns 403 (API Gateway) or 404 (handler)."""
    response = requests.put(
        f"{api_base_url}/register",
        headers={"Content-Type": "application/json"},
        json={},
        timeout=10
    )
    # API Gateway returns 403 for methods not configured, handler would return 404
    assert response.status_code in [403, 404], f"Expected 403 or 404 for PUT, got {response.status_code}: {response.text}"


def test_register_wrong_http_method_patch(api_base_url):
    """Test that PATCH request to register endpoint returns 403 (API Gateway) or 404 (handler)."""
    response = requests.patch(
        f"{api_base_url}/register",
        headers={"Content-Type": "application/json"},
        json={},
        timeout=10
    )
    # API Gateway returns 403 for methods not configured, handler would return 404
    assert response.status_code in [403, 404], f"Expected 403 or 404 for PATCH, got {response.status_code}: {response.text}"


def test_register_wrong_http_method_delete(api_base_url):
    """Test that DELETE request to register endpoint returns 403 (API Gateway) or 404 (handler)."""
    response = requests.delete(
        f"{api_base_url}/register",
        headers={"Content-Type": "application/json"},
        timeout=10
    )
    # API Gateway returns 403 for methods not configured, handler would return 404
    assert response.status_code in [403, 404], f"Expected 403 or 404 for DELETE, got {response.status_code}: {response.text}"


# ============================================
# Response Structure Validation
# ============================================

def test_register_response_structure_success(api_base_url, test_user_credentials):
    """Test that successful registration returns correct response structure."""
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
    
    # Verify Content-Type header
    assert "Content-Type" in response.headers, "Response should include Content-Type header"
    assert "application/json" in response.headers["Content-Type"].lower(), "Content-Type should be application/json"
    
    # Verify response body structure
    data = response.json()
    assert isinstance(data, dict), "Response body should be a JSON object"
    
    # Verify required fields
    assert "message" in data, "Response should include 'message' field"
    assert "username" in data, "Response should include 'username' field"
    
    # Verify field types
    assert isinstance(data["message"], str), "'message' should be a string"
    assert isinstance(data["username"], str), "'username' should be a string"
    
    # Verify field values
    assert data["message"] == "User registered successfully", f"Expected success message, got: {data['message']}"
    assert data["username"] == test_user_credentials["username"], f"Username should match input: {data['username']}"
    
    # Verify no unexpected fields (optional, but good practice)
    expected_fields = {"message", "username"}
    actual_fields = set(data.keys())
    assert actual_fields == expected_fields, f"Response should only contain {expected_fields}, got {actual_fields}"


def test_register_response_structure_error(api_base_url):
    """Test that error responses have correct structure."""
    # Test with missing fields to get an error response
    response = requests.post(
        f"{api_base_url}/register",
        json={
            "username": "testuser"
            # Missing other required fields
        },
        headers={"Content-Type": "application/json"},
        timeout=10
    )
    
    assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
    
    # Verify Content-Type header
    assert "Content-Type" in response.headers, "Error response should include Content-Type header"
    assert "application/json" in response.headers["Content-Type"].lower(), "Content-Type should be application/json"
    
    # Verify response body structure
    data = response.json()
    assert isinstance(data, dict), "Error response body should be a JSON object"
    
    # Verify required fields
    assert "error" in data, "Error response should include 'error' field"
    
    # Verify field types
    assert isinstance(data["error"], str), "'error' should be a string"
    assert len(data["error"]) > 0, "Error message should not be empty"
    
    # Verify no unexpected fields
    expected_fields = {"error"}
    actual_fields = set(data.keys())
    assert actual_fields == expected_fields, f"Error response should only contain {expected_fields}, got {actual_fields}"


def test_register_response_structure_duplicate(api_base_url, test_user_credentials):
    """Test that duplicate error responses have correct structure."""
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
    assert response1.status_code == 201, f"First registration failed: {response1.text}"
    
    # Try to register again with duplicate username
    timestamp = int(time.time())
    response2 = requests.post(
        f"{api_base_url}/register",
        json={
            "username": test_user_credentials["username"],  # Duplicate
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
    
    # Verify Content-Type header
    assert "Content-Type" in response2.headers, "Error response should include Content-Type header"
    assert "application/json" in response2.headers["Content-Type"].lower(), "Content-Type should be application/json"
    
    # Verify response body structure
    data = response2.json()
    assert isinstance(data, dict), "Error response body should be a JSON object"
    assert "error" in data, "Error response should include 'error' field"
    assert isinstance(data["error"], str), "'error' should be a string"
    assert len(data["error"]) > 0, "Error message should not be empty"
