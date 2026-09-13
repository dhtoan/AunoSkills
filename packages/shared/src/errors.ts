export const ExitCode = {
  Success: 0,
  GenericFailure: 1,
  InvalidUsage: 2,
  DetectionFailure: 3,
  ResolutionFailure: 4,
  NetworkFailure: 5,
  IntegrityFailure: 6,
  SecurityPolicyViolation: 7,
  MaterializationFailure: 8,
  LockfileViolation: 9,
  AuditThresholdFailure: 10,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export type ErrorCategory =
  | 'config' | 'detection' | 'resolution' | 'registry' | 'network' | 'integrity'
  | 'security' | 'cache' | 'materialization' | 'transaction' | 'agent' | 'lockfile'
  | 'filesystem' | 'internal';
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

const EXIT_BY_CATEGORY: Record<ErrorCategory, ExitCode> = {
  config: ExitCode.InvalidUsage,
  detection: ExitCode.DetectionFailure,
  resolution: ExitCode.ResolutionFailure,
  registry: ExitCode.NetworkFailure,
  network: ExitCode.NetworkFailure,
  integrity: ExitCode.IntegrityFailure,
  security: ExitCode.SecurityPolicyViolation,
  cache: ExitCode.GenericFailure,
  materialization: ExitCode.MaterializationFailure,
  transaction: ExitCode.GenericFailure,
  agent: ExitCode.MaterializationFailure,
  lockfile: ExitCode.LockfileViolation,
  filesystem: ExitCode.GenericFailure,
  internal: ExitCode.GenericFailure,
};

export interface AunoErrorOptions {
  code: string;
  message: string;
  category: ErrorCategory;
  severity?: ErrorSeverity;
  retryable?: boolean;
  details?: unknown;
  cause?: unknown;
}

export class AunoError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly retryable: boolean;
  readonly details?: unknown;
  readonly exitCode: ExitCode;

  constructor(options: AunoErrorOptions) {
    super(options.message, { cause: options.cause });
    this.name = 'AunoError';
    this.code = options.code;
    this.category = options.category;
    this.severity = options.severity ?? 'error';
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    this.exitCode = this.code === 'AUNO_AUDIT_THRESHOLD' ? ExitCode.AuditThresholdFailure : EXIT_BY_CATEGORY[this.category];
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      category: this.category,
      severity: this.severity,
      retryable: this.retryable,
      ...(this.details === undefined ? {} : { details: this.details }),
    };
  }
}

export function asAunoError(error: unknown): AunoError {
  if (error instanceof AunoError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AunoError({ code: 'AUNO_INTERNAL', message, category: 'internal', cause: error });
}
