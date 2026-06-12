/** Public TypeScript surface for `@vllnt/convex-permissions`. */

/** A stored role definition, as returned by `Permissions.listRoles`. */
export interface RoleDoc {
  _id: string;
  _creationTime: number;
  name: string;
  grants: string[];
  description?: string;
  updatedAt: number;
}
