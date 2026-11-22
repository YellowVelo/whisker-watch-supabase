import { createClient } from '@supabase/supabase-js';
import { reportClientError } from '@/lib/errorMonitoring';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly in dev rather than silently making broken requests.
  reportClientError(
    new Error(
      'Missing Supabase env vars. Make sure VITE_SUPABASE_URL and ' +
      'VITE_SUPABASE_ANON_KEY are set in your .env file.'
    ),
    { feature: 'supabase_config' }
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
