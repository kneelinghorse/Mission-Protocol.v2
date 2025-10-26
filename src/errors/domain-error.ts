import { MissionProtocolError } from './mission-error';
import { ErrorCode, ErrorContext, ErrorSeverity } from './types';

export interface DomainErrorOptions {
  code?: Extract<ErrorCode, 'DOMAIN_NOT_FOUND' | 'DOMAIN_INVALID'>;
  context?: ErrorContext;
  severity?: ErrorSeverity;
  cause?: unknown;
  retryable?: boolean;
}

export class DomainError extends MissionProtocolError {
  constructor(message: string, options: DomainErrorOptions = {}) {
    super({
      message,
      code: options.code ?? 'DOMAIN_INVALID',
      category: 'domain',
      severity: options.severity ?? 'error',
      context: options.context,
      cause: options.cause,
      retryable: options.retryable ?? false,
    });
  }
}
