# Component Registry

All pages, API routes, and shared components in the WhatStage Next.js app.

## Marketing

| Component | Route | File |
|-----------|-------|------|
| [[MarketingHomePage]] | `/` | `src/app/(marketing)/page.tsx` |
| [[LoginPage]] | `/login` | `src/app/(marketing)/login/page.tsx` |
| [[SignupPage]] | `/signup` | `src/app/(marketing)/signup/page.tsx` |
| [[OnboardingPage]] | `/onboarding` | `src/app/(marketing)/onboarding/page.tsx` |

## Layouts

| Component | Route | File |
|-----------|-------|------|
| [[RootLayout]] | `/` | `src/app/layout.tsx` |
| [[MarketingLayout]] | `/` | `src/app/(marketing)/layout.tsx` |
| [[TenantAppLayout]] | `/app` | `src/app/(tenant)/app/layout.tsx` |

## Tenant Dashboard

| Component | Route | File |
|-----------|-------|------|
| [[BotPage]] | `/app/bot` | `src/app/(tenant)/app/bot/page.tsx` |
| [[ActionsPage]] | `/app/actions` | `src/app/(tenant)/app/actions/page.tsx` |
| [[LeadsPage]] | `/app/leads` | `src/app/(tenant)/app/leads/page.tsx` |
| [[WorkflowsPage]] | `/app/workflows` | `src/app/(tenant)/app/workflows/page.tsx` |
| [[SettingsPage]] | `/app/settings` | `src/app/(tenant)/app/settings/page.tsx` |

## Action Pages

| Component | Route | File |
|-----------|-------|------|
| [[ActionSlugPage]] | `/a/:slug` | `src/app/(tenant)/a/[slug]/page.tsx` |

## API Routes

| Component | Route | File |
|-----------|-------|------|
| [[FbWebhookRoute]] | `/api/fb/webhook` | `src/app/api/fb/webhook/route.ts` |
| [[CreateTenantRoute]] | `/api/onboarding/create-tenant` | `src/app/api/onboarding/create-tenant/route.ts` |
| [[AuthCallbackRoute]] | `/auth/callback` | `src/app/auth/callback/route.ts` |

## Shared Components

| Component | Description |
|-----------|-------------|
| [[DashboardNav]] | Top/side navigation for the tenant dashboard |
| [[Middleware]] | Next.js middleware for subdomain routing and tenant isolation |

<!-- AUTO-UPDATED: New components appended by feature-doc skill -->
