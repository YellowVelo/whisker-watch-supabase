// Template registry. Adding a new template = add the file above and
// register it here — renderTemplate.ts and sendEmail.ts never need to
// change.
//
// Uses a Map rather than a plain object: a plain object literal's keys
// are looked up against Object.prototype too, so `templates['__proto__']`
// or `templates['constructor']` would resolve to a truthy built-in
// value instead of undefined for an unregistered name, bypassing the
// "unknown template" check in renderTemplate.ts. A Map has no such
// inherited keys, so an unrecognized name always misses cleanly.

import type { EmailTemplate } from '../types.ts';
import coOwnerInvitation from './co-owner-invitation.ts';
import welcome from './welcome.ts';
import verifyEmail from './verify-email.ts';
import passwordReset from './password-reset.ts';

export const templates: Map<string, EmailTemplate> = new Map([
  [coOwnerInvitation.name, coOwnerInvitation],
  [welcome.name, welcome],
  [verifyEmail.name, verifyEmail],
  [passwordReset.name, passwordReset],
]);
