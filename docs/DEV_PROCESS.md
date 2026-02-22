# Development Process Documentation

## Table of Contents

1. [Repository Architecture](#repository-architecture)
   - [Overview](#overview)
   - [Repository Structure](#repository-structure)
   - [Standards & Documentation References](#standards--documentation-references)
     - [Frontend](#frontend)
     - [Backend](#backend)

2. [Workflow and Branching Strategy](#workflow-and-branching-strategy)
   - [Workflow](#workflow)
   - [Branches](#branches)
     - [Main](#main)
     - [Feature Branches](#feature-branches)
   - [Creating an Issue](#creating-an-issue)
   - [Creating a New Feature Branch](#creating-a-new-feature-branch)
   - [Tags](#tags)

3. [Code Development & Review Policy](#code-development--review-policy)
   - [Pull Request Requirements](#pull-request-requirements)
     - [PR Creation Checklist](#pr-creation-checklist)
   - [Code Review Process](#code-review-process)
     - [Reviewer Assignment](#reviewer-assignment)
     - [Review Criteria](#review-criteria)
     - [Review Feedback](#review-feedback)
     - [Code Review Frequency](#code-review-frequency)
     - [Branch Maintenance](#branch-maintenance)

## Repository Architecture

### Overview

This repository follows a full-stack architecture pattern with a React Native/Expo frontend and an AWS serverless backend. The backend infrastructure is defined using Infrastructure as Code (IaC) templates, and the project is organized to support both frontend and backend development workflows.

### Repository Structure

```
Stride/
├── .gitignore
├── README.md                        # Entry point documentation
├── aws_resources/                   # Backend Infrastructure & Logic
│   ├── app.py                       # AWS CDK App Entry Point (Python)
│   ├── cdk.json                     # CDK Context & Config
│   ├── requirements.txt             # Python Dependencies (CDK)
│   ├── source.bat                   # Environment setup script
│   ├── backend/                     # Business Logic (Lambda Functions)
│   │   ├── build.gradle.kts         # Kotlin Build Configuration
│   │   ├── settings.gradle.kts
│   │   └── src/main/kotlin/
│   │       └── com/handler/
│   │           └── Handler.kt       # Lambda Handler Entry Point
│   ├── cdk/                         # Infrastructure Definitions
│   │   └── cdk_stack.py             # Main CloudFormation Stack Definition
│   ├── schema_initializer/          # Database Migration/Setup
│   │   ├── handler.py
│   │   └── verify_db_init.py
│   └── tests/                       # Infrastructure Tests
│       └── unit/
│           └── test_cdk_stack.py
├── docs/                            # Project Documentation
│   ├── BackendSetup.md
│   ├── FrontendSetup.md
│   ├── FRONTEND.md                  # Detailed frontend architecture & file structure
│   ├── Design_Document.pdf
│   └── DEV_PROCESS.md
└── frontend/                        # Mobile Application (React Native/Expo)
    ├── app.json                     # Expo Configuration
    ├── package.json                 # JS Dependencies
    ├── tsconfig.json                # TypeScript Configuration
    ├── app/                         # Application Screens & File-based Routing
    │   ├── _layout.tsx              # Root layout wrapping all routes in a Stack
    │   ├── (auth)/                  # Unauthenticated flows (landing, future auth)
    │   │   ├── _layout.tsx          # Auth-specific Stack layout
    │   │   └── index.tsx            # Landing screen with \"Sign in\" button
    │   └── (tabs)/                  # Main authenticated tabbed experience
    │       ├── _layout.tsx          # Tabs layout (home/profile/settings)
    │       ├── home.tsx             # Home tab screen
    │       ├── profile.tsx          # Profile tab screen
    │       └── settings.tsx         # Settings tab screen
    ├── assets/                      # Static assets (images, fonts, icons)
    │   ├── fonts/                   # Custom fonts (currently empty)
    │   ├── icons/                   # Icon assets (currently empty)
    │   └── images/                  # App and brand imagery (icons, splash, etc.)
    ├── components/                  # Reusable UI components
    │   ├── Button/                  # Primary button component
    │   ├── Label/                   # Label/text component
    │   └── TextField/               # Text input component
    ├── hooks/                       # Custom React hooks
    ├── services/                    # API clients and integrations
    ├── theme/                       # Design tokens (colors, spacing, typography)
    ├── types/                       # Shared TypeScript types/interfaces
    └── utils/                       # Generic utility/helper functions

```

### Standards & Documentation References

#### Frontend

Our frontend is built using React Native with Expo. We follow the file structure detailed by Expo Router for organizing screens and navigation. For more information, refer to the [Expo Router Documentation](https://docs.expo.dev/router/introduction/).

For frontend setup instructions, environment variable configuration, connecting to a live backend, and the developer bypass feature, see [FRONTEND.md](./FRONTEND.md).

#### Backend

The backend infrastructure is created using AWS CDK in Python with the core backend lambda handler created in Kotlin to achieve better runtime performance.
We follow the best practices for AWS CDK projects as outlined in their [documentation](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html)

## Workflow and Branching Strategy

This project uses a **Feature Branch Workflow** with a single main integration branch. All development occurs in dedicated branches that are linked to GitHub project issues.

### Workflow

1. **Issue Creation**
   - See [Creating an Issue](#creating-an-issue) for detailed instructions

2. **Branch Creation**
   - See [Creating a New Feature Branch](#creating-a-new-feature-branch) for detailed instructions

3. **Development**
   - Make commits with clear, descriptive messages
   - Push branch to remote repository

   ```
   git push origin <branch-name>
   ```

   - Keep branch up-to-date with `main` by rebasing or merging

4. **Pull Request**
   - Create Pull Request targeting `main` on GitHub
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

---

### Branches

#### Main

- **Purpose**: Production-ready code and stable releases
- **Protection**: Protected branch requiring PR approval and CI/CD checks
- **Merge Policy**: Only via Pull Requests that pass all checks
- **Deployment**: Automatically deployed to main stack

#### Feature Branches

- **Purpose**: Implementing changes for an issue, doing work
- **Protection**: None
- **Merge Policy**: At discretion of branch owner
- **Deployment**: Automatically deployed to branch specific dev stack `StrideStack-<issue-number>-<description>`

All feature branches must follow this naming pattern:

```
<tag>/<issue-number>-<short-description>
```
See [Tags](#tags) for details

**Examples:**

- `feature/123-add-image-upload`
- `bug/456-fix-camera-permissions`
- `fix/789-security-patch`

---

### Creating an Issue

When creating a new GitHub issue, follow these guidelines:

**Issue Naming Convention:**

- Format: `<tag>: <description>`
- Use the appropriate tag prefix (see [Tags](#tags) section)
- Keep the description concise and descriptive

**Steps:**

1. Go to the repository's Issues tab
2. Click **New Issue**
3. Enter the issue title using the naming convention: `<tag>: <description>`
4. Add a clear and detailed description of the issue or feature request
5. Assign the issue to the appropriate team member
6. Add appropriate labels and tags (see [Tags](#tags) section)

**Note:** The tag you use in the issue title should match the tag you use when creating the corresponding branch (e.g., if the issue is titled `feature: add image upload`, create a branch with `feature/` prefix).

---

### Creating a New Feature Branch

Follow these steps to create a new feature branch:

1. **Ensure you're on `main` and up-to-date**

   ```bash
   git checkout main
   git pull origin main
   ```

2. **Create a new branch with the appropriate tag**

   ```bash
   git checkout -b <tag>/<issue-number>-<short-description>
   ```

   **Example:**

   ```bash
   git checkout -b feature/123-add-image-upload
   ```

3. **Push the branch to remote**

   ```bash
   git push -u origin <tag>/<issue-number>-<short-description>
   ```

   **Example:**

   ```bash
   git push -u origin feature/123-add-image-upload
   ```

4. **Verify branch naming**
   - Branch name should follow the pattern: `<tag>/<issue-number>-<short-description>`
   - Use lowercase and hyphens (no spaces or underscores)
   - Keep description concise (20 characters or less)
   - Issue number should match the GitHub issue you're working on

**Notes:**

- Always create branches from `main` to ensure you have the latest code
- Use the `-u` flag when pushing to set up tracking between local and remote branches
- The branch will automatically trigger CI/CD workflows and deploy to a branch-specific stack

---

### Tags

Tags are used to categorize issues and branches. Select the appropriate tag based on the type of work:

- **`feature`** - For new features, enhancements, and functionality additions
  - Use for: Adding new user-facing features, implementing new capabilities, major enhancements

- **`bug`** - For bug fixes and defect corrections
  - Use for: Fixing defects in existing features, correcting incorrect behavior

- **`fix`** - For quick fixes, hotfixes, and urgent corrections
  - Use for: Critical production issues, quick fixes

- **`app`** - For frontend application changes
  - Use for: React Native/Expo frontend modifications, UI/UX changes, mobile app features

- **`infra`** - For infrastructure and DevOps changes
  - Use for: AWS infrastructure updates, CDK changes

- **`ci`** - For CI/CD pipeline and automation changes
  - Use for: GitHub Actions workflows, CI/CD pipeline improvements, automation updates

## Code Development & Review Policy

### Policy Summary

**Pull Requests:**

- Required for all changes to `main` branch
- Must be linked to a GitHub issue
- Must receive minimum of 1 approving review
- Must pass all automated CI checks

**Code Reviews:**

- Frequency: Reviewers check daily for pending PRs
- Approval: Minimum 1 approving review required
- Timeline: 24-48 hour response time expected

**CI Checks:**

- Build validation
- Must pass all unit tests before merge is allowed
- These checks are automated on every PR open/update

**Merging:**

- Target: All merges go to `main` (single integration branch)
- Use: Squash & Merge or Rebase & Merge
- Protection: Direct pushes to `main` are prohibited
- Post-merge: Automatic deployment to production or branch-specific stack

### Pipeline overview:

1. Pull Request opened
2. PR Validation runs (Build & Unit Tests)
3. Code Review process
4. PR Approved & Merged
5. Backend Build workflow runs
6. Infrastructure Deploy workflow runs (Deploy stack & Integration Tests)
7. Full Deployment completed

---

### Pull Requests

This policy establishes the code review process for our project, aligned with our automated CI/CD pipeline. All code changes must go through a Pull Request (PR) process before merging into `main`.

**Note:** PR validation runs build and tests only. It does not trigger deployment. This provides fast feedback without AWS usage.

#### PR Creation Checklist

- [ ] Branch is named according to convention: (see [Workflow and Branching Strategy](#workflow-and-branching-strategy))
- [ ] Branch is linked to a GitHub issue
- [ ] Code follows project style guidelines
- [ ] Unit tests are added/updated for new functionality
- [ ] All existing tests pass locally
- [ ] Documentation is updated if needed
- [ ] PR description includes:
  - Summary of changes
  - Reference to related issue (`Closes #123`)
  - Testing instructions (if applicable)
  - Screenshots (for UI changes)
  - Breaking changes (if any)

## Automated Validation

### CI Checks Overview

All PRs must pass automated CI checks before merging. These checks are **mandatory** and therefore can't be bypassed.

**Required Checks:**

1. Build job must succeed
2. Unit tests job must succeed
3. No compilation errors

**Check Enforcement:**

- Branch protection rules prevent merging with failed checks
- Checks must pass on the latest commit
- Merge button is disabled until all checks pass

### What Gets Checked Automatically

1. **Build Validation**
   - Kotlin JAR builds successfully
   - Dependencies resolve correctly

2. **Unit Tests**
   - All unit tests pass

3. **Workflow Status**
   - Both build and test jobs must succeed
   - Results visible in PR checks

---

### Code Review Process

The purpose of code review is to ensure that the code base progresses over time without compromising on the code health. All of the tools and processes of code review are designed to this end. (see [The Standard of Code Review](https://google.github.io/eng-practices/review/reviewer/standard.html))

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

## Additional Resources

- [GitHub Flow Guide](https://guides.github.com/introduction/flow/)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [AWS SAM Documentation](https://docs.aws.amazon.com/serverless-application-model/)
- [Expo Documentation](https://docs.expo.dev/)

---

**Document Version**: 1.0  
**Last Updated**: 2026 \
**Maintained By**: Stride Development Team
