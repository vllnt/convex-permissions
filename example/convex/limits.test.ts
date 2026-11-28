import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { Permissions, type PermissionsComponent } from "../../src/client";
import { api as componentApi } from "../../src/component/_generated/api";
import componentSchema from "../../src/component/schema";
import { register } from "../../src/test";

const modules = import.meta.glob("./**/*.ts");
const componentModules = import.meta.glob("../../src/component/**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  register(t);
  return t;
}

const grantList = (count: number) => Array.from({ length: count }, (_, i) => `g${String(i)}`);

describe("role size limits", () => {
  test("a role may have 256 grants, not 257", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "r", grants: grantList(256) });
    await expect(
      t.mutation(api.example.defineRole, { name: "r", grants: grantList(257) }),
    ).rejects.toThrow(/a role may have at most 256 grants/);
    expect((await t.query(api.example.listRoles, {}))[0]?.grants).toHaveLength(256);
  });

  test("a new role over the limits is rejected and nothing is inserted", async () => {
    const t = setup();
    await expect(
      t.mutation(api.example.defineRole, { name: "fresh", grants: grantList(257) }),
    ).rejects.toThrow(/a role may have at most 256 grants/);
    expect(await t.query(api.example.listRoles, {})).toEqual([]);
  });

  test("a grant may have 256 characters, not 257", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, { name: "r", grants: ["a".repeat(256)] });
    await expect(
      t.mutation(api.example.defineRole, { name: "r", grants: ["a".repeat(257)] }),
    ).rejects.toThrow(/grant must be at most 256 characters/);
  });

  test("a description may have 1024 characters, not 1025", async () => {
    const t = setup();
    await t.mutation(api.example.defineRole, {
      name: "r",
      grants: [],
      description: "d".repeat(1024),
    });
    await expect(
      t.mutation(api.example.defineRole, { name: "r", grants: [], description: "d".repeat(1025) }),
    ).rejects.toThrow(/description must be at most 1024 characters/);
  });

  test("lengths count UTF-16 code units, not code points or UTF-8 bytes", async () => {
    const t = setup();
    const emoji = "\u{1F600}"; // 1 code point, 2 UTF-16 code units, 4 UTF-8 bytes
    const accent = "é"; // "é": 1 code point, 1 UTF-16 code unit, 2 UTF-8 bytes
    expect(emoji).toHaveLength(2);

    // 256 code units = 512 UTF-8 bytes: accepted, so bytes are not counted.
    await t.mutation(api.example.defineRole, {
      name: "r",
      grants: [accent.repeat(256)],
      description: accent.repeat(1024),
    });
    // 256 code points = 257 code units: rejected, so code points are not counted.
    await expect(
      t.mutation(api.example.defineRole, { name: "r", grants: ["a".repeat(255) + emoji] }),
    ).rejects.toThrow(/grant must be at most 256 characters/);
    await expect(
      t.mutation(api.example.defineRole, {
        name: "r",
        grants: [],
        description: "d".repeat(1023) + emoji,
      }),
    ).rejects.toThrow(/description must be at most 1024 characters/);
    // 128 emoji = 256 code units: accepted.
    await t.mutation(api.example.defineRole, {
      name: "r",
      grants: [emoji.repeat(128)],
      description: emoji.repeat(512),
    });
    const [role] = await t.query(api.example.listRoles, {});
    expect(role?.grants).toEqual([emoji.repeat(128)]);
  });
});

