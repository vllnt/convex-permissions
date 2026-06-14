<!-- Badges -->
[![Convex Component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![npm version](https://img.shields.io/npm/v/@vllnt/convex-permissions.svg)](https://www.npmjs.com/package/@vllnt/convex-permissions)
[![CI](https://github.com/vllnt/convex-permissions/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-permissions/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@vllnt/convex-permissions.svg)](./LICENSE)

# @vllnt/convex-permissions

Role-based access control as a Convex component — typed, sandboxed,
runtime-editable roles and grants keyed by opaque refs.

```ts
// Define a role, assign it, enforce it — all from host functions.
await permissions.defineRole(ctx, { name: "editor", grants: ["doc.read", "doc.edit"] });
await permissions.assign(ctx, { subjectRef: userId, role: "editor" });
await permissions.require(ctx, { subjectRef: userId, action: "doc.edit" }); // throws on deny
```

## Features

- **Stored, runtime-editable RBAC** — roles, grants, and assignments live in sandboxed tables; change them with a mutation, no redeploy.
- **Typed end to end** — `Permissions<TRole, TAction>` is generic over your role and action unions.
- **Wildcard grants** — `"doc.*"` grants every `doc.` action; `"*"` grants everything.
- **Scoped / multi-tenant** — assign within an opaque `scopeRef`; unscoped assignments apply globally.
- **Agnostic by construction** — opaque `subjectRef` / `scopeRef`, no auth library, no domain model, no vendor.
- **`require` throws** — `ConvexError<PermissionDenied>` the host maps to a 403.
- **Default-deny** — unknown subjects and unmatched actions are denied.
- **Runs anywhere** — identical on Convex Cloud and self-hosted `convex-backend`.

## Installation

```bash
npm install @vllnt/convex-permissions
```

Peer dependency: `convex@^1.36.1`.

## Usage

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import permissions from "@vllnt/convex-permissions/convex.config";

const app = defineApp();
app.use(permissions);
export default app;
```

```ts
// convex/permissions.ts — instantiate the typed client, then define / assign / check.
import { components } from "./_generated/api";
import { Permissions } from "@vllnt/convex-permissions";

type Role = "admin" | "editor" | "viewer";
type Action = "doc.read" | "doc.edit" | "doc.delete";

export const permissions = new Permissions<Role, Action>(components.permissions);

// from any host mutation/query (gate management behind your own admin auth):
await permissions.defineRole(ctx, { name: "editor", grants: ["doc.read", "doc.edit"] });
await permissions.assign(ctx, { subjectRef: userId, role: "editor", scopeRef: orgId });
const allowed = await permissions.check(ctx, { subjectRef: userId, action: "doc.edit" });
await permissions.require(ctx, { subjectRef: userId, action: "doc.edit" }); // throws on deny
```

## API Reference

| Method | Kind | Result |
|--------|------|--------|
| `defineRole(ctx, { name, grants, description? })` | mutation | Upsert a role (runtime-editable) |
| `removeRole(ctx, name)` | mutation | Delete a role by name |
| `assign(ctx, { subjectRef, role, scopeRef? })` | mutation | Grant a role to a subject |
| `revoke(ctx, { subjectRef, role, scopeRef? })` | mutation | Remove a role from a subject |
| `check(ctx, { subjectRef, action, scopeRef? })` | query | Boolean permission check (default-deny) |
| `require(ctx, { subjectRef, action, scopeRef? })` | query | Enforce access — throws on deny |
| `rolesFor(ctx, { subjectRef, scopeRef? })` | query | List role names for a subject |
| `permissionsFor(ctx, { subjectRef, scopeRef? })` | query | List distinct grants for a subject |
| `listRoles(ctx)` | query | All role definitions |

Full reference: [docs/API.md](docs/API.md).

## Security

- **Host owns auth** — it authenticates the caller, resolves identity to an opaque `subjectRef`, and gates the management methods behind its own admin authorization.
- **Opaque refs only** — `subjectRef`, `scopeRef`, and action keys are arbitrary strings; tables are sandboxed (reached only via the client).
- **Default-deny** — no matching grant ⇒ denied; boundary validation rejects refs not matching `^[A-Za-z0-9_.:-]{1,128}$`.

See [docs/API.md](docs/API.md).

## Testing

```bash
pnpm test           # single run
pnpm test:coverage  # enforced 100% on covered files
```

Tests run against the real component runtime via `convex-test` (`@edge-runtime/vm`), not mocks.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

Built by [bntvllnt](https://github.com/bntvllnt) · [bntvllnt.com](https://bntvllnt.com) · [X @bntvllnt](https://x.com/bntvllnt)

Part of the [@vllnt](https://github.com/vllnt) Convex component fleet — [vllnt.com](https://vllnt.com)

If this is useful, [sponsor the work](https://github.com/sponsors/bntvllnt).

## License

MIT — see [LICENSE](LICENSE).
