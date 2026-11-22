import { renderButton, renderLinkFallback, renderParagraph } from '../layout.ts';
import type { EmailTemplate } from '../types.ts';

// Sent by invite-sitter when the invited address already has a Wysker Watch
// account (spec 0077, PA-36). The pending pet_sitter_access row links to
// their account the next time they sign in (claim_pending_sitter_invites);
// the pets show up from the day before the sit starts (pet_sit_is_open,
// migration 0057). Copy approved by Lynn 2026-11-22.
const template: EmailTemplate = {
  name: 'sitter-added',
  subject: '{{owner_name}} invited you to pet sit for {{pet_names}} in Wysker Watch',
  previewText: "You're pet sitting for {{pet_names}} from {{start_date}} to {{end_date}}.",
  requiredVariables: ['owner_name', 'pet_names', 'start_date', 'end_date', 'signin_url'],
  urlVariables: ['signin_url'],

  html: (vars) => `
    ${renderParagraph('Hi,')}
    ${renderParagraph(`${vars.owner_name} invited you to help care for ${vars.pet_names} while pet sitting from ${vars.start_date} to ${vars.end_date}. Sign in to Wysker Watch to see their care details. They'll show up from the day before the sit starts.`)}
    ${renderButton(vars.signin_url, 'Sign in to Wysker Watch')}
    ${renderLinkFallback(vars.signin_url)}
    ${renderParagraph("If you weren't expecting this, you can safely ignore this email.")}
    ${renderParagraph('The Wysker Watch Team')}
  `,

  text: (vars) => `Hi,

${vars.owner_name} invited you to help care for ${vars.pet_names} while pet sitting from ${vars.start_date} to ${vars.end_date}. Sign in to Wysker Watch to see their care details. They'll show up from the day before the sit starts.

Sign in to Wysker Watch:
${vars.signin_url}

If you weren't expecting this, you can safely ignore this email.

The Wysker Watch Team`,
};

export default template;
