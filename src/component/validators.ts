import { v } from "convex/values";

/** Public shape of a stored role definition, returned by the `listRoles` query. */
export const roleDoc = v.object({
  _id: v.id("roles"),
  _creationTime: v.number(),
  name: v.string(),
  grants: v.array(v.string()),
  description: v.optional(v.string()),
  updatedAt: v.number(),
});
