---
name: ai-feature-coding
description: Implement AI product features from a concise PRD or prototype, including UI states, API contracts, failure handling, safety, analytics, and verification.
---

# AI Feature Coding

Use this skill when the user asks to build or iterate an AI-powered product feature in an existing application and provides a PRD, prototype, issue, or clear feature description.

## Workflow

1. Inspect the existing app structure, package scripts, design patterns, auth, API client, and test setup before editing.
2. Translate the request into a small behavior contract: inputs, outputs, permissions, quota or billing effects, and the states `idle`, `input`, `processing`, `success`, `failure`, and `retry` as applicable.
3. Reuse existing components, services, schemas, and telemetry conventions. Keep the MVP boundary explicit and avoid unrelated refactors.
4. Implement validation at the user boundary and the server boundary. Treat model output as untrusted: validate its shape, handle timeouts and provider errors, and avoid exposing internal error details.
5. For image, voice, or identity-related features, include consent or rights checks, abuse reporting or blocking paths, and retention/deletion behavior when the product context requires them.
6. Instrument the funnel and system outcomes named in the PRD. Do not log raw user media, prompts, or personal data unless the existing privacy design explicitly permits it.
7. Verify the change with focused tests plus the repository's lint, typecheck, and build commands when available. Exercise at least one success path and one recoverable failure path.

## Completion standard

The feature is complete only when the main flow works, loading and error states are usable, invalid input is rejected, analytics are emitted with stable names, and the change passes the relevant checks. Report assumptions, changed files, verification performed, and known follow-ups.

For a compact implementation review list, read [references/implementation-checklist.md](references/implementation-checklist.md).
