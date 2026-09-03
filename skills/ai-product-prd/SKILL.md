---
name: ai-product-prd
description: Create concise, implementation-ready PRDs for AI product MVPs and daily iterations using scenario, goal, scope, flow, analytics, and acceptance metrics.
---

# AI Product PRD

Use this skill when the user needs a new AI feature PRD, an MVP definition, or a small iteration that should be handed to design and engineering quickly.

## Output

Write only the six sections below unless the user asks for more. Keep the document short enough to review in one sitting.

1. **Background and scenarios**: Who has the problem, in what context, and what triggers the request.
2. **Goal**: One user outcome and, when useful, one business outcome. State what is explicitly not a goal.
3. **Scope**: Separate MVP in-scope items from out-of-scope items. Define the minimum input, output, and supported constraints for the AI capability.
4. **Flow**: Describe the main path and key exception states. Include upload/input, processing, success, retry, failure, and empty states when relevant.
5. **Analytics**: Name events at meaningful user decisions and system outcomes. Include the minimum properties needed to diagnose the funnel.
6. **Acceptance and metrics**: Define functional acceptance criteria, quality expectations, and a small set of measurable launch metrics.

## Rules

- Turn vague ideas into explicit assumptions; label assumptions instead of presenting them as facts.
- Prefer observable behavior and thresholds over adjectives such as "fast" or "high quality".
- For AI features, cover input validation, model failure, latency, cost or quota impact, and safety or consent requirements when applicable.
- Do not duplicate detailed visual specs that are already clear in a prototype. Reference the prototype as the UI source of truth.
- If information is missing, make the smallest reasonable assumption and list it at the end of the affected section.

For the reusable output format, read [references/prd-template.md](references/prd-template.md).
