import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { Permissions } from "../../src/client";

/**
 * Host-app wrappers. The host owns auth: resolve identity here, then pass an
 * opaque `subjectRef` into the component client. These thin wrappers exist so the
 * test suite can exercise every public client method end to end.
 */
const permissions = new Permissions(components.permissions);

export const defineRole = mutation({
  args: {
    name: v.string(),
    grants: v.array(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.null(),
  handler: (ctx, args) => permissions.defineRole(ctx, args),
});

export const removeRole = mutation({
  args: { name: v.string() },
  returns: v.boolean(),
  handler: (ctx, args) => permissions.removeRole(ctx, args.name),
});

export const assign = mutation({
  args: { subjectRef: v.string(), role: v.string(), scopeRef: v.optional(v.string()) },
  returns: v.boolean(),
  handler: (ctx, args) => permissions.assign(ctx, args),
});

export const revoke = mutation({
  args: { subjectRef: v.string(), role: v.string(), scopeRef: v.optional(v.string()) },
  returns: v.boolean(),
  handler: (ctx, args) => permissions.revoke(ctx, args),
});

export const check = query({
  args: { subjectRef: v.string(), action: v.string(), scopeRef: v.optional(v.string()) },
  returns: v.boolean(),
  handler: (ctx, args) => permissions.check(ctx, args),
});

export const requireAccess = query({
  args: { subjectRef: v.string(), action: v.string(), scopeRef: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await permissions.require(ctx, args);
    return null;
  },
});

export const rolesFor = query({
  args: { subjectRef: v.string(), scopeRef: v.optional(v.string()) },
  returns: v.array(v.string()),
  handler: (ctx, args) => permissions.rolesFor(ctx, args),
});

export const permissionsFor = query({
  args: { subjectRef: v.string(), scopeRef: v.optional(v.string()) },
  returns: v.array(v.string()),
  handler: (ctx, args) => permissions.permissionsFor(ctx, args),
});

export const listRoles = query({
  args: {},
  returns: v.array(v.any()),
  handler: (ctx) => permissions.listRoles(ctx),
});
