#!/usr/bin/env python3
"""
PreToolUse Hook: Validate Integration Code

Prevents writing Supabase-based integration code.
All integration credentials must go through the API (BigQuery is source of truth).

Blocked patterns in actions/integrations.ts:
- cloud_provider_integrations table access
- createServiceRoleClient for integration status
- Direct Supabase writes for integration status

See: /integration-setup skill for architecture details.
"""

import json
import sys
import re

def main():
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)  # Allow if can't parse

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    # Only check Write and Edit tools
    if tool_name not in ["Write", "Edit"]:
        sys.exit(0)

    file_path = tool_input.get("file_path", "")
    content = tool_input.get("content", "") or tool_input.get("new_string", "")

    # Only check integration-related files
    integration_files = [
        "actions/integrations.ts",
        "integrations.ts",
    ]

    is_integration_file = any(f in file_path for f in integration_files)
    if not is_integration_file:
        sys.exit(0)

    # Patterns that indicate Supabase integration writes (which we want to prevent)
    blocked_patterns = [
        # Direct Supabase table access for integrations
        (r'\.from\(["\']cloud_provider_integrations["\']',
         "Don't use cloud_provider_integrations table. Use API which stores in BigQuery. See /integration-setup"),

        # Writing integration status to Supabase
        (r'integration_openai_status|integration_anthropic_status|integration_gcp_status',
         "Don't write integration status to Supabase. API stores status in BigQuery. See /integration-setup"),

        # Using createServiceRoleClient for integration operations
        (r'createServiceRoleClient\(\)[\s\S]{0,200}(integration|cloud_provider)',
         "Don't use createServiceRoleClient for integrations. Use BackendClient API. See /integration-setup"),

        # saveIntegrationStatus or saveCloudIntegrationStatus functions
        (r'async function save(Cloud)?IntegrationStatus',
         "Don't create save*IntegrationStatus functions. API handles all writes. See /integration-setup"),
    ]

    for pattern, message in blocked_patterns:
        if re.search(pattern, content, re.IGNORECASE | re.MULTILINE):
            output = {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": f"❌ BLOCKED: {message}"
                }
            }
            print(json.dumps(output))
            sys.exit(0)

    # Allow the operation
    sys.exit(0)

if __name__ == "__main__":
    main()
