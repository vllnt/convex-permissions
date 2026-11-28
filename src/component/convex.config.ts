import { defineComponent } from "convex/server";

/**
 * The permissions component definition. Mount it in the host's
 * `convex/convex.config.ts` with `app.use(permissions)`; the default mount name is
 * `permissions`, so the host reference is `components.permissions`.
 */
const component = defineComponent("permissions");

// Nest official child components here, e.g.:
// import sharded from "@convex-dev/sharded-counter/convex.config";
// component.use(sharded);

export default component;
