import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("provides the Phase 0 Vite and TypeScript entry points", async () => {
  await access(new URL("package.json", root));
  await access(new URL("tsconfig.json", root));
  await access(new URL("index.html", root));
  await access(new URL("src/routing/types.ts", root));
  await access(new URL("spike/valhalla-route.html", root));

  const index = await readFile(new URL("index.html", root), "utf8");
  const types = await readFile(new URL("src/routing/types.ts", root), "utf8");

  assert.match(index, /src\/main\.ts/);
  assert.match(types, /export interface RoutingEngine/);
});
