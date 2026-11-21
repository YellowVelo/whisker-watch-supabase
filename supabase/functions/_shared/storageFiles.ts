// Shared by delete-account, delete-pet and reset-sandbox-account (spec 0075).
//
// Supabase Storage's list() returns at most `limit` entries per call (100
// by default), so a single call silently misses files for heavier users.
// These helpers page through a folder and delete in batches.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const PAGE_SIZE = 100;
const BUCKET = 'uploads';

// Every file path directly inside `folder` (uploads are stored flat as
// "{userId}/{file}"). Throws on a listing error, so a caller never acts on
// a partial list.
export async function listFolderPaths(admin: SupabaseClient, folder: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(folder, { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`Storage list failed for ${folder}: ${error.message}`);
    const page = data ?? [];
    // Sub-folders come back with a null id; only real files have one.
    for (const item of page) if (item.id) paths.push(`${folder}/${item.name}`);
    if (page.length < PAGE_SIZE) break;
  }
  return paths;
}

// Deletes the given paths, PAGE_SIZE at a time. Returns the first error
// message, or null if every batch succeeded.
export async function removePaths(admin: SupabaseClient, paths: string[]): Promise<string | null> {
  for (let i = 0; i < paths.length; i += PAGE_SIZE) {
    const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + PAGE_SIZE));
    if (error) return error.message;
  }
  return null;
}
