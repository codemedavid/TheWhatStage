# Phase 8: Human Handoff & Review — Design Spec

**Date**: 2026-04-19  
**Status**: Approved  
**Parent spec**: `docs/superpowers/specs/2026-04-18-ai-chatbot-rag-design.md`  
**Depends on**: Phase 4 (Conversation Engine), Phase 5 (Image & Media System), Phase 7 (Flow Builder)

---

## 1. Goal

Enable human agents (tenant users) to take over conversations that the AI bot escalates, reply to leads directly via Messenger (text + images), and resume bot operation when done. The system tracks escalation reasons, highlights the trigger message, and provides configurable auto-resume timers.

---

## 2. Architecture Overview

```
Lead sends message
  -> Webhook receives it
  -> Conversation Engine gate check:
       bot_paused_at set?
         YES -> check idle timer
           expired? -> clear pause, proceed with bot response
           not expired / never? -> do nothing, stay paused
         NO -> normal bot processing
           -> LLM response
           -> confidence < 0.4 / empty / explicit escalate?
                YES -> set needs_human, escalation_reason, escalation_message_id
                       insert escalation_event
                       bot does NOT respond
                NO -> send bot response normally

Agent in Inbox:
  -> sees escalated conversations (polling every 5s)
  -> opens conversation, sees escalation reason + highlighted trigger message
  -> sends reply via POST /api/inbox/send
     -> message sent to lead via Messenger
     -> bot_paused_at set automatically (first human reply)
     -> escalation_event logged (agent_took_over)
  -> when done, clicks "Resume Bot" or waits for auto-resume timer
```

---

## 3. Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Notification method | In-app only (badge + visual indicator) | Fastest to ship, no external services needed |
| Bot pause/resume | Auto-pause on first human message, auto-resume after configurable idle timer | Removes friction for agent, prevents bot from jumping back in prematurely |
| Resume behavior | Silent (no re-engagement message) | Avoids spamming leads; re-engagement can be added as workflow feature later |
| Escalation display | Reason + highlighted trigger message | Saves agent time by showing exactly why and where the bot got stuck |
| Idle timer | Configurable (1h, 6h, 12h, 24h, 48h, never) | Tenants have different response patterns |
| Message sending | Immediate, no preview | Agents need speed; compose box provides context |
| Agent reply content | Text + images (upload or pick from knowledge images) | Covers most handoff scenarios |
| Update mechanism | Polling (5-10s interval) | Consistent with existing codebase patterns; can swap for Realtime later |

---

## 4. Database Changes

### 4.1 New Columns on `conversations`

| Column | Type | Purpose |
|---|---|---|
| `bot_paused_at` | `timestamptz`, nullable | When the bot was paused (null = bot active) |
| `escalation_reason` | `text`, nullable | Why the bot escalated: `low_confidence`, `empty_response`, `llm_decision` |
| `escalation_message_id` | `uuid`, nullable, FK -> messages | The lead message that triggered escalation |

### 4.2 New Column on `tenants`

| Column | Type | Purpose |
|---|---|---|
| `handoff_timeout_hours` | `integer`, default 24 | Auto-resume timer. Values: 1, 6, 12, 24, 48, or null (never) |

### 4.3 New Table: `escalation_events`

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `conversation_id` | uuid | FK -> conversations, CASCADE |
| `tenant_id` | uuid | FK -> tenants, CASCADE |
| `type` | text | NOT NULL. Values: `escalated`, `agent_took_over`, `bot_resumed` |
| `reason` | text | nullable. Escalation reason or resume trigger (`manual`, `timeout`) |
| `agent_user_id` | uuid | nullable. The user who took over |
| `created_at` | timestamptz | default now() |

### 4.4 Indexes

```sql
create index on escalation_events (conversation_id);
create index on escalation_events (tenant_id);
create index on conversations (tenant_id) where needs_human = true;
```

### 4.5 RLS

