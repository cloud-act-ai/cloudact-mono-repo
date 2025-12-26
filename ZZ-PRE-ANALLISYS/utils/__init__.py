"""
GenAI utilities package.

Modules:
- pricing_loader: Load pricing from genai_*.csv files
- usage_store: Log usage to genai_payg/commitment_usage.csv
- consolidate: UNION tables into genai_all_*.csv
"""
from .pricing_loader import (
    calculate_cost,
    calculate_ptu_cost,
    get_model_pricing,
    get_pricing_model,
    get_provider_info,
    get_pricing_summary,
    list_models,
    load_payg_pricing,
    load_commitment_pricing,
    load_provider_registry,
)

from .usage_store import (
    log_usage,
    log_payg_usage,
    log_commitment_usage,
    get_usage,
    get_payg_usage,
    get_commitment_usage,
    get_usage_summary,
    clear_usage_files,
)

from .consolidate import (
    consolidate_all,
    consolidate_usage,
    consolidate_costs,
    get_consolidation_summary,
)

__all__ = [
    # Pricing
    "calculate_cost",
    "calculate_ptu_cost",
    "get_model_pricing",
    "get_pricing_model",
    "get_provider_info",
    "get_pricing_summary",
    "list_models",
    "load_payg_pricing",
    "load_commitment_pricing",
    "load_provider_registry",
    # Usage
    "log_usage",
    "log_payg_usage",
    "log_commitment_usage",
    "get_usage",
    "get_payg_usage",
    "get_commitment_usage",
    "get_usage_summary",
    "clear_usage_files",
    # Consolidate
    "consolidate_all",
    "consolidate_usage",
    "consolidate_costs",
    "get_consolidation_summary",
]
