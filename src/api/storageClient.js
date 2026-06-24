import { supabase } from './supabaseClient';

/**
 * Drop-in replacement for base44.integrations.Core.UploadFile.
 * Uploads a file to the Supabase Storage "uploads" bucket under a
 * path scoped to the current user's id, and returns a public URL in
 * the same { file_url } shape the app already expects.
 *
 * Requires a public storage bucket named "uploads" to exist in the
 * Supabase project (created once via the dashboard or the SQL editor
 * — see chat for the exact steps).
 */
export async function uploadFile({ file }) {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) throw new Error('Not authenticated');

  const ext = file.name.split('.').pop();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('uploads')
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(path);

  return { file_url: urlData.publicUrl };
}
