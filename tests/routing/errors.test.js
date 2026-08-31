import test from "node:test";
import assert from "node:assert/strict";
import { RoutingError, toRoutingError } from "../../src/routing/errors.js";

test("maps routing failures to safe, actionable user messages", () => {
  const graphError = toRoutingError(new Error("Graph tile request failed: HTTP 404 (/secret/path/tile.gph)"));
  assert.equal(graphError.code, "graph-tile");
  assert.equal(graphError.retryable, true);
  assert.equal(graphError.userMessage, "地图数据加载失败，请检查网络后重试。");
  assert.doesNotMatch(graphError.userMessage, /secret|tile\.gph|404/);

  assert.equal(toRoutingError(new Error("没有 graph tile 覆盖路线起终点")).code, "outside-region");
  assert.equal(toRoutingError(new Error("No route could be found")).code, "no-route");
  assert.equal(new RoutingError("wasm-init").retryable, true);
});
