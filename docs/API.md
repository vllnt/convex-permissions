# API reference: @vllnt/convex-permissions

Full reference for every public export. Signatures, defaults, return shapes,
errors, and validation rules are taken from `src/`.

**Compatibility:** peer `convex@^1.45.0`, Node.js `>=20`, ESM
(`"type": "module"`).

## Entry points

| Import                                           | Exports                                                                                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@vllnt/convex-permissions`                      | [`Permissions`](#permissions) class; types [`PermissionsComponent`](#permissionscomponent), [`PermissionDenied`](#permissiondenied), [`RoleDoc`](#roledoc) |
| `@vllnt/convex-permissions/convex.config`        | [Default export](#convexconfig-default-export): the component definition for `app.use(...)`                                                                |
| `@vllnt/convex-permissions/test`                 | [`register`](#register) for `convex-test` (TypeScript source)                                                                                              |
| `@vllnt/convex-permissions/_generated/component` | Type [`ComponentApi`](#componentapi) (types only)                                                                                                          |

`/convex.config.js` and `/_generated/component.js` resolve to the same files as
`/convex.config` and `/_generated/component`.

## Permissions client

### Permissions

```ts
import { Permissions } from "@vllnt/convex-permissions";
import { components } from "./_generated/api";

type Role = "admin" | "editor" | "viewer";
type Action = "doc.read" | "doc.edit" | "doc.delete";

