import { renderButton, renderLinkFallback, renderParagraph } from '../layout.ts';
import type { EmailTemplate } from '../types.ts';

// Note: this template deliberately does NOT claim a specific expiration
// date/time. The invite link's real expiry is governed by the Supabase
// project's own Auth settings (Mailer OTP Expiry), which isn't readable
// from an Edge Function — a computed "expires on <date>" here would be a
// value with no way to stay in sync with that setting, silently going
// stale (in either direction) if the dashboard setting ever changes.
// Non-committal wording avoids asserting something we can't guarantee.
const template: EmailTemplate = {
  name: 'co-owner-invitation',
  subject: '{{owner_name}} invited you to help care for {{pet_name}} in Wysker Watch',
  previewText: 'Accept your invitation to help care for {{pet_name}}.',
  requiredVariables: ['owner_name', 'pet_name', 'accept_url'],
  urlVariables: ['accept_url'],

  html: (vars) => `
    ${renderParagraph('Hi,')}
    ${renderParagraph(`${vars.owner_name} invited you to become a co-owner for ${vars.pet_name} in Wysker Watch.`)}
    ${renderParagraph(`As a co-owner, you will be able to help track daily check-ins, view trends, manage care information, and support ${vars.pet_name}'s health story.`)}
    ${renderButton(vars.accept_url, 'Accept invitation')}
    ${renderLinkFallback(vars.accept_url)}
    ${renderParagraph('This invitation link will expire soon, so please accept it promptly.')}
    ${renderParagraph('If you were not expecting this invitation, you can safely ignore this email.')}
    ${renderParagraph('The Wysker Watch Team')}
  `,

  text: (vars) => `${vars.owner_name} invited you to become a co-owner for ${vars.pet_name} in Wysker Watch.

Accept your invitation:
${vars.accept_url}

This invitation link will expire soon, so please accept it promptly.

If you were not expecting this invitation, you can safely ignore this email.

The Wysker Watch Team`,
};

export default template;
