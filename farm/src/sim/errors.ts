/*  Refusals the UI can catch and show as a message.
    A refusal is never a crash and never a silent no-op. */

export type SimErrorCode =
  | "TANK_EMPTY"
  | "NOT_AT_POND"
  | "TANK_FULL"
  | "NOT_TILLED"
  | "ALREADY_PLANTED"
  | "ALREADY_TILLED"
  | "NO_CROP"
  | "OUT_OF_SEASON";

export class SimError extends Error {
  readonly code: SimErrorCode;

  constructor(code: SimErrorCode, message: string) {
    super(message);
    this.name = "SimError";
    this.code = code;
  }
}

export function isSimError(error: unknown): error is SimError {
  return error instanceof SimError;
}
