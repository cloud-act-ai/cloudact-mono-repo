"""
OpenAI Pricing

Pricing per 1K tokens (as of Dec 2024)
Source: https://openai.com/pricing
"""

PRICING = {
    # GPT-4o series
    "gpt-4o": {"input": 0.0025, "output": 0.01, "cached_input": 0.00125},
    "gpt-4o-2024-11-20": {"input": 0.0025, "output": 0.01, "cached_input": 0.00125},
    "gpt-4o-2024-08-06": {"input": 0.0025, "output": 0.01, "cached_input": 0.00125},
    "gpt-4o-2024-05-13": {"input": 0.005, "output": 0.015},

    # GPT-4o mini
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006, "cached_input": 0.000075},
    "gpt-4o-mini-2024-07-18": {"input": 0.00015, "output": 0.0006, "cached_input": 0.000075},

    # GPT-4 Turbo
    "gpt-4-turbo": {"input": 0.01, "output": 0.03},
    "gpt-4-turbo-2024-04-09": {"input": 0.01, "output": 0.03},
    "gpt-4-turbo-preview": {"input": 0.01, "output": 0.03},

    # GPT-4
    "gpt-4": {"input": 0.03, "output": 0.06},
    "gpt-4-32k": {"input": 0.06, "output": 0.12},

    # GPT-3.5 Turbo
    "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
    "gpt-3.5-turbo-0125": {"input": 0.0005, "output": 0.0015},
    "gpt-3.5-turbo-instruct": {"input": 0.0015, "output": 0.002},

    # o1 reasoning models
    "o1": {"input": 0.015, "output": 0.06, "cached_input": 0.0075},
    "o1-2024-12-17": {"input": 0.015, "output": 0.06, "cached_input": 0.0075},
    "o1-preview": {"input": 0.015, "output": 0.06},
    "o1-preview-2024-09-12": {"input": 0.015, "output": 0.06},
    "o1-mini": {"input": 0.003, "output": 0.012, "cached_input": 0.0015},
    "o1-mini-2024-09-12": {"input": 0.003, "output": 0.012},

    # Embedding models
    "text-embedding-3-small": {"input": 0.00002, "output": 0},
    "text-embedding-3-large": {"input": 0.00013, "output": 0},
    "text-embedding-ada-002": {"input": 0.0001, "output": 0},
}


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int = 0
) -> float:
    """
    Calculate cost for OpenAI API usage.

    Args:
        model: Model name (e.g., "gpt-4o-mini")
        input_tokens: Number of input/prompt tokens
        output_tokens: Number of output/completion tokens
        cached_input_tokens: Number of cached input tokens (for supported models)

    Returns:
        Estimated cost in USD
    """
    # Find matching pricing (try exact match first, then prefix match)
    rate = PRICING.get(model)

    if not rate:
        # Try prefix matching
        for model_key, model_rate in PRICING.items():
            if model.startswith(model_key) or model_key in model:
                rate = model_rate
                break

    if not rate:
        print(f"[OpenAI] Unknown model: {model}, using gpt-4o-mini pricing as fallback")
        rate = PRICING["gpt-4o-mini"]

    # Calculate cost
    input_cost = (input_tokens / 1000.0) * rate["input"]
    output_cost = (output_tokens / 1000.0) * rate["output"]

    # Add cached input cost if applicable
    cached_cost = 0
    if cached_input_tokens > 0 and "cached_input" in rate:
        cached_cost = (cached_input_tokens / 1000.0) * rate["cached_input"]

    return input_cost + output_cost + cached_cost


def get_model_info(model: str) -> dict:
    """Get pricing info for a model."""
    rate = PRICING.get(model)
    if rate:
        return {"model": model, "pricing": rate, "found": True}

    # Try prefix matching
    for model_key, model_rate in PRICING.items():
        if model.startswith(model_key) or model_key in model:
            return {"model": model_key, "pricing": model_rate, "found": True, "matched_from": model}

    return {"model": model, "pricing": None, "found": False}
