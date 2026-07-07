// Shared branded HTML layout for every transactional email.
//
// Colors/typography follow 0005 Design System.md: Midnight Charcoal
// background, Pure White high-contrast body text, Soft Sky Blue accent,
// Warm Gray secondary/footer text, Inter font. Email clients strip most
// CSS, so styles are inlined on every element rather than relying on a
// <style> block (the block below is included as a progressive
// enhancement for the handful of clients that do support it, e.g. for
// the mobile max-width tweak).
//
// The CTA button uses a Sky Blue fill with Charcoal text — the inverse
// of the app's primary button (Charcoal fill, Sky Blue outline) — since
// the email body itself is already Charcoal and a same-color button
// would disappear against it.

const COLORS = {
  background: '#0D0F12',
  panel: '#15181D',
  text: '#FFFFFF',
  secondaryText: '#A9AEB5',
  accent: '#6FB7FF',
};

export function renderButton(url: string, label: string): string {
  const safeUrl = escapeAttribute(url);
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
      <tr>
        <td style="border-radius: 8px; background-color: ${COLORS.accent};">
          <a href="${safeUrl}" target="_blank"
             style="display: inline-block; padding: 14px 28px; font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: 600; color: ${COLORS.background}; text-decoration: none; border-radius: 8px;">
            ${escapeAttribute(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

export function renderParagraph(html: string): string {
  return `<p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: ${COLORS.text};">${html}</p>`;
}

export function renderLinkFallback(url: string): string {
  const safeUrl = escapeAttribute(url);
  return `<p style="margin: 0 0 16px 0; font-size: 13px; line-height: 1.6; color: ${COLORS.secondaryText}; word-break: break-all;">${safeUrl}</p>`;
}

interface RenderLayoutParams {
  previewText: string;
  bodyHtml: string;
}

export function renderLayout({ previewText, bodyHtml }: RenderLayoutParams): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>Wysker Watch</title>
    <style>
      @media (max-width: 480px) {
        .ww-container { width: 100% !important; padding: 24px 16px !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${COLORS.background};">
    <!-- Preview text: shown in inbox list preview, hidden in the body -->
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
      ${escapeAttribute(previewText)}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: ${COLORS.background};">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" class="ww-container" width="480" cellpadding="0" cellspacing="0" border="0" style="width: 480px; max-width: 100%; background-color: ${COLORS.panel}; border-radius: 16px; padding: 40px 32px;">
            <tr>
              <td>
                <div style="font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 600; color: ${COLORS.text}; margin-bottom: 24px;">
                  Wysker Watch
                </div>
                <div style="font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif;">
                  ${bodyHtml}
                </div>
                <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid rgba(169, 174, 181, 0.2);">
                  <p style="margin: 0; font-size: 13px; line-height: 1.6; color: ${COLORS.secondaryText}; font-family: 'Inter', -apple-system, Helvetica, Arial, sans-serif;">
                    You're receiving this email because of activity on your Wysker Watch account. If this wasn't you, you can safely ignore it.
                  </p>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeAttribute(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
