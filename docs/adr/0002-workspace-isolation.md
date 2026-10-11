# ADR-0002: Common workspace isolation and explicit sharing

| Field | Value |
|---|---|
| Status | Proposed |
| Created | October 11, 2026 |
| Product baseline | BMTC-PRODUCT 1.1.0, sections 2.1, 2.2, 5, and 10 |
| Technical baseline | BMTC-TECH 1.0.0, sections 5 to 7 |
| Related open decisions | TD-001, TD-002, TD-003, TD-005 |
| Supersedes | None |

## Context

Schools and independent teachers are already tenants. Families own profiles and sharing relationships but have no equally explicit isolation principal. One user may participate in several workspaces. A child's education records can belong to several providers.

## Proposed decision

Use one workspace isolation concept with SCHOOL, INDEPENDENT, and FAMILY variants. Retain `tenant_id` in owned tables. Give each provider its own learning-profile identifier; keep approved identity links in a restricted mapping domain.

Ordinary operations execute under one workspace context. Cross-workspace access uses a dedicated sharing operation that checks the current grant, source resource, recipient, purpose, and allowed projection. Do not disable RLS to make family views convenient.

Keep commercial payer and feature entitlement separate from workspace authorization. A premium purchase does not change a child's sharing relationships.

## Alternatives

- A global child table with broad provider access would make accidental cross-provider disclosure easier and weaken record ownership.
- A separate authorization model for each workspace kind would duplicate policy enforcement and make multi-role behavior harder to reason about.
- Copying all records into a family workspace would create competing histories and unresolved deletion and correction semantics.

## Consequences

Uniform isolation reduces special cases but makes the word tenant broader than school organization. The product data model must explicitly accept that distinction before implementation.

Sharing still requires resource-level authorization. A source tenant context alone is not permission to read every record in that tenant. Guardian authority, report access after revocation, and duplicate resolution remain open policies.

## Verification

Test a teacher, parent, independent teacher, and multi-role user across permitted and denied relationships. Cover grant expiry, source corrections, duplicate links, wrong-workspace IDs, pooled connection reuse, and membership removal. Review the policy lookup role's exact privileges.

## Decision history

- October 11, 2026: proposed to complete the full-product isolation model. Acceptance is pending; do not treat this ADR as a settled guardianship or sharing policy.
