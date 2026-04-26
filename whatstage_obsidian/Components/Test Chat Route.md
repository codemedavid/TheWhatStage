---
title: Test Chat Route
date: 2026-04-20
tags:
  - component
  - api
  - bot
  - bugfix
status: active
---

# Test Chat Route

The test chat endpoint (`/api/bot/test-chat`) allows tenants to test their bot configuration from the dashboard without sending real Messenger messages.

## Route

`src/app/api/bot/test-chat/route.ts`

## Flow

1. Authenticate user, resolve tenant
2. Rate limit check (30 req/min per tenant)
3. Retrieve knowledge via RAG pipeline
4. Build system prompt with test mode flag
5. Call [[LLM Client]] for response
6. Parse decision (message + confidence)
7. Return reply with retrieval metadata

## Known Issues & Fixes (2026-04-20)

> [!warning] Rate Limiter Memory Leak (Fixed)
> The in-memory `rateLimitMap` (a `Map<string, ...>`) never evicted expired entries. With many tenants over time, or if the serverless function stays warm, the map grows indefinitely.
>
> **Fix:** Added eviction of expired entries when the map exceeds 10,000 entries. The eviction runs lazily (only when a new entry needs to be added and the threshold is crossed).
>
> **Future considerations:**
> - If deployed to multiple function instances, each has its own map (rate limiting is per-instance, not global). For true rate limiting at scale, use Redis/Upstash or Vercel KV.
> - The 10k threshold is generous — a single function instance is unlikely to serve that many unique tenants. Adjust if memory pressure appears.

> [!info] Test Mode Differences
> - Uses a static `TEST_PHASE` (no real conversation phase)
> - `conversationId` is hardcoded to `"test-mode"`
> - No messages are persisted to the database
> - RAG retrieval still hits real knowledge base

## Related Notes

- [[LLM Client]]
- [[RAG Knowledge Retrieval Flow]]
- [[Bot Conversation Flow]]
