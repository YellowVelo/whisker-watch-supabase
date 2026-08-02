// Shared section-lookup helper for legal-document content files (Terms of
// Service, Privacy Policy) — both look up a section by id the same way, so
// they share this one copy instead of each defining it.

export function getLegalSection(sections, lastUpdatedSection, sectionId) {
  if (sectionId === lastUpdatedSection.id) return lastUpdatedSection;
  return sections.find((s) => s.id === sectionId) ?? null;
}
