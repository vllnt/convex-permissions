import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server.js";
import { roleDoc } from "./validators.js";
import { anyGrantMatches } from "../shared.js";

/** Role names assigned to a subject that apply in the given scope. */
async function applicableRoleNames(
  ctx: QueryCtx,
  subjectRef: string,
  scopeRef: string | undefined,
): Promise<Set<string>> {
  const assignments = await ctx.db
    .query("assignments")
    .withIndex("by_subject", (q) => q.eq("subjectRef", subjectRef))
    .collect();
  const names = new Set<string>();
  for (const assignment of assignments) {
    // Global (unscoped) assignments apply everywhere; scoped ones only in-scope.
    if (assignment.scopeRef === undefined || assignment.scopeRef === scopeRef) {
      names.add(assignment.role);
    }
  }
  return names;
}

/** All grants conferred by a set of role names. */
async function grantsForRoleNames(
  ctx: QueryCtx,
  roleNames: Set<string>,
): Promise<string[]> {
  if (roleNames.size === 0) {
    return [];
  }
  const roles = await ctx.db.query("roles").collect();
  const grants: string[] = [];
  for (const role of roles) {
    if (roleNames.has(role.name)) {
      grants.push(...role.grants);
    }
  }
  return grants;
}

/** Is the subject authorized to perform the action (in the optional scope)? */
export const check = query({
  args: {
    subjectRef: v.string(),
    action: v.string(),
    scopeRef: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const roleNames = await applicableRoleNames(ctx, args.subjectRef, args.scopeRef);
    if (roleNames.size === 0) {
      return false; // default-deny
    }
    const grants = await grantsForRoleNames(ctx, roleNames);
    return anyGrantMatches(grants, args.action);
  },
});

/** Role names a subject holds in the optional scope (sorted). */
export const rolesFor = query({
  args: { subjectRef: v.string(), scopeRef: v.optional(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const names = await applicableRoleNames(ctx, args.subjectRef, args.scopeRef);
    return [...names].sort();
  },
});

/** Distinct grants a subject has in the optional scope (sorted). */
export const permissionsFor = query({
  args: { subjectRef: v.string(), scopeRef: v.optional(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const names = await applicableRoleNames(ctx, args.subjectRef, args.scopeRef);
    const grants = await grantsForRoleNames(ctx, names);
    return [...new Set(grants)].sort();
  },
});

/** All role definitions. */
export const listRoles = query({
  args: {},
  returns: v.array(roleDoc),
  handler: async (ctx) => {
    return await ctx.db.query("roles").collect();
  },
});