describe("roles stored before the size limits", () => {
  // The component runs as the root app so the test can write an oversized row
  // straight into its `roles` table, as a 0.1.0 deployment could have stored it.
  const longGrant = `doc.${"x".repeat(300)}`;
  const otherLongGrant = `img.${"y".repeat(400)}`;
  const legacyGrants = [longGrant, otherLongGrant, ...grantList(298)];
  const legacyDescription = "d".repeat(2000);

  async function setupLegacy() {
    const t = convexTest(componentSchema, componentModules);
    await t.run(async (ctx) => {
      await ctx.db.insert("roles", {
        name: "legacy",
        grants: legacyGrants,
        description: legacyDescription,
        updatedAt: 0,
      });
      await ctx.db.insert("assignments", { subjectRef: "u1", role: "legacy", createdAt: 0 });
    });
    const permissions = new Permissions(componentApi as unknown as PermissionsComponent);
    const define = (grants: string[], description?: string) =>
      t.mutation((ctx) =>
        permissions.defineRole(ctx, {
          name: "legacy",
          grants,
          ...(description === undefined ? {} : { description }),
        }),
      );
    const storedRole = () => t.run((ctx) => ctx.db.query("roles").unique());
    return { t, permissions, define, storedRole };
  }

  test("every read query still works on an oversized role", async () => {
    const { t, permissions } = await setupLegacy();
    expect(
      await t.query((ctx) => permissions.check(ctx, { subjectRef: "u1", action: longGrant })),
    ).toBe(true);
    expect(
      await t.query((ctx) => permissions.check(ctx, { subjectRef: "u1", action: "g297" })),
    ).toBe(true);
    await expect(
      t.query((ctx) => permissions.require(ctx, { subjectRef: "u1", action: otherLongGrant })),
    ).resolves.toBeNull();
    expect(await t.query((ctx) => permissions.rolesFor(ctx, { subjectRef: "u1" }))).toEqual([
      "legacy",
    ]);
    expect(
      await t.query((ctx) => permissions.permissionsFor(ctx, { subjectRef: "u1" })),
    ).toEqual([...legacyGrants].sort());
    const [role] = await t.query((ctx) => permissions.listRoles(ctx));
    expect(role?.grants).toEqual(legacyGrants);
    expect(role?.description).toBe(legacyDescription);
  });

  test("an oversized role can be kept or shrunk", async () => {
    const { define, storedRole } = await setupLegacy();
    // Unchanged: a no-op, not an error.
    await define(legacyGrants, legacyDescription);
    expect((await storedRole())?.updatedAt).toBe(0);

    // Same size, different values: allowed (the role does not grow).
    const sameSize = [longGrant, otherLongGrant, ...grantList(299).slice(1)];
    await define(sameSize, "e".repeat(2000));
    expect((await storedRole())?.grants).toEqual(sameSize);

    // Shrink: fewer grants, one long grant dropped, shorter description.
    await define([longGrant, "g0"], "short");
    const role = await storedRole();
    expect(role?.grants).toEqual([longGrant, "g0"]);
    expect(role?.description).toBe("short");
  });

  test("omitting the description clears an oversized one", async () => {
    const { define, storedRole } = await setupLegacy();
    await define(legacyGrants);
    const role = await storedRole();
    expect(role?.description).toBeUndefined();
    expect(role?.grants).toEqual(legacyGrants);
  });

  test("short grants can be swapped for 256-character ones without gaining grants", async () => {
    const { define, storedRole } = await setupLegacy();
    const wide = grantList(300).map((grant) => grant.padEnd(256, "w"));
    await define(wide, legacyDescription);
    expect((await storedRole())?.grants).toEqual(wide);
  });

  test("an oversized role cannot pass the larger of limit and stored value, or add a long grant", async () => {
    const { define, storedRole } = await setupLegacy();
    await expect(define([...legacyGrants, "extra"], legacyDescription)).rejects.toThrow(
      /a role may have at most 256 grants/,
    );
    await expect(define([`doc.${"z".repeat(300)}`], legacyDescription)).rejects.toThrow(
      /grant must be at most 256 characters/,
    );
    await expect(define([longGrant], `${legacyDescription}!`)).rejects.toThrow(
      /description must be at most 1024 characters/,
    );
    // A kept long grant cannot be duplicated, even after dropping a longer one.
    await expect(define([longGrant, longGrant], legacyDescription)).rejects.toThrow(
      /grant must be at most 256 characters/,
    );
    const role = await storedRole();
    expect(role?.grants).toEqual(legacyGrants);
    expect(role?.description).toBe(legacyDescription);
  });

  test("once shrunk, the limits apply again", async () => {
    const { define } = await setupLegacy();
    await define(grantList(10), "short");
    await expect(define([longGrant], "short")).rejects.toThrow(
      /grant must be at most 256 characters/,
    );
    await expect(define(grantList(257))).rejects.toThrow(/a role may have at most 256 grants/);
    await expect(define([], "d".repeat(1025))).rejects.toThrow(
      /description must be at most 1024 characters/,
    );
  });
});
