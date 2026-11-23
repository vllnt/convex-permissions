/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");

describe("role input limits on roles stored before the limits", () => {
  test("an oversized stored role can be shrunk but not grown", async () => {
    const t = convexTest(schema, modules);
    const longGrant = `doc.${"x".repeat(300)}`;
    const grants = [longGrant, ...Array.from({ length: 299 }, (_, i) => `g${String(i)}`)];
    const description = "d".repeat(2000);
    await t.run(async (ctx) => {
      await ctx.db.insert("roles", { name: "legacy", grants, description, updatedAt: 0 });
    });

    await t.mutation(api.mutations.defineRole, {
      name: "legacy",
      grants: grants.slice(0, -1),
      description,
    });
    let role = await t.run((ctx) => ctx.db.query("roles").first());
    expect(role?.grants).toHaveLength(299);
    expect(role?.grants[0]).toBe(longGrant);

    await expect(
      t.mutation(api.mutations.defineRole, { name: "legacy", grants, description }),
    ).rejects.toThrow(/at most 256 grants/);
    await expect(
      t.mutation(api.mutations.defineRole, {
        name: "legacy",
        grants: [`doc.${"y".repeat(300)}`],
        description,
      }),
    ).rejects.toThrow(/grant must be at most 256 characters/);
    await expect(
      t.mutation(api.mutations.defineRole, {
        name: "legacy",
        grants: [longGrant],
        description: `${description}!`,
      }),
    ).rejects.toThrow(/description must be at most 1024 characters/);

    await expect(
      t.mutation(api.mutations.defineRole, {
        name: "legacy",
        grants: [longGrant, longGrant],
        description,
      }),
    ).rejects.toThrow(/grant must be at most 256 characters/);

    await t.mutation(api.mutations.defineRole, {
      name: "legacy",
      grants: [longGrant],
      description: "short",
    });
    role = await t.run((ctx) => ctx.db.query("roles").first());
    expect(role?.grants).toEqual([longGrant]);
    expect(role?.description).toBe("short");
  });
});
