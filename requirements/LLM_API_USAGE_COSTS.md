# LLM API Usage Costs

**Status**: NOT IMPLEMENTED

## What
Track actual API token usage and calculate costs.

## Examples (Future)
- OpenAI gpt-4: 1M input tokens × $0.03 = $30
- Anthropic claude-3: 500K output tokens × $0.015 = $7.50

## What Exists Now
- Pricing table: `llm_model_pricing` (per-token costs)
- Provider integration (API keys stored)

## What's Missing
1. Usage extraction pipelines
2. Usage storage tables
3. Cost calculation
4. Usage dashboard

## TODO
- [ ] Extract usage from OpenAI API
- [ ] Extract usage from Anthropic API
- [ ] Extract usage from Gemini API
- [ ] Create `llm_usage_daily` table
- [ ] Calculate: tokens × pricing = cost
- [ ] Build usage charts
