import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasConfig = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.includes('supabase.co')
);

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key'
);

export const productImagesBucket = 'product-images';

export const getPublicStorageUrl = (path: string) => {
  if (!supabaseUrl || !path) return '';
  return `${supabaseUrl}/storage/v1/object/public/${productImagesBucket}/${path}`;
};
