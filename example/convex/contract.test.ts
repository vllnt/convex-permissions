import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { describe, expect, test, vi } from "vitest";
import { api, components } from "./_generated/api";
import schema from "./schema";
import { Permissions, type PermissionDenied, type PermissionsComponent } from "../../src/client";
import { api as componentApi } from "../../src/component/_generated/api";
import componentSchema from "../../src/component/schema";
import { register } from "../../src/test";

// One test per documented promise in README.md and docs/API.md that the other
// suites do not prove directly, each with its failure path.
const modules = import.meta.glob("./**/*.ts");
const componentModules = import.meta.glob("../../src/component/**/*.ts");
const permissions = new Permissions(components.permissions);

function setup() {
  const t = convexTest(schema, modules);
  register(t);
  return t;
}

describe("token pattern", () => {
  const max = "a".repeat(128);
  const tooLong = "a".repeat(129);
  const malformed = ["", tooLong, "bad ref!", "org/1", "u1\n", "é"];

  test("role names may have 128 characters, not 129, and only A-Za-z0-9_.:-", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: max, grants: ["x"] });
    await t.mutation(api.example.defineRole, { name: "Aa0_.:-", grants: ["x"] });
    for (const name of malformed) {
      await expect(t.mutation(api.example.defineRole, { name, grants: ["x"] })).rejects.toThrow(
        /role name must match \/\^\[A-Za-z0-9_.:-\]\{1,128\}\$\//,
      );
    }
    expect((await t.query(api.example.listRoles, {})).map((role) => role.name).sort()).toEqual(
      ["Aa0_.:-", max].sort(),
    );
  });

  test("assign accepts 128-character refs and rejects each malformed subjectRef, role, and scopeRef", async () => {
    const t = setup();
    expect(
      await t.mutation(api.example.assign, { subjectRef: max, role: max, scopeRef: max }),
    ).toBe(true);
    for (const bad of malformed) {
      await expect(
        t.mutation(api.example.assign, { subjectRef: bad, role: "editor" }),
      ).rejects.toThrow(/subjectRef must match/);
      await expect(
        t.mutation(api.example.assign, { subjectRef: "u1", role: bad }),
      ).rejects.toThrow(/role must match/);
      await expect(
        t.mutation(api.example.assign, { subjectRef: "u1", role: "editor", scopeRef: bad }),
      ).rejects.toThrow(/scopeRef must match/);
    }
    expect(await t.query(api.example.rolesFor, { subjectRef: "u1" })).toEqual([]);
  });

  test("reads never validate refs: malformed refs find nothing and never throw", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "admin", grants: ["*"] });
    await t.mutation(api.example.assign, { subjectRef: "u1", role: "admin" });
    for (const bad of malformed) {
      expect(await t.query(api.example.check, { subjectRef: bad, action: "x" })).toBe(false);
      expect(await t.query(api.example.rolesFor, { subjectRef: bad })).toEqual([]);
      expect(await t.query(api.example.permissionsFor, { subjectRef: bad })).toEqual([]);
      // A malformed scope adds nothing; the global admin role still applies.
      expect(
        await t.query(api.example.check, { subjectRef: "u1", action: "x", scopeRef: bad }),
      ).toBe(true);
      expect(await t.mutation(api.example.revoke, { subjectRef: bad, role: bad })).toBe(false);
      expect(await t.mutation(api.example.removeRole, { name: bad })).toBe(false);
    }
  });
});

describe("assignments", () => {
  test("assign does not require the role; rolesFor lists it and it grants once defined", async () => {
    const t = setup();
    expect(await t.mutation(api.example.assign, { subjectRef: "u1", role: "later" })).toBe(true);
    expect(await t.query(api.example.rolesFor, { subjectRef: "u1" })).toEqual(["later"]);
    expect(await t.query(api.example.permissionsFor, { subjectRef: "u1" })).toEqual([]);
    expect(await t.query(api.example.check, { subjectRef: "u1", action: "doc.read" })).toBe(false);

    await t.mutation(api.example.defineRole, { name: "later", grants: ["doc.read"] });
    expect(await t.query(api.example.check, { subjectRef: "u1", action: "doc.read" })).toBe(true);
  });

  test("a scoped assign is idempotent and separate from the global one", async () => {
    const t = setup();
    const scoped = { subjectRef: "u1", role: "editor", scopeRef: "org" };
    expect(await t.mutation(api.example.assign, scoped)).toBe(true);
    expect(await t.mutation(api.example.assign, scoped)).toBe(false);
    expect(await t.mutation(api.example.assign, { subjectRef: "u1", role: "editor" })).toBe(true);
    expect(await t.mutation(api.example.assign, { subjectRef: "u1", role: "editor" })).toBe(false);
  });

  test("removeRole keeps assignments; redefining the name grants its new grants", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "viewer", grants: ["doc.read"] });
    await t.mutation(api.example.assign, { subjectRef: "u1", role: "viewer" });
    expect(await t.mutation(api.example.removeRole, { name: "viewer" })).toBe(true);
    expect(await t.query(api.example.rolesFor, { subjectRef: "u1" })).toEqual(["viewer"]);
    expect(await t.query(api.example.check, { subjectRef: "u1", action: "doc.read" })).toBe(false);

    await t.mutation(api.example.defineRole, { name: "viewer", grants: ["img.view"] });
    expect(await t.query(api.example.check, { subjectRef: "u1", action: "img.view" })).toBe(true);
    expect(await t.query(api.example.check, { subjectRef: "u1", action: "doc.read" })).toBe(false);
  });
});

