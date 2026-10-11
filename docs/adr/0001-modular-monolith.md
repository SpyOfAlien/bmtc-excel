# ADR-0001: Modular monolith with explicit SQL and module ownership

| Field | Value |
|---|---|
| Status | Accepted from the confirmed product baseline |
| Created | October 11, 2026 |
| Product baseline | BMTC-PRODUCT 1.1.0, sections 2.12 and 14 |
| Technical baseline | BMTC-TECH 1.0.0, sections 2 to 4 |
| Supersedes | None |

## Context

BMTC has several business areas with shared identity, authorization, and transactional needs. The project is beginning implementation planning. The product already selects Java, Spring Boot, Spring Modulith, PostgreSQL, Flyway, and jOOQ.

## Decision

Use a modular monolith with one primary relational database. Each module owns its rules and tables and exposes a small public interface. Separate command and query handlers in code while retaining one database. Use Flyway as schema source and jOOQ for explicit queries and generated persistence types. Do not introduce Hibernate, JPA, event sourcing, or separate CQRS databases.

Use adapters for HTTP, persistence, identity, AI, queues, object storage, and notification providers. Domain code remains independent of their frameworks. A later worker runtime can use the same artifact and module ownership.

## Alternatives

- Microservices would require distributed consistency and operating decisions before there is evidence for independent deployment.
- An undivided monolith would make table ownership and responsibility harder to enforce as features grow.
- Parallel ORM and SQL persistence models would contradict the confirmed single persistence approach.

## Consequences

The application can coordinate local transactions without distributed commits. Module discipline must be enforced because code shares a repository and runtime. Cross-module queries use public interfaces or owned projections, not informal access to private tables.

Specific framework versions, dependency compatibility, and worker deployment choices remain open. This ADR accepts the architecture selected in the product, not every proposal in the technical specification.

## Verification

Run module-cycle and internal-access checks, architecture checks, and PostgreSQL integration tests. Prove transaction behavior using the selected versions. Split a module into a service only after an ADR documents measured scaling, deployment, or fault-isolation needs.

## Decision history

- October 11, 2026: recorded the architecture already confirmed in the product specification. No application implementation exists at this baseline.
