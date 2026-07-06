// Decorative, non-interactive illustration for the Menu header (Menu
// Feature Spec #1) — a dog and cat silhouette under a night sky, matching
// the approved screen design. No image asset exists in the repo yet, so
// this is drawn inline as SVG rather than introducing a new asset file.
export default function MenuIllustration() {
  return (
    <svg
      viewBox="0 0 120 120"
      className="h-[72px] w-[72px] flex-shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="menu-illustration-sky" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#2A3A66" />
          <stop offset="100%" stopColor="#0D0F1E" />
        </radialGradient>
      </defs>
      <circle cx="60" cy="60" r="58" fill="url(#menu-illustration-sky)" />
      <circle cx="82" cy="34" r="10" fill="#F4E9C9" />
      <circle cx="30" cy="24" r="1.4" fill="#FFFFFF" opacity="0.8" />
      <circle cx="46" cy="16" r="1" fill="#FFFFFF" opacity="0.6" />
      <circle cx="94" cy="18" r="1.2" fill="#FFFFFF" opacity="0.7" />
      <path d="M0 84 Q30 70 60 82 T120 80 V120 H0 Z" fill="#141B33" opacity="0.9" />
      <path
        d="M48 96 C48 82 52 74 58 74 C64 74 68 82 68 90 C71 88 74 90 74 94 L74 96 Z"
        fill="#05060C"
      />
      <path
        d="M78 96 C78 86 82 80 87 80 C92 80 96 87 96 96 Z"
        fill="#05060C"
      />
      <path d="M85 80 L83 74 L88 78 Z" fill="#05060C" />
      <path d="M91 80 L93 74 L96 78 Z" fill="#05060C" />
    </svg>
  );
}
