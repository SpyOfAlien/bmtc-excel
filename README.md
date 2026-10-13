# BMTC

Child education support platform, starting with a pilot for teachers and their daily observation and reporting work.

BMTC serves children needing special education support in Vietnam. Schools are team customers; freelance teachers and parents can purchase personal premium capabilities.

- [Product specification 1.1.0](docs/application-specification-v1.md): behavior, requirements, business decisions, and release scope.
- [Technical specification 1.0.0](docs/technical-specification-v1.md): architecture, data isolation, interfaces, security, synchronization, jobs, deployment, and verification.
- [Documentation and versioning](docs/README.md): current versions, Git baselines, and the change workflow.
- [Change log](docs/CHANGELOG.md) and [architecture decisions](docs/adr/README.md).

The repository also contains a [Next.js lesson planner](apps/lesson-planner/README.md), deployable to Cloudflare. It creates per-child Excel plans from an existing template, with workbook processing in the browser. Run it from `apps/lesson-planner` with `npm ci` and `npm run dev`.

The specifications describe the wider platform. Technical proposals and unresolved product policies are identified explicitly.
