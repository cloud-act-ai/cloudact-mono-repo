"""
consolidate.py

Consolidation utilities - UNION genai_payg and genai_commitment tables
into normalized genai_all tables for unified reporting.
"""
import csv
import os
from pathlib import Path
from typing import List, Dict, Any

# Output directories
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "output")).expanduser()
USAGE_DIR = OUTPUT_DIR / "usage"
COSTS_DIR = OUTPUT_DIR / "costs"

# Source files
PAYG_USAGE_CSV = USAGE_DIR / "genai_payg_usage.csv"
COMMITMENT_USAGE_CSV = USAGE_DIR / "genai_commitment_usage.csv"
PAYG_COSTS_CSV = COSTS_DIR / "genai_payg_costs.csv"
COMMITMENT_COSTS_CSV = COSTS_DIR / "genai_commitment_costs.csv"

# Consolidated output files
ALL_USAGE_CSV = USAGE_DIR / "genai_all_usage.csv"
ALL_COSTS_CSV = COSTS_DIR / "genai_all_costs.csv"

# Normalized schemas
ALL_USAGE_COLUMNS = [
    "date", "provider", "pricing_model", "model",
    "usage_quantity", "usage_unit", "cost_usd", "org_slug", "source_table"
]

ALL_COSTS_COLUMNS = [
    "date", "provider", "pricing_model", "model",
    "cost_usd", "cost_category", "tokens_or_units", "org_slug", "source_table"
]


def _safe_float(val: str, default: float = 0.0) -> float:
    """Safely convert string to float."""
    if not val or val.strip() == "":
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _safe_int(val: str, default: int = 0) -> int:
    """Safely convert string to int."""
    if not val or val.strip() == "":
        return default
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def _read_csv(file_path: Path) -> List[Dict[str, Any]]:
    """Read CSV file into list of dicts."""
    if not file_path.exists():
        return []

    with file_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def _write_csv(file_path: Path, columns: List[str], rows: List[Dict[str, Any]]) -> int:
    """Write rows to CSV file."""
    file_path.parent.mkdir(parents=True, exist_ok=True)

    with file_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)

    return len(rows)


def consolidate_usage() -> Dict:
    """
    UNION genai_payg_usage + genai_commitment_usage → genai_all_usage.csv

    Normalizes both schemas into a common format for unified reporting.
    """
    consolidated = []

    # Process PAYG usage
    payg_rows = _read_csv(PAYG_USAGE_CSV)
    for row in payg_rows:
        total_tokens = _safe_int(row.get("total_tokens", 0))
        consolidated.append({
            "date": row.get("date", ""),
            "provider": row.get("provider", ""),
            "pricing_model": "payg",
            "model": row.get("model", ""),
            "usage_quantity": total_tokens,
            "usage_unit": "tokens",
            "cost_usd": _safe_float(row.get("cost_usd", 0)),
            "org_slug": row.get("org_slug", ""),
            "source_table": "genai_payg_usage",
        })

    # Process Commitment usage
    commitment_rows = _read_csv(COMMITMENT_USAGE_CSV)
    for row in commitment_rows:
        ptu_count = _safe_int(row.get("ptu_count", 0))
        consolidated.append({
            "date": row.get("date", ""),
            "provider": row.get("provider", ""),
            "pricing_model": "commitment",
            "model": row.get("model", ""),
            "usage_quantity": ptu_count,
            "usage_unit": "ptu_hours",
            "cost_usd": _safe_float(row.get("daily_cost_usd", 0)),
            "org_slug": row.get("org_slug", ""),
            "source_table": "genai_commitment_usage",
        })

    # Sort by date, provider
    consolidated.sort(key=lambda x: (x["date"], x["provider"]))

    # Write consolidated file
    rows_written = _write_csv(ALL_USAGE_CSV, ALL_USAGE_COLUMNS, consolidated)

    return {
        "payg_rows": len(payg_rows),
        "commitment_rows": len(commitment_rows),
        "total_rows": rows_written,
        "output_file": str(ALL_USAGE_CSV),
    }


def consolidate_costs() -> Dict:
    """
    UNION genai_payg_costs + genai_commitment_costs → genai_all_costs.csv

    Normalizes both schemas into a common format for unified cost reporting.
    """
    consolidated = []

    # Process PAYG costs
    payg_rows = _read_csv(PAYG_COSTS_CSV)
    for row in payg_rows:
        total_tokens = _safe_int(row.get("total_tokens", 0))
        consolidated.append({
            "date": row.get("date", ""),
            "provider": row.get("provider", ""),
            "pricing_model": "payg",
            "model": row.get("model", ""),
            "cost_usd": _safe_float(row.get("total_cost_usd", 0)),
            "cost_category": "token_based",
            "tokens_or_units": total_tokens,
            "org_slug": row.get("org_slug", ""),
            "source_table": "genai_payg_costs",
        })

    # Process Commitment costs
    commitment_rows = _read_csv(COMMITMENT_COSTS_CSV)
    for row in commitment_rows:
        ptu_count = _safe_int(row.get("ptu_count", 0))
        consolidated.append({
            "date": row.get("date", ""),
            "provider": row.get("provider", ""),
            "pricing_model": "commitment",
            "model": row.get("model", ""),
            "cost_usd": _safe_float(row.get("ptu_cost_usd", 0)),
            "cost_category": "fixed_capacity",
            "tokens_or_units": ptu_count,
            "org_slug": row.get("org_slug", ""),
            "source_table": "genai_commitment_costs",
        })

    # Sort by date, provider
    consolidated.sort(key=lambda x: (x["date"], x["provider"]))

    # Write consolidated file
    rows_written = _write_csv(ALL_COSTS_CSV, ALL_COSTS_COLUMNS, consolidated)

    return {
        "payg_rows": len(payg_rows),
        "commitment_rows": len(commitment_rows),
        "total_rows": rows_written,
        "output_file": str(ALL_COSTS_CSV),
    }


def consolidate_all() -> Dict:
    """
    Consolidate both usage and costs into unified tables.
    """
    usage_result = consolidate_usage()
    costs_result = consolidate_costs()

    return {
        "usage": usage_result,
        "costs": costs_result,
    }


def get_consolidation_summary() -> Dict:
    """Get summary of consolidated data."""
    all_usage = _read_csv(ALL_USAGE_CSV)
    all_costs = _read_csv(ALL_COSTS_CSV)

    usage_by_model = {}
    for row in all_usage:
        model = row.get("pricing_model", "unknown")
        usage_by_model[model] = usage_by_model.get(model, 0) + 1

    costs_by_model = {}
    for row in all_costs:
        model = row.get("pricing_model", "unknown")
        costs_by_model[model] = costs_by_model.get(model, 0) + 1

    total_cost = sum(_safe_float(row.get("cost_usd", 0)) for row in all_costs)

    return {
        "usage_rows": len(all_usage),
        "cost_rows": len(all_costs),
        "usage_by_pricing_model": usage_by_model,
        "costs_by_pricing_model": costs_by_model,
        "total_cost_usd": round(total_cost, 4),
        "files": {
            "all_usage": str(ALL_USAGE_CSV),
            "all_costs": str(ALL_COSTS_CSV),
        },
    }


if __name__ == "__main__":
    print("Consolidating GenAI tables...")
    result = consolidate_all()
    print(f"Usage: {result['usage']}")
    print(f"Costs: {result['costs']}")
    print("\nSummary:")
    print(get_consolidation_summary())
