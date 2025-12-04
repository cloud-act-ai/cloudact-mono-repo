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

async function checkUsage() {
    const slug = process.env.TEST_ORG_SLUG || process.argv[2];
    if (!slug) {
        console.error('Usage: npx tsx scripts/check_usage.ts <org_slug>');
        process.exit(1);
    }

    // Get org ID
    const { data: org } = await supabase.from('organizations').select('id').eq('org_slug', slug).single();

    if (!org) {
        console.error('Org not found');
        return;
    }

    const { data: usage, error } = await supabase
        .from('usage_tracking')
        .select('*')
        .eq('org_id', org.id)
        .eq('usage_type', 'pipeline');

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Usage:', JSON.stringify(usage, null, 2));
    }
}

checkUsage();
