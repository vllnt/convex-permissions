import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Sandboxed tables — the component's own concern only. Subjects, scopes, and
 * actions are opaque host-supplied strings; the component never models the
 * host's domain or reaches into host / sibling tables.
 */
export default defineSchema({
  // Runtime-editable role definitions: a role name → the grants it confers.
  roles: defineTable({
    name: v.string(),
    grants: v.array(v.string()),
    description: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  // Who holds which role, optionally within an opaque scope (multi-tenant).
  // A row with no scopeRef is global (applies in every scope).
  assignments: defineTable({
    subjectRef: v.string(),
    role: v.string(),
    scopeRef: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_subject", ["subjectRef"])
    .index("by_role", ["role"])
    .index("by_subject_role_scope", ["subjectRef", "role", "scopeRef"]),
});
