# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Refresh all direct dependencies to their latest compatible releases for canary validation.
- Require `convex@^1.45.0` and update `convex-test` to `^0.0.56`.

## [0.1.0] - 2026-06-12

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
