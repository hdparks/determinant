export const MOCK_LLM_RESPONSES = {
  Questions: `# Research Questions

1. What is the current authentication mechanism?
2. How are errors currently handled?
3. What database schema exists?

## Confidence
Score: 7/10 - Questions based on proposal understanding
`,

  Design: `# Technical Design

## Overview
Mock design document for testing purposes

## Architecture
- Component A: Handles authentication
- Component B: Processes requests
- Component C: Manages data persistence

## Technical Decisions
- Use JWT for auth
- REST API endpoints
- PostgreSQL database

## Confidence
Score: 8/10 - Clear requirements from research
`,

  Plan: `# Implementation Plan

## Step 1: Database Setup
Create tables for users and sessions

## Step 2: Auth Middleware
Implement JWT verification

## Step 3: API Routes
Add endpoints for login/logout

## Confidence
Score: 9/10 - Design is well-specified
`,

  QuestionAnswers: `# Question Answers

**Decision**: [ANSWERED]

Mock approval for testing

## Confidence
Score: 10/10 - Human approved
`,

  DesignApproval: `# Design Approval

**Status**: APPROVED

## Confidence
Score: 10/10 - Human approved
`,

  DesignFeedback: `# Design Feedback

**Status**: NEEDS_REVISION

## Human Feedback

Please add error handling section

## Confidence
Score: 5/10 - Requires revision
`,
};
