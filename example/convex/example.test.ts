import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { register } from "../../src/test";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  register(t);
  return t;
}

describe("roles", () => {
  test("defineRole upserts (insert then patch) and listRoles reflects it", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, {
      name: "editor",
      grants: ["doc.read", "doc.edit"],
      description: "Editors",
    });
    let roles = await t.query(api.example.listRoles, {});
    expect(roles).toHaveLength(1);
    expect(roles[0].grants).toEqual(["doc.read", "doc.edit"]);
    expect(roles[0].description).toBe("Editors");

    // Re-defining the same role patches it in place (no duplicate row).
    await t.mutation(api.example.defineRole, { name: "editor", grants: ["doc.read"] });
    roles = await t.query(api.example.listRoles, {});
    expect(roles).toHaveLength(1);
    expect(roles[0].grants).toEqual(["doc.read"]);
  });

  test("removeRole returns true when present, false when absent", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "viewer", grants: ["doc.read"] });
    expect(await t.mutation(api.example.removeRole, { name: "viewer" })).toBe(true);
    expect(await t.mutation(api.example.removeRole, { name: "viewer" })).toBe(false);
  });

  test("rejects an invalid role name (boundary validation)", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.defineRole, { name: "bad name!", grants: [] }),
    ).rejects.toThrow(/role name must match/);
  });
});

describe("assignments + check", () => {
  test("assign is idempotent (true then false); check honors exact grants", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, {
      name: "editor",
      grants: ["doc.read", "doc.edit"],
    });
    expect(await t.mutation(api.example.assign, { subjectRef: "u1", role: "editor" })).toBe(true);
    expect(await t.mutation(api.example.assign, { subjectRef: "u1", role: "editor" })).toBe(false);

    expect(await t.query(api.example.check, { subjectRef: "u1", action: "doc.edit" })).toBe(true);
    expect(await t.query(api.example.check, { subjectRef: "u1", action: "doc.delete" })).toBe(false);
  });

  test("default-deny for an unknown subject", async () => {
    const t = setup();
    expect(await t.query(api.example.check, { subjectRef: "nobody", action: "doc.read" })).toBe(false);
  });

  test("rejects an invalid subjectRef on assign (boundary validation)", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "editor", grants: ["doc.edit"] });
    await expect(
      t.mutation(api.example.assign, { subjectRef: "bad ref!", role: "editor" }),
    ).rejects.toThrow(/subjectRef must match/);
  });

  test("wildcard grants: prefix hit/miss and global", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "docs", grants: ["doc.*"] });
    await t.mutation(api.example.defineRole, { name: "admin", grants: ["*"] });
    await t.mutation(api.example.assign, { subjectRef: "d", role: "docs" });
    await t.mutation(api.example.assign, { subjectRef: "a", role: "admin" });

    expect(await t.query(api.example.check, { subjectRef: "d", action: "doc.read" })).toBe(true);
    expect(await t.query(api.example.check, { subjectRef: "d", action: "img.view" })).toBe(false);
    expect(await t.query(api.example.check, { subjectRef: "a", action: "anything.here" })).toBe(true);
  });

  test("revoke removes access (true then false)", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "editor", grants: ["doc.edit"] });
    await t.mutation(api.example.assign, { subjectRef: "u1", role: "editor" });
    expect(await t.mutation(api.example.revoke, { subjectRef: "u1", role: "editor" })).toBe(true);
    expect(await t.mutation(api.example.revoke, { subjectRef: "u1", role: "editor" })).toBe(false);
    expect(await t.query(api.example.check, { subjectRef: "u1", action: "doc.edit" })).toBe(false);
  });
});

describe("scoped (multi-tenant) roles", () => {
  test("scoped assignment applies only in-scope; global applies everywhere", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "editor", grants: ["doc.edit"] });
    await t.mutation(api.example.defineRole, { name: "admin", grants: ["*"] });
    await t.mutation(api.example.assign, { subjectRef: "u1", role: "editor", scopeRef: "orgA" });
    await t.mutation(api.example.assign, { subjectRef: "u2", role: "admin" });

    // In-scope grant.
    expect(
      await t.query(api.example.check, { subjectRef: "u1", action: "doc.edit", scopeRef: "orgA" }),
    ).toBe(true);
    // Out-of-scope: scoped assignment excluded.
    expect(
      await t.query(api.example.check, { subjectRef: "u1", action: "doc.edit", scopeRef: "orgB" }),
    ).toBe(false);
    // Unscoped check: scoped assignment also excluded.
    expect(await t.query(api.example.check, { subjectRef: "u1", action: "doc.edit" })).toBe(false);
    // Global assignment applies in any scope.
    expect(
      await t.query(api.example.check, { subjectRef: "u2", action: "doc.edit", scopeRef: "orgB" }),
    ).toBe(true);
  });
});

describe("introspection", () => {
  test("rolesFor + permissionsFor (dedup + sort); empty for unknown subject", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "editor", grants: ["doc.read", "doc.edit"] });
    await t.mutation(api.example.defineRole, { name: "viewer", grants: ["doc.read"] });
    await t.mutation(api.example.defineRole, { name: "ghost", grants: ["x"] }); // defined, never assigned
    await t.mutation(api.example.assign, { subjectRef: "u1", role: "editor" });
    await t.mutation(api.example.assign, { subjectRef: "u1", role: "viewer" });

    expect(await t.query(api.example.rolesFor, { subjectRef: "u1" })).toEqual(["editor", "viewer"]);
    expect(await t.query(api.example.permissionsFor, { subjectRef: "u1" })).toEqual([
      "doc.edit",
      "doc.read",
    ]);
    expect(await t.query(api.example.permissionsFor, { subjectRef: "nobody" })).toEqual([]);
  });
});

describe("require", () => {
  test("require resolves when allowed, throws ConvexError(FORBIDDEN) when denied", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "editor", grants: ["doc.edit"] });
    await t.mutation(api.example.assign, { subjectRef: "u1", role: "editor" });

    await expect(
      t.query(api.example.requireAccess, { subjectRef: "u1", action: "doc.edit" }),
    ).resolves.toBeNull();
    await expect(
      t.query(api.example.requireAccess, { subjectRef: "u1", action: "doc.delete" }),
    ).rejects.toThrow();
  });
});
