# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - Unreleased

### Fixed

- `defineRole` rejects empty-string grants (`grant must be a non-empty string`).
- `assign` validates `scopeRef` against the same token pattern as `subjectRef`, so an empty or
  malformed scope can no longer be stored as a stray scope. `revoke` still matches refs exactly
  and never validates, so previously stored rows can be removed.
- `check` / `require` always deny an empty `action`, even for a `"*"` grant.

### Changed

- Release workflow: stable releases publish only from a `vX.Y.Z` tag on `main` with npm trusted
  publishing and provenance; actions are pinned to commit SHAs. `pnpm` 10 with a release-age gate.
- Docs: `/test` setup for consuming apps, host-owned auth note, validation rules, and that
  `removeRole` keeps existing assignments (they apply again if the role name is reused).

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
