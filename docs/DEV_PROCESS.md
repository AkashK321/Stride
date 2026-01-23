# Development Process Documentation

## Table of Contents
1. [Repository Architecture](#repository-architecture)
2. [Branching Strategy](#branching-strategy)
3. [Code Development & Review Policy](#code-development--review-policy)

---

## Repository Architecture

### Overview

This repository follows a full-stack architecture pattern with a React Native/Expo frontend and an AWS serverless backend. The backend infrastructure is defined using Infrastructure as Code (IaC) templates, and the project is organized to support both frontend and backend development workflows.

### Repository Structure

```
Stride/
│
├── app/                          # Frontend: React Native/Expo application
│   ├── _layout.tsx              # Root layout component
│   ├── App.tsx                  # Main application component
│   └── index.tsx                # Entry point
│
├── backend/                     # Backend: AWS Serverless functions
│   ├── functions/               # Lambda function handlers
│   │   ├── image-processing/   # Image processing Lambda
│   │   └── api-handlers/       # API Gateway integration handlers
│   ├── lib/                     # Shared backend libraries
│   └── config/                  # Backend configuration files
│
├── infrastructure/              # Infrastructure as Code
│   ├── template.yaml           # AWS SAM/CloudFormation template
│   ├── samconfig.toml          # SAM CLI configuration
│   └── parameters/             # Environment-specific parameters
│
├── tests/                       # Test suites
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests
│   └── e2e/                    # End-to-end tests
│
├── assets/                      # Static assets (images, icons, etc.)
│   └── images/                 # Image assets
│
├── doc/                         # Documentation
│   └── DEV_PROCESS.md          # This file
│
├── .github/                     # GitHub configuration
│   ├── workflows/              # CI/CD workflows
│   └── PULL_REQUEST_TEMPLATE.md # PR template
│
├── app.json                     # Expo configuration
├── package.json                 # Frontend dependencies
├── tsconfig.json                # TypeScript configuration
├── eslint.config.js             # ESLint configuration
└── README.md                    # Project overview

```

___

## Branching Strategy

This project uses a **Feature Branch Workflow** with a single main integration branch. All feature development occurs in dedicated branches that are linked to GitHub project issues.

### Main Branches

#### `main`
- **Purpose**: Production-ready code and stable releases
- **Protection**: Protected branch requiring PR approval and CI/CD checks
- **Merge Policy**: Only via Pull Requests that pass all checks
- **Deployment**: Automatically deployed to production/staging environments

### Branch Naming Convention

All feature branches must follow this naming pattern:

```
issue-[issue-number]-[short-description]
```

**Examples:**
- `issue-123-add-image-upload`
- `issue-456-implement-api-authentication`
- `issue-89-fix-camera-permissions`


### Workflow Process

1. **Issue Creation**
   - Create a GitHub issue describing the feature or bug fix
   - Assign issue to appropriate team member
   - Label appropriately (feature, bug, enhancement, etc.)

2. **Branch Creation**
   - Create a feature branch from `main`: `git checkout -b feature/[issue-number]-[description]`
   - Link branch to GitHub issue in PR description using: `Closes #123` or `Fixes #123`

3. **Development**
   - Make commits with clear, descriptive messages
   - Push branch to remote repository
   - **CI/CD Pipeline**: On push, the pipeline automatically:
     * Builds Kotlin backend and runs unit tests
     * Deploys branch-specific CloudFormation stack (e.g., `StrideStack-123-feature-name`)
     * Runs integration tests against the deployed stack
   - Keep branch up-to-date with `main` by rebasing or merging

4. **Pull Request**
   - Create Pull Request targeting `main`
   - Reference the GitHub issue in PR title/description
   - Assign a reviewer (required)
   - **CI/CD Pipeline**: When PR is opened/updated, the pipeline automatically:
     * Builds Kotlin backend and runs unit tests
     * Deploys to the PR's source branch stack (same as push, for validation)
     * Runs integration tests against the deployed branch stack
   - Wait for CI/CD checks to pass
   - Address review feedback

5. **Merge**
   - After approval and passing CI/CD, merge via "Squash and Merge" or "Rebase and Merge"
   - **CI/CD Pipeline**: On merge to `main`, the pipeline automatically:
     * Builds Kotlin backend and runs unit tests
     * Deploys to production stack (`StrideStack`)
     * Runs integration tests against the production stack
   - Delete feature branch after merge




## Code Development & Review Policy

### Pull Request Requirements

All code changes must go through a Pull Request (PR) process before merging into `main`.

#### PR Creation Checklist

- [ ] Branch is named according to convention: `issue-[issue-number]-[description]`
- [ ] Branch is linked to a GitHub issue
- [ ] Code follows project style guidelines
- [ ] Tests are added/updated for new functionality
- [ ] All existing tests pass
- [ ] Documentation is updated if needed
- [ ] PR description includes:
  - Summary of changes
  - Reference to related issue (`Closes #123`)
  - Testing instructions (if applicable)
  - Screenshots (for UI changes)

### Code Review Process

#### Reviewer Assignment

- **Required**: Every PR must have at least one assigned reviewer
- **Assignment**: 
  - Automatically assigned based on code ownership (CODEOWNERS file)
  - Manually assigned by PR creator
  - Rotated among team members for fairness
- **Timeline**: Reviewers should respond within 24-48 hours

#### Review Criteria

Reviewers should check for:

1. **Functionality**
   - Code solves the stated problem
   - Edge cases are handled
   - No obvious bugs or logic errors

2. **Code Quality**
   - Follows project coding standards
   - Proper error handling
   - No code duplication
   - Appropriate comments and documentation

3. **Testing**
   - Adequate test coverage
   - Tests are meaningful and pass
   - Integration tests updated if needed

4. **Architecture**
   - Follows project architecture patterns
   - No unnecessary dependencies
   - Proper separation of concerns

5. **Security**
   - No sensitive data exposed
   - Input validation where appropriate
   - Follows security best practices

#### Review Feedback

- **Approval**: Reviewer approves PR when satisfied
- **Request Changes**: Reviewer requests changes with specific comments
- **Comments**: Use GitHub's review feature for line-by-line feedback
- **Discussion**: Use PR comments for questions and clarifications


#### Code Review Frequency

- **Daily Reviews**: Team members should review PRs daily
- **Response Time**: Aim for 24-48 hour review turnaround
- **Batch Reviews**: Review multiple related PRs together when possible

#### Branch Maintenance

- **Keep Updated**: Regularly rebase/merge `main` into feature branches
- **Clean Up**: Delete merged branches promptly
- **Naming**: Use descriptive branch names that indicate purpose

---

## Additional Resources

- [GitHub Flow Guide](https://guides.github.com/introduction/flow/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- [Expo Documentation](https://docs.expo.dev/)

---

**Document Version**: 1.0  
**Last Updated**: 2024  
**Maintained By**: Stride Development Team

