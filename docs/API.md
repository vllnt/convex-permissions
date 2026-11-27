# API Reference — @vllnt/convex-permissions

**Compatibility:** `convex@^1.45.0`

## Entry points

| Import                                           | Exports                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `@vllnt/convex-permissions`                      | `Permissions` class; types `PermissionsComponent`, `PermissionDenied`, `RoleDoc`     |
| `@vllnt/convex-permissions/convex.config`        | Default export: the component definition for `app.use(...)`                            |
| `@vllnt/convex-permissions/test`                 | `register(t, name = "permissions")` for `convex-test` (TypeScript source, see README) |
| `@vllnt/convex-permissions/_generated/component` | Type `ComponentApi` (types only)                                                       |

`/convex.config.js` and `/_generated/component.js` resolve to the same files.

The public surface is the `Permissions` client class (`src/client/index.ts`),
generic over the host's role and action unions:

```ts
import { Permissions } from "@vllnt/convex-permissions";

type Role = "admin" | "editor" | "viewer";
type Action = "doc.read" | "doc.edit" | "doc.delete";

const permissions = new Permissions<Role, Action>(components.permissions);
```

`TRole` and `TAction` default to `string`. `assign`, `revoke`, `removeRole`, `check`, and
`require` are typed against them; `defineRole` grants accept any string and are not checked
against `TAction`.

Every method takes the host `ctx` first. The mutating methods (`defineRole`, `removeRole`,
`assign`, `revoke`) need a `ctx` with `runMutation` (mutation or action); the read methods
(`check`, `require`, `rolesFor`, `permissionsFor`, `listRoles`) need a `ctx` with `runQuery`
(query, mutation, or action).

## Mutations

Require a mutation or action `ctx`.

| Method                                            | Args                     | Returns            | Notes                                |
| ------------------------------------------------- | ------------------------ | ------------------ | ------------------------------------ |
| `defineRole(ctx, { name, grants, description? })` | role name + grant list   | `Promise<null>`    | Upsert by name — runtime-editable    |
| `removeRole(ctx, name)`                           | role name                | `Promise<boolean>` | `true` if a role was removed         |
| `assign(ctx, { subjectRef, role, scopeRef? })`    | subject + role (+ scope) | `Promise<boolean>` | `true` if newly created (idempotent) |
| `revoke(ctx, { subjectRef, role, scopeRef? })`    | subject + role (+ scope) | `Promise<boolean>` | `true` if an assignment was removed  |

`removeRole` deletes the role definition only: existing assignments stay and apply again if a
role with the same name is defined later. Revoke the role from its holders first, or don't reuse
the name.

`assign` does not check that the role is defined. An assignment to an undefined role grants
nothing until a role with that name is defined, and `rolesFor` still lists it.

## Queries

Accept a query, mutation, or action `ctx`.

| Method                                            | Args                       | Returns              | Notes                                          |
| ------------------------------------------------- | -------------------------- | -------------------- | ---------------------------------------------- |
| `check(ctx, { subjectRef, action, scopeRef? })`   | subject + action (+ scope) | `Promise<boolean>`   | Default-deny                                   |
| `require(ctx, { subjectRef, action, scopeRef? })` | subject + action (+ scope) | `Promise<void>`      | Throws `ConvexError<PermissionDenied>` on deny |
| `rolesFor(ctx, { subjectRef, scopeRef? })`        | subject (+ scope)          | `Promise<string[]>`  | Assigned role names, sorted                    |
| `permissionsFor(ctx, { subjectRef, scopeRef? })`  | subject (+ scope)          | `Promise<string[]>`  | Distinct grants, sorted                        |
| `listRoles(ctx)`                                  | —                          | `Promise<RoleDoc[]>` | All role definitions                           |

`RoleDoc = { _id; _creationTime; name; grants; description?; updatedAt }`.

## Error codes

| Code        | Thrown by | Description                                                     |
| ----------- | --------- | --------------------------------------------------------------- |
| `FORBIDDEN` | `require` | Subject does not hold a matching grant for the requested action |

`require` throws
`ConvexError<{ code: "FORBIDDEN"; subjectRef: string; action: string; scopeRef?: string }>`.

Boundary validation throws a plain `Error` (not `ConvexError`) when:

- a `defineRole` `name`, or an `assign` `subjectRef`, `role`, or `scopeRef`, does not match
  `^[A-Za-z0-9_.:-]{1,128}$`;
- a `defineRole` grant is an empty string (`grant must be a non-empty string`).

`defineRole` with the same grants (same order) and description as the stored role writes
nothing, so it does not bump `updatedAt` or re-run subscribed `check` queries.

`removeRole`, `revoke`, and the read queries never throw on malformed refs; they match exactly and
return `false` / empty. `check` and `require` always deny an empty `action`.

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

## Out of scope

This component is a **decision engine** (can subject X do action Y?). It does
not answer "list every resource X can see" — relationship/listing queries belong
with your resource data and indexes. Relationship-based access control (ReBAC)
is a candidate for a future major version.
