# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-11-28

### Added

- The npm package ships `docs/API.md`, `CHANGELOG.md`, and `llms.txt` next to `README.md` and
  `src/`, so coding agents can read docs that match the installed version under
  `node_modules/@vllnt/convex-permissions/`. `llms.txt` links the shipped files relatively.

### Changed

- **Breaking:** `assign` validates `scopeRef` against the same token pattern as `subjectRef`
  (`^[A-Za-z0-9_.:-]{1,128}$`), so an empty or malformed scope can no longer be stored as a
  stray scope. Scope refs 0.1.0 accepted, such as `""` or `"org/1"`, now throw
  `scopeRef must match /^[A-Za-z0-9_.:-]{1,128}$/`: omit `scopeRef` for a global assignment or
  map the scope to a valid ID. `revoke`, `check`, `rolesFor`, and `permissionsFor` still match
  refs exactly and never validate, so rows 0.1.0 stored stay readable and can be revoked.
- **Breaking:** `defineRole` rejects empty-string grants (`grant must be a non-empty string`).
  Remove `""` from the grants you pass.
- **Breaking:** `defineRole` caps role size: at most 256 grants per role, 256 characters per
  grant, and 1024 characters of description, counted as JavaScript string length (UTF-16 code
  units: `"é"` counts 1, most emoji count 2). Larger inputs now throw
  `a role may have at most 256 grants`, `grant must be at most 256 characters`, or
  `description must be at most 1024 characters`. Before upgrading, trim roles over these limits
  (find them with `listRoles`). Roles already stored over the limits stay readable by every
  query, and `defineRole` can still update them as long as the grant count and description
  length each stay within the larger of the limit and the stored value, and the update adds no
  new grant over 256 characters (a stored one may be kept, at most as many times). Each limit is
  checked on its own, and grants of 256 characters or fewer are always accepted, so such an
  update can still raise the role's total size.
- **Breaking:** `check` and `require` always deny an empty `action` (`""`), even for a `"*"`
  grant; 0.1.0 allowed it for a `"*"` or `""` grant. Pass the real, non-empty action string.
- **Breaking:** `engines.node` is `>=20` (was `>=18`): the lowest supported peer,
  `convex@1.45.0`, requires Node.js 20. The `convex` peer range is unchanged (`^1.45.0`).
- `defineRole` skips the write when grants (same order) and description are unchanged: no
  `updatedAt` bump, no re-run of subscribed `check` / `permissionsFor` queries, no OCC
  contention.
- npm metadata: `homepage` is https://oss.vllnt.com/packages/convex-permissions, the
  `description` is the same sentence as in `README.md` and `llms.txt`, and `keywords` add
  `typescript`, `rbac`, `role-based-access-control`, `roles`, `authorization`,
  `access-control`, and `multi-tenant`.
- Docs: the README is restructured for coding agents (When to use, Quick start, an API table
  linking every export into `docs/API.md`, Common tasks, Errors and fixes, Limits and gotchas,
  Compatibility) and drops the Related packages list; `docs/API.md` documents every export,
  validation rule, and thrown error; the client has TSDoc on every method; `llms-full.txt` is
  removed and `llms.txt` links the shipped docs instead; the `/test` setup lists `vite` as a
  direct dev dependency and the `convex-test` peer range for `convex`. No runtime change.
- Releases: a stable version publishes only from a `vX.Y.Z` tag on `main`, and every merge to
  `main` publishes a `@canary` build; both use npm trusted publishing with provenance.
- Internal: CI and the publish workflow (pinned actions, pnpm 10 through Corepack with a
  release-age gate, no update bot), docs and package-content checks in `pnpm lint`, and a
  packed-tarball consumer test, including every docs example.

### Fixed

- `register` from `@vllnt/convex-permissions/test` accepts a `convexTest` instance built from
  the host app's own schema; it was typed against the component schema and rejected with
  TS2345. No runtime change.
- `scopeRef` and `description` accept `undefined` under `exactOptionalPropertyTypes`, so a
  `string | undefined` variable type-checks; `undefined` behaves like an omitted field. No
  runtime change. `PermissionDenied.scopeRef` is typed `string | undefined`, matching the data
  `require` throws for an unscoped call inside the host function.

## [0.1.0] - 2026-09-01

### Added

- Initial release of `@vllnt/convex-permissions` — stored, runtime-editable
  role-based access control as a Convex component.
- `Permissions<TRole, TAction>` client class, generic over the host's role and
  action unions: `defineRole`, `removeRole`, `assign`, `revoke`, `check`,
  `require`, `rolesFor`, `permissionsFor`, `listRoles`.
- Sandboxed `roles` and `assignments` tables keyed by opaque `subjectRef` /
  `scopeRef`; the host never reads them directly.
- Wildcard grants (`"doc.*"`, `"*"`), scoped / multi-tenant assignments,
  default-deny semantics, and a structured `ConvexError<PermissionDenied>` from
  `require`.
- Boundary validation of role names and subject refs.
- 100% end-to-end test coverage via `convex-test` against the real component
  runtime.

### Changed

- Resolve scoped assignments through a `(subjectRef, scopeRef)` index and fetch only assigned
  role definitions, avoiding full per-subject assignment and global role-table scans on access checks.
- Treat Convex `_generated` output as CLI-owned, exclude it from formatting, and expose a
  dedicated codegen script.
- Refresh all direct dependencies to their latest compatible releases for canary validation.
- Require `convex@^1.45.0` and update `convex-test` to `^0.0.56`.
