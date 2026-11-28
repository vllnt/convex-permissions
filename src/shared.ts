/**
 * Shared constants, types, and pure utilities for `@vllnt/convex-permissions`.
 * Imported by both the component backend and the client wrapper. Pure — no
 * Convex `ctx`, no Node APIs — so it runs identically on Cloud and self-hosted.
 */

/** Component id used by `defineComponent` and the default mount / register name. */
export const COMPONENT_NAME = "permissions";

/** Opaque, host-supplied references. The component never assumes their shape or source. */
export type SubjectRef = string;
export type ScopeRef = string;

/** Role names, subject refs, and scope refs must match this token shape (1..128 chars). */
const TOKEN_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;

/**
 * Validate an opaque token (role name / subject ref) at the component boundary.
 * Throws on invalid input so callers fail fast and loud.
 */
export function assertToken(label: string, value: string): void {
  if (!TOKEN_PATTERN.test(value)) {
    throw new Error(`${label} must match ${String(TOKEN_PATTERN)}`);
  }
}

/** Reject an empty grant: it carries no meaning and must never be stored. */
export function assertGrant(value: string): void {
  if (value.length === 0) {
    throw new Error("grant must be a non-empty string");
  }
}

/**
 * Role size limits. Lengths are JavaScript string lengths (UTF-16 code units):
 * `"é"` counts 1, most emoji count 2. Every `check` reads whole role documents,
 * so these bound its database I/O. The thrown messages repeat the numbers as
 * literals so `pnpm check:docs` can match them against the docs.
 */
const MAX_GRANTS_PER_ROLE = 256;
const MAX_GRANT_LENGTH = 256;
const MAX_DESCRIPTION_LENGTH = 1024;

/**
 * Enforce the role size limits on a `defineRole` input. A role stored before
 * the limits may exceed them and stays updatable as long as it does not grow:
 * its grant count and description length may stay or shrink, and a grant longer
 * than the limit is accepted only as many times as the stored role holds it.
 */
export function assertRoleLimits(
  grants: readonly string[],
  description: string | undefined,
  stored: { grants: readonly string[]; description?: string } | null,
): void {
  const storedGrants = stored?.grants ?? [];
  if (grants.length > Math.max(MAX_GRANTS_PER_ROLE, storedGrants.length)) {
    throw new Error("a role may have at most 256 grants");
  }
  const keptLongGrants = new Map<string, number>();
  for (const grant of storedGrants) {
    if (grant.length > MAX_GRANT_LENGTH) {
      keptLongGrants.set(grant, (keptLongGrants.get(grant) ?? 0) + 1);
    }
  }
  for (const grant of grants) {
    if (grant.length > MAX_GRANT_LENGTH) {
      const left = keptLongGrants.get(grant) ?? 0;
      if (left === 0) {
        throw new Error("grant must be at most 256 characters");
      }
      keptLongGrants.set(grant, left - 1);
    }
  }
  const storedDescriptionLength = stored?.description?.length ?? 0;
  if (
    description !== undefined &&
    description.length > Math.max(MAX_DESCRIPTION_LENGTH, storedDescriptionLength)
  ) {
    throw new Error("description must be at most 1024 characters");
  }
}

export function sameGrants(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((grant, index) => grant === b[index]);
}

/**
 * Does a single stored grant authorize an action? An empty action is never
 * authorized (default-deny), not even by `"*"`.
 *
 * - exact:  `"doc.edit"` authorizes `"doc.edit"`
 * - global: `"*"` authorizes everything
 * - prefix: `"doc.*"` authorizes `"doc.edit"`, `"doc.read"`, …
 */
export function grantMatchesAction(grant: string, action: string): boolean {
  if (action.length === 0) {
    return false;
  }
  if (grant === action || grant === "*") {
    return true;
  }
  if (grant.endsWith(".*")) {
    return action.startsWith(grant.slice(0, -1));
  }
  return false;
}

/** Does any grant in the set authorize the action? */
export function anyGrantMatches(grants: readonly string[], action: string): boolean {
  for (const grant of grants) {
    if (grantMatchesAction(grant, action)) {
      return true;
    }
  }
  return false;
}
