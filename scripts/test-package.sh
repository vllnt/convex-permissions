#!/usr/bin/env bash
#
# test-package.sh — smoke-test the packed npm tarball the way a consumer sees it.
#
# Expects an existing build in dist/ (run `pnpm build` first). Packs the package,
# installs the tarball with pnpm into a throwaway consumer project next to the repo's installed
# convex, convex-test, vite, and typescript versions, imports every runtime entry point
# with node, and type-checks a consumer file that imports every entry point
# (strict, skipLibCheck false, Bundler resolution). It also extracts every ```ts
# block of README.md and docs/API.md and type-checks each one as a host-app file
# against the tarball, next to stubs this script writes that mirror Convex codegen
# (_generated/api, _generated/server, schema). Blocks that restate a package type get
# a type-equality assertion against the real export (scripts/extract-doc-examples.mjs).
#
# Exit codes: 0 pass, non-zero on any pack, install, import, or type-check failure.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f dist/client/index.js || ! -f dist/component/convex.config.js ]]; then
  echo "error: dist/ is missing; run pnpm build first" >&2
  exit 1
fi

installed_version() {
  node -p "require('./node_modules/$1/package.json').version"
}
CONVEX_VERSION="$(installed_version convex)"
CONVEX_TEST_VERSION="$(installed_version convex-test)"
VITE_VERSION="$(installed_version vite)"
TS_VERSION="$(installed_version typescript)"
VITEST_VERSION="$(installed_version vitest)"
# The consumer pins the repo's pnpm, so Corepack never fetches a pnpm newer than the
# release-age gate allows.
PACKAGE_MANAGER="$(node -p "require('./package.json').packageManager")"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

npm pack --ignore-scripts --silent --pack-destination "$tmp" > "$tmp/pack-name.txt"
tarball="$tmp/$(tail -n 1 "$tmp/pack-name.txt")"
[[ -f "$tarball" ]] || { echo "error: npm pack produced no tarball" >&2; exit 1; }

# Resolved from the repo so the consumer reuses its store; when the temp dir sits on
# another filesystem (e.g. a tmpfs /tmp), pnpm would otherwise create a new store
# there that the trap below never removes.
STORE_DIR="$(pnpm store path)"

consumer="$tmp/consumer"
mkdir -p "$consumer"
cd "$consumer"

cat > package.json <<EOF
{ "name": "package-smoke-consumer", "private": true, "type": "module", "packageManager": "$PACKAGE_MANAGER" }
EOF
# Carries the repo's release-age gate and its @vllnt/* exclusion into the consumer: a
# parent pnpm run passes only the age through the environment, not the exclusion, and
# running this script directly with bash passes neither. It also makes the consumer
# its own pnpm project root.
cp "$ROOT/pnpm-workspace.yaml" pnpm-workspace.yaml

pnpm add --ignore-scripts --prefer-offline --loglevel=error --store-dir "$STORE_DIR" \
  "$tarball" \
  "convex@$CONVEX_VERSION" \
  "convex-test@$CONVEX_TEST_VERSION" \
  "vite@$VITE_VERSION" \
  "vitest@$VITEST_VERSION" \
  "typescript@$TS_VERSION"

cat > runtime.mjs <<'EOF'
const client = await import("@vllnt/convex-permissions");
if (typeof client.Permissions !== "function") throw new Error("Permissions export missing");
for (const entry of [
  "@vllnt/convex-permissions/convex.config",
  "@vllnt/convex-permissions/convex.config.js",
]) {
  const mod = await import(entry);
  if (!mod.default) throw new Error(`${entry} has no default export`);
}
console.log("OK    runtime imports");
EOF
node runtime.mjs

cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": false,
    "noEmit": true,
    "types": []
  },
  "include": ["consumer.ts", "examples/**/*.ts"]
}
EOF

cat > consumer.ts <<'EOF'
import {
  Permissions,
  type PermissionDenied,
  type PermissionsComponent,
  type RoleDoc,
} from "@vllnt/convex-permissions";
import component from "@vllnt/convex-permissions/convex.config";
import componentJs from "@vllnt/convex-permissions/convex.config.js";
import type { ComponentApi } from "@vllnt/convex-permissions/_generated/component";
import type { ComponentApi as ComponentApiJs } from "@vllnt/convex-permissions/_generated/component.js";
import { register } from "@vllnt/convex-permissions/test";
import { convexTest } from "convex-test";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

declare const mounted: ComponentApi;
// The generated component API must satisfy the client's hand-written contract.
export const permissions = new Permissions<"admin", "doc.read">(mounted);
export const sameApi: ComponentApiJs = mounted;
export const contract: PermissionsComponent = mounted;
export const definitions = [component, componentJs] as const;
export type Shapes = [RoleDoc, PermissionDenied];

// register must accept a convexTest instance built from the host app's own schema.
const hostSchema = defineSchema({ notes: defineTable({ body: v.string() }) });
export function mountForTests(): void {
  register(convexTest(hostSchema));
  register(convexTest(), "custom");
}
EOF
# Docs examples are host-app files importing ./_generated/api, ./_generated/server, and
# ./schema; the stubs mirror Convex codegen for a host that mounts the component as
# `permissions`, typed with the package's own ComponentApi.
mkdir -p examples/_generated
cat > examples/schema.ts <<'EOF'
import { defineSchema } from "convex/server";

export default defineSchema({});
EOF
cat > examples/_generated/api.ts <<'EOF'
import { anyApi, componentsGeneric } from "convex/server";
import type { ComponentApi } from "@vllnt/convex-permissions/_generated/component";

export const api = anyApi;
export const internal = anyApi;
export const components = componentsGeneric() as unknown as {
  permissions: ComponentApi<"permissions">;
};
EOF
cat > examples/_generated/server.ts <<'EOF'
import {
  actionGeneric,
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
  type ActionBuilder,
  type DataModelFromSchemaDefinition,
  type GenericActionCtx,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type HttpActionBuilder,
  type MutationBuilder,
  type QueryBuilder,
} from "convex/server";
import type schema from "../schema";

export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export const query: QueryBuilder<DataModel, "public"> = queryGeneric;
export const internalQuery: QueryBuilder<DataModel, "internal"> = internalQueryGeneric;
export const mutation: MutationBuilder<DataModel, "public"> = mutationGeneric;
export const internalMutation: MutationBuilder<DataModel, "internal"> = internalMutationGeneric;
export const action: ActionBuilder<DataModel, "public"> = actionGeneric;
export const internalAction: ActionBuilder<DataModel, "internal"> = internalActionGeneric;
export const httpAction: HttpActionBuilder = httpActionGeneric;
export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type ActionCtx = GenericActionCtx<DataModel>;
EOF
node "$ROOT/scripts/extract-doc-examples.mjs" examples "$ROOT/README.md" "$ROOT/docs/API.md"

pnpm exec tsc -p tsconfig.json
echo "OK    consumer and docs examples type-check"

echo "OK    test-package.sh"
