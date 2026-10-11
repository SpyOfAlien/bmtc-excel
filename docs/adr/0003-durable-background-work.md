# ADR-0003: Durable internal events and external jobs

| Field | Value |
|---|---|
| Status | Proposed |
| Created | October 11, 2026 |
| Product baseline | BMTC-PRODUCT 1.1.0, sections 14.6 and 17.6 |
| Technical baseline | BMTC-TECH 1.0.0, section 11 |
| Related open decisions | TD-008, TD-013 |
| Supersedes | None |

## Context

Saving an observation may trigger projections, report work, AI requests, and notifications. A process can fail after committing a record but before sending work to a queue. Workers and providers may repeat effects when a response is lost.

## Proposed decision

Use Spring Modulith's JDBC publication registry for retryable internal module listeners. Use a transactional outbox for external SQS jobs. Each effect has one durable owner and one scheduling path.

Commit the business change, audit evidence, and external job intent atomically. Dispatch with stable event IDs and expiring leases. Consumers recheck authority and commit deduplication state with database effects. Use bounded retries, dead-letter handling, and controlled replay.

External provider calls use durable attempt records and provider idempotency where available. Ambiguous results require reconciliation; there is no general exactly-once guarantee across a database and a remote provider.

## Alternatives

- An ordinary in-memory asynchronous listener can lose work during a crash.
- Publishing directly to SQS inside a business transaction cannot make the database commit and queue send one atomic operation.
- Routing the same effect through both a listener and an outbox creates duplication and unclear recovery ownership.

## Consequences

The design adds outbox, inbox or processed-event, lease, and retry operations. It requires cleanup policies and operational alerts. The publication registry and business transaction must use compatible transaction configuration; sharing a database alone is insufficient evidence.

A custom outbox versus a compatible library remains an implementation choice to evaluate under TD-013. The architecture does not require adopting a specific additional library.

## Verification

Inject crashes before commit, after commit, after queue send, during provider calls, and before acknowledgment. Deliver events twice and out of order. Confirm no duplicated database effects, no lost committed intents, safe authorization rechecks, and a visible recovery path for ambiguous external effects.

## Decision history

- October 11, 2026: proposed the durability strategy. Library selection and transaction integration require validation before acceptance.
