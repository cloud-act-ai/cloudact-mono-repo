# Chat - Test Plan

## UI Tests

Chat UI validation via Playwright test script:
- **Test file:** `01-fronted-system/tests/demo-setup/chat-ui-test.ts`
- **Run:** `cd 01-fronted-system && npx tsx tests/demo-setup/chat-ui-test.ts`

### Test Matrix (20 checks)

| # | Test | Type | Expected |
|---|------|------|----------|
| 1 | Login with demo credentials | E2E | Redirect to dashboard |
| 2 | Navigate to chat page | Nav | `/chat` loads without error |
| 3 | Full-width layout (no left sidebar) | UI | Chat area spans full width |
| 4 | Header bar with New Chat + History buttons | UI | Both buttons visible |
| 5 | Welcome screen with Sparkles icon | UI | Sparkles icon (not MessageSquare) |
| 6 | Suggestion chips displayed | UI | At least 1 suggestion chip |
| 7 | Input area with send button | UI | Text input + send button present |
| 8 | Indigo theme (no mint) | Audit | Zero `#90FCA6` in chat area |
| 9 | History button opens right Sheet drawer | E2E | Sheet opens from right side |
| 10 | Conversation list in Sheet | UI | Conversations visible in Sheet |
| 11 | Relative timestamps (not provider + count) | UI | "2h ago", "Yesterday" format |
| 12 | New Chat button creates fresh conversation | E2E | Welcome screen reloads |
| 13 | Send message and receive response | E2E | Bot response appears |
| 14 | Streaming cursor visible during response | UI | Indigo cursor blinks |
| 15 | Bot icon is indigo | Audit | `var(--cloudact-indigo)` applied |
| 16 | Send button is indigo | Audit | Indigo background, white text |
| 17 | Sheet auto-closes on conversation select | E2E | Sheet closes after selection |
| 18 | Sidebar "Beta" badge is indigo | Audit | Not mint (#90FCA6) |
| 19 | Configure AI Chat shown without settings | UI | CTA visible when no BYOK key |
| 20 | Settings page loads | Nav | `/settings/ai-chat` accessible |

## Backend Tests

### Unit Tests (07-org-chat-backend)

```bash
cd 07-org-chat-backend
source venv/bin/activate
pytest tests/ -v
```

| Domain | File | Tests |
|--------|------|-------|
| Agents | `tests/test_agents/test_orchestrator.py` | Agent hierarchy creation, routing |
| Agents | `tests/test_agents/test_cost_analyst.py` | Cost agent tool binding |
| Agents | `tests/test_agents/test_model_factory.py` | LiteLlm/native model creation |
| Tools | `tests/test_tools/test_costs.py` | 5 cost MCP tools |
| Tools | `tests/test_tools/test_alerts.py` | 4 alert MCP tools |
| Tools | `tests/test_tools/test_usage.py` | 4 usage MCP tools |
| Security | `tests/test_security/test_org_validator.py` | Org validation + isolation |
| Security | `tests/test_security/test_query_guard.py` | Dry-run gate, table whitelist |

### Integration Tests

| Test | Command | Expected |
|------|---------|----------|
| Health check | `curl http://localhost:8002/health` | `{"status":"ok"}` |
| Agent card | `curl http://localhost:8002/.well-known/agent.json` | Valid JSON agent card |
| Chat settings GET | `curl http://localhost:8000/api/v1/organizations/{org}/chat-settings -H "X-API-Key: ..."` | Settings or `{ configured: false }` |
| Chat settings POST | POST with provider, credential_id, model_id | 200 with saved settings |

## Manual Verification Checklist

| Check | How | Expected |
|-------|-----|----------|
| BYOK setup flow | Settings → select provider → enter key → select model → save | "Connected" status |
| Send chat message | Type question → send → wait for response | Streaming response with agent name |
| Tool execution | "What are my total costs?" → CostAnalyst invoked | Cost data returned |
| Alert creation | "Create alert for >$1000" → AlertManager invoked | Alert created confirmation |
| Conversation persistence | Send message → refresh page → click History | Conversation preserved |
| Key rotation | Settings → rotate key → continue chat | Seamless continuation |
| Cross-org isolation | Login as Org A → check only Org A data | No Org B data visible |

## Pass Criteria

| Criteria | Target |
|----------|--------|
| UI tests passing | 17/20 (85%+, 3 are warnings) |
| Backend unit tests | 132/132 (100%) |
| Console errors in chat | 0 |
| Cross-org data leakage | 0 |
| Mint color in chat area | 0 elements |

## Known Limitations

1. **Streaming test**: Streaming cursor may not be captured in fast headless mode (warning, not failure)
2. **Tool execution**: Requires actual BigQuery data to verify tool results (demo data needed)
3. **Key validation**: Requires valid LLM API key to test full BYOK flow
4. **CopilotKit version**: Must match between frontend packages (^1.51)
5. **VPC in prod**: Chat backend only accessible via VPC connector (no direct testing)
