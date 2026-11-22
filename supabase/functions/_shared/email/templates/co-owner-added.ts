import { renderButton, renderLinkFallback, renderParagraph } from '../layout.ts';
import type { EmailTemplate } from '../types.ts';

// Sent by invite-co-owner when the invited address already has a Wysker
// Watch account (spec 0077, PA-36). They don't need an invite link: the
// pending pet_co_owners row links to their account the next time they sign
// in (claim_pending_co_owner_invites, called from AuthContext.jsx). Sending
// this instead of nothing also means the inviter's reply is the same
// whether or not the address has an account (PA-10). Copy approved by Lynn
// 2026-11-22.
const template: EmailTemplate = {
  name: 'co-owner-added',
  subject: '{{owner_name}} added you as a co-owner for {{pet_name}} in Wysker Watch',
  previewText: '{{pet_name}} is now in your Wysker Watch account.',
  requiredVariables: ['owner_name', 'pet_name', 'signin_url'],
  urlVariables: ['signin_url'],

  html: (vars) => `
    ${renderParagraph('Hi,')}
    ${renderParagraph(`${vars.owner_name} added you as a co-owner for ${vars.pet_name} in Wysker Watch. Sign in to see ${vars.pet_name}'s profile and help with daily check-ins, trends and care information.`)}
    ${renderButton(vars.signin_url, 'Sign in to Wysker Watch')}
    ${renderLinkFallback(vars.signin_url)}
    ${renderParagraph("If you weren't expecting this, you can safely ignore this email.")}
    ${renderParagraph('The Wysker Watch Team')}
  `,

  text: (vars) => `Hi,

${vars.owner_name} added you as a co-owner for ${vars.pet_name} in Wysker Watch. Sign in to see ${vars.pet_name}'s profile and help with daily check-ins, trends and care information.

Sign in to Wysker Watch:
${vars.signin_url}

If you weren't expecting this, you can safely ignore this email.

The Wysker Watch Team`,
};

export default template;
