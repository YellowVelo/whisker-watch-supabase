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
  // Overrides layout.ts's default "activity on your Wysker Watch account"
  // footer line — only needed for templates not tied to a real account.
  footerText?: string;
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
  // Defaults to support@wyskerwatch.com if omitted (see sendEmail.ts's
  // DEFAULT_REPLY_TO) — only pass this to override that default.
  replyTo?: string;
  // Defaults to "Wysker Watch <no-reply@wyskerwatch.com>" (see
  // sendEmail.ts's FROM_ADDRESS) — only pass this to override that
  // default. Added for beta-signup-confirmation (spec 0053), whose copy
  // explicitly invites a reply ("just reply to this email"); a no-reply@
  // From address would visually contradict that even though replyTo
  // already routes replies correctly.
  from?: string;
  // Optional linkage for email_logs (e.g. 'pet_co_owners' / invite id).
  relatedEntityType?: string;
  relatedEntityId?: string;
  // Optional caller-supplied key for safe retries. Passing the same key
  // on a retried request (client timeout, at-least-once job delivery)
  // returns the original result instead of sending a second email. See
  // sendEmail.ts's claimIdempotencyKey for the concurrency-safe
  // reservation this relies on.
  idempotencyKey?: string;
  // Optional id of the profiles row responsible for triggering this
  // send. When present, sendEmail() checks that account's account_type
  // and silently suppresses (never calls Resend) for 'test'/'demo'
  // accounts — see sendEmail.ts. Omit when there's no single acting
  // user (e.g. an ops/scheduled call through the send-email endpoint).
  sentByUserId?: string;
}

// A discriminated union, not an interface with optional fields: this
// makes `suppressionReason` a compile-time-required companion of
// `suppressed: true`, rather than a field a future suppression path in
// sendEmail.ts could forget to set. Callers (invite-co-owner,
// invite-sitter) branch on `result.suppressed` to narrow to the variant
// that actually has `suppressionReason` — TypeScript will flag it if a
// new sendEmail() code path ever returns `suppressed: true` without also
// providing one of the two known reasons.
export type SendEmailResult =
  | { success: true; messageId: string | null; suppressed?: false }
  | {
      success: true;
      messageId: null;
      suppressed: true;
      // 'test_or_demo_account': the sending account (sentByUserId) is
      // test/demo. 'recipient_suppressed': the recipient address has a
      // previously-bounced/complained-and-not-cleared row in
      // email_suppressions (see the resend-webhook Edge Function and
      // migration 0038).
      suppressionReason: 'test_or_demo_account' | 'recipient_suppressed';
    };
