import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY || !STRIPE_KEY) {
    console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const stripe = new Stripe(STRIPE_KEY);

async function fixSubscription() {
    const slug = process.env.TEST_ORG_SLUG || process.argv[2];
    const email = process.env.TEST_USER_EMAIL || process.argv[3];

    if (!slug || !email) {
        console.error('Usage: npx tsx scripts/fix_subscription.ts <org_slug> <user_email>');
        process.exit(1);
    }

    console.log(`Checking org: ${slug}`);
    const { data: org, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('org_slug', slug)
        .single();

    if (error) {
        console.error('Error fetching org:', error);
        return;
    }

    console.log('Current Org State:', {
        id: org.id,
        stripe_subscription_id: org.stripe_subscription_id,
        plan: org.plan,
        billing_status: org.billing_status
    });

    if (org.stripe_subscription_id) {
        console.log('Subscription ID already exists!');
        // return; // Continue to fetch details
    }

    console.log(`Fetching customer for email: ${email}`);
    let sub: Stripe.Subscription | undefined;
    const customers = await stripe.customers.list({ email: email, limit: 1 });
    if (customers.data.length === 0) {
        console.log(`Fetching subscription: ${org.stripe_subscription_id}`);
        sub = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
    } else {
        console.log(`Fetching customer for email: ${email}`);
        const customers = await stripe.customers.list({ email: email, limit: 1 });
        if (customers.data.length === 0) {
            console.error('No customer found in Stripe');
            return;
        }
        const customer = customers.data[0];
        console.log(`Found customer: ${customer.id}`);

        console.log('Fetching subscriptions...');
        const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: 'active',
            limit: 1
        });
        // Also check trialing
        const trialing = await stripe.subscriptions.list({
            customer: customer.id,
            status: 'trialing',
            limit: 1
        });

        sub = subscriptions.data[0] || trialing.data[0];
    }

    if (!sub) {
        console.error('No active/trialing subscription found');
        return;
    }

    console.log(`Found subscription: ${sub.id} (Status: ${sub.status})`);

    const price = sub.items.data[0].price;
    const productId = typeof price.product === 'string' ? price.product : price.product.id;

    console.log(`Fetching product: ${productId}`);
    const product = await stripe.products.retrieve(productId);

    console.log('Product Metadata:', product.metadata);
    console.log('Product Name:', product.name);
    console.log('Subscription Items:', JSON.stringify(sub.items.data, null, 2));
    console.log('Trial End:', sub.trial_end);

    console.log('Updating organization...');
    const { error: updateError } = await supabase
        .from('organizations')
        .update({ stripe_subscription_id: sub.id })
        .eq('id', org.id);

    if (updateError) {
        console.error('Error updating org:', updateError);
    } else {
        console.log('Successfully updated organization with subscription ID!');
    }
}

fixSubscription();
