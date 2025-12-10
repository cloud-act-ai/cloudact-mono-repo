import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getApiKey() {
    const slug = process.env.TEST_ORG_SLUG || process.argv[2];
    if (!slug) {
        console.error('Usage: npx tsx scripts/get_api_key.ts <org_slug>');
        process.exit(1);
    }

    const { data, error } = await supabase
        .from('org_api_keys_secure')
        .select('api_key')
        .eq('org_slug', slug)
        .single();

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Org API Key:', data.api_key);
}

getApiKey();
