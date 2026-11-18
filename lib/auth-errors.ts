/** Error keys shown on auth forms; each one has a text in messages/*.json under auth.errors. */
export const AUTH_ERROR_KEYS = [
  "required",
  "invalidEmail",
  "passwordTooShort",
  "passwordTooLong",
  "passwordsMismatch",
  "invalidCredentials",
  "emailNotConfirmed",
  "emailTaken",
  "weakPassword",
  "samePassword",
  "emailRateLimit",
  "rateLimit",
  "signupDisabled",
  "sessionExpired",
  "unknown",
] as const;

export type AuthErrorKey = (typeof AUTH_ERROR_KEYS)[number];

export function isAuthErrorKey(value: unknown): value is AuthErrorKey {
  return typeof value === "string" && (AUTH_ERROR_KEYS as readonly string[]).includes(value);
}

/** Maps a Supabase AuthError to a dictionary key, so raw English messages never reach the user. */
export function authErrorKey(error: { code?: string; status?: number } | null | undefined): AuthErrorKey {
  switch (error?.code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "user_already_exists":
    case "email_exists":
      return "emailTaken";
    case "weak_password":
      return "weakPassword";
    case "same_password":
      return "samePassword";
    case "over_email_send_rate_limit":
      return "emailRateLimit";
    case "over_request_rate_limit":
      return "rateLimit";
    case "signup_disabled":
    case "email_provider_disabled":
      return "signupDisabled";
    case "session_not_found":
    case "session_expired":
    case "refresh_token_not_found":
      return "sessionExpired";
  }
  if (error?.status === 429) return "rateLimit";
  return "unknown";
}