All new tables/columns scoped to `current_tenant_id()`, same pattern as existing tables.

---

## 5. Conversation Engine Changes

### 5.1 Gate Check (top of `handleMessage()`)

Before processing any incoming lead message:

1. Fetch conversation record including `bot_paused_at`
2. If `bot_paused_at` is null -> proceed normally
3. If `bot_paused_at` is set:
   a. Fetch tenant's `handoff_timeout_hours`
   b. If timeout is null (never) -> do nothing, return early
   c. If `now() - bot_paused_at > timeout` AND no agent messages sent within timeout window -> auto-resume:
      - Clear `bot_paused_at`, `needs_human`, `escalation_reason`, `escalation_message_id`
      - Insert `escalation_events` row: type=`bot_resumed`, reason=`timeout`
      - Proceed with normal bot response
   d. If still within timeout -> do nothing, return early

### 5.2 Enriched Escalation Logic

When the existing escalation triggers fire (confidence < 0.4, empty response, explicit LLM decision):

1. Set `conversations.needs_human = true` (already exists)
2. Set `conversations.escalation_reason` to: `low_confidence`, `empty_response`, or `llm_decision`
3. Set `conversations.escalation_message_id` to the lead message ID that triggered it
4. Insert `escalation_events` row: type=`escalated`, reason=[same as above]

---

## 6. API Routes

### 6.1 `GET /api/inbox/conversations`

Returns conversations for the tenant, sorted by escalation status:

- Escalated conversations (`needs_human = true`) first, ordered by escalation time
- Then non-escalated, ordered by `last_message_at` DESC
- Each entry includes: conversation ID, lead name, last message preview, `needs_human`, `bot_paused_at`, `escalation_reason`
- Supports polling (stateless, no cursor needed for reasonable conversation counts)

### 6.2 `POST /api/inbox/send`

Agent sends a reply to a lead via Messenger.

**Request body:**
```json
{
  "conversation_id": "uuid",
  "message": "string",
  "image_url": "string (optional, Cloudinary URL)"
}
```

**Flow:**
1. Auth check — verify user belongs to conversation's tenant
2. Look up lead's PSID and tenant's `page_access_token`
3. Send via Facebook Graph API (text or image attachment via existing `sendMessage()`)
4. Store in `messages` table with `direction: 'out'`
5. Log `lead_events` entry with type `message_out`
6. If `bot_paused_at` is null (first human reply):
   - Set `bot_paused_at = now()`
   - Insert `escalation_events` row: type=`agent_took_over`
7. Update `conversations.last_message_at`

### 6.3 `POST /api/inbox/resume`

Manual bot resume by agent.

**Request body:**
```json
{
  "conversation_id": "uuid"
}
```

**Flow:**
1. Auth check
2. Clear `bot_paused_at`, `needs_human`, `escalation_reason`, `escalation_message_id`
3. Insert `escalation_events` row: type=`bot_resumed`, reason=`manual`, agent_user_id=[current user]

### 6.4 `PATCH /api/bot/settings`

Update tenant bot settings (extend existing if it exists, create if not).

**Request body (partial):**
```json
{
  "handoff_timeout_hours": 24
}
```

Validates value is one of: 1, 6, 12, 24, 48, or null.

---

## 7. Inbox UI Changes

### 7.1 ConversationList (Left Sidebar)

- Escalated conversations get a red indicator dot and sort to the top
- Paused conversations show a small "Paused" badge
- Polling via `useInboxPolling` hook (5s interval)

### 7.2 MessageThread (Main Area)

**Escalation system message:**
- Inline card at the point of escalation showing: "Bot escalated: [human-readable reason]"
- The lead message that triggered escalation (`escalation_message_id`) is visually highlighted with a colored left border

**Bot status banner (top of thread):**
- "Bot is active" (green) — normal operation
- "Waiting for human" (amber) — escalated, no agent reply yet
- "Bot paused — you're in control" (blue) — agent has taken over

