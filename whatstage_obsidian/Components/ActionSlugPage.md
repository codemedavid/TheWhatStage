---
tags:
  - component
  - page
file_path: src/app/(tenant)/a/[slug]/page.tsx
route: /a/:slug
subsystem: actions
context: action-page
created: 2026-04-18
---

# ActionSlugPage

## Description

Public-facing action page renderer -- dynamically serves forms, calendar booking, sales pages, product catalogs, and checkout flows based on the action page slug and type.

## Route

`/a/:slug` -- action-page context

## Data Consumed

- [[action_pages]]
- [[action_submissions]]
- [[products]]
- [[orders]]
- [[appointments]]
- [[qualification_forms]]
- [[qualification_responses]]

## Part Of

- [[Form Pages]]
- [[Calendar Booking]]
- [[Sales Pages]]
- [[Product Catalog]]
- [[Checkout]]
- [[Qualification Engine]]
- [[Booking Integration]]
- [[Sales Push]]
- [[Action Page Submission Flow]]

## Source

`src/app/(tenant)/a/[slug]/page.tsx`
