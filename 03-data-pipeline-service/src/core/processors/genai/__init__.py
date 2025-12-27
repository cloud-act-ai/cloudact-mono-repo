"""
GenAI Cost Processors

Processes usage and cost data for all GenAI providers across 3 flows:
- PAYG: Token-based usage (OpenAI, Anthropic, Gemini, etc.)
- Commitment: Provisioned throughput (Azure PTU, AWS PT, GCP GSU)
- Infrastructure: GPU/TPU hourly usage (self-hosted)

Usage in pipeline configs:
    ps_type: genai.payg_usage
    ps_type: genai.payg_cost
    ps_type: genai.commitment_usage
    ps_type: genai.commitment_cost
    ps_type: genai.infrastructure_usage
    ps_type: genai.infrastructure_cost
    ps_type: genai.unified_consolidator
    ps_type: genai.focus_converter
"""