describe("introspection", () => {
  test("rolesFor is sorted and deduplicated across global and scoped rows; unknown is []", async () => {
    const t = setup();
    await t.mutation(api.example.assign, { subjectRef: "u1", role: "zeta" });
    await t.mutation(api.example.assign, { subjectRef: "u1", role: "zeta", scopeRef: "org" });
    await t.mutation(api.example.assign, { subjectRef: "u1", role: "alpha", scopeRef: "org" });
    expect(await t.query(api.example.rolesFor, { subjectRef: "u1", scopeRef: "org" })).toEqual([
      "alpha",
      "zeta",
    ]);
    expect(await t.query(api.example.rolesFor, { subjectRef: "nobody" })).toEqual([]);
  });

  test("permissionsFor returns wildcard grants as stored, not expanded", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "r", grants: ["doc.*", "*", "doc.read"] });
    await t.mutation(api.example.assign, { subjectRef: "u1", role: "r" });
    expect(await t.query(api.example.permissionsFor, { subjectRef: "u1" })).toEqual([
      "*",
      "doc.*",
      "doc.read",
    ]);
  });

  test("a prefix wildcard matches nested actions", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "docs", grants: ["doc.*"] });
    await t.mutation(api.example.assign, { subjectRef: "u1", role: "docs" });
    expect(await t.query(api.example.check, { subjectRef: "u1", action: "doc.page.edit" })).toBe(
      true,
    );
    expect(await t.query(api.example.check, { subjectRef: "u1", action: "doc." })).toBe(true);
  });

  test("listRoles returns every role, unpaginated, as RoleDoc; [] when none", async () => {
    const t = setup();
    expect(await t.query(api.example.listRoles, {})).toEqual([]);
    const names = Array.from({ length: 150 }, (_, i) => `role${String(i)}`);
    for (const name of names) {
      await t.mutation(api.example.defineRole, { name, grants: [name] });
    }
    await t.mutation(api.example.defineRole, { name: "described", grants: [], description: "D" });
    const roles = await t.query((ctx) => permissions.listRoles(ctx));
    expect(roles).toHaveLength(151);
    expect(roles.map((role) => role.name).sort()).toEqual([...names, "described"].sort());
    expect(roles.find((role) => role.name === "described")).toEqual({
      _id: expect.any(String),
      _creationTime: expect.any(Number),
      name: "described",
      grants: [],
      description: "D",
      updatedAt: expect.any(Number),
    });
    expect(Object.keys(roles[0] ?? {}).sort()).toEqual(
      ["_creationTime", "_id", "grants", "name", "updatedAt"].sort(),
    );
  });
});

describe("require", () => {
  test("FORBIDDEN data has code, subjectRef, action, and scopeRef in the host function", async () => {
    const t = setup();
    const caught = (scopeRef?: string) =>
      t.query(async (ctx) => {
        try {
          await permissions.require(ctx, { subjectRef: "u1", action: "doc.delete", scopeRef });
        } catch (error) {
          expect(error).toBeInstanceOf(ConvexError);
          const data = (error as { data: PermissionDenied }).data;
          expect(Object.keys(data).sort()).toEqual(["action", "code", "scopeRef", "subjectRef"]);
          return { ...data, scopeRef: data.scopeRef ?? null };
        }
        return null;
      });
    expect(await caught("org")).toEqual({
      code: "FORBIDDEN",
      subjectRef: "u1",
      action: "doc.delete",
      scopeRef: "org",
    });
    expect(await caught()).toEqual({
      code: "FORBIDDEN",
      subjectRef: "u1",
      action: "doc.delete",
      scopeRef: null,
    });
  });

  test("a FORBIDDEN error thrown out of a function keeps its data; an unscoped one drops scopeRef", async () => {
    const t = setup();
    const denied = async (scopeRef?: string) => {
      try {
        await t.query(api.example.requireAccess, {
          subjectRef: "u1",
          action: "doc.delete",
          ...(scopeRef === undefined ? {} : { scopeRef }),
        });
      } catch (error) {
        expect(error).toBeInstanceOf(ConvexError);
        return (error as ConvexError<Record<string, string>>).data;
      }
      throw new Error("require did not throw");
    };
    expect(await denied("org")).toEqual({
      code: "FORBIDDEN",
      subjectRef: "u1",
      action: "doc.delete",
      scopeRef: "org",
    });
    expect(await denied()).toEqual({ code: "FORBIDDEN", subjectRef: "u1", action: "doc.delete" });
  });
});

