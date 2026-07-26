// Shared Svix-style webhook signature helpers.
//
// Used by resend-webhook/index.ts (to verify Resend's signature) and its
// own index.test.ts (to sign hand-crafted test payloads with the same
// algorithm). Extracted into one module specifically so the test can
// never silently drift from what the production code actually verifies —
// previously these functions were implemented twice, once in each file.

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function computeSignature(secretBytes: Uint8Array, signedContent: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedContent));
  return bytesToBase64(new Uint8Array(signatureBytes));
}

// Not part of Web Crypto — signature comparison must not use plain
// string equality (`===`), which can leak timing information about how
// many leading bytes matched. This walks the full length of both inputs
// regardless of where they first differ.
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// Strips the `whsec_` prefix Resend/Svix webhook secrets are issued with,
// then base64-decodes the remainder into the raw signing key.
export function webhookSecretToBytes(secret: string): Uint8Array {
  return base64ToBytes(secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret);
}
