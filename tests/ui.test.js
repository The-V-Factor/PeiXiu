import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("defines the compact route planner controls and mobile layout", async () => {
  const main = await readFile(new URL("src/main.ts", root), "utf8");
  const styles = await readFile(new URL("src/main.css", root), "utf8");

  assert.doesNotMatch(main, /广州摩托导航/);
  assert.doesNotMatch(main, /id="clear"/);
  assert.doesNotMatch(main, /id="select-(start|end)"/);
  assert.doesNotMatch(main, /<div class="scope-legend-item"><span>路网覆盖范围（近似）/);
  assert.match(main, /center: \[113\.31261, 22\.98989\]/);
  assert.match(main, /window\.isSecureContext/);
  assert.match(main, /map\.easeTo\(\{ center:/);
  assert.match(styles, /\.scope-legend-item/);
  assert.match(styles, /@media \(max-width: 480px\)/);
});
