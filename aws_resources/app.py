#!/usr/bin/env python3
import os
import subprocess
import re
import sys

import aws_cdk as cdk

from cdk.cdk_stack import CdkStack


def get_current_branch():
    """Get the current git branch name.
    
    Exits with error code 1 if branch cannot be determined.
    """
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            capture_output=True, 
            text=True, 
            check=True, 
            cwd=os.path.dirname(__file__)
        )
        branch_name = result.stdout.strip()
        if not branch_name:
            raise subprocess.CalledProcessError(1, 'git', 'Empty branch name returned')
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
        sys.exit(1)


def sanitize_branch_name(branch_name):
    """
    Sanitize branch name for CloudFormation stack naming.
    This is the single source of truth for stack naming logic.
    """
    if not branch_name:
        return "default"
    
    branch_lower = branch_name.lower()
    
    # Special handling for main branch: use production stack name
    if branch_lower in ("main", "master"):
        return "StrideStack"
    
    # Extract issue number (digits at start before first hyphen)
    issue_match = re.match(r'^([0-9]+)-', branch_lower)
    if issue_match:
        issue_num = issue_match.group(1)
        # Extract description (everything after issue number and hyphen)
        description = branch_lower[len(issue_num) + 1:]
        # Sanitize description: alphanumeric and hyphens only, truncate to 20 chars
        description = re.sub(r'[^a-z0-9-]', '-', description)
        description = re.sub(r'^-+|-+$', '', description)[:20]
        
        # Build sanitized name: issue-description (if description exists)
        if description and description != "-":
            sanitized = f"{issue_num}-{description}"
        else:
            sanitized = issue_num
    else:
        # Branch doesn't match expected format, use full sanitization
        # Convert to lowercase, replace invalid chars with hyphens, remove leading/trailing hyphens
        sanitized = re.sub(r'[^a-z0-9-]', '-', branch_lower)
        sanitized = re.sub(r'^-+|-+$', '', sanitized)[:100]
        
        # Ensure it starts with a letter (prepend 'branch-' if it starts with a number)
        if re.match(r'^[0-9]', sanitized):
            sanitized = f"branch-{sanitized[:93]}"  # Leave room for 'branch-' prefix
    
    # If empty or just hyphens, use 'default'
    if not sanitized or sanitized == "-":
        sanitized = "default"
    
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

CdkStack(app, stack_name, branch_name=branch_name,
    # If you don't specify 'env', this stack will be environment-agnostic.
    # Account/Region-dependent features and context lookups will not work,
    # but a single synthesized template can be deployed anywhere.

    # Use AWS CLI configuration (from 'aws configure')
    # Falls back to AWS CLI defaults if environment variables are not set
    # This allows CI/CD to override via CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION
    env=cdk.Environment(account=os.getenv('CDK_DEFAULT_ACCOUNT'), region=os.getenv('CDK_DEFAULT_REGION')),

    # Alternative: Hardcode region (not recommended if using 'aws configure')
    # env=cdk.Environment(account=os.getenv('CDK_DEFAULT_ACCOUNT'), region='us-east-1'),

    # For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html
    )

app.synth()
