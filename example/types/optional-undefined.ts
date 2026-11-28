// Type-level test, never run. `pnpm typecheck:test` type-checks it twice: with
// `exactOptionalPropertyTypes` on (tsconfig.exact.json) and off (tsconfig.loose.json).
// A `string | undefined` variable must be accepted as `scopeRef` and `description`.
import type { GenericDataModel, GenericMutationCtx } from "convex/server";
import { Permissions, type PermissionDenied, type PermissionsComponent } from "../../src/client";
import type { ComponentApi } from "../../src/component/_generated/component";

declare const mounted: ComponentApi;
declare const ctx: GenericMutationCtx<GenericDataModel>;
declare const scopeRef: string | undefined;
declare const description: string | undefined;

// The generated component API still satisfies the client's contract.
const component: PermissionsComponent = mounted;
const permissions = new Permissions<"editor", "doc.edit">(component);

export async function passesMaybeUndefined(): Promise<void> {
  const defined: null = await permissions.defineRole(ctx, {
    name: "editor",
    grants: ["doc.edit"],
    description,
  });
  const created: boolean = await permissions.assign(ctx, {
    subjectRef: "u1",
    role: "editor",
    scopeRef,
  });
  const removed: boolean = await permissions.revoke(ctx, {
    subjectRef: "u1",
    role: "editor",
    scopeRef,
  });
  const allowed: boolean = await permissions.check(ctx, {
    subjectRef: "u1",
    action: "doc.edit",
    scopeRef,
  });
  await permissions.require(ctx, { subjectRef: "u1", action: "doc.edit", scopeRef });
  const roles: string[] = await permissions.rolesFor(ctx, { subjectRef: "u1", scopeRef });
  const grants: string[] = await permissions.permissionsFor(ctx, { subjectRef: "u1", scopeRef });
  const denied: PermissionDenied = {
    code: "FORBIDDEN",
    subjectRef: "u1",
    action: "doc.edit",
    scopeRef,
  };
  void [defined, created, removed, allowed, roles, grants, denied];
}
