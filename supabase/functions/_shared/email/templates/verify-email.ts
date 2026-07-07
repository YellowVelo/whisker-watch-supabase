import { renderButton, renderLinkFallback, renderParagraph } from '../layout.ts';
import type { EmailTemplate } from '../types.ts';

const template: EmailTemplate = {
  name: 'verify-email',
  subject: 'Verify your Wysker Watch email',
  previewText: 'Confirm your email address to finish setting up your account.',
  requiredVariables: ['verify_url'],
  urlVariables: ['verify_url'],

  html: (vars) => `
    ${renderParagraph('Please verify your email address to finish setting up your Wysker Watch account.')}
    ${renderButton(vars.verify_url, 'Verify email')}
    ${renderLinkFallback(vars.verify_url)}
    ${renderParagraph('If you did not create this account, you can ignore this email.')}
    ${renderParagraph('The Wysker Watch Team')}
  `,

  text: (vars) => `Please verify your email address to finish setting up your Wysker Watch account.

Verify email:
${vars.verify_url}

If you did not create this account, you can ignore this email.

The Wysker Watch Team`,
};

export default template;
