---
title: Inbox Conversations Flow
date: 2026-04-20
tags:
  - flow
  - inbox
  - api
  - bugfix
status: active
---

# Inbox Conversations Flow

The inbox conversations endpoint (`/api/inbox/conversations`) fetches a tenant's conversations with lead info and the latest message for display in the dashboard inbox.

## Route

`src/app/api/inbox/conversations/route.ts`

## Data Flow

1. Authenticate user via Supabase auth
2. Resolve tenant membership via `tenant_members`
3. Query `conversations` joined with `leads` and `messages`
4. Shape response with lead name/pic and last message text
5. Return sorted list (escalated first, then by recency)

## Known Issues & Fixes (2026-04-20)

> [!bug] Ambiguous FK Relationship (Fixed)
> The `conversations` table has **two foreign keys** to `messages`:
> - `messages_conversation_id_fkey` — one-to-many (all messages in a conversation)
> - `conversations_escalation_message_id_fkey` — many-to-one (single escalation message)
>
> PostgREST cannot auto-resolve which relationship to use. **Fix:** Explicit FK hint in the select: `messages!messages_conversation_id_fkey(text, created_at)`
>
> If this error resurfaces, check if a new FK between `conversations` and `messages` was added.

> [!warning] Scalability: Message Fetching
> Previously fetched ALL messages per conversation just to find the latest one. At volume (1000s of messages per conversation x 50 conversations), this transfers megabytes of unnecessary data.
>
> **Fix:** Added `.order("created_at", { referencedTable: "messages", ascending: false }).limit(1, { referencedTable: "messages" })` to fetch only the single most recent message per conversation.
>
> If inbox becomes slow again, check:
> - Whether the `messages` table has an index on `(conversation_id, created_at DESC)`
> - Whether the `.limit(50)` on conversations is sufficient or needs pagination

## Related Notes

- [[Bot Conversation Flow]]
- [[Conversation Review Flow]]
- [[LLM Client]]
