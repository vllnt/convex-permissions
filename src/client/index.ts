/**
 * Typed client for the `@vllnt/convex-permissions` Convex component: stored,
 * runtime-editable roles, wildcard grants, and scoped multi-tenant checks.
 *
 * @see https://oss.vllnt.com/packages/convex-permissions
 * @packageDocumentation
 */
import { ConvexError } from "convex/values";
import type {
  FunctionArgs,
  FunctionReference,
  FunctionReturnType,
} from "convex/server";
import type { RoleDoc } from "./types.js";

/**
 * The component's function references, as exposed on the host via
 * `components.permissions`. Hand-written so the client typechecks without the
 * component's generated code — the host supplies the mounted ref.
 */
export interface PermissionsComponent {
  mutations: {
    defineRole: FunctionReference<
      "mutation",
      "internal",
      { name: string; grants: string[]; description?: string },
      null
    >;
    removeRole: FunctionReference<"mutation", "internal", { name: string }, boolean>;
    assign: FunctionReference<
      "mutation",
      "internal",
      { subjectRef: string; role: string; scopeRef?: string },
      boolean
    >;
    revoke: FunctionReference<
      "mutation",
      "internal",
      { subjectRef: string; role: string; scopeRef?: string },
      boolean
    >;
  };
  queries: {
    check: FunctionReference<
      "query",
      "internal",
      { subjectRef: string; action: string; scopeRef?: string },
      boolean
    >;
    rolesFor: FunctionReference<
      "query",
      "internal",
      { subjectRef: string; scopeRef?: string },
      string[]
    >;
    permissionsFor: FunctionReference<
      "query",
      "internal",
      { subjectRef: string; scopeRef?: string },
      string[]
    >;
    listRoles: FunctionReference<
      "query",
      "internal",
      Record<string, never>,
      RoleDoc[]
    >;
  };
}

interface RunQueryCtx {
  runQuery<Q extends FunctionReference<"query", "internal">>(
    reference: Q,
    args: FunctionArgs<Q>,
  ): Promise<FunctionReturnType<Q>>;
}

interface RunMutationCtx {
  runMutation<M extends FunctionReference<"mutation", "internal">>(
    reference: M,
    args: FunctionArgs<M>,
  ): Promise<FunctionReturnType<M>>;
}

/** Structured payload thrown by `Permissions.require` on an authorization failure. */
export interface PermissionDenied {
  code: "FORBIDDEN";
  subjectRef: string;
  action: string;
  scopeRef?: string;
}

/**
 * Consumer-facing client for the permissions component. Construct with the
 * mounted component ref, then call from host queries / mutations. The host owns
 * auth — it resolves identity and passes an opaque `subjectRef` in. Generic over
 * the host's role + action unions so checks are typed end to end.
 *
 * @example
 * ```ts
 * type Role = "admin" | "editor" | "viewer";
 * type Action = "doc.read" | "doc.edit" | "doc.delete";
 * const permissions = new Permissions<Role, Action>(components.permissions);
 * await permissions.require(ctx, { subjectRef: userId, action: "doc.edit" });
 * ```
 */
export class Permissions<
  TRole extends string = string,
  TAction extends string = string,
> {
  /** @param component The mounted component reference, `components.permissions`. */
  constructor(private readonly component: PermissionsComponent) {}

  /**
   * Create or update a role definition (upsert by name). An update replaces the
   * grants and description; an unchanged role writes nothing.
   *
   * At most 256 grants of at most 256 characters and a description of at most
   * 1024 characters (UTF-16 code units). A role stored over these limits can be
   * updated as long as its grant count and description length each stay within
   * the larger of the limit and the stored value, and it adds no new grant over
   * 256 characters (a stored one may be kept, at most as many times).
   *
   * @throws Error `role name must match /^[A-Za-z0-9_.:-]{1,128}$/`,
   * `grant must be a non-empty string`, `a role may have at most 256 grants`,
   * `grant must be at most 256 characters`, or
   * `description must be at most 1024 characters`.
   */
  defineRole(
    ctx: RunMutationCtx,
    role: { name: TRole; grants: readonly (TAction | string)[]; description?: string },
  ): Promise<null> {
    return ctx.runMutation(this.component.mutations.defineRole, {
      name: role.name,
      grants: [...role.grants],
      ...(role.description === undefined
        ? {}
        : { description: role.description }),
    });
  }

  /**
   * Delete a role definition. Resolves true if a role was removed. Existing
   * assignments of the role are kept and apply again if the name is redefined.
   */
  removeRole(ctx: RunMutationCtx, name: TRole): Promise<boolean> {
    return ctx.runMutation(this.component.mutations.removeRole, { name });
  }

  /**
   * Assign a role to a subject, globally or in `scopeRef`. Resolves true if newly
   * created. Does not require the role to be defined.
   *
   * @throws Error `<subjectRef|role|scopeRef> must match /^[A-Za-z0-9_.:-]{1,128}$/`.
   */
  assign(
    ctx: RunMutationCtx,
    args: { subjectRef: string; role: TRole; scopeRef?: string },
  ): Promise<boolean> {
    return ctx.runMutation(this.component.mutations.assign, args);
  }

  /**
   * Remove the assignment that matches subject, role, and scope exactly. Resolves
   * true if one was removed. Never validates its arguments.
   */
  revoke(
    ctx: RunMutationCtx,
    args: { subjectRef: string; role: TRole; scopeRef?: string },
  ): Promise<boolean> {
    return ctx.runMutation(this.component.mutations.revoke, args);
  }

  /**
   * Is the subject authorized to perform the action? Default-deny; an empty action
   * is always denied. An unscoped check considers only global assignments.
   */
  check(
    ctx: RunQueryCtx,
    args: { subjectRef: string; action: TAction; scopeRef?: string },
  ): Promise<boolean> {
    return ctx.runQuery(this.component.queries.check, args);
  }

  /**
   * Enforce an action. Throws `ConvexError<PermissionDenied>` when the subject is
   * not authorized — the host can map this to a 403.
   */
  async require(
    ctx: RunQueryCtx,
    args: { subjectRef: string; action: TAction; scopeRef?: string },
  ): Promise<void> {
    const allowed = await this.check(ctx, args);
    if (!allowed) {
      // `ConvexError` data must be a Convex `Value`; an inline object literal
      // satisfies that (a named interface would not, lacking an index signature).
      // The shape matches `PermissionDenied`, which consumers use to type catches.
      throw new ConvexError({
        code: "FORBIDDEN",
        subjectRef: args.subjectRef,
        action: args.action,
        scopeRef: args.scopeRef,
      });
    }
  }

  /** Role names the subject holds in the optional scope (sorted). */
  rolesFor(
    ctx: RunQueryCtx,
    args: { subjectRef: string; scopeRef?: string },
  ): Promise<string[]> {
    return ctx.runQuery(this.component.queries.rolesFor, args);
  }

  /** Distinct grants the subject has in the optional scope (sorted). */
  permissionsFor(
    ctx: RunQueryCtx,
    args: { subjectRef: string; scopeRef?: string },
  ): Promise<string[]> {
    return ctx.runQuery(this.component.queries.permissionsFor, args);
  }

  /** All role definitions, in one unpaginated query. */
  listRoles(ctx: RunQueryCtx): Promise<RoleDoc[]> {
    return ctx.runQuery(this.component.queries.listRoles, {});
  }
}

export type { RoleDoc };