export const permissions = new Permissions<Role, Action>(
  components.permissions,
);
```

- Signature:
  `new Permissions<TRole extends string = string, TAction extends string = string>(component: PermissionsComponent)`.
- `component` is the mounted component reference, `components.permissions` from
  the host's `./_generated/api` (or `components.<name>` when mounted with
  `app.use(permissions, { name })`).
- `TRole` types the `name` of `defineRole`, the `name` of `removeRole`, and the
  `role` of `assign` and `revoke`. `TAction` types the `action` of `check` and
  `require`. Both default to `string`.
- `defineRole` grants are typed `readonly (TAction | string)[]`, so grants are
  not checked against `TAction`. `rolesFor` and `permissionsFor` return
  `string[]`, not `TRole[]` or `TAction[]`.
- The constructor stores the reference only. It makes no call and never throws.

Every method takes the host `ctx` first:

- Mutating methods (`defineRole`, `removeRole`, `assign`, `revoke`) need a `ctx`
  with `runMutation`: a mutation or action `ctx`.
- Read methods (`check`, `require`, `rolesFor`, `permissionsFor`, `listRoles`)
  need a `ctx` with `runQuery`: a query, mutation, action, or HTTP action `ctx`.

### defineRole

`defineRole(ctx, role: { name: TRole; grants: readonly (TAction | string)[]; description?: string }): Promise<null>`

Creates the role, or replaces the grants and description of the role with that
`name` (upsert by name).

- `name` must match `^[A-Za-z0-9_.:-]{1,128}$`, else it throws
  `role name must match /^[A-Za-z0-9_.:-]{1,128}$/`.
- Each grant must be a non-empty string, else it throws
  `grant must be a non-empty string`. Grants have no pattern check.
- Size limits, counted as JavaScript string length (UTF-16 code units: `"é"`
  counts 1, most emoji count 2):
  - at most 256 grants, else it throws `a role may have at most 256 grants`;
  - each grant at most 256 characters, else it throws
    `grant must be at most 256 characters`;
  - `description` at most 1024 characters, else it throws
    `description must be at most 1024 characters`.
- A role stored before these limits (by 0.1.0) may exceed them. It stays
  readable by every query, and `defineRole` can update it as long as the grant
  count and description length each stay within the larger of the limit and the
  stored value, and it adds no new grant over 256 characters. Each rule is
  checked on its own:
  - at most 256 grants or the stored count, whichever is larger;
  - a description of at most 1024 characters or the stored length, whichever is
    larger (omitting it is always accepted);
  - a grant over 256 characters only if the stored role holds it, at most as
    many times as stored (kept, never added or duplicated).

  Grants of 256 characters or fewer are always accepted, so the total size can
  still grow: 300 short grants can be replaced by 300 grants of 256 characters.
  Once the role fits the limits, they apply in full.

- An update replaces both fields. Omitting `description` on an update removes
  the stored description.
- When the grants (same order) and the description equal the stored role, it
  writes nothing: `updatedAt` stays the same and subscribed queries do not
  re-run. A different grant order counts as a change.
- On a write, `updatedAt` is set to `Date.now()`.

### removeRole

`removeRole(ctx, name: TRole): Promise<boolean>`

Deletes the role definition. Resolves `true` if a role was deleted, `false` if
no role had that name.

- Does not validate `name` and never throws for a malformed name.
- Keeps every assignment of the role. While no role has that name, those
  assignments grant nothing, but `rolesFor` still lists them. If a role with the
  same name is defined again, they grant its new grants. Revoke the holders
  first, or never reuse the name.
- The component exposes no query that lists the holders of a role. Keep your own
  record of who you assigned if you need to revoke them all.

### assign

`assign(ctx, args: { subjectRef: string; role: TRole; scopeRef?: string }): Promise<boolean>`

Assigns `role` to `subjectRef`, globally (no `scopeRef`) or in one scope.
Resolves `true` if the assignment was created, `false` if it already existed
(idempotent).

- `subjectRef`, `role`, and `scopeRef` (when given) must match
  `^[A-Za-z0-9_.:-]{1,128}$`, else it throws
  `subjectRef must match /^[A-Za-z0-9_.:-]{1,128}$/`,
  `role must match /^[A-Za-z0-9_.:-]{1,128}$/`, or
  `scopeRef must match /^[A-Za-z0-9_.:-]{1,128}$/`. An empty `scopeRef` (`""`)
  throws; omit the field for a global assignment.
- Does not check that the role is defined. The assignment grants nothing until a
  role with that name exists.
- A global assignment and a scoped assignment of the same role are separate
  rows.

### revoke

`revoke(ctx, args: { subjectRef: string; role: TRole; scopeRef?: string }): Promise<boolean>`

Deletes the one assignment that matches `subjectRef`, `role`, and `scopeRef`
exactly. Resolves `true` if it deleted one, `false` otherwise.

- Never validates its arguments and never throws for malformed refs, so rows
  stored by 0.1.0 (before `scopeRef` validation) can still be revoked.
- Omitting `scopeRef` revokes only the global assignment; it leaves scoped
  assignments of the same role in place, and the reverse.

### check

`check(ctx, args: { subjectRef: string; action: TAction; scopeRef?: string }): Promise<boolean>`

Resolves `true` if a role assigned to `subjectRef` has a grant that matches
`action` (see [Grant matching](#grant-matching)), else `false`.

- Default-deny: no assignment, no defined role, or no matching grant resolves
  `false`.
- An empty `action` (`""`) always resolves `false`, even with a `"*"` grant.
- Unscoped: considers only global assignments. Scoped: considers global
  assignments plus the assignments in that `scopeRef` (see
  [Scopes](#scopes-multi-tenant)).
- Never validates its arguments and never throws for malformed refs.

### require

`require(ctx, args: { subjectRef: string; action: TAction; scopeRef?: string }): Promise<void>`

Runs `check` and resolves when it is `true`. When it is `false`, it throws a
`ConvexError` whose `data` is a [`PermissionDenied`](#permissiondenied):

```ts
import type { PermissionDenied } from "@vllnt/convex-permissions";

