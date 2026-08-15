import { renderParagraph } from '../layout.ts';
import type { EmailTemplate } from '../types.ts';

// Confirmation email for the public /early-adopters page (spec 0056).
// Distinct from beta-signup-confirmation.ts: this list is NOT being
// invited to test a rough Alpha app — they're told they'll get an invite
// once the real (PWA) app is ready to sign up for. Deliberately no
// mention of the Vibe/check-in model or any other internal mechanics,
// same rule the beta confirmation follows.
const template: EmailTemplate = {
  name: 'early-adopter-confirmation',
  subject: "You're on the list — Wysker Watch Early Adopters",
  previewText: "You'll hear from us when it's ready.",
  requiredVariables: [],
  // No account exists for this flow (pre-auth capture, not a real Wysker
  // Watch signup) — layout.ts's default footer would be factually wrong.
  footerText: "You're receiving this email because you signed up as an Early Adopter at wyskerwatch.com/early-adopters. If this wasn't you, you can safely ignore it.",

  html: () => `
    ${renderParagraph('Hi there,')}
    ${renderParagraph("Thanks for signing up as a Wysker Watch Early Adopter. You're on the list.")}
    ${renderParagraph("Here's what happens next: we're finishing up the app, and the moment it's ready for real sign-ups, you'll get an email with an invite to join &mdash; no automated countdown, just a real email when it's actually ready.")}
    ${renderParagraph("In the meantime, if you'd rather not be contacted, just reply to this email and let me know.")}
    ${renderParagraph("Thanks for your interest in what we're building.")}
    ${renderParagraph('&mdash; Lynn<br />Wysker Watch')}
  `,

  text: () => `Hi there,

Thanks for signing up as a Wysker Watch Early Adopter. You're on the list.

Here's what happens next: we're finishing up the app, and the moment it's ready for real sign-ups, you'll get an email with an invite to join — no automated countdown, just a real email when it's actually ready.

In the meantime, if you'd rather not be contacted, just reply to this email and let me know.

Thanks for your interest in what we're building.

— Lynn
Wysker Watch`,
};

export default template;
