// Shared types for the transactional email system.
//
// Used by renderTemplate.ts, sendEmail.ts, templates/*.ts, and the
// send-email Edge Function. Keeping these in one place means every
// caller (current and future workflows) agrees on the same error
// vocabulary instead of each Edge Function inventing its own.

export type EmailErrorCode =
  | 'missing_template'
  | 'missing_variable'
  | 'provider_error'
  | 'invalid_recipient'
  | 'unauthorized'
  | 'unknown_error';

// Thrown by renderTemplate/sendEmail. The `message` is always safe to
// show to a caller — never put raw provider responses, stack traces,
// or secret values in it.
export class EmailServiceError extends Error {
  code: EmailErrorCode;

  constructor(code: EmailErrorCode, message: string) {
    super(message);
    this.name = 'EmailServiceError';
    this.code = code;
  }
}

export interface EmailTemplate {
  name: string;
  // May reference {{variables}}; rendered without HTML-escaping since
  // subject lines are plain text in the mail client's UI, not HTML.
  subject: string;
  previewText: string;
  // Every variable listed here must be present and non-empty or
  // renderTemplate throws `missing_variable`.
  requiredVariables: string[];
  // Variables in this list are treated as URLs: validated with
  // isSafeEmailUrl (https + allowlisted host, see utils.ts) and
  // inserted into href attributes instead of HTML-escaped body text.
  urlVariables?: string[];
  // Returns the *inner* body markup for the shared layout — not a full
  // HTML document. Receives already-escaped text variables and raw
  // (validated) URL variables.
  html: (vars: Record<string, string>) => string;
  // Plain text fallback body. Receives raw (unescaped) variables.
  text: (vars: Record<string, string>) => string;
}

export interface SendEmailParams {
  to: string;
  template: string;
  variables: Record<string, string>;
  replyTo?: string;
  // Optional linkage for email_logs (e.g. 'pet_co_owners' / invite id).
  relatedEntityType?: string;
  relatedEntityId?: string;
  // Optional caller-supplied key for safe retries. Passing the same key
  // on a retried request (client timeout, at-least-once job delivery)
  // returns the original result instead of sending a second email. See
  // sendEmail.ts's claimIdempotencyKey for the concurrency-safe
  // reservation this relies on.
  idempotencyKey?: string;
}

export interface SendEmailResult {
  success: true;
  messageId: string | null;
}
