import { renderButton, renderLinkFallback, renderParagraph } from '../layout.ts';
import type { EmailTemplate } from '../types.ts';

// Deliberately kept simple: owner, pet(s), sit dates, and the accept
// link only — no daily task/checklist detail. That level of detail is
// an in-app concern once the sitter is logged in, per product decision
// (see requirements-sitter-invite-email.md).
//
// Same non-committal expiry wording as co-owner-invitation.ts, for the
// same reason: the real expiry is governed by the Supabase project's
// own Auth settings, which isn't readable from an Edge Function.
const template: EmailTemplate = {
  name: 'sitter-invitation',
  subject: '{{owner_name}} invited you to help care for {{pet_names}} in Wysker Watch',
  previewText: 'Accept your invitation to help care for {{pet_names}}.',
  requiredVariables: ['owner_name', 'pet_names', 'start_date', 'end_date', 'accept_url'],
  urlVariables: ['accept_url'],

  html: (vars) => `
    ${renderParagraph('Hi,')}
    ${renderParagraph(`${vars.owner_name} invited you to help care for ${vars.pet_names} in Wysker Watch while pet sitting from ${vars.start_date} to ${vars.end_date}.`)}
    ${renderParagraph('Accept the invitation to see care details and log visits during the sit.')}
    ${renderButton(vars.accept_url, 'Accept invitation')}
    ${renderLinkFallback(vars.accept_url)}
    ${renderParagraph('This invitation link will expire soon, so please accept it promptly.')}
    ${renderParagraph('If you were not expecting this invitation, you can safely ignore this email.')}
    ${renderParagraph('The Wysker Watch Team')}
  `,

  text: (vars) => `${vars.owner_name} invited you to help care for ${vars.pet_names} in Wysker Watch while pet sitting from ${vars.start_date} to ${vars.end_date}.

Accept your invitation:
${vars.accept_url}

This invitation link will expire soon, so please accept it promptly.

If you were not expecting this invitation, you can safely ignore this email.

The Wysker Watch Team`,
};

export default template;
