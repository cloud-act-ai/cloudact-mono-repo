
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkOrg() {
    const slug = process.env.TEST_ORG_SLUG || process.argv[2];
    if (!slug) {
        console.error('Usage: npx tsx scripts/check_org.ts <org_slug>');
        process.exit(1);
    }
    const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('org_slug', slug)
        .single();

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Org:', {
        id: data.id,
        slug: data.org_slug,
        stripe_customer_id: data.stripe_customer_id,
        stripe_subscription_id: data.stripe_subscription_id,
        plan: data.plan
    });
}

checkOrg();
