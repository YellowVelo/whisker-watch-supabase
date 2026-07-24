import { renderButton, renderLinkFallback, renderParagraph } from '../layout.ts';
import type { EmailTemplate } from '../types.ts';

// Used instead of sitter-invitation when invite-sitter/index.ts is
// re-inviting someone who was invited before but never finished
// accepting (mirrors co-owner-invitation-reminder.ts's same distinction
// for co-owner invites — see email_has_password() in migration 0020).
const template: EmailTemplate = {
  name: 'sitter-invitation-reminder',
  subject: '{{owner_name}} is still hoping you\'ll help care for {{pet_names}} in Wysker Watch',
  previewText: 'Your invitation to help care for {{pet_names}} is still waiting.',
  requiredVariables: ['owner_name', 'pet_names', 'start_date', 'end_date', 'accept_url'],
  urlVariables: ['accept_url'],

  html: (vars) => `
    ${renderParagraph('Hi,')}
    ${renderParagraph(`Just a reminder — ${vars.owner_name} invited you to help care for ${vars.pet_names} in Wysker Watch while pet sitting from ${vars.start_date} to ${vars.end_date}, but the invitation hasn't been accepted yet.`)}
    ${renderParagraph('Accept the invitation to see care details and log visits during the sit.')}
    ${renderButton(vars.accept_url, 'Accept invitation')}
    ${renderLinkFallback(vars.accept_url)}
    ${renderParagraph('This invitation link will expire soon, so please accept it promptly.')}
    ${renderParagraph('If you were not expecting this invitation, you can safely ignore this email.')}
    ${renderParagraph('The Wysker Watch Team')}
  `,

  text: (vars) => `Just a reminder — ${vars.owner_name} invited you to help care for ${vars.pet_names} in Wysker Watch while pet sitting from ${vars.start_date} to ${vars.end_date}, but the invitation hasn't been accepted yet.

Accept your invitation:
${vars.accept_url}

This invitation link will expire soon, so please accept it promptly.

If you were not expecting this invitation, you can safely ignore this email.

The Wysker Watch Team`,
};

export default template;
