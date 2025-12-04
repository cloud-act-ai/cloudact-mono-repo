import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwroaccbrxppfiysqlzs.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3cm9hY2NicnhwcGZpeXNxbHpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDAzNTM5MCwiZXhwIjoyMDc5NjExMzkwfQ.sW39fSpR0b1i5izgXVwGaV3sXdWmMGI22sX4zAnywuM';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function updateApiKey() {
  // First get user by email
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Error listing users:', listError);
    return;
  }

  // Find the org first to get its id
  const { data: orgs, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('org_slug', 'newteset_11262025')
    .limit(1);

  if (orgError) {
    console.error('Error finding org:', orgError);
    return;
  }

  if (!orgs || orgs.length === 0) {
    console.error('Org not found');
    return;
  }

  console.log('Org data:', orgs[0]);
  const userId = orgs[0].created_by;
  console.log('Found user ID:', userId);

  // Get user's current metadata
  const user = users.find(u => u.id === userId);
  if (!user) {
    console.error('User not found');
    return;
  }

  console.log('Current org_api_keys:', user.user_metadata?.org_api_keys);

  // Update with new API key
  const existingKeys = user.user_metadata?.org_api_keys || {};
  const updatedKeys = {
    ...existingKeys,
    'newteset_11262025': 'newteset_11262025_api_zkiSa4IEz1ebyS0_'
  };

  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...user.user_metadata,
      org_api_keys: updatedKeys
    }
  });

  if (error) {
    console.error('Error updating user:', error);
    return;
  }

  console.log('Updated org_api_keys:', data.user.user_metadata?.org_api_keys);
  console.log('SUCCESS: API key saved to user metadata');
}

updateApiKey().catch(console.error);
