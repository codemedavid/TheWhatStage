---
tags:
  - component
  - middleware
file_path: src/middleware.ts
subsystem: auth
context: api
created: 2026-04-18
---

# Middleware

## Description

Next.js middleware that extracts tenant slug from wildcard subdomains, resolves tenant_id, and enforces auth guards on protected routes.

## Data Consumed

- [[tenants]]

## Part Of

- [[Tenant Routing]]

## Source

`src/middleware.ts`
