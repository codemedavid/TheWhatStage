# Design Spec: Fluid Sales Conversation Prompt & Offer-Aware RAG

**Date:** 2026-04-24  
**Status:** Draft for review  
**Subsystem:** AI conversation engine, prompt builder, RAG retrieval

---

## 1. Purpose

The chatbot should feel like a capable human sales rep who understands what the business sells before replying. When a lead says something vague but buying-oriented, such as "I'm interested", the bot should not respond like it has no context. It should infer the likely offer from the current campaign, business context, conversation history, and retrieved knowledge, then move the conversation forward naturally.

The design borrows from Alex Hormozi's CLOSER framework as a reasoning model, not as a persona. The bot should not claim to be Alex Hormozi or sound like a sales training script. The usable principles are: clarify why the lead reached out, name the real problem, understand what they have tried or considered, sell the outcome instead of the mechanics, address concerns directly, and reinforce the next decision after conversion.

Reference material used:
- Hormozi sales framework transcript: https://ytscribe.com/v/q32-l3Yoqg4
- CLOSER framework notes: https://studylib.net/doc/27075508/closer-alex-hormozi
- Acquisition.com business context: https://www.acquisition.com/

---

## 2. Current Problem

Production Messenger currently assigns a campaign before generating a reply, but the campaign's name, description, and goal are not passed into `buildSystemPrompt`. Test chat already passes that context. This means the live bot may know the tenant's broad business type and bot goal, but not the actual offer being promoted.

Retrieval is also based on only the latest lead message. A message like "interested" has weak semantic content, so hybrid/vector search can return no useful product or business context. The prompt then falls back to generic clarification and asks what the lead is interested in.

The result is a message like:

```text
Uy! Hi din! 😊 Ano'ng interested ka ba? Business mo ba or something else?
```

The language is natural, but the sales behavior is wrong because the bot is acting offer-blind.

---

## 3. Design Principles

1. **Phases are advisory, not rigid.** A phase is a conversation compass, not a script or mandatory checklist. The bot can skip, blend, or slow down phases based on lead intent.

2. **Lead intent beats phase position.** If the lead asks price, availability, booking, checkout, requirements, or says they are interested, the bot should respond to that signal directly even if the current phase says "Nurture" or "Discover".

3. **Default to the active offer when intent is vague.** If a lead says "I'm interested", the bot should assume they mean the current campaign or primary offer unless the business context is genuinely ambiguous.

4. **Diagnose before pitching, but do not stall obvious buyers.** The bot should ask one useful question when more context is needed. It should not interrogate or delay the next step when the lead is already ready.

5. **Outcome-first selling.** The bot should describe the result or benefit the lead wants before explaining process, features, modules, or internal mechanics.

6. **Human Messenger behavior.** Replies stay short, contextual, Taglish/English matched to the lead, and free of bullets, corporate phrasing, and fake enthusiasm.

---

## 4. Prompt Architecture Changes

### 4.1 Offer Context Becomes Mandatory

`buildSystemPrompt` should receive a compact offer context for production Messenger, not only for test chat.

Minimum fields:
- campaign name
- campaign description
- campaign goal
- tenant business type and bot goal
- optional primary product/service summary from knowledge base

If no campaign description exists, the prompt should still include a generated fallback from tenant settings and top product/general knowledge:

```text
Current likely offer: Use the tenant's primary campaign or most relevant product/service context below. If it is still unclear, ask one specific clarifying question.
```

### 4.2 Add Sales Reasoning Layer

Add a dedicated prompt layer after mission/offer context and before phase context:

```text
--- SALES CONVERSATION STRATEGY ---
Use this as hidden reasoning, not as a script.
- Clarify: understand why they reached out and what outcome they want.
- Label: briefly reflect the problem or desire in their words.
- Overview: if useful, ask what they tried, considered, or need to compare.
- Sell outcome: connect the offer to the result they care about, not just features.
- Explain concerns: answer price, trust, fit, timing, and decision-maker concerns directly.
- Reinforce: after they choose a next step, make them feel clear about what happens next.

Do not force every step. Pick the next useful move for this exact message.
```

### 4.3 Reframe Phase Instructions

Current phase context should explicitly say:

```text
The phase is guidance, not a rule. If the lead's intent clearly belongs to another step, respond to the lead's intent first. You may advance when the conversation naturally moves forward.
```

The model should use phase metadata to decide broad posture, but should not ignore explicit user buying signals.

### 4.4 Vague Intent Handling

Add prompt rules for low-detail but high-intent messages:

```text
If the lead says "interested", "details", "how much", "available?", "pa info", or similar:
- Assume they mean the current offer if one is available.
- Reply with a short contextual bridge showing you know the offer.
- Ask only one next question, or give the next action if the path is clear.
- Do not ask "interested in what?" unless there are multiple unrelated offers and no campaign context.
```

