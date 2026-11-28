# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - Unreleased

### Added

- The npm package now ships `docs/*.md`, `CHANGELOG.md`, and `llms.txt`, so coding agents
  can read docs that match the installed version under `node_modules/@vllnt/convex-permissions/`.
  `llms.txt` links shipped files relatively. `pnpm lint` fails when a required file is missing
  from the tarball or a contributor-only file would ship.
- `pnpm check:docs` (part of `pnpm lint`) fails when the README sections, API table, errors
  table, README version line, relative links, code-block language tags, or the fixed Links,
  footer, and `llms.txt` Ecosystem blocks drift from the code. `pnpm check:links` requests every external docs URL
  except npmjs.com (its own CI job). `pnpm test:package` type-checks every `ts` example in `README.md` and
  `docs/API.md` against the packed tarball.

### Changed

- **Breaking:** `assign` validates `scopeRef` against the same token pattern as `subjectRef`
  (`^[A-Za-z0-9_.:-]{1,128}$`), so an empty or malformed scope can no longer be stored as a
  stray scope. Scope refs 0.1.0 accepted, such as `""` or `"org/1"`, now throw. `revoke` still
  matches refs exactly and never validates, so previously stored rows can be removed.
- **Breaking:** `defineRole` rejects empty-string grants (`grant must be a non-empty string`).
- **Breaking:** `defineRole` caps role size: at most 256 grants per role, 256 characters per
  grant, and 1024 characters of description, counted as JavaScript string length (UTF-16 code
  units: `"é"` counts 1, most emoji count 2). Larger inputs now throw
  `a role may have at most 256 grants`, `grant must be at most 256 characters`, or
  `description must be at most 1024 characters`. Before upgrading, trim roles over these limits
  (find them with `listRoles`). Roles already stored over the limits stay readable by every
  query, and `defineRole` can still update them as long as they do not grow: the grant count and
  description length may stay or shrink, and a grant over 256 characters may be kept but not
  added or duplicated.
- **Breaking:** `engines.node` is `>=20`: the lowest supported peer, `convex@1.45.0`, requires
  Node.js 20.
- `defineRole` skips the write when grants and description are unchanged: no `updatedAt`
  bump, no re-run of subscribed `check` / `permissionsFor` queries, no OCC contention.
- `homepage` points to https://oss.vllnt.com/packages/convex-permissions.
- `description` is now "Role-based access control (RBAC) component for Convex: runtime-editable
  roles, wildcard grants, scoped multi-tenant checks, and a typed TypeScript client." and is the
  same sentence in `README.md` and `llms.txt`. `keywords` add `typescript` and
  `role-based-access-control`.
- README restructured for coding agents: When to use, Install, Quick start, an API table that
  links every export into `docs/API.md`, Common tasks, Errors and fixes, Limits and gotchas,
  Compatibility, and Links. The Related packages list is removed: no other package is used with
  this one in code. `docs/API.md` documents every export with an anchor; `llms.txt` adds when to
  use, links to the README errors and limits sections, and the Ecosystem links.
- TSDoc on the client entry, its methods (thrown errors, no-op and scope rules), and the
  `convex.config` default export. No runtime change.
- Release workflow: stable releases publish only from a `vX.Y.Z` tag on `main`, and every push
  to `main` publishes a canary (`@canary` dist-tag only), both with npm trusted publishing and
  provenance; actions are pinned to commit SHAs. The quality gates both jobs need smoke-test
  the packed tarball (imports and a strict consumer type-check) before anything publishes.
  `pnpm` 10 with a release-age gate.
- Docs: `/test` setup for consuming apps, host-owned auth note, validation rules, the package
  entry points, that action `ctx` works, that `assign` does not require the role to be defined,
  and that `removeRole` keeps existing assignments (they apply again if the role name is reused).
- Internal: CI and publish set up pnpm through Corepack, CI cancels only superseded pull request
  runs, and there is no update bot.

### Fixed

- `register` from `@vllnt/convex-permissions/test` accepts a `convexTest` instance built from
  the host app's own schema; it was typed against the component schema and rejected with
  TS2345. No runtime change.
- `check` / `require` always deny an empty `action`, even for a `"*"` grant.

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
