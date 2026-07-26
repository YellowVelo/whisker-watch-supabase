// Shared server-side email service.
//
// This is the single place that talks to Resend. Every product
// workflow that needs to send a transactional email (co-owner invites,
// welcome, verify-email, password-reset, and anything future) should
// import `sendEmail` from here rather than calling Resend or building
// its own HTML — see 0006 Technical Standards.md's rule against
// duplicating logic across Edge Functions.
//
// sendEmail() always logs the attempt to `email_logs` (best-effort —
// a logging failure never masks a real send result, and a send failure
// is still logged). It never throws the raw Resend error message;
// callers only ever see one of the EmailErrorCode values.
//
// A row's `status: 'sent'` means "accepted by the provider," not
// "confirmed delivered" — the resend-webhook Edge Function (migration
// 0038) updates delivered_at/bounced_at/complained_at on this same row
// later, asynchronously, once Resend reports what actually happened.
// See docs/features/0020_Resend_Bounce_Delivery_Webhook_Specification_v1.md.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { renderTemplate } from './renderTemplate.ts';
import { EmailServiceError, type SendEmailParams, type SendEmailResult } from './types.ts';
import { isValidEmail, normalizeEmail } from './utils.ts';

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Wysker Watch <no-reply@wyskerwatch.com>';
// no-reply@ isn't a monitored inbox, so without this, replies to any
// transactional email bounce. support@wyskerwatch.com is a real,
// monitored mailbox as of 2026-07 — this is the default for every send;
// an individual caller can still override via SendEmailParams.replyTo.
const DEFAULT_REPLY_TO = 'support@wyskerwatch.com';

function getAdminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, serviceRoleKey);
}

interface LogFields {
  recipientEmail: string;
  templateName: string;
  status: 'sent' | 'suppressed' | 'failed';
  providerMessageId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
}

// Insert a fresh log row (the no-idempotency-key path — unchanged
// behavior from before idempotency support existed).
async function insertLog(admin: SupabaseClient, fields: LogFields): Promise<void> {
  try {
    const { error } = await admin.from('email_logs').insert({
      recipient_email: fields.recipientEmail,
      template_name: fields.templateName,
      status: fields.status,
      provider_message_id: fields.providerMessageId ?? null,
      error_code: fields.errorCode ?? null,
      error_message: fields.errorMessage ?? null,
      related_entity_type: fields.relatedEntityType ?? null,
      related_entity_id: fields.relatedEntityId ?? null,
      sent_at: fields.status === 'sent' ? new Date().toISOString() : null,
    });
    if (error) {
      // A logging failure must never surface as (or mask) a send
      // failure — log to the function's own console and move on.
      console.error('email_logs insert failed:', error.message);
    }
  } catch (err) {
    console.error('email_logs insert threw:', (err as Error).message);
  }
}

// Finalize a previously-claimed pending row (the idempotency-key path).
async function finalizeLog(admin: SupabaseClient, id: string, fields: LogFields): Promise<void> {
  try {
    const { error } = await admin
      .from('email_logs')
      .update({
        status: fields.status,
        provider_message_id: fields.providerMessageId ?? null,
        error_code: fields.errorCode ?? null,
        error_message: fields.errorMessage ?? null,
        sent_at: fields.status === 'sent' ? new Date().toISOString() : null,
      })
      .eq('id', id);
    if (error) {
      console.error('email_logs finalize update failed:', error.message);
    }
  } catch (err) {
    console.error('email_logs finalize update threw:', (err as Error).message);
  }
}

type ClaimResult =
  // A fresh reservation (new key, or retrying a previously-failed key)
  // — the caller should proceed to send and finalize this row by id.
  | { outcome: 'claimed'; logId: string }
  // The key was already used for a successful send — replay that
  // result without sending again.
  | { outcome: 'already_sent'; providerMessageId: string | null }
  // Another request with the same key is currently in flight (its row
  // is still 'pending'). Treated conservatively: never send a second
  // time for the same key just because two requests overlapped.
  | { outcome: 'in_progress' };

