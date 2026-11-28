#!/usr/bin/env bash
#
# test-package.sh — smoke-test the packed npm tarball the way a consumer sees it.
#
# Expects an existing build in dist/ (run `pnpm build` first). Packs the package,
# installs the tarball into a throwaway consumer project next to the repo's installed
# convex, convex-test, vite, and typescript versions, imports every runtime entry point
# with node, and type-checks a consumer file that imports every entry point
# (strict, skipLibCheck false, Bundler resolution).
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

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

npm pack --ignore-scripts --silent --pack-destination "$tmp" > "$tmp/pack-name.txt"
tarball="$tmp/$(tail -n 1 "$tmp/pack-name.txt")"
[[ -f "$tarball" ]] || { echo "error: npm pack produced no tarball" >&2; exit 1; }

consumer="$tmp/consumer"
mkdir -p "$consumer"
cd "$consumer"

cat > package.json <<'EOF'
{ "name": "package-smoke-consumer", "private": true, "type": "module" }
EOF

npm install --no-audit --no-fund --ignore-scripts --prefer-offline --loglevel=error \
  "$tarball" \
  "convex@$CONVEX_VERSION" \
  "convex-test@$CONVEX_TEST_VERSION" \
  "vite@$VITE_VERSION" \
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
  "include": ["consumer.ts"]
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
import type { register } from "@vllnt/convex-permissions/test";

declare const mounted: ComponentApi;
// The generated component API must satisfy the client's hand-written contract.
export const permissions = new Permissions<"admin", "doc.read">(mounted);
export const sameApi: ComponentApiJs = mounted;
export const contract: PermissionsComponent = mounted;
export const definitions = [component, componentJs] as const;
export type Shapes = [RoleDoc, PermissionDenied, typeof register];
EOF
npx --no-install tsc -p tsconfig.json
echo "OK    consumer type-check"

echo "OK    test-package.sh"
