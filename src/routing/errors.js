const errorDetails = {
  "wasm-init": { message: "本地路线引擎启动失败，请重试。", retryable: true },
  "graph-tile": { message: "地图数据加载失败，请检查网络后重试。", retryable: true },
  "outside-region": { message: "起点或目的地超出当前测试路网范围（蓝色边界），请重新选点。", retryable: false },
  "no-route": { message: "当前两点之间没有可用摩托车路线，请更换地点。", retryable: false },
  unknown: { message: "本地路线计算失败，请重试。", retryable: true },
};

export class RoutingError extends Error {
  constructor(code, cause) {
    super(errorDetails[code].message, { cause });
    this.name = "RoutingError";
    this.code = code;
    this.userMessage = errorDetails[code].message;
    this.retryable = errorDetails[code].retryable;
  }
}

export function toRoutingError(error) {
  if (error instanceof RoutingError) return error;

  const message = error instanceof Error ? error.message : String(error);
  if (/没有 graph tile|未找到 graph tile/i.test(message)) return new RoutingError("outside-region", error);
  if (/Graph tile request failed|graph tile/i.test(message)) return new RoutingError("graph-tile", error);
  if (/no route|unreachable|route could not be found|no suitable/i.test(message)) return new RoutingError("no-route", error);
  return new RoutingError("unknown", error);
}
