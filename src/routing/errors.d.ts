export type RoutingErrorCode = "wasm-init" | "graph-tile" | "outside-region" | "no-route" | "unknown";

export class RoutingError extends Error {
  readonly code: RoutingErrorCode;
  readonly userMessage: string;
  readonly retryable: boolean;

  constructor(code: RoutingErrorCode, cause?: unknown);
}

export function toRoutingError(error: unknown): RoutingError;
