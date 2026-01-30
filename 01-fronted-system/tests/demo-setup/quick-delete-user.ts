/**
 * Quick utility to update/verify API keys
 *
 * Usage: npx tsx tests/demo-setup/quick-delete-user.ts <org_slug> <api_key>
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "https://kwroaccbrxppfiysqlzs.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const orgSlug = process.argv[2];
  const apiKey = process.argv[3];

  if (!orgSlug) {
    console.log("Usage: npx tsx tests/demo-setup/quick-delete-user.ts <org_slug> [api_key]");
    console.log("\nExamples:");
    console.log("  npx tsx tests/demo-setup/quick-delete-user.ts acme_inc_ml01ua8p");
    console.log("  npx tsx tests/demo-setup/quick-delete-user.ts acme_inc_ml01ua8p new_api_key_here");
    process.exit(1);
  }

  if (apiKey) {
    // Update API key
    const { data, error } = await supabase
      .from("org_api_keys_secure")
      .update({ api_key: apiKey })
      .eq("org_slug", orgSlug)
      .select();

    console.log("Updated:", data);
    if (error) console.log("Error:", error.message);
  }

  // Verify
  const { data: verify } = await supabase
    .from("org_api_keys_secure")
    .select("*")
    .eq("org_slug", orgSlug)
    .single();

  console.log("\nCurrent org_api_keys_secure entry:", verify);
}

main().catch(console.error);
