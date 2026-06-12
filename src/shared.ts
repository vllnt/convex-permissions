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

/**
 * Does a single stored grant authorize an action?
 * - exact:  `"doc.edit"` authorizes `"doc.edit"`
 * - global: `"*"` authorizes everything
 * - prefix: `"doc.*"` authorizes `"doc.edit"`, `"doc.read"`, …
 */
export function grantMatchesAction(grant: string, action: string): boolean {
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
