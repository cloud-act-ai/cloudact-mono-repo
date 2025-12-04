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

async function forceUpgrade() {
    const slug = process.env.TEST_ORG_SLUG || process.argv[2];
    if (!slug) {
        console.error('Usage: npx tsx scripts/force_upgrade.ts <org_slug>');
        process.exit(1);
    }
    console.log(`Forcing upgrade for ${slug}...`);

    const { error } = await supabase
        .from('organizations')
        .update({
            plan: 'professional',
            seat_limit: 50,
            providers_limit: 10,
            pipelines_per_day_limit: 100
        })
        .eq('org_slug', slug);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Successfully forced upgrade to Professional!');
    }
}

forceUpgrade();
