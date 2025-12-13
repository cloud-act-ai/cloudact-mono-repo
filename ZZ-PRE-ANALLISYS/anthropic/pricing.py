"""
Anthropic Pricing

Pricing per 1K tokens (as of Dec 2024)
Source: https://www.anthropic.com/pricing
"""

PRICING = {
    # Claude 3.5 Sonnet (latest)
    "claude-3-5-sonnet-20241022": {"input": 0.003, "output": 0.015, "cached_input": 0.0003, "cached_write": 0.00375},
    "claude-3-5-sonnet-latest": {"input": 0.003, "output": 0.015, "cached_input": 0.0003, "cached_write": 0.00375},

    # Claude 3.5 Sonnet (June)
    "claude-3-5-sonnet-20240620": {"input": 0.003, "output": 0.015},

    # Claude 3.5 Haiku
    "claude-3-5-haiku-20241022": {"input": 0.0008, "output": 0.004, "cached_input": 0.00008, "cached_write": 0.001},
    "claude-3-5-haiku-latest": {"input": 0.0008, "output": 0.004, "cached_input": 0.00008, "cached_write": 0.001},

    # Claude 3 Opus
    "claude-3-opus-20240229": {"input": 0.015, "output": 0.075, "cached_input": 0.0015, "cached_write": 0.01875},
    "claude-3-opus-latest": {"input": 0.015, "output": 0.075, "cached_input": 0.0015, "cached_write": 0.01875},

    # Claude 3 Sonnet
    "claude-3-sonnet-20240229": {"input": 0.003, "output": 0.015},

    # Claude 3 Haiku
    "claude-3-haiku-20240307": {"input": 0.00025, "output": 0.00125, "cached_input": 0.00003, "cached_write": 0.0003},

    # Legacy aliases
    "claude-3-5-sonnet": {"input": 0.003, "output": 0.015},
    "claude-3-opus": {"input": 0.015, "output": 0.075},
    "claude-3-sonnet": {"input": 0.003, "output": 0.015},
    "claude-3-haiku": {"input": 0.00025, "output": 0.00125},
}


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int = 0,
    cached_write_tokens: int = 0
) -> float:
    """
    Calculate cost for Anthropic API usage.

    Args:
        model: Model name (e.g., "claude-3-5-sonnet-20241022")
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens
        cached_input_tokens: Tokens read from cache (discounted)
        cached_write_tokens: Tokens written to cache (premium)

    Returns:
        Estimated cost in USD
    """
    # Find matching pricing
    rate = PRICING.get(model)

    if not rate:
        # Try prefix matching
        for model_key, model_rate in PRICING.items():
            if model_key in model or model.startswith(model_key.split("-20")[0]):
                rate = model_rate
                break

    if not rate:
        print(f"[Anthropic] Unknown model: {model}, using claude-3-5-sonnet pricing as fallback")
        rate = PRICING["claude-3-5-sonnet-20241022"]

    # Calculate base cost
    input_cost = (input_tokens / 1000.0) * rate["input"]
    output_cost = (output_tokens / 1000.0) * rate["output"]

    # Add caching costs if applicable
    cached_read_cost = 0
    cached_write_cost = 0

    if cached_input_tokens > 0 and "cached_input" in rate:
        cached_read_cost = (cached_input_tokens / 1000.0) * rate["cached_input"]

    if cached_write_tokens > 0 and "cached_write" in rate:
        cached_write_cost = (cached_write_tokens / 1000.0) * rate["cached_write"]

    return input_cost + output_cost + cached_read_cost + cached_write_cost


def get_model_info(model: str) -> dict:
    """Get pricing info for a model."""
    rate = PRICING.get(model)
    if rate:
        return {"model": model, "pricing": rate, "found": True}

    # Try prefix matching
    for model_key, model_rate in PRICING.items():
        if model_key in model or model.startswith(model_key.split("-20")[0]):
            return {"model": model_key, "pricing": model_rate, "found": True, "matched_from": model}

    return {"model": model, "pricing": None, "found": False}
