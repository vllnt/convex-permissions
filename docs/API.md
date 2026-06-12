# API Reference — @vllnt/convex-permissions

The public surface is the `Permissions` client class (`src/client/index.ts`),
generic over the host's role and action unions:

```ts
import { Permissions } from "@vllnt/convex-permissions";

type Role = "admin" | "editor" | "viewer";
type Action = "doc.read" | "doc.edit" | "doc.delete";

const permissions = new Permissions<Role, Action>(components.permissions);
```

Every method takes the host `ctx` first. The mutating methods (`defineRole`,
`removeRole`, `assign`, `revoke`) need a mutation `ctx`; the read methods
(`check`, `require`, `rolesFor`, `permissionsFor`, `listRoles`) need a query (or
mutation) `ctx`.

## Methods

| Method | Args | Returns | Notes |
|--------|------|---------|-------|
| `defineRole(ctx, { name, grants, description? })` | role name + grant list | `Promise<null>` | Upsert by name — runtime-editable |
| `removeRole(ctx, name)` | role name | `Promise<boolean>` | `true` if a role was removed |
| `assign(ctx, { subjectRef, role, scopeRef? })` | subject + role (+ scope) | `Promise<boolean>` | `true` if newly created (idempotent) |
| `revoke(ctx, { subjectRef, role, scopeRef? })` | subject + role (+ scope) | `Promise<boolean>` | `true` if an assignment was removed |
| `check(ctx, { subjectRef, action, scopeRef? })` | subject + action (+ scope) | `Promise<boolean>` | Default-deny |
| `require(ctx, { subjectRef, action, scopeRef? })` | subject + action (+ scope) | `Promise<void>` | Throws `ConvexError<PermissionDenied>` on deny |
| `rolesFor(ctx, { subjectRef, scopeRef? })` | subject (+ scope) | `Promise<string[]>` | Role names, sorted |
| `permissionsFor(ctx, { subjectRef, scopeRef? })` | subject (+ scope) | `Promise<string[]>` | Distinct grants, sorted |
| `listRoles(ctx)` | — | `Promise<RoleDoc[]>` | All role definitions |

`RoleDoc = { _id; _creationTime; name; grants; description?; updatedAt }`.

## Grant matching

- **exact** — `"doc.edit"` authorizes `"doc.edit"`
- **prefix wildcard** — `"doc.*"` authorizes `"doc.read"`, `"doc.edit"`, …
- **global wildcard** — `"*"` authorizes everything (a super-role is just a role
  granted `"*"`)

## Scopes (multi-tenant)

An assignment with no `scopeRef` is **global** — it applies in every scope. A
scoped assignment applies only when `check` / `require` is called with the same
`scopeRef`. A scoped check therefore considers the subject's global **and**
in-scope roles; an unscoped check considers only global roles.

## Errors

`require` throws `ConvexError<PermissionDenied>` where:

```ts
type PermissionDenied = { code: "FORBIDDEN"; subjectRef: string; action: string; scopeRef?: string };
```

Boundary validation throws when a role name or subject ref does not match
`^[A-Za-z0-9_.:-]{1,128}$`.

## Out of scope

This component is a **decision engine** (can subject X do action Y?). It does not
answer "list every resource X can see" — relationship/listing queries belong with
your resource data and indexes. Relationship-based access control (ReBAC) is a
candidate for a future major version.
