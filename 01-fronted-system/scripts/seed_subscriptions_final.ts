
import { createClient } from '@supabase/supabase-js';


const SUPABASE_URL = 'https://kwroaccbrxppfiysqlzs.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cm9hY2NicnhwcGZpeXNxbHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDAzNTM5MCwiZXhwIjoyMDc5NjExMzkwfQ.sW39fSpR0b1i5izgXVwGaV3sXdWmMGI22sX4zAnywuM';
const API_URL = 'http://localhost:8000';
const ORG_SLUG = 'guru_inc_12012025';

const SUBSCRIPTIONS = [
  { provider: 'slack', plan: { plan_name: 'Pro', display_name: 'Pro', unit_price: 15, seats: 5, pricing_model: 'PER_SEAT', billing_cycle: 'monthly', currency: 'USD', status: 'active', start_date: '2025-01-01' } },
  { provider: 'jira', plan: { plan_name: 'Standard', display_name: 'Standard', unit_price: 10, seats: 20, pricing_model: 'PER_SEAT', billing_cycle: 'monthly', currency: 'USD', status: 'active', start_date: '2025-01-01' } },
  { provider: 'zoom', plan: { plan_name: 'Business', display_name: 'Business', unit_price: 20, seats: 3, pricing_model: 'PER_SEAT', billing_cycle: 'monthly', currency: 'USD', status: 'active', start_date: '2025-01-01' } },
  { provider: 'notion', plan: { plan_name: 'Plus', display_name: 'Plus', unit_price: 8, seats: 10, pricing_model: 'PER_SEAT', billing_cycle: 'monthly', currency: 'USD', status: 'active', start_date: '2025-01-01' } },
  { provider: 'figma', plan: { plan_name: 'Professional', display_name: 'Professional', unit_price: 12, seats: 2, pricing_model: 'PER_SEAT', billing_cycle: 'monthly', currency: 'USD', status: 'active', start_date: '2025-01-01' } },
  { provider: 'datadog', plan: { plan_name: 'Pro', display_name: 'Pro', unit_price: 15, seats: 1, pricing_model: 'PER_SEAT', billing_cycle: 'monthly', currency: 'USD', status: 'active', start_date: '2025-01-01' } },
  { provider: 'aws', plan: { plan_name: 'Developer Support', display_name: 'Developer Support', unit_price: 29, seats: 1, pricing_model: 'FLAT_FEE', billing_cycle: 'monthly', currency: 'USD', status: 'active', start_date: '2025-01-01' } },
  { provider: 'google_workspace', plan: { plan_name: 'Business Standard', display_name: 'Business Standard', unit_price: 12, seats: 5, pricing_model: 'PER_SEAT', billing_cycle: 'monthly', currency: 'USD', status: 'active', start_date: '2025-01-01' } },
  { provider: 'salesforce', plan: { plan_name: 'Essentials', display_name: 'Essentials', unit_price: 25, seats: 2, pricing_model: 'PER_SEAT', billing_cycle: 'monthly', currency: 'USD', status: 'active', start_date: '2025-01-01' } },
  { provider: 'asana', plan: { plan_name: 'Premium', display_name: 'Premium', unit_price: 11, seats: 5, pricing_model: 'PER_SEAT', billing_cycle: 'monthly', currency: 'USD', status: 'active', start_date: '2025-01-01' } }
];

async function main() {
  console.log('Using Supabase URL:', SUPABASE_URL);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Get Org ID
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('org_slug', ORG_SLUG)
    .single();

  if (orgError) {
    console.error('Error fetching org:', orgError);
    return;
  }
  console.log('Org ID:', org.id);
  // Log org keys to find where the key is
  // console.log('Org Keys:', Object.keys(org)); 
  // Look for something like backend_api_key_encrypted
  
  if (org.backend_api_key) {
      console.log('Found backend_api_key (plain?):', org.backend_api_key);
  }

  console.log('Created By:', org.created_by);

  // 2. Get User Metadata (Auth Admin)
  const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(org.created_by);

  if (userError) {
    console.error('Error fetching user:', userError);
    return;
  }

  const apiKey = user?.user_metadata?.org_api_keys?.[ORG_SLUG];

  if (!apiKey) {
    console.error('API Key not found for org:', ORG_SLUG);
    console.log('Metadata:', JSON.stringify(user?.user_metadata || {}, null, 2));
    return;
  }

  console.log('Found API Key:', apiKey.substring(0, 10) + '...');

  // 3. Seed Subscriptions
  for (const sub of SUBSCRIPTIONS) {
    const { provider, plan } = sub;
    console.log(`Adding ${provider} plan...`);

    // Enable provider first (Meta table)
    const { error: enableError } = await supabase
        .from('saas_subscription_providers_meta')
        .upsert(
            {
                org_id: org.id,
                provider_name: provider,
                is_enabled: true,
                enabled_at: new Date().toISOString(),
                is_custom: false // Assume standard unless forced
            },
            { onConflict: 'org_id,provider_name' }
        );
    
    if (enableError) console.error(`Error enabling ${provider}:`, enableError.message);


    try {
      const response = await fetch(
        `${API_URL}/api/v1/subscriptions/${ORG_SLUG}/providers/${provider}/plans`,
        {
          method: 'POST',
          headers: {
            'X-API-Key': apiKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(plan)
        }
      );
      
      const responseText = await response.text();
      if (response.ok) {
         console.log(`Success: ${response.status} - ${responseText}`);
      } else {
         console.error(`Failed to add ${provider}: ${response.status} - ${responseText}`);
      }

    } catch (error: any) {
      console.error(`Failed to add ${provider}:`, error.message);
    }
  }
}

main().catch(console.error);
