---
name: test-feature
description: Use when adding a new feature, API route, component, or utility — decomposes into separately testable units, scaffolds tests, and runs them automatically without user intervention
---

# Test Feature

Decompose every feature into its smallest testable units, scaffold tests, run them automatically, and only present results to the user when everything passes.

## When to Use

- After implementing a new feature, component, API route, or utility
- When adding a new action page type (form, calendar, e-comm, etc.)
- When adding a new workflow trigger or automation
- When modifying existing features that lack test coverage

## Core Principles

1. **Decompose first** — break the feature into every independently testable piece
2. **Test automatically** — run all tests without asking for user permission
3. **Use .env.local** — read environment variables directly, never prompt the user for secrets
4. **Present finished results** — only report back when all tests pass (or with specific failures to fix)

## Step 1: Decompose the Feature

Before writing any test, analyze the implementation and list every testable unit:

### Decomposition Checklist

| Layer | What to Extract | Example |
|-------|----------------|---------|
| **Pure functions** | Validation, transforms, formatters, parsers | `formatLeadName()`, `validateWebhookPayload()` |
| **Business logic** | State transitions, rules, calculations | `moveLeadToStage()`, `shouldTriggerWorkflow()` |
| **Data access** | DB queries, mutations, filters | `getLeadsByTenant()`, `createActionLog()` |
| **API handlers** | Route handlers, middleware, auth checks | `POST /api/webhooks`, `GET /api/leads` |
| **React components** | UI rendering, user interactions, state | `<LeadCard />`, `<StageSelector />` |
| **Hooks** | Custom React hooks | `useLeads()`, `useTenantConfig()` |
| **Integration points** | External API calls, webhook processing | FB Graph API calls, postback handling |
| **Full flows** | End-to-end user journeys | Lead fills form → stage moves → notification sent |

Write out the decomposition as a comment block at the top of each test file:

```ts
/**
 * Feature: Lead Form Submission
 *
 * Testable units:
 * 1. validateFormFields() — pure validation logic
 * 2. sanitizeFormData() — input sanitization
 * 3. createLead() — DB insert + tenant scoping
 * 4. POST /api/leads — full endpoint (auth, validation, creation, response)
 * 5. <LeadForm /> — renders fields, validates client-side, submits
 * 6. Form submit → lead created → stage assigned → notification — E2E flow
 */
```

## Step 2: Create Test Files

Organize tests by granularity, with each testable unit getting its own `describe` block:

```
tests/
├── unit/
│   ├── lib/
│   │   ├── validate-form-fields.test.ts    # Pure function tests
│   │   └── sanitize-form-data.test.ts
│   └── components/
│       └── lead-form.test.tsx              # Component render + interaction tests
├── integration/
│   ├── api/
│   │   └── leads.test.ts                   # API route + DB tests
│   └── db/
│       └── create-lead.test.ts             # Data access tests with real DB
└── e2e/
    └── lead-form-flow.spec.ts              # Full browser flow
```

### Naming Convention

Mirror source paths:
- `src/lib/leads/validate.ts` → `tests/unit/lib/leads/validate.test.ts`
- `src/app/api/leads/route.ts` → `tests/integration/api/leads.test.ts`
- `src/components/leads/LeadForm.tsx` → `tests/unit/components/leads/lead-form.test.tsx`

## Step 3: Write Tests — One `describe` per Unit

Each testable unit gets its own `describe` block. Test the unit in isolation:

```ts
// tests/unit/lib/leads/validate.test.ts
import { describe, it, expect } from 'vitest';
import { validateFormFields } from '@/lib/leads/validate';

describe('validateFormFields', () => {
  it('accepts valid fields', () => { /* ... */ });
  it('rejects missing required fields', () => { /* ... */ });
  it('rejects invalid email format', () => { /* ... */ });
  it('trims whitespace from string fields', () => { /* ... */ });
});
```

### What to Test per Unit Type

| Unit Type | Test Cases |
|-----------|-----------|
| **Pure function** | Valid input → correct output, edge cases, invalid input → error/false |
| **Business logic** | State transitions, boundary conditions, tenant isolation |
| **Data access** | CRUD operations, tenant scoping, constraint violations |
| **API handler** | 200/400/401/404/500 responses, auth enforcement, input validation, correct DB writes |
| **Component** | Renders correctly, handles interactions, shows error states, loading states |
| **Hook** | Returns correct initial state, updates on events, cleans up |
| **Integration** | Multi-step flows work end-to-end, external APIs called correctly |

## Step 4: Run Tests Automatically

**Do NOT ask the user for permission.** Run tests immediately after writing them:

```bash
# Run unit tests for the feature
npm test -- tests/unit/path-to-test.test.ts

# Run integration tests for the feature
npm test -- tests/integration/path-to-test.test.ts

# Run E2E tests (only if dev server is running)
npx playwright test tests/e2e/path-to-test.spec.ts
```

### Auto-Run Rules

- **Environment variables**: Read directly from `.env.local` — never ask the user for values
- **Unit tests**: Always run immediately, no dependencies needed
- **Integration tests**: Always run immediately — use real Supabase (credentials from `.env.local`)
- **E2E tests**: Check if dev server is running first; if not, skip E2E and note it in the report
- **On failure**: Fix the test or implementation, then re-run. Iterate until green. Only report back to the user after exhausting reasonable fixes (3 attempts max per test).

## Step 5: Report Results

Only present to the user when done. Format:

```
## Test Results: [Feature Name]

### Decomposition
- N testable units identified
- N unit tests | N integration tests | N e2e tests

### Results
✅ All tests passing

| Test File | Tests | Status |
|-----------|-------|--------|
| tests/unit/lib/validate.test.ts | 4 | ✅ Pass |
| tests/integration/api/leads.test.ts | 3 | ✅ Pass |

### Files Created
- tests/unit/lib/validate.test.ts
- tests/integration/api/leads.test.ts
```

If there are unresolvable failures, report them clearly:

```
### ❌ Failures (need user input)
- `tests/integration/api/leads.test.ts` — Supabase connection refused (is the DB running?)
```

## Quick Reference

| Feature Type | Decompose Into | Required Tests |
|-------------|---------------|---------------|
| Utility / lib function | Pure functions | Unit |
| API route / server action | Validation + handler + DB access | Unit + Integration |
| React component | Component + hooks + helpers | Unit + Component |
| Full user flow | All layers | Unit + Integration + E2E |
| Workflow / automation | Triggers + conditions + actions | Unit + Integration |
| Database migration | Schema + queries | Integration |

## Common Mistakes

- **Not decomposing enough** — a single `describe` block testing everything is not decomposition
- Skipping integration tests for API routes (unit tests alone miss DB issues)
- Not testing tenant isolation — always verify one tenant can't access another's data
- Not testing the Messenger postback → web action → notification loop end-to-end
- Writing E2E tests that depend on specific test data instead of setting up their own state
- Asking the user for permission to run tests — just run them
