"""
Gemini (Google AI) Pricing

Pricing per 1K tokens (as of Dec 2024)
Source: https://ai.google.dev/pricing

Notes:
- Gemini 2.0 Flash is currently free (experimental)
- Prices vary by context length (<=128K vs >128K)
- Audio/video input has separate pricing
"""

PRICING = {
    # Gemini 2.5 (Latest)
    "gemini-2.5-flash": {"input": 0.00015, "output": 0.0006, "cached_input": 0.0000375},
    "gemini-2.5-pro": {"input": 0.00125, "output": 0.01, "cached_input": 0.0003125},
    "gemini-2.5-flash-lite": {"input": 0.000075, "output": 0.0003},

    # Gemini 2.0 Flash (Experimental - currently free)
    "gemini-2.0-flash-exp": {"input": 0, "output": 0, "note": "Experimental - free"},
    "gemini-2.0-flash": {"input": 0, "output": 0, "note": "Experimental - free"},
    "gemini-2.0-flash-lite": {"input": 0, "output": 0, "note": "Experimental - free"},
    "gemini-2.0-flash-lite-preview-02-05": {"input": 0, "output": 0},

    # Gemini 1.5 Flash (<=128K context)
    "gemini-1.5-flash": {"input": 0.000075, "output": 0.0003, "cached_input": 0.00001875},
    "gemini-1.5-flash-latest": {"input": 0.000075, "output": 0.0003, "cached_input": 0.00001875},
    "gemini-1.5-flash-001": {"input": 0.000075, "output": 0.0003},
    "gemini-1.5-flash-002": {"input": 0.000075, "output": 0.0003},

    # Gemini 1.5 Flash (>128K context) - higher pricing
    "gemini-1.5-flash-128k+": {"input": 0.00015, "output": 0.0006, "cached_input": 0.0000375},

    # Gemini 1.5 Flash-8B
    "gemini-1.5-flash-8b": {"input": 0.0000375, "output": 0.00015, "cached_input": 0.000009375},
    "gemini-1.5-flash-8b-latest": {"input": 0.0000375, "output": 0.00015},
    "gemini-1.5-flash-8b-001": {"input": 0.0000375, "output": 0.00015},

    # Gemini 1.5 Pro (<=128K context)
    "gemini-1.5-pro": {"input": 0.00125, "output": 0.005, "cached_input": 0.0003125},
    "gemini-1.5-pro-latest": {"input": 0.00125, "output": 0.005, "cached_input": 0.0003125},
    "gemini-1.5-pro-001": {"input": 0.00125, "output": 0.005},
    "gemini-1.5-pro-002": {"input": 0.00125, "output": 0.005},

    # Gemini 1.5 Pro (>128K context) - higher pricing
    "gemini-1.5-pro-128k+": {"input": 0.0025, "output": 0.01, "cached_input": 0.000625},

    # Gemini 1.0 Pro (Legacy)
    "gemini-1.0-pro": {"input": 0.0005, "output": 0.0015},
    "gemini-pro": {"input": 0.0005, "output": 0.0015},

    # Text Embedding
    "text-embedding-004": {"input": 0.000025, "output": 0},
    "text-embedding-005": {"input": 0.000025, "output": 0},
    "embedding-001": {"input": 0.000025, "output": 0},

    # Imagen (per image, not per token)
    "imagen-3.0-generate-001": {"per_image": 0.03},
    "imagen-3.0-fast-generate-001": {"per_image": 0.02},
}


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int = 0,
    context_length: int = 0
) -> float:
    """
    Calculate cost for Gemini API usage.

    Args:
        model: Model name (e.g., "gemini-1.5-flash")
        input_tokens: Number of input tokens
        output_tokens: Number of output tokens
        cached_input_tokens: Tokens from cached context
        context_length: Total context length (to determine pricing tier)

    Returns:
        Estimated cost in USD
    """
    # Determine if we need >128K pricing
    pricing_model = model
    if context_length > 128000:
        if "flash" in model and "8b" not in model:
            pricing_model = "gemini-1.5-flash-128k+"
        elif "pro" in model:
            pricing_model = "gemini-1.5-pro-128k+"

    # Find matching pricing
    rate = PRICING.get(pricing_model)

    if not rate:
        # Try prefix matching
        for model_key, model_rate in PRICING.items():
            if model_key in model or model.startswith(model_key):
                rate = model_rate
                break

    if not rate:
        print(f"[Gemini] Unknown model: {model}, using gemini-1.5-flash pricing as fallback")
        rate = PRICING["gemini-1.5-flash"]

    # Handle image generation models
    if "per_image" in rate:
        return rate["per_image"]  # Per-image pricing

    # Calculate token-based cost
    input_cost = (input_tokens / 1000.0) * rate.get("input", 0)
    output_cost = (output_tokens / 1000.0) * rate.get("output", 0)

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
        if model_key in model or model.startswith(model_key):
            return {"model": model_key, "pricing": model_rate, "found": True, "matched_from": model}

    return {"model": model, "pricing": None, "found": False}


def is_free_model(model: str) -> bool:
    """Check if a model is currently free (experimental)."""
    rate = PRICING.get(model)
    if rate:
        return rate.get("input", 0) == 0 and rate.get("output", 0) == 0

    # Check for 2.0 models which are experimental/free
    return "2.0" in model or "2.5" in model
