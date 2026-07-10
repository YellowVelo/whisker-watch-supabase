// Structured content for the Privacy Policy screen (Menu -> Privacy),
// sourced from privacy-policy.md. Kept as data rather than rendering the
// markdown file directly so the list screen and detail screens can share
// one source of truth for titles/subtitles/icons/body content.

export const PRIVACY_POLICY_LAST_UPDATED = 'June 30, 2026';

export const PRIVACY_POLICY_SECTIONS = [
  {
    id: 'information-we-collect',
    title: 'Information we collect',
    subtitle: 'Learn about the information we collect and how you provide it.',
    icon: 'User',
    body: [
      { type: 'paragraph', text: 'We collect the following types of information:' },
      {
        type: 'bullets',
        items: [
          { label: 'Account information', text: "When you create an account, we collect your email address and the password you set (your password is never stored in plain text — it is securely hashed by our authentication provider)." },
          { label: 'Pet health information you enter', text: "This includes your pets' names, breeds, birth dates, photos, medical conditions, medications, vaccination records, bloodwork results, food logs, and symptom logs — anything you choose to record in the App." },
          { label: 'Photos and documents you upload', text: 'This includes pet profile photos and photos or PDFs of vaccine records or lab reports that you scan for the AI document-extraction feature.' },
          { label: 'Information about sharing', text: 'If you invite another person to co-own a pet’s profile or to be a pet sitter, we collect the email address you provide for that invitation.' },
          { label: 'AI feature usage', text: "If you use the App's AI chat or document-scanning features, the content you submit (your questions, or the photos/documents you upload) is sent to Anthropic's Claude API to generate a response. We do not separately store a transcript of this beyond what's needed for the AI service to process your request." },
        ],
      },
      { type: 'subheading', text: 'What we do not collect' },
      { type: 'paragraph', text: 'We do not use third-party advertising or analytics services. We do not sell, rent, or share your personal information with advertisers. We do not track you across other apps or websites.' },
    ],
  },
  {
    id: 'how-we-use-your-information',
    title: 'How we use your information',
    subtitle: 'How we use your data to provide and improve the app.',
    icon: 'ShieldCheck',
    body: [
      { type: 'paragraph', text: 'We use the information described above only to:' },
      {
        type: 'bullets',
        items: [
          { text: "Provide the core functionality of the App (storing and displaying your pets' health records)" },
          { text: 'Power the AI features you choose to use (chat assistance and document scanning)' },
          { text: 'Enable sharing features you choose to use (co-owner and pet sitter access)' },
          { text: 'Generate exportable reports (such as vet visit summaries) at your request' },
        ],
      },
    ],
  },
  {
    id: 'who-can-see-your-data',
    title: 'Who can see your data',
    subtitle: 'Understand who has access to your information and how sharing works.',
    icon: 'Users',
    body: [
      { type: 'paragraph', text: 'By default, only you can see your pets’ data. If you invite a co-owner, that person will have full access to the pets you share with them, equivalent to your own access. If you invite a pet sitter, that person will have limited access to the specific pet-sitting period and pets you grant them.' },
    ],
  },
  {
    id: 'third-party-services',
    title: 'Third-party services',
    subtitle: 'The trusted services we use to run Wysker Watch.',
    icon: 'Server',
    body: [
      {
        type: 'bullets',
        items: [
          { label: 'Supabase', text: 'Database, authentication, and file storage hosting. Supabase stores your account information, pet health records, and uploaded photos/documents on our behalf. You can review Supabase’s own privacy and security practices at', link: { href: 'https://supabase.com/privacy', text: 'supabase.com/privacy' } },
          { label: 'Anthropic', text: 'AI features, via the Claude API. When you use the AI chat or document-scanning features, the relevant content is sent to Anthropic to generate a response. You can review Anthropic’s privacy practices at', link: { href: 'https://www.anthropic.com/privacy', text: 'anthropic.com/privacy' } },
        ],
      },
      { type: 'paragraph', text: 'We do not use any other third-party services to process your personal data.' },
    ],
  },
  {
    id: 'data-retention-and-deletion',
    title: 'Data retention and deletion',
    subtitle: 'How long we keep your data and how you can delete it.',
    icon: 'Trash2',
    body: [
      { type: 'paragraph', text: 'Your data is retained for as long as your account remains active. You can delete individual records (pets, logs, medications, etc.) at any time within the App. You can also permanently delete your account and all associated data at any time using the Delete Account option in Settings.' },
    ],
  },
  {
    id: 'childrens-privacy',
    title: 'Children’s privacy',
    subtitle: 'Our policy for children under 13.',
    icon: 'UsersRound',
    body: [
      { type: 'paragraph', text: 'Wysker Watch is not directed at children under 13, and we do not knowingly collect personal information from children under 13.' },
    ],
  },
  {
    id: 'changes-to-this-policy',
    title: 'Changes to this policy',
    subtitle: 'How we will notify you of changes.',
    icon: 'FileText',
    body: [
      { type: 'paragraph', text: 'We may update this Privacy Policy from time to time. If we make material changes, we will update the "Last updated" date above. Continued use of the App after changes are posted constitutes acceptance of the updated policy.' },
    ],
  },
  {
    id: 'contact-us',
    title: 'Contact us',
    subtitle: 'How to reach us with questions.',
    icon: 'Mail',
    body: [
      { type: 'paragraph', text: 'Wysker Watch is developed and maintained independently. If you have questions about this Privacy Policy or your data, please contact us at:' },
      { type: 'link', href: 'mailto:support@wyskerwatch.com', text: 'support@wyskerwatch.com' },
    ],
  },
];

// Destination for the list screen's "Last updated" row. Kept separate from
// PRIVACY_POLICY_SECTIONS so it doesn't also render as a ninth row in that
// list — it's reached only by tapping the "Last updated" row itself.
export const PRIVACY_POLICY_LAST_UPDATED_SECTION = {
  id: 'last-updated',
  title: 'Last updated',
  body: [
    { type: 'paragraph', text: `This Privacy Policy was last updated on ${PRIVACY_POLICY_LAST_UPDATED}.` },
  ],
};

export function getPrivacyPolicySection(sectionId) {
  if (sectionId === PRIVACY_POLICY_LAST_UPDATED_SECTION.id) return PRIVACY_POLICY_LAST_UPDATED_SECTION;
  return PRIVACY_POLICY_SECTIONS.find((s) => s.id === sectionId) ?? null;
}
