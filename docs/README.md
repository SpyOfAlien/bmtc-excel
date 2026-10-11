# BMTC documentation

## Current documents

| Document ID | Current version | File | Status |
|---|---|---|---|
| BMTC-PRODUCT | 1.1.0 | [Application specification](application-specification-v1.md) | Product baseline; open policies remain |
| BMTC-TECH | 1.0.0 | [Technical specification](technical-specification-v1.md) | Design baseline; implementation and validation pending |

BMTC-TECH 1.0.0 targets BMTC-PRODUCT 1.1.0. Versions are independent: a product change does not automatically require the same version number in the technical document.

The product document defines user behavior, business policies, confirmed architecture constraints, and delivery scope. The technical document defines the implementation design and verification strategy. Neither document silently overrides the other. Resolve a conflict in the appropriate source document and update the affected references together.

See the [change log](CHANGELOG.md) for version history and [architecture decisions](adr/README.md) for significant design choices.

## Version numbers

Use `major.minor.patch` for each specification:

- Increase **major** when changing a foundational contract incompatibly, such as the ownership model, a required architecture constraint, or a permission model that invalidates the previous design.
- Increase **minor** when adding a compatible capability, clarifying a substantive policy, or extending the technical design without invalidating the existing foundation.
- Increase **patch** for corrections, wording, diagrams, and links that do not change required behavior.

Apply the same discipline while a document is a draft. A version identifies its exact contents. Status identifies the level of agreement. A tagged design baseline is not proof of stakeholder approval, completed implementation, legal review, or a deployed release.

Keep a stable filename within a major series. `application-specification-v1.md` can hold version 1.1.0 or 1.2.0. Historical minor and patch versions are retrieved from Git tags. If version 2 is needed, create `application-specification-v2.md`, preserve the v1 series, and update this index with its successor.

The original `v1` product baseline in commit `12d9fe9` is normalized as BMTC-PRODUCT 1.0.0 for version tracking. Its original header remains unchanged in that historical commit. The earlier 0.x entries describe pre-repository design history.

## Git baselines

Use annotated tags with these names:

| Tag | Meaning |
|---|---|
| `docs/product/v1.0.0` | Initial committed product baseline |
| `docs/product/v1.1.0` | Vietnam market and premium-customer clarification, plus technical-document linkage |
| `docs/technical/v1.0.0` | Initial separate technical design |

Tags identify complete repository snapshots. Never move or overwrite an existing documentation version tag. Correct a published baseline by making a new version. Local tags are not automatically backed up to a remote.

Examples for inspecting history:

```sh
git show docs/technical/v1.0.0:docs/technical-specification-v1.md
git diff docs/product/v1.0.0 docs/product/v1.1.0 -- docs/application-specification-v1.md
git log --follow -- docs/technical-specification-v1.md
```

The documentation tags are separate from application release tags. An application release should record the product and technical baseline versions it implements, together with its own build, database migration, API, and event-schema versions.

## Change workflow

1. Identify the product rule or technical decision being changed and preserve its confirmed, proposed, or open status.
2. Update the responsible specification. Do not mark a new proposal confirmed merely because it appears in the document.
3. Choose its next version number and update its header, updated date, and internal history.
4. Update this index and the [change log](CHANGELOG.md). Update the technical document's product baseline only after checking compatibility.
5. For a significant architecture change, create or supersede an ADR. Accepted ADRs preserve their original decision; a replacement points back to the prior record.
6. Check local links, section references, requirement identifiers, diagrams, and scope consistency. Run relevant implementation checks when code exists.
7. Review the diff, commit the exact files, then create the annotated tag for each changed specification. A combined commit can carry both document tags if both versions changed.
8. Push only when a remote and publication are authorized. Do not assume local commits or tags are already shared.

Working edits can remain untagged while a decision is being developed. At a baseline checkpoint, settle the document versions together. Do not add a second edit under an already tagged version and present it as the same baseline.

## Decision records

Use sequential immutable IDs such as ADR-0004. The filename includes the number and a short description. ADRs have their own status and dates, but do not need an independent semantic version for every edit.

Use [the template](adr/template.md) for new decisions. Accepted, rejected, and superseded records stay in Git. Keep policy questions in the product register and implementation questions in the technical register; cross-reference them when one depends on the other.