**Resume Bot button:**
- Visible when `bot_paused_at` is set
- Calls `POST /api/inbox/resume`

**Compose box:**
- Wired to `POST /api/inbox/send`
- Image attachment button next to Send:
  - Upload from device (uploads to Cloudinary)
  - Pick from Knowledge Images (existing `GET /api/knowledge/images/list`)
  - Selected image shows as thumbnail preview before sending

### 7.3 Nav Sidebar Badge

- Inbox nav item shows red badge with count of `needs_human = true` conversations
- Polled via `useEscalationCount` hook (5s interval, lightweight count-only query)

---

## 8. Bot Settings UI

New dropdown in bot config area of `BotClient.tsx`:

- **Label:** "Auto-resume bot after"
- **Options:** 1 hour, 6 hours, 12 hours, 24 hours (default), 48 hours, Never
- **Help text:** "When a human agent takes over a conversation, the bot will automatically resume after this period of agent inactivity."
- **API:** `PATCH /api/bot/settings`

---

## 9. New Components

| Component | Purpose |
|---|---|
| `EscalationBanner.tsx` | Bot status banner with state indicator + Resume Bot button |
| `EscalationSystemMessage.tsx` | Inline card showing escalation reason at the point it occurred |
| `ImageAttachmentPicker.tsx` | Image picker for compose box (upload from device + pick from knowledge images) |

---

## 10. Hooks

| Hook | Purpose |
|---|---|
| `useInboxPolling.ts` | Poll `GET /api/inbox/conversations` every 5s, returns sorted conversation list with escalation metadata |
| `useEscalationCount.ts` | Poll for count of `needs_human = true` conversations for nav badge |

---

## 11. File Structure

```
supabase/migrations/
└── 0008_human_handoff.sql              # New columns + escalation_events table

src/types/
└── database.ts                         # Modify: add new columns/types

src/app/api/inbox/
├── conversations/route.ts              # GET: list with escalation sorting
├── send/route.ts                       # POST: agent reply via Messenger
├── resume/route.ts                     # POST: manual bot resume

src/app/api/bot/
└── settings/route.ts                   # PATCH: update handoff_timeout_hours

src/lib/ai/
└── conversation-engine.ts              # Modify: gate check + enriched escalation

src/hooks/
├── useInboxPolling.ts                  # Poll for conversations with escalation state
├── useEscalationCount.ts               # Poll for nav badge count

src/components/dashboard/
├── ConversationList.tsx                # Modify: escalation indicators, sorting
├── MessageThread.tsx                   # Modify: system messages, banner, compose wiring, image picker
├── EscalationBanner.tsx                # Bot status banner (active/waiting/paused + resume button)
├── EscalationSystemMessage.tsx         # Inline escalation reason card
├── ImageAttachmentPicker.tsx           # Image picker for compose box (upload + knowledge images)

src/app/(tenant)/app/bot/
└── BotClient.tsx                       # Modify: add handoff timeout setting

src/app/(tenant)/app/
└── layout.tsx (or sidebar component)   # Modify: inbox badge count

tests/unit/
├── inbox-conversations-api.test.ts
├── inbox-send-api.test.ts
├── inbox-resume-api.test.ts
├── bot-settings-api.test.ts
├── conversation-engine-handoff.test.ts
├── escalation-banner.test.tsx
├── escalation-system-message.test.tsx
├── image-attachment-picker.test.tsx
├── use-inbox-polling.test.ts
├── use-escalation-count.test.ts

tests/e2e/
└── human-handoff.spec.ts
```

---

## 12. Out of Scope (Future)

- Email / push / Messenger notifications to agents (can layer on later)
- Re-engagement messages on bot resume
- Escalation analytics dashboard
- Agent assignment / routing (multi-agent teams)
- Canned responses / quick replies for agents
- Supabase Realtime (can replace polling later)