Example behavior:

```text
Oo, this is for [offer]. Quick check lang, are you looking to [primary outcome] soon or just comparing options muna?
```

---

## 5. RAG Retrieval Changes

### 5.1 Context-Aware Query Building

`retrieveKnowledge` should accept optional context fields:
- latest lead message
- current phase name
- campaign name and description
- recent conversation summary or last few messages
- business name/type

For retrieval, build an enriched search query when the lead message is vague:

```text
Lead message: interested
Campaign: [campaign name]
Offer: [campaign description]
Phase: [phase name]
Business type: [business type]
Recent context: [last relevant lead/bot exchange]
```

This enriched query is only for retrieval. The final LLM still receives the real user message separately.

### 5.2 Always Include Offer Anchors

For high-intent vague queries, retrieval should search both general and product KB and bias toward product/offer chunks. If there is a campaign description, it should be included in the retrieval query even before LLM query expansion.

### 5.3 Pre-Knowledge Snapshot

Add a lightweight "business brief" context layer assembled before each response:

- tenant name
- business type
- bot goal
- active campaign
- primary offer summary
- top 1-3 product/service facts
- key action path, such as book appointment, submit form, or buy

This brief should be retrieved or assembled once per response from structured tables and high-confidence chunks. It should be short enough to always fit in the prompt.

### 5.4 Do Not Hallucinate Missing Details

The bot may infer that vague interest refers to the active offer, but it must not invent prices, guarantees, stock, schedules, or policies. If those details are not in the brief or retrieved chunks, it should say so naturally and either ask a useful question or escalate.

---

## 6. Conversation Behavior

### 6.1 Better Response To "I'm Interested"

If campaign/offer context exists:

```text
Oo, sakto. This is for [offer/outcome].

Para ma-guide kita properly, are you looking to [buy/book/start] soon or checking details muna?
```

If product context exists but there are multiple possible products:

```text
Nice. Are you looking at [likely category/product] or ibang item?
```

If no offer context exists:

```text
Sure. Para tama sagot ko, which one are you interested in: [best known option A] or [best known option B]?
```

The exact wording should remain generated by the model, not hardcoded.

### 6.2 One Question Rule

The bot should ask at most one main question per reply unless a form/action flow requires multiple fields. This keeps the Messenger feel human and prevents interrogation.

### 6.3 Human Sales Posture

The bot should:
- sound certain when the knowledge supports it
- admit uncertainty when the knowledge is missing
- recommend the next step instead of waiting passively
- avoid fake urgency unless an actual campaign or product rule provides urgency
- avoid dumping catalog lists unless the lead asks for options

---

## 7. Implementation Scope

### In Scope

- Fetch campaign context in production `conversation-engine.ts` and pass it into `buildSystemPrompt`.
- Update `prompt-builder.ts` with the sales reasoning layer, advisory phase framing, and vague intent rules.
- Extend retrieval params to support context-aware enriched queries.
- Add tests for production campaign context, soft phase behavior in prompt text, and vague intent retrieval enrichment.
- Keep test chat behavior aligned with production.

### Out Of Scope

- New database schema for persistent conversation summaries.
- Full CRM-style lead scoring.
- Hardcoded scripts per business type.
- Replacing the existing campaign phase system.
- Training the bot to imitate Alex Hormozi's voice.

---

## 8. Testing Plan

Unit tests:
- `prompt-builder.test.ts` verifies prompt includes offer context, sales strategy, soft phase language, and vague intent handling.
- `conversation-engine.test.ts` verifies production engine fetches campaign details and passes them into prompt building.
- `retriever.test.ts` verifies vague high-intent messages use enriched campaign/offer query context.
- `query-router.test.ts` verifies "interested", "details", "pa info", "available", and similar terms route to both or product-biased search instead of weak general fallback.

Manual test prompts:
- "Interested"
- "Hm?"
- "Available pa?"
- "Pa info"
- "How much?"
- "Can I book?"
- "Need ko muna pag-isipan"

Expected behavior:
- The bot references the current offer when available.
- The bot asks one relevant next question or gives one clear next step.
- The bot does not ask "interested in what?" unless context is genuinely missing.
- The bot does not invent details missing from RAG or structured context.

---

## 9. Success Criteria

The change is successful when the live bot can handle vague buying signals with offer awareness, while still sounding like a natural Messenger conversation. Phases remain useful for strategy, but the lead's actual intent controls the next reply.

The specific failure case should become impossible when campaign or offer context exists:

```text
Lead: Interested
Bot: Ano'ng interested ka ba?
```

Instead, the bot should know the likely offer, acknowledge it, and move the buyer one step forward.
