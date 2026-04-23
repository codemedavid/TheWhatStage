---
name: test-feature
description: Use when adding a new feature, API route, component, or utility — decomposes into separately testable units, scaffolds tests, runs them automatically, then launches agent-browser to interactively dogfood the feature in a real browser until it is fully verified
allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*)
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
- **E2E tests**: Check if dev server is running first; if not, start it
- **On failure**: Fix the test or implementation, then re-run. Iterate until green. Only report back to the user after exhausting reasonable fixes (3 attempts max per test).
- **After all automated tests pass**: Proceed to Step 6 (Interactive Exploratory Testing) — do NOT skip this step

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

## Step 6: Interactive Exploratory Testing (Dogfood)

After all automated tests pass, launch a live browser session to interact with the feature as a real user would. **Do not skip this step.** The goal is to use the feature end-to-end in the running app until you are confident it works correctly.

### Prerequisites

- Dev server must be running (`npm run dev`). If not running, start it.
- `agent-browser` must be installed. If not: `npm i -g agent-browser && agent-browser install`
- Load the dogfood skill: `agent-browser skills get dogfood`

### Workflow

1. **Start a session and navigate to the app:**

```bash
agent-browser --session test-feature open http://localhost:3000
agent-browser --session test-feature wait --load networkidle
```

2. **Sign up / Sign in if needed:**
   - If the feature requires authentication, go through the full sign-up or login flow in the browser.
   - If credentials or OTP codes are needed, **ask the user** — do not guess.
   - Save auth state after login: `agent-browser --session test-feature state save ./dogfood-output/auth-state.json`

3. **Navigate to the feature:**
   - Use the app's navigation like a real user — click through menus, sidebars, links.
   - Take snapshots at each page to orient: `agent-browser --session test-feature snapshot -i`
   - Take screenshots for evidence: `agent-browser --session test-feature screenshot --annotate ./dogfood-output/screenshots/{step}.png`

4. **Exercise every part of the feature:**
   - Fill forms with realistic data
   - Click every button, toggle, dropdown
   - Test happy paths AND edge cases (empty inputs, long text, special characters)
   - Check error states — submit invalid data, trigger validation
   - Test the full create → read → update → delete cycle if applicable
   - Check the browser console for errors: `agent-browser --session test-feature errors`

5. **Do not stop until the feature is fully tested:**
   - If something breaks, document it with a screenshot, fix the code, and re-test
   - If you need user input (file uploads, specific test data, credentials), **ask immediately** — do not skip the test
   - Keep iterating: fix → re-test → fix → re-test until everything works
   - Aim for at least 5-10 distinct interactions with the feature

6. **Document findings:**

```
### Exploratory Test Results

| Action | Result | Evidence |
|--------|--------|----------|
| Signed up with test account | Success | screenshots/signup.png |
| Navigated to [Feature] | Success | screenshots/feature-nav.png |
| Submitted form with valid data | Success | screenshots/form-submit.png |
| Submitted form with empty fields | Validation shown | screenshots/form-empty.png |
| ... | ... | ... |

#### Issues Found
- ISSUE-001: [Description] — see screenshots/issue-001.png
  - Fixed in [file:line] — re-tested, now passing
```

7. **Close the session:**

```bash
agent-browser --session test-feature close
```

### Key Rules

- **Never stop early** — the feature is not tested until you have interacted with every user-facing aspect
- **Ask for inputs when needed** — if the feature needs files, specific data, or credentials, ask the user immediately rather than skipping
- **Fix and re-test** — if you find a bug during exploratory testing, fix the implementation, then re-test in the browser to confirm the fix
- **Test like a real user** — don't just verify it renders; actually use it the way a customer would
- **Console errors count** — check `errors` and `console` commands periodically; JS errors are bugs even if the UI looks fine

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
