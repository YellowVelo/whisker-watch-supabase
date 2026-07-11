// Data-layer wrapper for the Vet Export feature's generate-vet-report
// Edge Function (Technical Standards: never call Supabase/fetch directly
// inside UI components). Uses a raw `fetch` rather than
// `supabase.functions.invoke` because the response is a binary PDF, not
// JSON — `invoke` assumes/parses a JSON body.
import { supabase } from '@/api/supabaseClient';

export async function downloadVetReport(petId, petName) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('You must be signed in to download a vet report.');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/generate-vet-report`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ petId, format: 'pdf' }),
  });

  if (!response.ok) {
    let message = 'Could not generate the vet report. Please try again.';
    try {
      const body = await response.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      // response wasn't JSON — keep the generic message
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(petName || 'pet').replace(/[^a-z0-9]+/gi, '-')}-vet-report.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
