import { renderButton, renderLinkFallback, renderParagraph } from '../layout.ts';
import type { EmailTemplate } from '../types.ts';

const template: EmailTemplate = {
  name: 'co-owner-invitation',
  subject: '{{owner_name}} invited you to help care for {{pet_name}} in Wysker Watch',
  previewText: 'Accept your invitation to help care for {{pet_name}}.',
  requiredVariables: ['owner_name', 'pet_name', 'accept_url', 'expiration_date'],
  urlVariables: ['accept_url'],

  html: (vars) => `
    ${renderParagraph('Hi,')}
    ${renderParagraph(`${vars.owner_name} invited you to become a co-owner for ${vars.pet_name} in Wysker Watch.`)}
    ${renderParagraph(`As a co-owner, you will be able to help track daily check-ins, view trends, manage care information, and support ${vars.pet_name}'s health story.`)}
    ${renderButton(vars.accept_url, 'Accept invitation')}
    ${renderLinkFallback(vars.accept_url)}
    ${renderParagraph(`This invitation expires on ${vars.expiration_date}.`)}
    ${renderParagraph('If you were not expecting this invitation, you can safely ignore this email.')}
    ${renderParagraph('The Wysker Watch Team')}
  `,

  text: (vars) => `${vars.owner_name} invited you to become a co-owner for ${vars.pet_name} in Wysker Watch.

Accept your invitation:
${vars.accept_url}

This invitation expires on ${vars.expiration_date}.

If you were not expecting this invitation, you can safely ignore this email.

The Wysker Watch Team`,
};

export default template;
