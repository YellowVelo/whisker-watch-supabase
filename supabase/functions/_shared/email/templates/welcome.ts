import { renderButton, renderLinkFallback, renderParagraph } from '../layout.ts';
import type { EmailTemplate } from '../types.ts';

const template: EmailTemplate = {
  name: 'welcome',
  subject: 'Welcome to Wysker Watch',
  previewText: "Start building your pet's health story.",
  requiredVariables: ['first_name', 'app_url'],
  urlVariables: ['app_url'],

  html: (vars) => `
    ${renderParagraph(`Hi ${vars.first_name},`)}
    ${renderParagraph('Welcome to Wysker Watch.')}
    ${renderParagraph('You can now add your pets, complete their profiles, and begin tracking daily changes.')}
    ${renderButton(vars.app_url, 'Open Wysker Watch')}
    ${renderLinkFallback(vars.app_url)}
    ${renderParagraph('The Wysker Watch Team')}
  `,

  text: (vars) => `Hi ${vars.first_name},

Welcome to Wysker Watch.

You can now add your pets, complete their profiles, and begin tracking daily changes.

Open Wysker Watch:
${vars.app_url}

The Wysker Watch Team`,
};

export default template;
