import { convexTest } from "convex-test";
import { componentsGeneric, defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { Permissions } from "../../src/client";
import type { ComponentApi } from "../../src/component/_generated/component";
import { register } from "../../src/test";

// A host schema with its own tables and none of the component's: `register` must
// accept the `convexTest` instance a consuming app builds from its own schema.
// `pnpm typecheck:test` type-checks this file.
const hostSchema = defineSchema({
  notes: defineTable({ body: v.string() }),
});
const modules = import.meta.glob("./**/*.ts");

test("register mounts the component on a host-schema convexTest instance", async () => {
  const t = convexTest(hostSchema, modules);
  register(t);

  await t.mutation(api.example.defineRole, { name: "editor", grants: ["doc.*"] });
  await t.mutation(api.example.assign, { subjectRef: "u1", role: "editor" });
  expect(
    await t.query(api.example.check, { subjectRef: "u1", action: "doc.edit" }),
  ).toBe(true);

  // The host's own tables keep working next to the component.
  const id = await t.run((ctx) => ctx.db.insert("notes", { body: "hello" }));
  expect((await t.run((ctx) => ctx.db.get(id)))?.body).toBe("hello");
});

test("register mounts the component under a custom name", async () => {
  const t = convexTest(hostSchema, modules);
  register(t);
  register(t, "custom");
  const custom = new Permissions(
    (componentsGeneric() as unknown as { custom: ComponentApi<"custom"> }).custom,
  );

  const allowed = await t.mutation(async (ctx) => {
    await custom.defineRole(ctx, { name: "viewer", grants: ["doc.read"] });
    await custom.assign(ctx, { subjectRef: "u1", role: "viewer" });
    return custom.check(ctx, { subjectRef: "u1", action: "doc.read" });
  });
  expect(allowed).toBe(true);

  // Each name is its own mount with its own tables.
  expect(await t.query(api.example.listRoles, {})).toEqual([]);
});
