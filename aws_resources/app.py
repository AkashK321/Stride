#!/usr/bin/env python3
import os
import subprocess
import re
import sys

import aws_cdk as cdk

from cdk.cdk_stack import CdkStack


def get_current_branch():
    """Get the current git branch name.

    Exits with error code 1 if branch cannot be determined or if in detached HEAD state.
    """
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            cwd=os.path.dirname(__file__),
        )
        branch_name = result.stdout.strip()

        # Fail if branch name is empty, None, or "HEAD" (detached HEAD state)
        if not branch_name or branch_name == "HEAD":
            print("ERROR: Invalid branch name detected")
            print()
            if branch_name == "HEAD":
                print("You are in a detached HEAD state. This is not allowed.")
                print(
                    "The pipeline requires a valid branch name to determine the stack name."
                )
            else:
                print("Empty or None branch name returned from git.")
            print()
            print("This can happen if:")
            print(" 1. Git is not installed or not in your PATH")
            print(" 2. You are not in a git repository (ensure you're at the root)")
            print(" 3. You are in a detached HEAD state (checkout a branch)")
            print()
            print("To fix:")
            print(" - Verify git is installed: git --version")
            print(" - Ensure that you're in the project root directory")
            print(" - Checkout a branch: git checkout <branch-name>")
            sys.exit(1)

        return branch_name
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("ERROR: Could not detect git branch name")
        print()
        print("This can happen if:")
        print(" 1. Git is not installed or not in your PATH")
        print(" 2. You are not in a git repository (ensure you're at the root)")
        print(" 3. You are in a detached HEAD state (checkout a branch)")
        print()
        print("To fix:")
        print(" - Verify git is installed: git --version")
        print(" - Ensure that you're in the project root directory")
        print(" - Checkout a branch: git checkout <branch-name>")
        sys.exit(1)


def sanitize_branch_name(branch_name):
    """
    Sanitize branch name for CloudFormation stack naming.
    This is the single source of truth for stack naming logic.

    Enforces branch naming convention: <tag>/<issue-number>-<description>
    Fails if branch name doesn't match the convention (except for main branch).
    """
    branch_lower = branch_name.lower()

    # Special handling for main branch: use production stack name
    if branch_lower in ("main"):
        return "StrideStack"

    # Enforce branch naming convention: <tag>/<issue-number>-<description>
    # Pattern: tag (alphanumeric/hyphens), slash, issue number, hyphen, description
    convention_pattern = r"^([a-z0-9-]+)/([0-9]+)-(.+)$"
    match = re.match(convention_pattern, branch_lower)

    if not match:
        print("ERROR: Branch name does not match required convention")
        print()
        print(f"Branch name: {branch_name}")
        print()
        print("Required format: <tag>/<issue-number>-<description>")
        print("Examples:")
        print("  - feature/123-add-login")
        print("  - bugfix/456-fix-crash")
        print("  - ci/60-centralize-stack-deploy-name")
        print()
        print("The branch name must:")
        print("  1. Start with a tag (alphanumeric, hyphens allowed)")
        print("  2. Have a forward slash '/'")
        print("  3. Have an issue number (digits)")
        print("  4. Have a hyphen '-'")
        print("  5. Have a description (at least one character)")
        print()
        print(
            "Exception: 'main' or 'master' branch is allowed for production deployments."
        )
        sys.exit(1)

    tag, issue_num, description = match.groups()

    # Sanitize description: alphanumeric and hyphens only, truncate to 20 chars
    description = re.sub(r"[^a-z0-9-]", "-", description)
    description = re.sub(r"^-+|-+$", "", description)[:20]

    if not description or description == "-":
        print("ERROR: Branch description is invalid after sanitization")
        print()
        print(f"Branch name: {branch_name}")
        print(f"Description after sanitization: '{description}'")
        print()
        print("The description must contain at least one valid alphanumeric character.")
        sys.exit(1)

    # Build sanitized name: issue-description
    sanitized = f"{tag}-{issue_num}-{description}"

    # Final stack name: StrideStack-{sanitized}
    # Max length: 12 (prefix) + 100 (sanitized) = 112 chars (well under CloudFormation 128 limit)
    if len(sanitized) > 100:
        sanitized = sanitized[:100]

    return f"StrideStack-{sanitized}"


app = cdk.App()

# Get branch name from git
branch_name = get_current_branch()
stack_name = sanitize_branch_name(branch_name)
print(f"Branch Name: {branch_name}")
print(f"Stack Name: {stack_name}")

# Use AWS standard environment variables with fallback
region = os.getenv("AWS_DEFAULT_REGION") or os.getenv("AWS_REGION") or "us-east-1"

CdkStack(app, stack_name, env=cdk.Environment(account=os.getenv("CDK_DEFAULT_ACCOUNT"), region=region))

app.synth()
