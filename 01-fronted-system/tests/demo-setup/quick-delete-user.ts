import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "https://kwroaccbrxppfiysqlzs.supabase.co";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  // Update API key to match BigQuery
  const correctApiKey = "acme_inc_01272026_api_C91DUs9I8iMeTq-jMqaBAQ";
  
  const { data, error } = await supabase
    .from("org_api_keys_secure")
    .update({ api_key: correctApiKey })
    .eq("org_slug", "acme_inc_01272026")
    .select();
  
  console.log("Updated:", data);
  if (error) console.log("Error:", error.message);
  
  // Verify
  const { data: verify } = await supabase
    .from("org_api_keys_secure")
    .select("*")
    .eq("org_slug", "acme_inc_01272026")
    .single();
  
  console.log("\nVerified:", verify);
}

main().catch(console.error);
