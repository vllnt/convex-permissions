/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    mutations: {
      assign: FunctionReference<
        "mutation",
        "internal",
        { role: string; scopeRef?: string; subjectRef: string },
        boolean,
        Name
      >;
      defineRole: FunctionReference<
        "mutation",
        "internal",
        { description?: string; grants: Array<string>; name: string },
        null,
        Name
      >;
      removeRole: FunctionReference<
        "mutation",
        "internal",
        { name: string },
        boolean,
        Name
      >;
      revoke: FunctionReference<
        "mutation",
        "internal",
        { role: string; scopeRef?: string; subjectRef: string },
        boolean,
        Name
      >;
    };
    queries: {
      check: FunctionReference<
        "query",
        "internal",
        { action: string; scopeRef?: string; subjectRef: string },
        boolean,
        Name
      >;
      listRoles: FunctionReference<
        "query",
        "internal",
        {},
        Array<{
          _creationTime: number;
          _id: string;
          description?: string;
          grants: Array<string>;
          name: string;
          updatedAt: number;
        }>,
        Name
      >;
      permissionsFor: FunctionReference<
        "query",
        "internal",
        { scopeRef?: string; subjectRef: string },
        Array<string>,
        Name
      >;
      rolesFor: FunctionReference<
        "query",
        "internal",
        { scopeRef?: string; subjectRef: string },
        Array<string>,
        Name
      >;
    };
  };
