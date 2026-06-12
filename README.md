# @vllnt/convex-permissions

[![npm](https://img.shields.io/npm/v/@vllnt/convex-permissions.svg)](https://www.npmjs.com/package/@vllnt/convex-permissions)
[![license](https://img.shields.io/npm/l/@vllnt/convex-permissions.svg)](./LICENSE)

Typed authorization for Convex. Define your roles and access policies **once**,
then enforce them inside every query, mutation, and action with type-safe guards
— `require`, `check`, `can`. Roles and policies are the developer's, declared in
code; the toolkit gives the DX to verify access without scattering ad-hoc `if`
checks through your backend.

```ts
const permissions = definePermissions({
  roles: ["admin", "editor", "viewer"] as const,
  grants: {
    admin:  ["doc.*"],
    editor: ["doc.read", "doc.edit"],
    viewer: ["doc.read"],
  },
  policies: {
    "doc.edit":   ({ subject, resource }) => subject.role === "admin" || resource.ownerId === subject.id,
    "doc.delete": ({ subject, resource }) => subject.role === "admin" && !resource.locked,
  },
});

// in any mutation — typed action, throws ConvexError on deny
await permissions.require(ctx, "doc.edit", doc);
```

> **Status: design stub.** API below is the proposed surface, not yet
> implemented. The load-bearing decision — ship as a typed npm package or a
> sandboxed `app.use()` Convex component — is **open**. See
> [ROADMAP.md](./ROADMAP.md) (`primitive-decision`).

---

## The model: RBAC default, ABAC escape hatch

Don't choose RBAC *or* ABAC — layer them. RBAC is the special case of ABAC where
the only attribute is the subject's role. Roles cover the 80%; policy functions
cover the ownership / state / context cases roles can't express.

```
require(ctx, action, resource?)
        │
        ▼
┌─────────────────────────────┐
│ RBAC: does subject.role have │── grant, no policy ─▶ ALLOW   (reason: "grant")
│ a grant for this action?     │
└──────────────┬──────────────┘
               │ policy exists for action
               ▼
┌─────────────────────────────┐
│ ABAC: run policy fn with      │── true  ─▶ ALLOW             (reason: "policy")
│ (subject, resource, ctx)      │── false ─▶ DENY              (reason: "policy")
└──────────────┬──────────────┘
               │ no grant, no policy
               ▼
             DENY                                              (reason: "default-deny")
```

- **RBAC** — `grants` map roles to static permissions. Cheap, resourceless,
  cacheable. `"doc.read"`, wildcards like `"doc.*"`.
- **ABAC** — `policies` are functions evaluated against the loaded resource and
  the caller's attributes. They run inside your Convex function, where `ctx` and
  the resource already live — so attribute checks are ergonomic, not a separate
  policy engine.
- **ReBAC** (relationship/graph checks — "can edit via org → folder → doc") is
  deliberately **out of scope** for the first cut. It needs stored relationship
  tuples, which is the case that would justify a real component (see ROADMAP
  `Later`).

This is a **decision engine**: it answers "can subject X do action Y on resource
Z?". It does **not** answer "list every doc X can see" — that filtering belongs
with your resource data, in your own tables. Authorize at the boundary; filter
with your own indexed queries.

---

## Configuration

`definePermissions(config)` is where roles and policies are declared. Proposed
surface (subject to the open decisions in the ROADMAP):

```ts
definePermissions({
  // Required — the role union. Drives type inference for grants + checks.
  roles: ["admin", "editor", "viewer"] as const,

  // RBAC layer — role → static permission grants. Wildcards allowed.
  grants: {
    admin:  ["doc.*", "org.*"],
    editor: ["doc.read", "doc.edit"],
    viewer: ["doc.read"],
  },

  // ABAC layer — per-action policy fns. Run when present; receive the resource.
  policies: {
    "doc.edit": ({ subject, resource, ctx }) => resource.ownerId === subject.id,
  },

  // Adapter — how to resolve the caller's identity + role from ctx.
  // The toolkit does NOT store role assignments; the host owns that data
  // (convex-auth identity claims, a users-table column, or a custom source).
  subject: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return { id: identity.subject, role: identity.role as Role };
  },

  // Optional — role inheritance (admin inherits editor's grants).
  hierarchy: { admin: ["editor"], editor: ["viewer"] },

  // Optional — deny behavior for `require`. Default: throw ConvexError.
  onDeny: "throw", // "throw" | "return"
});
```

**Key design point:** role *assignments* (who is an admin) are not stored by this
package — the `subject` adapter reads them from wherever the host already keeps
identity. That keeps the toolkit a pure, typed enforcement layer with no data
sandbox to sync. (If assignments must be **runtime-editable + audited**, that
flips the primitive to a stored component — an open ROADMAP decision.)

---

## API (proposed)

| Method | Returns | Purpose |
|--------|---------|---------|
| `require(ctx, action, resource?)` | `void` | Enforce — throws `ConvexError` on deny |
| `check(ctx, action, resource?)` | `boolean` | Boolean decision, no throw |
| `can(subject, action, resource?)` | `boolean` | Pure check against a known subject |
| `permissionsFor(subject)` | `string[]` | Resolved grants for a role (RBAC only) |

`action` and `role` are inferred from `roles` + `grants`, so checks are
autocompleted and typo-safe. A React `useCan(action)` hook mirrors the
`@vllnt/convex-flags` client surface (proposed — see ROADMAP `dx-tooling`).

---

## Testing

Backend logic is covered with `convex-test` (in-process, no running backend);
end-to-end flows use the `@vllnt/testing` 4-layer framework against a real Convex
backend — never a mock. Per-perspective focus: **Security** (auth bypass, default
deny), **State** (role/policy precedence), **Contract** (typed action surface).

---

## License

MIT
