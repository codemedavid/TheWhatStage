# System Prompt Architecture (V3)

Three zones, cache-aligned:

- **Zone A (immutable top, cache-stable):** Constitution → Campaign Top Anchor → Voice Rules.
- **Zone B (semi-stable middle, tenant + campaign):** Tenant custom instructions → Campaign personality → Business Facts → Bot Rules → Campaign Playbook → Mission/Offering → Buying signals → Step context → Sales behavior → Action buttons.
- **Zone C (volatile bottom, per-turn):** Retrieved knowledge (`<untrusted source="tenant_kb">`) → Lead context (`<untrusted source="form_submission">`) → Conversation history (`<untrusted source="messenger_lead">`) → Recycled phrases → Output contract → Campaign Closing Anchor → Persona Anchor.

## Design Principles

1. **Constitution is ranked** — lower-numbered rules win on conflict.
2. **No literal example phrases or shape templates anywhere** — behavior described as constraints, not samples.
3. **Campaign goal pinned at top AND bottom** — recency bias (Liu et al. 2023).
4. **All untrusted content wrapped in `<untrusted>` tags** — spotlighting (Hines et al. 2024).
5. **Persona anchor at the very bottom** — mitigates long-thread drift (PersonaGym, Samuel et al. 2024).

## Tests

- `tests/integration/prompt-no-copy-leak.test.ts` — banned-phrase contract.
- `tests/integration/prompt-trajectory.test.ts` — 5-turn campaign-lock + no-leak.
- `tests/unit/prompt/` — module-level tests for constitution, voice rules, campaign lock, spotlighting.
- `tests/unit/decision-parser-repair.test.ts` — JSON repair fallback for malformed LLM output.
