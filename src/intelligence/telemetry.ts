/**
 * Telemetry utilities for intelligence services.
 *
 * Provides a lightweight hook that downstream missions can replace with
 * structured telemetry collectors once they are available.
 */

export type TelemetryEventLevel = 'info' | 'warning' | 'error';

export interface TelemetryEvent {
  source: string;
  level: TelemetryEventLevel;
  message: string;
  context?: Record<string, unknown>;
}

export type TelemetryHandler = (event: TelemetryEvent) => void;

let handler: TelemetryHandler | null = null;

/**
 * Register a telemetry handler. Downstream integrations can inject their own
 * collector without requiring us to ship a concrete analytics dependency.
 */
export function registerTelemetryHandler(nextHandler: TelemetryHandler | null): void {
  handler = nextHandler;
}

/**
 * Emit a warning-level telemetry event. Falls back to console.warn so we still
 * surface actionable signals during local development.
 */
export function emitTelemetryWarning(
  source: string,
  message: string,
  context?: Record<string, unknown>
): void {
  const event: TelemetryEvent = {
    source,
    level: 'warning',
    message,
    context,
  };

  if (handler) {
    try {
      handler(event);
      return;
    } catch (error) {
      // Fall through to console.warn so the warning is not lost.
      console.warn(`[Telemetry handler error] ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (context) {
    console.warn(`[Telemetry][${source}] ${message}`, context);
  } else {
    console.warn(`[Telemetry][${source}] ${message}`);
  }
}
