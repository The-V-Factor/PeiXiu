import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("defines an installable app shell without graph tile precache", async () => {
  const manifest = JSON.parse(await readFile(new URL("public/manifest.webmanifest", root), "utf8"));
  const serviceWorker = await readFile(new URL("public/sw.js", root), "utf8");
  const headers = await readFile(new URL("public/_headers", root), "utf8");
  const nginxConfig = await readFile(new URL("deploy/nginx.conf", root), "utf8");

  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.match(serviceWorker, /peixiu-app-shell-v2/);
  assert.match(serviceWorker, /valhalla\.wasm/);
  assert.match(serviceWorker, /\.gph/);
  const appShell = serviceWorker.match(/const APP_SHELL = \[(.*?)\];/s)?.[1] ?? "";
  assert.doesNotMatch(appShell, /\.gph/);
  assert.match(serviceWorker, /request\.destination/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /cache: "no-store"/);
  assert.match(headers, /\/index\.html[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
  assert.match(headers, /\/sw\.js[\s\S]*Cache-Control: no-cache, no-store, must-revalidate/);
  assert.match(headers, /\/assets\/\*[\s\S]*immutable/);
  assert.match(nginxConfig, /application\/manifest\+json webmanifest/);
});
