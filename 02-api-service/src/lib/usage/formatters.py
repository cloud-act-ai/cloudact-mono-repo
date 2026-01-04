"""
Usage Formatters

Display formatting functions for GenAI usage metrics.
Consistent formatting for tokens, requests, latency.
"""

from typing import Optional


# ==============================================================================
# Token Formatting
# ==============================================================================

def format_token_count(tokens: int) -> str:
    """
    Format token count for display (e.g., 1.5M, 250K).

    Args:
        tokens: Token count

    Returns:
        Formatted string
    """
    if tokens >= 1_000_000_000:
        return f"{tokens / 1_000_000_000:.1f}B"
    if tokens >= 1_000_000:
        return f"{tokens / 1_000_000:.1f}M"
    if tokens >= 1_000:
        return f"{tokens / 1_000:.1f}K"
    return str(tokens)


def format_token_count_compact(tokens: int) -> str:
    """
    Format token count as compact (1M, 500K).

    Args:
        tokens: Token count

    Returns:
        Formatted string
    """
    if tokens >= 1_000_000_000:
        return f"{round(tokens / 1_000_000_000)}B"
    if tokens >= 1_000_000:
        return f"{round(tokens / 1_000_000)}M"
    if tokens >= 1_000:
        return f"{round(tokens / 1_000)}K"
    return str(tokens)


def format_token_breakdown(
    input_tokens: int,
    output_tokens: int
) -> str:
    """
    Format token breakdown.

    Args:
        input_tokens: Input token count
        output_tokens: Output token count

    Returns:
        Formatted string (e.g., "1.5M in / 500K out")
    """
    return f"{format_token_count(input_tokens)} in / {format_token_count(output_tokens)} out"


# ==============================================================================
# Request Formatting
# ==============================================================================

def format_requests(requests: int) -> str:
    """
    Format request count.

    Args:
        requests: Request count

    Returns:
        Formatted string
    """
    if requests >= 1_000_000:
        return f"{requests / 1_000_000:.1f}M"
    if requests >= 1_000:
        return f"{requests / 1_000:.1f}K"
    return str(requests)


def format_requests_with_label(requests: int) -> str:
    """
    Format requests with label.

    Args:
        requests: Request count

    Returns:
        Formatted string with "requests" label
    """
    return f"{format_requests(requests)} requests"


# ==============================================================================
# Latency Formatting
# ==============================================================================

def format_latency(ms: float) -> str:
    """
    Format latency in milliseconds.

    Args:
        ms: Latency in milliseconds

    Returns:
        Formatted string
    """
    if ms >= 1000:
        return f"{ms / 1000:.2f}s"
    return f"{round(ms)}ms"


def format_ttft(ms: float) -> str:
    """
    Format time to first token.

    Args:
        ms: TTFT in milliseconds

    Returns:
        Formatted string
    """
    return f"{round(ms)}ms TTFT"


# ==============================================================================
# Percentage Formatting
# ==============================================================================

def format_success_rate(rate: float) -> str:
    """
    Format success rate percentage.

    Args:
        rate: Success rate (0-100)

    Returns:
        Formatted string
    """
    if rate >= 99.9:
        return "99.9%"
    if rate >= 99:
        return f"{rate:.1f}%"
    return f"{rate:.2f}%"


def format_percentage(value: float, decimals: int = 1) -> str:
    """
    Format percentage value.

    Args:
        value: Percentage value (0-100)
        decimals: Decimal places

    Returns:
        Formatted string
    """
    return f"{value:.{decimals}f}%"


def format_percentage_change(change: float) -> str:
    """
    Format percentage change with sign and arrow.

    Args:
        change: Percentage change

    Returns:
        Formatted string
    """
    sign = "+" if change > 0 else ""
    arrow = "↑" if change > 0 else ("↓" if change < 0 else "→")
    return f"{arrow} {sign}{change:.1f}%"


# ==============================================================================
# Rate Formatting
# ==============================================================================

def format_tokens_per_request(tpr: float) -> str:
    """
    Format tokens per request.

    Args:
        tpr: Tokens per request

    Returns:
        Formatted string
    """
    if tpr >= 1000:
        return f"{tpr / 1000:.1f}K/req"
    return f"{round(tpr)}/req"


def format_daily_rate(tokens: int) -> str:
    """
    Format daily token rate.

    Args:
        tokens: Daily token count

    Returns:
        Formatted string
    """
    return f"{format_token_count(tokens)}/day"


def format_monthly_forecast(tokens: int) -> str:
    """
    Format monthly token forecast.

    Args:
        tokens: Monthly token count

    Returns:
        Formatted string
    """
    return f"{format_token_count(tokens)}/mo"


# ==============================================================================
# Cost Formatting
# ==============================================================================

def format_cost_per_1m(
    cost: float,
    currency: str = "USD"
) -> str:
    """
    Format cost per 1M tokens.

    Args:
        cost: Cost per 1M tokens
        currency: Currency code

    Returns:
        Formatted string
    """
    symbol = "$" if currency == "USD" else currency
    return f"{symbol}{cost:.4f}/1M"


def format_cost_per_token(
    cost: float,
    currency: str = "USD"
) -> str:
    """
    Format cost per token.

    Args:
        cost: Cost per token
        currency: Currency code

    Returns:
        Formatted string
    """
    symbol = "$" if currency == "USD" else currency
    if cost < 0.000001:
        return f"{symbol}{cost:.2e}"
    return f"{symbol}{cost:.8f}"
