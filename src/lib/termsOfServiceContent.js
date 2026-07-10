// Structured content for the Terms of Service screen (Menu -> Terms of
// Service), sourced from terms-of-service.md. Kept as data rather than
// rendering the markdown file directly so the list screen and detail
// screens can share one source of truth for titles/subtitles/icons/body
// content — mirrors src/lib/privacyPolicyContent.js exactly.

export const TOS_LAST_UPDATED = 'July 10, 2026';

export const TOS_SECTIONS = [
  {
    id: 'about-the-service',
    title: 'About the service',
    subtitle: 'Who can use Wysker Watch and what it does.',
    icon: 'Info',
    body: [
      { type: 'paragraph', text: 'By creating an account or using the Service, you agree to be bound by these Terms. If you do not agree, you may not use the Service.' },
      { type: 'subheading', text: 'Eligibility' },
      { type: 'paragraph', text: 'You must:' },
      {
        type: 'bullets',
        items: [
          { text: 'be at least 18 years of age;' },
          { text: 'reside within the United States;' },
          { text: 'have the legal authority to enter into this agreement; and' },
          { text: 'comply with all applicable laws while using the Service.' },
        ],
      },
      { type: 'paragraph', text: 'The Service is intended for use only within the United States.' },
      { type: 'subheading', text: 'About Wysker Watch' },
      { type: 'paragraph', text: "Wysker Watch is a pet health management platform designed to help pet owners organize health information, record daily observations, identify trends over time, and prepare for conversations with veterinary professionals." },
      { type: 'paragraph', text: 'The Service may allow users to:' },
      {
        type: 'bullets',
        items: [
          { text: 'create pet profiles;' },
          { text: 'record daily observations;' },
          { text: 'track medications;' },
          { text: 'maintain vaccination records;' },
          { text: 'store health records and laboratory results;' },
          { text: 'monitor wellness trends;' },
          { text: 'receive AI-generated summaries and educational information;' },
          { text: 'generate veterinary reports; and' },
          { text: "organize a pet's health history." },
        ],
      },
      { type: 'paragraph', text: 'Wysker Watch is intended to support pet owners—not replace veterinary professionals.' },
    ],
  },
  {
    id: 'not-a-veterinary-service',
    title: 'Not a veterinary service',
    subtitle: 'What we don’t provide, and what to do in an emergency.',
    icon: 'Stethoscope',
    body: [
      { type: 'subheading', text: 'No veterinary or medical services' },
      { type: 'paragraph', text: 'Wysker Watch is not a veterinary practice. We do not provide:' },
      {
        type: 'bullets',
        items: [
          { text: 'veterinary medicine;' },
          { text: 'diagnosis;' },
          { text: 'treatment;' },
          { text: 'prescriptions;' },
          { text: 'emergency services;' },
          { text: 'telemedicine; or' },
          { text: 'professional veterinary advice.' },
        ],
      },
      { type: 'paragraph', text: 'Nothing within the Service should be interpreted as veterinary, medical, or emergency guidance. Always consult a licensed veterinarian regarding your pet’s health.' },
      { type: 'subheading', text: 'Emergency situations' },
      { type: 'paragraph', text: 'The Service must never be relied upon during a veterinary emergency. If your pet is experiencing:' },
      {
        type: 'bullets',
        items: [
          { text: 'difficulty breathing;' },
          { text: 'collapse;' },
          { text: 'seizures;' },
          { text: 'suspected poisoning;' },
          { text: 'uncontrolled bleeding;' },
          { text: 'inability to urinate;' },
          { text: 'severe trauma; or' },
          { text: 'any other medical emergency,' },
        ],
      },
      { type: 'paragraph', text: 'immediately contact your veterinarian or the nearest emergency veterinary hospital. The Service is not monitored in real time and cannot respond to emergencies.' },
    ],
  },
  {
    id: 'ai-assisted-features',
    title: 'AI-assisted features',
    subtitle: 'How AI-generated content works and its limits.',
    icon: 'Sparkles',
    body: [
      { type: 'paragraph', text: 'Certain features within Wysker Watch use artificial intelligence ("AI") to summarize information, identify trends, explain observations, and assist users in understanding recorded information.' },
      { type: 'paragraph', text: 'AI-generated content is provided for informational and educational purposes only. AI responses:' },
      {
        type: 'bullets',
        items: [
          { text: 'are generated automatically;' },
          { text: 'may be incomplete or inaccurate;' },
          { text: 'may misunderstand uploaded information;' },
          { text: 'should not be considered factual without verification;' },
          { text: 'are not veterinary advice;' },
          { text: 'are not diagnoses;' },
          { text: 'are not treatment recommendations.' },
        ],
      },
      { type: 'paragraph', text: 'Users remain solely responsible for decisions regarding their pets. Always consult a licensed veterinarian before making healthcare decisions.' },
      { type: 'subheading', text: 'Owner observations' },
      { type: 'paragraph', text: 'Wysker Watch records and organizes owner observations. It does not independently verify, diagnose, or determine a pet’s medical condition. Observations entered into the Service reflect information supplied by users and may not accurately represent a pet’s actual health.' },
    ],
  },
  {
    id: 'your-account-and-information',
    title: 'Your account & information',
    subtitle: 'Your responsibilities for your account and pet data.',
    icon: 'User',
    body: [
      { type: 'subheading', text: 'User accounts' },
      { type: 'paragraph', text: 'You are responsible for maintaining the confidentiality of your account credentials and all activity occurring under your account.' },
      { type: 'subheading', text: 'Pet information' },
      { type: 'paragraph', text: 'You are responsible for the accuracy of all information entered into Wysker Watch. Wysker Watch does not verify user-submitted information.' },
      { type: 'subheading', text: 'Veterinary reports and PDF exports' },
      { type: 'paragraph', text: 'Generated PDF reports summarize information recorded by users and are intended to support conversations with veterinary professionals. They are not official medical records and cannot be modified within the Service after creation.' },
    ],
  },
  {
    id: 'content-and-acceptable-use',
    title: 'Content & acceptable use',
    subtitle: 'Ownership of your content and rules for using the Service.',
    icon: 'FileText',
    body: [
      { type: 'subheading', text: 'User content' },
      { type: 'paragraph', text: 'You retain ownership of the content you submit while granting Wysker Watch LLC a limited license to store and process it for the purpose of operating the Service.' },
      { type: 'subheading', text: 'Acceptable use' },
      { type: 'paragraph', text: 'You agree not to misuse the Service, violate applicable laws, interfere with system operations, or submit fraudulent or malicious content.' },
      { type: 'subheading', text: 'Intellectual property' },
      { type: 'paragraph', text: 'All software, branding, logos, content, and related intellectual property are owned by Wysker Watch LLC or its licensors.' },
      { type: 'subheading', text: 'Feedback' },
      { type: 'paragraph', text: 'Any feedback or suggestions you provide may be used by Wysker Watch LLC without compensation.' },
    ],
  },
  {
    id: 'third-party-services-and-availability',
    title: 'Third-party services & availability',
    subtitle: 'Providers we rely on and what we guarantee.',
    icon: 'Server',
    body: [
      { type: 'subheading', text: 'Third-party services' },
      { type: 'paragraph', text: 'The Service relies on third-party providers, including cloud infrastructure and AI services. Wysker Watch is not responsible for failures caused by those providers.' },
      { type: 'subheading', text: 'Availability' },
      { type: 'paragraph', text: 'We strive to provide reliable service but do not guarantee uninterrupted or error-free operation.' },
      { type: 'subheading', text: 'Future features' },
      { type: 'paragraph', text: 'Nothing in these Terms guarantees the availability of future functionality.' },
      { type: 'subheading', text: 'Privacy' },
      { type: 'paragraph', text: 'Your use of the Service is also governed by the Wysker Watch Privacy Policy.' },
    ],
  },
  {
    id: 'legal-terms',
    title: 'Legal terms',
    subtitle: 'Warranties, liability, and account suspension.',
    icon: 'Scale',
    body: [
      { type: 'subheading', text: 'Disclaimer of warranties' },
      { type: 'paragraph', text: 'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND TO THE MAXIMUM EXTENT PERMITTED BY LAW.' },
      { type: 'subheading', text: 'Limitation of liability' },
      { type: 'paragraph', text: 'TO THE MAXIMUM EXTENT PERMITTED BY LAW, WYSKER WATCH LLC SHALL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, CONSEQUENTIAL, SPECIAL, EXEMPLARY, OR PUNITIVE DAMAGES ARISING FROM USE OF THE SERVICE.' },
      { type: 'paragraph', text: 'IF LIABILITY CANNOT BE DISCLAIMED, TOTAL LIABILITY SHALL NOT EXCEED THE GREATER OF $100 USD OR THE AMOUNT PAID FOR THE SERVICE DURING THE PREVIOUS TWELVE MONTHS.' },
      { type: 'subheading', text: 'Indemnification' },
      { type: 'paragraph', text: 'You agree to indemnify and hold harmless Wysker Watch LLC from claims arising from your use of the Service or violation of these Terms.' },
      { type: 'subheading', text: 'Suspension and termination' },
      { type: 'paragraph', text: 'We may suspend or terminate accounts that violate these Terms or misuse the Service.' },
    ],
  },
  {
    id: 'changes-law-and-contact',
    title: 'Changes, law & contact',
    subtitle: 'Updates to these Terms, governing law, and how to reach us.',
    icon: 'Mail',
    body: [
      { type: 'subheading', text: 'Changes to these Terms' },
      { type: 'paragraph', text: 'We may update these Terms from time to time. Continued use of the Service constitutes acceptance of any revised Terms.' },
      { type: 'subheading', text: 'Governing law' },
      { type: 'paragraph', text: 'These Terms are governed by the laws of the State of Maryland.' },
      { type: 'subheading', text: 'Severability' },
      { type: 'paragraph', text: 'If any provision is unenforceable, the remaining provisions remain in effect.' },
      { type: 'subheading', text: 'Entire agreement' },
      { type: 'paragraph', text: 'These Terms and the Privacy Policy constitute the entire agreement between you and Wysker Watch LLC regarding the Service.' },
      { type: 'subheading', text: 'Contact us' },
      { type: 'paragraph', text: 'Wysker Watch LLC. If you have questions about these Terms, please contact us at:' },
      { type: 'link', href: 'mailto:support@wyskerwatch.com', text: 'support@wyskerwatch.com' },
      { type: 'link', href: 'https://www.wyskerwatch.com', text: 'wyskerwatch.com' },
    ],
  },
];

// Destination for the list screen's "Last updated" row. Kept separate from
// TOS_SECTIONS so it doesn't also render as an extra row in that list —
// it's reached only by tapping the "Last updated" row itself.
export const TOS_LAST_UPDATED_SECTION = {
  id: 'last-updated',
  title: 'Last updated',
  body: [
    { type: 'paragraph', text: `These Terms of Service were last updated on ${TOS_LAST_UPDATED}.` },
  ],
};

export function getTermsOfServiceSection(sectionId) {
  if (sectionId === TOS_LAST_UPDATED_SECTION.id) return TOS_LAST_UPDATED_SECTION;
  return TOS_SECTIONS.find((s) => s.id === sectionId) ?? null;
}
