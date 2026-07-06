// User Profile & Timezone Settings V1 — name display helpers.
// Full Name = First Name + Last Name; falls back to email when neither
// name part is present (spec: "Missing name" empty state).

export function buildFullName(firstName, lastName) {
  return [firstName, lastName].filter((part) => part && part.trim()).join(' ').trim();
}

export function getDisplayName(profile) {
  const fullName = buildFullName(profile?.first_name, profile?.last_name);
  return fullName || profile?.email || '';
}