describe("optional args passed as undefined", () => {
  // Projects with `exactOptionalPropertyTypes` pass a `string | undefined` variable;
  // `undefined` must behave exactly like an omitted field.
  test("scopeRef: undefined is a global assign, revoke, and an unscoped read", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "editor", grants: ["doc.edit"] });
    await t.mutation(api.example.defineRole, { name: "viewer", grants: ["doc.read"] });
    await t.mutation(api.example.assign, { subjectRef: "u1", role: "viewer", scopeRef: "org" });
    const result = await t.mutation(async (ctx) => {
      const scopeRef = undefined as string | undefined;
      const created = await permissions.assign(ctx, { subjectRef: "u1", role: "editor", scopeRef });
      const duplicate = await permissions.assign(ctx, { subjectRef: "u1", role: "editor" });
      const read = {
        check: await permissions.check(ctx, { subjectRef: "u1", action: "doc.edit", scopeRef }),
        scopedOnly: await permissions.check(ctx, { subjectRef: "u1", action: "doc.read", scopeRef }),
        roles: await permissions.rolesFor(ctx, { subjectRef: "u1", scopeRef }),
        grants: await permissions.permissionsFor(ctx, { subjectRef: "u1", scopeRef }),
      };
      await permissions.require(ctx, { subjectRef: "u1", action: "doc.edit", scopeRef });
      const revoked = await permissions.revoke(ctx, { subjectRef: "u1", role: "editor", scopeRef });
      const keptScoped = await permissions.revoke(ctx, { subjectRef: "u1", role: "viewer", scopeRef });
      return { created, duplicate, read, revoked, keptScoped };
    });
    expect(result).toEqual({
      created: true,
      duplicate: false,
      read: { check: true, scopedOnly: false, roles: ["editor"], grants: ["doc.edit"] },
      revoked: true,
      keptScoped: false,
    });
    expect(await t.query(api.example.rolesFor, { subjectRef: "u1" })).toEqual([]);
    expect(await t.query(api.example.rolesFor, { subjectRef: "u1", scopeRef: "org" })).toEqual([
      "viewer",
    ]);
  });

  test("description: undefined is the same as omitting it", async () => {
    vi.useFakeTimers();
    try {
      const t = setup();
      const define = (description: string | undefined) =>
        t.mutation((ctx) => permissions.defineRole(ctx, { name: "r", grants: ["x"], description }));
      vi.setSystemTime(1_000);
      await define(undefined);
      let [role] = await t.query(api.example.listRoles, {});
      expect(role !== undefined && "description" in role).toBe(false);

      vi.setSystemTime(2_000);
      await define(undefined); // unchanged: no write
      [role] = await t.query(api.example.listRoles, {});
      expect(role?.updatedAt).toBe(1_000);

      await define("Readers");
      vi.setSystemTime(3_000);
      await define(undefined); // removes the stored description
      [role] = await t.query(api.example.listRoles, {});
      expect(role?.description).toBeUndefined();
      expect(role?.updatedAt).toBe(3_000);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("rows stored by 0.1.0 before ref validation", () => {
  // The component runs as the root app so the test can write rows that current
  // `assign` rejects, as a 0.1.0 deployment could have stored them.
  test("reads match them exactly and revoke deletes them", async () => {
    const t = convexTest(componentSchema, componentModules);
    await t.run(async (ctx) => {
      await ctx.db.insert("roles", { name: "editor", grants: ["doc.edit"], updatedAt: 0 });
      await ctx.db.insert("assignments", {
        subjectRef: "u1",
        role: "editor",
        scopeRef: "org/1",
        createdAt: 0,
      });
      await ctx.db.insert("assignments", { subjectRef: "u1", role: "editor", scopeRef: "", createdAt: 0 });
    });
    const legacy = new Permissions(componentApi as unknown as PermissionsComponent);
    const can = (scopeRef?: string) =>
      t.query((ctx) => legacy.check(ctx, { subjectRef: "u1", action: "doc.edit", scopeRef }));
    expect(await can("org/1")).toBe(true);
    expect(await can("")).toBe(true);
    expect(await can()).toBe(false);
    expect(await t.query((ctx) => legacy.rolesFor(ctx, { subjectRef: "u1", scopeRef: "org/1" }))).toEqual([
      "editor",
    ]);
    await expect(
      t.mutation((ctx) => legacy.assign(ctx, { subjectRef: "u1", role: "editor", scopeRef: "org/1" })),
    ).rejects.toThrow(/scopeRef must match/);

    for (const scopeRef of ["org/1", ""]) {
      const revoke = () =>
        t.mutation((ctx) => legacy.revoke(ctx, { subjectRef: "u1", role: "editor", scopeRef }));
      expect(await revoke()).toBe(true);
      expect(await revoke()).toBe(false);
      expect(await can(scopeRef)).toBe(false);
    }
  });
});
