import { renderButton, renderLinkFallback, renderParagraph } from '../layout.ts';
import type { EmailTemplate } from '../types.ts';

const template: EmailTemplate = {
  name: 'password-reset',
  subject: 'Reset your Wysker Watch password',
  previewText: 'Use this secure link to reset your password.',
  requiredVariables: ['reset_url'],
  urlVariables: ['reset_url'],

  html: (vars) => `
    ${renderParagraph('We received a request to reset your Wysker Watch password.')}
    ${renderButton(vars.reset_url, 'Reset password')}
    ${renderLinkFallback(vars.reset_url)}
    ${renderParagraph('If you did not request this, you can ignore this email.')}
    ${renderParagraph('The Wysker Watch Team')}
  `,

  text: (vars) => `We received a request to reset your Wysker Watch password.

Reset password:
${vars.reset_url}

If you did not request this, you can ignore this email.

The Wysker Watch Team`,
};

export default template;