export const example: PermissionDenied = {
  code: "FORBIDDEN",
  subjectRef: "user_1",
  action: "doc.delete",
  scopeRef: "org_1",
};
```

`scopeRef` is `undefined` when the check had no scope. The error is thrown in
the host function, so the host can catch it. See [Error codes](#error-codes) for
how to detect it.

### rolesFor

`rolesFor(ctx, args: { subjectRef: string; scopeRef?: string }): Promise<string[]>`

Role names assigned to `subjectRef` that apply in the scope (global, plus the
scope when given), without duplicates, sorted. Includes assigned role names that
have no definition. Unknown subjects resolve `[]`. Never throws for malformed
refs.

### permissionsFor

`permissionsFor(ctx, args: { subjectRef: string; scopeRef?: string }): Promise<string[]>`

The stored grant strings of the defined roles from `rolesFor`, without
duplicates, sorted. Wildcard grants are returned as stored (`"doc.*"`, `"*"`),
not expanded into actions. Unknown subjects resolve `[]`. Never throws for
malformed refs.

### listRoles

`listRoles(ctx): Promise<RoleDoc[]>`

Every role definition as a [`RoleDoc`](#roledoc), in one query with no
pagination.

## Types

### PermissionsComponent

The shape the `Permissions` constructor accepts: the component's function
references as mounted on the host.

```ts
import type { PermissionsComponent } from "@vllnt/convex-permissions";
import { components } from "./_generated/api";

export const mounted: PermissionsComponent = components.permissions;
```

- `mutations`: `defineRole`, `removeRole`, `assign`, `revoke`.
- `queries`: `check`, `rolesFor`, `permissionsFor`, `listRoles`.

The generated [`ComponentApi`](#componentapi) satisfies it; the package test
checks this.

### PermissionDenied

The `data` of the `ConvexError` thrown by [`require`](#require):

```ts
export interface PermissionDenied {
  code: "FORBIDDEN";
  subjectRef: string;
  action: string;
  scopeRef?: string;
}
```

`PermissionDenied` is an interface without an index signature, so
`ConvexError<PermissionDenied>` does not satisfy the `Value` constraint of
`ConvexError`. Narrow with `error instanceof ConvexError` and read
`error.data as PermissionDenied`.

### RoleDoc

A stored role definition, as returned by [`listRoles`](#listroles):

```ts
export interface RoleDoc {
  _id: string;
  _creationTime: number;
  name: string;
  grants: string[];
  description?: string;
  updatedAt: number;
}
```

`updatedAt` is the `Date.now()` of the last write by `defineRole`.

## Other entry points

### convex.config default export

`import permissions from "@vllnt/convex-permissions/convex.config"` is the
component definition, created with `defineComponent("permissions")`. Mount it in
the host's `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import permissions from "@vllnt/convex-permissions/convex.config";

const app = defineApp();
app.use(permissions);

export default app;
```

The default mount name is `permissions`, so the host reference is
`components.permissions`.

### register

`register<TSchema extends GenericSchema>(t: TestConvex<SchemaDefinition<TSchema, boolean>>, name = "permissions"): void`

From `@vllnt/convex-permissions/test`. Registers the component's schema and
functions on a `convex-test` instance built from the host app's own schema,
under `name`. Pass the same name the host uses in `app.use`.

- The entry point is TypeScript source (`src/test.ts`) and uses Vite's
  `import.meta.glob`, so it needs `convex-test` and a Vite-based runner such as
  Vitest. It does not load in plain Node.js.

```ts
/// <reference types="vite/client" />
import { Permissions } from "@vllnt/convex-permissions";
import { register } from "@vllnt/convex-permissions/test";
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { components } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const permissions = new Permissions(components.permissions);

test("an editor can edit", async () => {
  const t = convexTest(schema, modules);
  register(t);
  const allowed = await t.mutation(async (ctx) => {
    await permissions.defineRole(ctx, { name: "editor", grants: ["doc.*"] });
    await permissions.assign(ctx, { subjectRef: "user_1", role: "editor" });
    return permissions.check(ctx, { subjectRef: "user_1", action: "doc.edit" });
  });
  expect(allowed).toBe(true);
});
```

### ComponentApi

`ComponentApi<Name extends string | undefined = string | undefined>` from
`@vllnt/convex-permissions/_generated/component` (types only). It is the type
Convex codegen gives `components.permissions` in the host's `_generated/api`.
Use it to type a parameter that receives the mounted component:

```ts
import { Permissions } from "@vllnt/convex-permissions";
import type { ComponentApi } from "@vllnt/convex-permissions/_generated/component";

