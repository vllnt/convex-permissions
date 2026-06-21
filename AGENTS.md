<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `example/convex/_generated/ai/guidelines.md` first** for
important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->

# @vllnt/convex-permissions

Role-based access control as a Convex component — typed, sandboxed, runtime-editable roles and
grants keyed by opaque refs.

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

Use `pnpm build:codegen` only when regenerating checked-in Convex `_generated` files and you have
access to the selected Convex project.

## Structure

- `src/client/index.ts` — `Permissions<TRole, TAction>` class (consumer API): defineRole,
  removeRole, assign, revoke, check, require, rolesFor, permissionsFor, listRoles
- `src/client/types.ts` — public TypeScript interfaces (`RoleDoc`, `PermissionDenied`)
- `src/component/mutations.ts` — Convex mutations (defineRole, removeRole, assign, revoke)
- `src/component/queries.ts` — Convex queries (check, require, rolesFor, permissionsFor, listRoles)
- `src/component/validators.ts` — shared validators
- `src/component/schema.ts` — database schema (`roles`, `assignments` tables)
- `src/component/convex.config.ts` — `defineComponent("permissions")`
- `src/shared.ts` — shared types, pure grant-matching logic
- `src/test.ts` — convex-test helper for registering the component

## Ownership boundary

**Component owns:**

- `roles` table — role name → grants array, optional description, updatedAt timestamp
- `assignments` table — subjectRef → role, optional scopeRef, createdAt timestamp
- Grant-matching logic (exact, prefix-wildcard `doc.*`, global `*`)
- Input validation at the mutation boundary (`^[A-Za-z0-9_.:-]{1,128}$`)

**Host owns:**

- Identity resolution — the host authenticates the caller and maps them to an opaque `subjectRef`
- Scope resolution — the host decides which `scopeRef` (org, workspace, tenant) applies
- Admin authorization — the host gates who may call `defineRole`, `assign`, `revoke`, `removeRole`
- Domain model — action strings, role names, and scope refs are opaque to the component

**Auth:**

- The component is auth-agnostic. It never sees credentials, sessions, or user records.
- Callers pass `subjectRef` and optionally `scopeRef` as opaque strings. The component never
  interprets their shape, source, or meaning.

## Key design decisions

- **Stored RBAC, not code-defined**: roles and assignments live in the component's own sandboxed
  tables and are editable at runtime via mutations — no redeploy to change who can do what.
- **Typed generic client**: `Permissions<TRole, TAction>` is generic over the host's role and
  action union types, providing autocomplete and typo-safety for `assign`, `check`, and `require`.
- **Wildcard grants**: grants support exact (`"doc.edit"`), prefix-wildcard (`"doc.*"`), and global
  (`"*"`) matching; a super-role is just a role granted `"*"`.
- **Default-deny**: a subject with no matching role/grant is denied. `require` throws a structured
  `ConvexError<{ code: "FORBIDDEN"; subjectRef; action; scopeRef? }>` the host maps to a 403.
- **Scoped / multi-tenant**: assignments carry an optional opaque `scopeRef`; a scoped check
  considers both global and in-scope roles; an unscoped check considers only global roles.
- **No bare `v.any()`**: all validators use explicit typed shapes; `jsonValue` alias only if ever
  needed as a documented last resort.
- **Mutations in `mutations.ts`, queries in `queries.ts`**: enforced by `@vllnt/eslint-config/convex`.

## Conventions

- Explicit `args` + `returns` on every Convex function.
- Host data via typed generics / host-supplied validator keyed by an opaque ref.
- 100% test coverage is BLOCKING (`vitest.config.mts` thresholds).
- Runtime deps: only official `@convex-dev/*` + `@vllnt/*`.

## Docs sync

When any of these change, update the corresponding docs in the same commit:

| Change | Update |
|--------|--------|
| Mutation/query args or return types | `docs/API.md`, `README.md` API table |
| Schema table added/removed/modified | `AGENTS.md` Structure + Ownership boundary, `README.md` Architecture |
| Grant-matching logic changed | `README.md` Features, `docs/API.md` Grant matching |
| Security model changed | `README.md` Security Model |
| New feature or breaking change | `CHANGELOG.md`, `README.md` Features |
| Input validation rules changed | `docs/API.md` Error codes |

Always run `pnpm lint && pnpm build && pnpm test` before committing docs
changes.
