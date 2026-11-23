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

export const MAX_GRANT_LENGTH = 256;
export const MAX_GRANTS_PER_ROLE = 256;
export const MAX_DESCRIPTION_LENGTH = 1024;

/** Reject an empty grant: it carries no meaning and must never be stored. */
export function assertGrant(value: string): void {
  if (value.length === 0) {
    throw new Error("grant must be a non-empty string");
  }
}

export interface StoredRole {
  grants: readonly string[];
  description?: string;
}

export function assertRoleInput(
  grants: readonly string[],
  description: string | undefined,
  stored: StoredRole | null,
): void {
  grants.forEach(assertGrant);
  const storedGrants = stored?.grants ?? [];
  if (grants.length > Math.max(MAX_GRANTS_PER_ROLE, storedGrants.length)) {
    throw new Error(`a role may have at most ${String(MAX_GRANTS_PER_ROLE)} grants`);
  }
  for (const grant of grants) {
    if (grant.length > MAX_GRANT_LENGTH && !storedGrants.includes(grant)) {
      throw new Error(`grant must be at most ${String(MAX_GRANT_LENGTH)} characters`);
    }
  }
  const storedDescriptionLength = stored?.description?.length ?? 0;
  if (
    description !== undefined &&
    description.length > Math.max(MAX_DESCRIPTION_LENGTH, storedDescriptionLength)
  ) {
    throw new Error(`description must be at most ${String(MAX_DESCRIPTION_LENGTH)} characters`);
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
