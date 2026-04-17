---
tags:
  - component
  - api-route
file_path: src/app/api/fb/webhook/route.ts
route: /api/fb/webhook
subsystem: messenger
context: api
created: 2026-04-18
---

# FbWebhookRoute

## Description

Facebook Messenger webhook endpoint -- receives and verifies incoming webhook events, parses messages and postbacks, resolves tenant, creates/updates leads, logs conversations, and triggers bot flows.

## Route

`/api/fb/webhook` -- api context

## Data Consumed

- [[tenants]]
- [[leads]]
- [[conversations]]
- [[messages]]
- [[lead_events]]

## Part Of

- [[Webhook Handler]]
- [[Message Handling]]
- [[Messenger Webhook Flow]]
- [[Bot Conversation Flow]]

## Source

`src/app/api/fb/webhook/route.ts`
