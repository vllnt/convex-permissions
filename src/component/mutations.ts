import { v } from "convex/values";
import { mutation } from "./_generated/server.js";
import { assertToken } from "../shared.js";

/** Create or update a role definition (upsert by name). Idempotent. */
export const defineRole = mutation({
  args: {
    name: v.string(),
    grants: v.array(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertToken("role name", args.name);
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        grants: args.grants,
        description: args.description,
        updatedAt: Date.now(),
      });
      return null;
    }
    await ctx.db.insert("roles", {
      name: args.name,
      grants: args.grants,
      description: args.description,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** Delete a role definition. Returns true if a role was removed. */
export const removeRole = mutation({
  args: { name: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (existing === null) {
      return false;
    }
    await ctx.db.delete(existing._id);
    return true;
  },
});

/** Assign a role to a subject, optionally scoped. Returns true if newly created. */
export const assign = mutation({
  args: {
    subjectRef: v.string(),
    role: v.string(),
    scopeRef: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    assertToken("subjectRef", args.subjectRef);
    assertToken("role", args.role);
    const existing = await ctx.db
      .query("assignments")
      .withIndex("by_subject_role_scope", (q) =>
        q
          .eq("subjectRef", args.subjectRef)
          .eq("role", args.role)
          .eq("scopeRef", args.scopeRef),
      )
      .unique();
    if (existing !== null) {
      return false;
    }
    await ctx.db.insert("assignments", {
      subjectRef: args.subjectRef,
      role: args.role,
      scopeRef: args.scopeRef,
      createdAt: Date.now(),
    });
    return true;
  },
});

/** Remove a role assignment. Returns true if an assignment was removed. */
export const revoke = mutation({
  args: {
    subjectRef: v.string(),
    role: v.string(),
    scopeRef: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("assignments")
      .withIndex("by_subject_role_scope", (q) =>
        q
          .eq("subjectRef", args.subjectRef)
          .eq("role", args.role)
          .eq("scopeRef", args.scopeRef),
      )
      .unique();
    if (existing === null) {
      return false;
    }
    await ctx.db.delete(existing._id);
    return true;
  },
});
