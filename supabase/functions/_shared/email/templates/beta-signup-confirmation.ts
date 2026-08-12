import { renderParagraph } from '../layout.ts';
import type { EmailTemplate } from '../types.ts';

// Confirmation email for the public /beta landing page (spec 0053). Copy
// approved verbatim by Lynn — do not paraphrase or "improve" it, this is
// meant to read as a personal note, not a templated one. Deliberately no
// mention of the Vibe/check-in model or any other internal mechanics,
// same as the landing page and screener it follows.
const template: EmailTemplate = {
  name: 'beta-signup-confirmation',
  subject: "You're on the list — Wysker Watch early access",
  previewText: 'Your spot on the waitlist is confirmed.',
  requiredVariables: [],
  // No account exists for this flow (it's a pre-auth capture, not a real
  // Wysker Watch signup) — layout.ts's default footer ("activity on your
  // Wysker Watch account") would be factually wrong here.
  footerText: "You're receiving this email because you signed up for early access to Wysker Watch at wyskerwatch.com/beta. If this wasn't you, you can safely ignore it.",

  html: () => `
    ${renderParagraph('Hi there,')}
    ${renderParagraph('Thanks for signing up for early access to Wysker Watch. Your spot on the waitlist is confirmed.')}
    ${renderParagraph("Here's what happens next: I'm personally reviewing signups and reaching out to a small group for our first round of testing. If you're a good fit, you'll hear from me directly with access details &mdash; no automated links, just a real email from a real person.")}
    ${renderParagraph("In the meantime, if anything changes (like your pet's situation, or you'd rather not be contacted), just reply to this email and let me know.")}
    ${renderParagraph("Thanks for your interest in what we're building.")}
    ${renderParagraph('&mdash; Lynn<br />Wysker Watch')}
  `,

  text: () => `Hi there,

Thanks for signing up for early access to Wysker Watch. Your spot on the waitlist is confirmed.

Here's what happens next: I'm personally reviewing signups and reaching out to a small group for our first round of testing. If you're a good fit, you'll hear from me directly with access details — no automated links, just a real email from a real person.

In the meantime, if anything changes (like your pet's situation, or you'd rather not be contacted), just reply to this email and let me know.

Thanks for your interest in what we're building.

— Lynn
Wysker Watch`,
};

export default template;
