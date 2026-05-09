export type ErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_CREDENTIALS"
  | "USERNAME_TAKEN"
  | "SAVE_NOT_FOUND"
  | "SETTINGS_NOT_FOUND"
  | "RATE_LIMITED"
  | "INVALID_BODY"
  | "INTERNAL"

export class AppError extends Error {
  readonly statusCode: number
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string, statusCode: number) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}

export const Errors = {
  unauthorized: () => new AppError("UNAUTHORIZED", "Not signed in", 401),
  invalidCredentials: () => new AppError("INVALID_CREDENTIALS", "Invalid credentials", 401),
  usernameTaken: () => new AppError("USERNAME_TAKEN", "Username already taken", 409),
  saveNotFound: () => new AppError("SAVE_NOT_FOUND", "Save not found", 404),
  settingsNotFound: () => new AppError("SETTINGS_NOT_FOUND", "Settings not synced for this account", 404),
  invalidBody: (msg: string) => new AppError("INVALID_BODY", msg, 400),
}
