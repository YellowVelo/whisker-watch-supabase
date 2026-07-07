// Shared template renderer.
//
// Looks up a template by name, validates its required variables, and
// produces the final subject / HTML / plain text / preview text. This
// is the only place that knows how to turn a template + variables into
// sendable content — sendEmail.ts just calls this and hands the result
// to Resend.

import { renderLayout } from './layout.ts';
import { templates } from './templates/index.ts';
import { EmailServiceError } from './types.ts';
import { escapeHtml, isSafeEmailUrl, replaceVariables } from './utils.ts';

export interface RenderedEmail {
  subject: string;
  previewText: string;
  html: string;
  text: string;
}

export function renderTemplate(templateName: string, variables: Record<string, string>): RenderedEmail {
  const template = templates.get(templateName);
  if (!template) {
    throw new EmailServiceError('missing_template', `Unknown email template: "${templateName}"`);
  }

  const urlVariableNames = new Set(template.urlVariables ?? []);

  // Every required variable must be present and non-empty.
  for (const key of template.requiredVariables) {
    const value = variables[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new EmailServiceError('missing_variable', `Missing required variable "${key}" for template "${templateName}"`);
    }
    if (urlVariableNames.has(key) && !isSafeEmailUrl(String(value))) {
      throw new EmailServiceError('missing_variable', `Variable "${key}" for template "${templateName}" must be a valid https URL on an allowed Wysker Watch domain`);
    }
  }

  // URL variables are inserted as-is (already validated above). Every
  // other variable is HTML-escaped before being handed to the
  // template's html() renderer, so user-provided values (owner_name,
  // pet_name, first_name, ...) can never break out of the markup.
  const htmlVars: Record<string, string> = {};
  const textVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    const stringValue = value == null ? '' : String(value);
    textVars[key] = stringValue;
    htmlVars[key] = urlVariableNames.has(key) ? stringValue : escapeHtml(stringValue);
  }

  const subject = replaceVariables(template.subject, textVars);
  const previewText = replaceVariables(template.previewText, textVars);
  const bodyHtml = template.html(htmlVars);
  const html = renderLayout({ previewText, bodyHtml });
  const text = template.text(textVars);

  return { subject, previewText, html, text };
}
