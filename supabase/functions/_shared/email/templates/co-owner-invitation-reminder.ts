import { renderButton, renderLinkFallback, renderParagraph } from '../layout.ts';
import type { EmailTemplate } from '../types.ts';

// Used instead of co-owner-invitation when invite-co-owner/index.ts is
// re-inviting someone who was invited before but never finished
// accepting (see email_has_password() in migration 0020 and the Edge
// Function's header comment for why that case exists and how it's
// detected). Same structure and non-committal expiry wording as
// co-owner-invitation.ts — just framed as a reminder rather than a
// first-time ask, so it doesn't read as a duplicate/confusing invite.
const template: EmailTemplate = {
  name: 'co-owner-invitation-reminder',
  subject: '{{owner_name}} is still hoping you\'ll help care for {{pet_name}} in Wysker Watch',
  previewText: 'Your invitation to help care for {{pet_name}} is still waiting.',
  requiredVariables: ['owner_name', 'pet_name', 'accept_url'],
  urlVariables: ['accept_url'],

  html: (vars) => `
    ${renderParagraph('Hi,')}
    ${renderParagraph(`Just a reminder — ${vars.owner_name} invited you to become a co-owner for ${vars.pet_name} in Wysker Watch, but the invitation hasn't been accepted yet.`)}
    ${renderParagraph(`As a co-owner, you will be able to help track daily check-ins, view trends, manage care information, and support ${vars.pet_name}'s health story.`)}
    ${renderButton(vars.accept_url, 'Accept invitation')}
    ${renderLinkFallback(vars.accept_url)}
    ${renderParagraph('This invitation link will expire soon, so please accept it promptly.')}
    ${renderParagraph('If you were not expecting this invitation, you can safely ignore this email.')}
    ${renderParagraph('The Wysker Watch Team')}
  `,

  text: (vars) => `Just a reminder — ${vars.owner_name} invited you to become a co-owner for ${vars.pet_name} in Wysker Watch, but the invitation hasn't been accepted yet.

Accept your invitation:
${vars.accept_url}

This invitation link will expire soon, so please accept it promptly.

If you were not expecting this invitation, you can safely ignore this email.

The Wysker Watch Team`,
};

export default template;
