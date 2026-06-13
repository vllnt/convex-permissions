<!-- Badges -->
[![Convex Component](https://img.shields.io/badge/convex-component-EE342F.svg)](https://www.convex.dev/components)
[![npm version](https://img.shields.io/npm/v/@vllnt/convex-permissions.svg)](https://www.npmjs.com/package/@vllnt/convex-permissions)
[![CI](https://github.com/vllnt/convex-permissions/actions/workflows/ci.yml/badge.svg)](https://github.com/vllnt/convex-permissions/actions/workflows/ci.yml)
[![License](https://img.shields.io/npm/l/@vllnt/convex-permissions.svg)](./LICENSE)

# @vllnt/convex-permissions

Role-based access control as a Convex component — typed, sandboxed,
runtime-editable roles and grants keyed by opaque refs.

Define roles and their grants, assign them to opaque subject refs (optionally
scoped for multi-tenancy), then check or enforce access from any Convex query,
mutation, or action. Roles and assignments live in the component's own sandboxed
tables, so they are editable at runtime — no redeploy to change who can do what.

```ts
// Define a role, assign it, enforce it — all from host functions.
await permissions.defineRole(ctx, { name: "editor", grants: ["doc.read", "doc.edit"] });
await permissions.assign(ctx, { subjectRef: userId, role: "editor" });
await permissions.require(ctx, { subjectRef: userId, action: "doc.edit" }); // throws on deny
```

## Features

- **Stored, runtime-editable RBAC** — roles, grants, and assignments live in the
  component's sandboxed tables; change them with a mutation, no redeploy.
- **Typed end to end** — `Permissions<TRole, TAction>` is generic over your role
  and action unions, so `assign`, `check`, and `require` are autocompleted and
  typo-safe.
- **Wildcard grants** — `"doc.*"` grants every `doc.` action; `"*"` grants
  everything (a super-role is just a role granted `"*"`).
- **Scoped / multi-tenant** — assign a role within an opaque `scopeRef` (e.g. an
  org); unscoped assignments apply globally.
- **Agnostic by construction** — opaque `subjectRef` / `scopeRef`, no auth
  library, no domain model, no vendor. The host owns identity and passes refs in.
- **`require` throws a structured error** — `ConvexError<PermissionDenied>` the
  host maps to a 403.
- **Default-deny** — unknown subjects and unmatched actions are denied.
- **Runs anywhere** — identical on Convex Cloud and self-hosted `convex-backend`.

## Architecture

```
src/
├── shared.ts        # pure grant-matching + token validation
├── test.ts          # convex-test register() helper
├── client/          # Permissions<TRole, TAction> — the public API
└── component/       # sandboxed tables: roles + assignments
```

The component owns two sandboxed tables — the host never reads them directly:

| Table | Fields | Indexes |
|-------|--------|---------|
| `roles` | `name`, `grants[]`, `description?`, `updatedAt` | `by_name` |
| `assignments` | `subjectRef`, `role`, `scopeRef?`, `createdAt` | `by_subject`, `by_role`, `by_subject_role_scope` |

Every access goes through the `Permissions` client — host tables are never read or
written by the component.

## Installation

> **Peer dependency:** `convex@^1.36.1`

```bash
npm install @vllnt/convex-permissions
```

Register the component in your app:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import permissions from "@vllnt/convex-permissions/convex.config";

const app = defineApp();
app.use(permissions);
export default app;
```

Instantiate the typed client once and re-export the host functions you need:

```ts
// convex/permissions.ts
import { components } from "./_generated/api";
import { Permissions } from "@vllnt/convex-permissions";

type Role = "admin" | "editor" | "viewer";
type Action = "doc.read" | "doc.edit" | "doc.delete";

export const permissions = new Permissions<Role, Action>(components.permissions);
```

## Usage

### Define roles (runtime-editable)

```ts
await permissions.defineRole(ctx, { name: "admin", grants: ["*"] });
await permissions.defineRole(ctx, { name: "editor", grants: ["doc.read", "doc.edit"] });
await permissions.defineRole(ctx, { name: "viewer", grants: ["doc.read"] });
```

`defineRole` upserts by name — call it again to change a role's grants without a
redeploy. Wrap it (and `assign` / `revoke`) behind your own admin authorization.

### Assign and revoke

```ts
await permissions.assign(ctx, { subjectRef: userId, role: "editor" });                 // global
await permissions.assign(ctx, { subjectRef: userId, role: "admin", scopeRef: orgId });  // scoped
await permissions.revoke(ctx, { subjectRef: userId, role: "editor" });
```

`assign` resolves `true` when newly created, `false` if the subject already held
the role. The host resolves identity (`userId`, `orgId`) — the component treats
them as opaque strings.

### Check and enforce

```ts
// boolean, no throw
if (await permissions.check(ctx, { subjectRef: userId, action: "doc.edit" })) {
  // ...
}

// throws ConvexError({ code: "FORBIDDEN", ... }) on deny
await permissions.require(ctx, { subjectRef: userId, action: "doc.edit", scopeRef: orgId });
```

A scoped check considers the subject's global roles **and** roles scoped to that
`scopeRef`; an unscoped check considers only global roles.

### Introspect

```ts
await permissions.rolesFor(ctx, { subjectRef: userId });        // ["editor", "viewer"]
await permissions.permissionsFor(ctx, { subjectRef: userId });  // ["doc.edit", "doc.read"]
await permissions.listRoles(ctx);                                // all role definitions
```

## API Reference

See [docs/API.md](docs/API.md). Summary:

| Method | ctx | Description |
|--------|-----|-------------|
| `defineRole(ctx, { name, grants, description? })` | mutation | Upsert a role (runtime-editable) |
| `removeRole(ctx, name)` | mutation | Delete a role by name |
| `assign(ctx, { subjectRef, role, scopeRef? })` | mutation | Grant a role to a subject |
| `revoke(ctx, { subjectRef, role, scopeRef? })` | mutation | Remove a role from a subject |
| `check(ctx, { subjectRef, action, scopeRef? })` | query/mutation | Boolean permission check (default-deny) |
| `require(ctx, { subjectRef, action, scopeRef? })` | query/mutation | Enforce access — throws on deny |
| `rolesFor(ctx, { subjectRef, scopeRef? })` | query/mutation | List role names for a subject |
| `permissionsFor(ctx, { subjectRef, scopeRef? })` | query/mutation | List distinct grants for a subject |
| `listRoles(ctx)` | query/mutation | All role definitions |

## Security Model

- **The host owns auth.** It authenticates the caller, resolves identity to an
  opaque `subjectRef`, and decides which `scopeRef` (if any) applies. The
  component never sees credentials, sessions, or user records.
- **Opaque refs only.** `subjectRef`, `scopeRef`, and action keys are arbitrary
  strings the component never interprets — drop it into any app, any auth model,
  any domain.
- **Default-deny.** No matching role / grant ⇒ denied. `require` throws
  `ConvexError<PermissionDenied>`.
- **Boundary validation.** Role names and subject refs must match
  `^[A-Za-z0-9_.:-]{1,128}$`; invalid input is rejected at the mutation boundary.
- **Sandboxed storage.** Roles and assignments live in the component's own
  tables — no host table is read or written. Gate the management methods behind
  your own admin authorization.

> This is a **decision engine** — it answers "can subject X do action Y?". It
> does not list "every resource X can see"; that filtering belongs with your
> resource data and indexes.

## Testing

```bash
pnpm test           # single run
pnpm test:coverage  # enforced 100% on covered files
```

Tests run against the real component runtime via `convex-test`
(`@edge-runtime/vm`), not mocks — every public method is exercised end to end
through the `example/convex/` host-app harness, happy path and adversarial.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Author

Built by [bntvllnt](https://github.com/bntvllnt) · [bntvllnt.com](https://bntvllnt.com) · [X @bntvllnt](https://x.com/bntvllnt)

Part of the [@vllnt](https://github.com/vllnt) Convex component fleet — [vllnt.com](https://vllnt.com)

If this is useful, [sponsor the work](https://github.com/sponsors/bntvllnt).

## License

MIT — see [LICENSE](LICENSE).