export function createPermissions(component: ComponentApi): Permissions {
  return new Permissions(component);
}
```

## Error codes

| Error                                                                                  | Thrown by    | Cause                                                                                 |
| -------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `ConvexError` with `data.code` `"FORBIDDEN"` ([`PermissionDenied`](#permissiondenied)) | `require`    | No role of the subject has a grant that matches the action                            |
| `Error`: `role name must match /^[A-Za-z0-9_.:-]{1,128}$/`                             | `defineRole` | `name` does not match the token pattern                                               |
| `Error`: `grant must be a non-empty string`                                            | `defineRole` | A grant is `""`                                                                       |
| `Error`: `a role may have at most 256 grants`                                          | `defineRole` | More than 256 grants, and more than the stored role has                               |
| `Error`: `grant must be at most 256 characters`                                        | `defineRole` | A grant over 256 UTF-16 code units that the stored role does not hold that many times |
| `Error`: `description must be at most 1024 characters`                                 | `defineRole` | A description over 1024 UTF-16 code units and longer than the stored one              |
| `Error`: `subjectRef must match /^[A-Za-z0-9_.:-]{1,128}$/`                            | `assign`     | `subjectRef` does not match the token pattern                                         |
| `Error`: `role must match /^[A-Za-z0-9_.:-]{1,128}$/`                                  | `assign`     | `role` does not match the token pattern                                               |
| `Error`: `scopeRef must match /^[A-Za-z0-9_.:-]{1,128}$/`                              | `assign`     | `scopeRef` is given and does not match (including `""`)                               |

- The validation errors are plain `Error`s thrown inside the component mutation,
  not `ConvexError`s. They reach the host function as a failed `runMutation`
  call; under `convex-test` the error message contains the text above. Match on
  it only in host code: Convex redacts errors that are not `ConvexError` to
  "Server Error" for clients of a production deployment
  ([Convex error handling](https://docs.convex.dev/functions/error-handling)).
- `require` throws in the host function. Detect it with
  `error instanceof ConvexError && (error.data as PermissionDenied).code === "FORBIDDEN"`.
- Arguments of the wrong type fail Convex argument validation before any
  component code runs.
- `removeRole`, `revoke`, `check`, `rolesFor`, and `permissionsFor` never
  validate refs and never throw for malformed ones. They match stored rows
  exactly. A ref that current `assign` rejects finds nothing (`false` or `[]`)
  unless 0.1.0 stored it, and `revoke` can then delete that row (`true`).

## Grant matching

A grant matches an action when:

- **exact**: the grant equals the action (`"doc.edit"` matches `"doc.edit"`);
- **global wildcard**: the grant is `"*"` (matches every non-empty action; a
  super-role is a role granted `"*"`);
- **prefix wildcard**: the grant ends in `.*` and the action starts with the
  grant minus the `*` (`"doc.*"` matches `"doc.read"` and `"doc.page.edit"`, not
  `"doc"` or `"docs.read"`).

Any other `*` is a literal character: `"doc*"` and `"*.read"` match only the
identical action string. An empty action never matches.

## Scopes (multi-tenant)

An assignment without `scopeRef` is global: it applies in every scope. A scoped
assignment applies only when `check`, `require`, `rolesFor`, or `permissionsFor`
is called with the same `scopeRef`. A scoped call considers the subject's global
and in-scope assignments; an unscoped call considers only global assignments.
Refs are compared exactly (case-sensitive, no prefix matching).

## Out of scope

This component answers "may subject X perform action Y (in scope Z)?". It does
not list the resources a subject can access, model relationships between
resources, evaluate attribute conditions, or authenticate callers. The host
resolves identity and scope and passes them in as opaque strings.
