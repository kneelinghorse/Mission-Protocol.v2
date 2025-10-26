import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { emitTelemetryWarning, registerTelemetryHandler } from '../../src/intelligence/telemetry';

describe('telemetry utilities', () => {
  beforeEach(() => {
    registerTelemetryHandler(null);
  });

  afterEach(() => {
    registerTelemetryHandler(null);
  });

  it('invokes registered handler with warning event', () => {
    const handler = jest.fn();
    registerTelemetryHandler(handler);

    emitTelemetryWarning('unit-test', 'handler invoked', { detail: 1 });

    expect(handler).toHaveBeenCalledWith({
      source: 'unit-test',
      level: 'warning',
      message: 'handler invoked',
      context: { detail: 1 },
    });
  });

  it('falls back to console when handler throws', () => {
    const error = new Error('handler failure');
    registerTelemetryHandler(() => {
      throw error;
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    emitTelemetryWarning('unit-test', 'handler error path');

    expect(warnSpy).toHaveBeenCalledWith('[Telemetry handler error] handler failure');
    expect(warnSpy).toHaveBeenCalledWith('[Telemetry][unit-test] handler error path');

    warnSpy.mockRestore();
  });
});
