# Roadmap — convex-permissions

> Typed authorization for Convex: declare roles + policies once, enforce them in every function with type-safe guards.

**Now:** primitive-decision
**Last updated:** 2026-06-12

## primitive-decision [ACTIVE]

**Goal:** Settle the load-bearing decisions before any implementation — the primitive (typed package vs sandboxed component) and where role assignments live.
**Exit criteria:** decision recorded in README (library vs `app.use()` component) + chosen subject/assignment model + locked `definePermissions` config contract; `vllnt/convex-permissions` repo exists; downstream phases unblocked.

- [ ] primitive-decision.1 Decide library vs component — default typed package; component only if policies must be runtime-editable + audited
- [ ] primitive-decision.2 Decide role-assignment source — subject adapter over convex-auth claims vs host users-table column vs stored
- [ ] primitive-decision.3 Lock `definePermissions` config contract (roles, grants, policies, subject, hierarchy, onDeny)
- [ ] primitive-decision.4 Confirm scope boundary — decision engine only; no resource listing/filtering, no ReBAC in v1
- [ ] primitive-decision.5 Create `vllnt/convex-permissions` GitHub repo + add row to hub README components index

## rbac-core

**Goal:** Working RBAC layer with typed, ergonomic enforcement helpers.
**Exit criteria:** `definePermissions` resolves role→grant checks; `require`/`check`/`can` typed against the role+action union; wildcards + hierarchy resolve; `convex-test` suite green.

- [ ] rbac-core.1 Implement `definePermissions` with `roles` + `grants` + action type inference
- [ ] rbac-core.2 Implement `subject` adapter resolution from `ctx`
- [ ] rbac-core.3 Implement `require` (throw ConvexError) / `check` (boolean) / `can` (pure)
- [ ] rbac-core.4 Wildcard grant matching (`doc.*`) + `hierarchy` inheritance resolution
- [ ] rbac-core.5 `convex-test` coverage: default-deny, grant hit, wildcard, hierarchy, unknown action

## abac-policies

**Goal:** Attribute-based policy layer layered over RBAC.
**Exit criteria:** per-action policy fns receive `(subject, resource, ctx)`; resolution precedence (grant → policy → default-deny) implemented + tested; ownership/state policies pass.

- [ ] abac-policies.1 Implement `policies` map + invocation with the loaded resource
- [ ] abac-policies.2 Define + test resolution precedence (RBAC grant vs ABAC policy vs default-deny)
- [ ] abac-policies.3 Resource-passing ergonomics for `require(ctx, action, resource)`
- [ ] abac-policies.4 `convex-test` coverage: ownership, resource-state (locked), context attributes

## dx-tooling

**Goal:** The verification DX the toolkit exists for — typed, discoverable, low-ceremony.
**Exit criteria:** end-to-end type inference (autocompleted actions, no string typos); structured `ConvexError` deny shape; React `useCan` hook; optional function wrapper.

- [ ] dx-tooling.1 Full action/role type inference end-to-end (no `v.string()` fallthrough)
- [ ] dx-tooling.2 Structured `ConvexError` deny shape (action, reason, subject role)
- [ ] dx-tooling.3 React `useCan(action)` hook mirroring the `@vllnt/convex-flags` client surface
- [ ] dx-tooling.4 `withAuthz()` query/mutation wrapper (optional ergonomic)

## release

**Goal:** First publishable release at the vllnt baseline.
**Exit criteria:** `@vllnt/convex-permissions` 0.1.0 published; `llms.txt` + `llms-full.txt`; CI green; `prepare-github-repository` verify passes; README design-stub banner dropped.

- [ ] release.1 Align tooling to conventions (`@vllnt/eslint-config/convex`, base tsconfig, vitest + `@edge-runtime/vm`)
- [ ] release.2 `CHANGELOG.md` + `llms.txt` + `llms-full.txt`
- [ ] release.3 CI workflow + `prepare-github-repository` verify
- [ ] release.4 Publish 0.1.0 to npm; update hub README + ROADMAP

## Later

- ReBAC / relationship tuples (org → folder → doc inheritance) — the case that justifies a stored `app.use()` component
- Runtime-editable policies + grant/revoke audit log (stored, component-shaped)
- Permission-aware listing helpers ("what can X see") — only if a viable indexed pattern emerges
- Scoped / multi-tenant roles (role within an org/workspace)
- Policy-coverage linter (assert every action has a grant or a policy)