// Atomically reserves an idempotency_key so at most one in-flight send
// happens per key, while still allowing a legitimate retry after a
// prior failure. The single INSERT ... ON CONFLICT ... DO UPDATE ...
// WHERE is what makes this race-safe: Postgres only applies (and
// returns) the DO UPDATE branch when the WHERE condition matches the
// conflicting row, so two simultaneous callers can't both "win" a
// claim on the same key.
async function claimIdempotencyKey(
  admin: SupabaseClient,
  key: string,
  recipientEmail: string,
  templateName: string,
): Promise<ClaimResult> {
  const { data, error } = await admin.rpc('claim_email_idempotency_key', {
    p_idempotency_key: key,
    p_recipient_email: recipientEmail,
    p_template_name: templateName,
  });

  if (error) {
    // If the claim mechanism itself is unavailable, fail closed rather
    // than silently sending without any duplicate protection.
    console.error('claim_email_idempotency_key failed:', error.message);
    throw new EmailServiceError('unknown_error', 'Unable to process this request right now');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.claimed) {
    return { outcome: 'claimed', logId: row.id };
  }
  if (row?.status === 'sent') {
    return { outcome: 'already_sent', providerMessageId: row.provider_message_id ?? null };
  }
  return { outcome: 'in_progress' };
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const {
    to,
    template: templateName,
    variables,
    replyTo,
    relatedEntityType,
    relatedEntityId,
    idempotencyKey,
    sentByUserId,
  } = params;

  if (!to || !isValidEmail(to)) {
    throw new EmailServiceError('invalid_recipient', 'Recipient email is missing or not a valid email address');
  }
  const recipientEmail = normalizeEmail(to);

  const admin = getAdminClient();

  // Test/demo-account suppression and recipient-address suppression are
  // two independent lookups (one keyed on sentByUserId against profiles,
  // one keyed on recipientEmail against email_suppressions) — kicked off
  // together via Promise.all rather than one fully awaited before the
  // other starts, so a real send only pays for one network round-trip's
  // worth of latency here, not two. Both are still checked (and logged)
  // before the idempotency claim, template render, or anything
  // Resend-related — a suppressed send never gets that far.
  const suppressionQuery = admin
    .from('email_suppressions')
    .select('reason')
    .eq('email', recipientEmail)
    .is('cleared_at', null)
    .maybeSingle();

  let suppressionResult: Awaited<typeof suppressionQuery>;

  // sentByUserId is optional: a caller with no single acting user (e.g.
  // an ops/scheduled call through the send-email endpoint) just gets no
  // account-type suppression check, same as before this existed.
  if (sentByUserId) {
    const [profileResult, resolvedSuppression] = await Promise.all([
      admin.from('profiles').select('account_type').eq('id', sentByUserId).single(),
      suppressionQuery,
    ]);
    suppressionResult = resolvedSuppression;

    const senderProfile = profileResult.data;
    if (senderProfile?.account_type === 'test' || senderProfile?.account_type === 'demo') {
      await insertLog(admin, {
        recipientEmail,
        templateName,
        status: 'suppressed',
        relatedEntityType,
        relatedEntityId,
      });
      return { success: true, messageId: null, suppressed: true, suppressionReason: 'test_or_demo_account' };
    }
  } else {
    suppressionResult = await suppressionQuery;
  }

  // Recipient-address suppression: an address that previously hard-
  // bounced or was reported as spam (see migration 0038 and the
  // resend-webhook Edge Function) and hasn't since been cleared via
  // clear-email-suppression. This applies to every caller, regardless of
  // sentByUserId — a dead/complaining address is a property of the
  // recipient, not the sender. A lookup failure here fails closed (does
  // NOT proceed to send) — sending to a known-bad address is worse than
  // a delayed send, the same posture as a missing RESEND_API_KEY below.
  const { data: suppressionRow, error: suppressionError } = suppressionResult;

  if (suppressionError) {
    console.error('email_suppressions lookup failed:', suppressionError.message);
    await insertLog(admin, {
      recipientEmail,
      templateName,
      status: 'failed',
      errorCode: 'provider_error',
      errorMessage: 'Unable to verify recipient suppression status',
      relatedEntityType,
      relatedEntityId,
    });
    throw new EmailServiceError('provider_error', 'Unable to process this request right now');
  }

  if (suppressionRow) {
    await insertLog(admin, {
      recipientEmail,
      templateName,
      status: 'suppressed',
      errorMessage:
        suppressionRow.reason === 'bounced'
          ? 'recipient previously hard-bounced'
          : 'recipient previously complained',
      relatedEntityType,
      relatedEntityId,
    });
    return { success: true, messageId: null, suppressed: true, suppressionReason: 'recipient_suppressed' };
  }

  let claimedLogId: string | null = null;
  if (idempotencyKey) {
    const claim = await claimIdempotencyKey(admin, idempotencyKey, recipientEmail, templateName);
    if (claim.outcome === 'already_sent') {
      return { success: true, messageId: claim.providerMessageId };
    }
    if (claim.outcome === 'in_progress') {
      // Don't send a second time for a key that's already being
      // processed by another concurrent request; the original request
      // owns the real result.
      return { success: true, messageId: null };
    }
    claimedLogId = claim.logId;
  }

  // Rendering (missing_template / missing_variable) happens before we
  // touch the network — there's nothing worth sending Resend for a
  // request that was never going to produce a valid email. If a row
  // was already claimed, mark it failed so the key can be retried.
  let rendered;
  try {
    rendered = renderTemplate(templateName, variables);
  } catch (err) {
    if (claimedLogId) {
      await finalizeLog(admin, claimedLogId, {
        recipientEmail,
        templateName,
        status: 'failed',
        errorCode: err instanceof EmailServiceError ? err.code : 'unknown_error',
        errorMessage: err instanceof EmailServiceError ? err.message : 'Failed to render template',
      });
    }
    throw err;
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    const logFields: LogFields = {
      recipientEmail,
      templateName,
      status: 'failed',
      errorCode: 'provider_error',
      errorMessage: 'RESEND_API_KEY is not configured',
      relatedEntityType,
      relatedEntityId,
    };
    if (claimedLogId) await finalizeLog(admin, claimedLogId, logFields);
    else await insertLog(admin, logFields);
    throw new EmailServiceError('provider_error', 'Email provider is not configured');
  }

  let providerMessageId: string | null = null;
  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: recipientEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        reply_to: replyTo || DEFAULT_REPLY_TO,
      }),
    });

    if (!response.ok) {
      // Capture the provider's response for our own logs, but never
      // pass it back to the caller — only the safe error code/message.
      // Truncated: this goes to function console output, which we
      // don't want to become a dumping ground for full provider
      // payloads (which may echo back parts of the request).
      let providerDetail = '';
      try {
        providerDetail = (await response.text()).slice(0, 300);
      } catch {
        // ignore
      }
      console.error(`Resend send failed (${response.status}):`, providerDetail);

      const logFields: LogFields = {
        recipientEmail,
        templateName,
        status: 'failed',
        errorCode: 'provider_error',
        errorMessage: `Resend responded with status ${response.status}`,
        relatedEntityType,
        relatedEntityId,
      };
      if (claimedLogId) await finalizeLog(admin, claimedLogId, logFields);
      else await insertLog(admin, logFields);
      throw new EmailServiceError('provider_error', 'The email provider was unable to send this message');
    }

    const body = await response.json();
    providerMessageId = body?.id ?? null;
  } catch (err) {
    if (err instanceof EmailServiceError) throw err;

    console.error('Resend request threw:', (err as Error).message);
    const logFields: LogFields = {
      recipientEmail,
      templateName,
      status: 'failed',
      errorCode: 'provider_error',
      errorMessage: 'Email provider request failed',
      relatedEntityType,
      relatedEntityId,
    };
    if (claimedLogId) await finalizeLog(admin, claimedLogId, logFields);
    else await insertLog(admin, logFields);
    throw new EmailServiceError('provider_error', 'The email provider was unable to send this message');
  }

  const successFields: LogFields = {
    recipientEmail,
    templateName,
    status: 'sent',
    providerMessageId,
    relatedEntityType,
    relatedEntityId,
  };
  if (claimedLogId) await finalizeLog(admin, claimedLogId, successFields);
  else await insertLog(admin, successFields);

  return { success: true, messageId: providerMessageId };
}
