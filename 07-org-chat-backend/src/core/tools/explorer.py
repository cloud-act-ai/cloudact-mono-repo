"""
Explorer tools for ad-hoc BigQuery exploration.
Scoped to the org's dataset to prevent cross-tenant access.
"""

import re
import logging
from typing import Dict, List, Any, Set

from google.cloud import bigquery

from src.core.engine.bigquery import execute_query, get_bq_client
from src.app.config import get_settings

logger = logging.getLogger(__name__)

# Only allow SELECT queries (no DDL/DML) — also allow CTEs (WITH ... SELECT)
_SELECT_ONLY = re.compile(r"^\s*(SELECT|WITH)\b", re.IGNORECASE)
_DISALLOWED = re.compile(
    r"\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|MERGE|GRANT|REVOKE)\b",
    re.IGNORECASE,
)

# Pattern to extract dataset references from SQL (project.dataset.table or dataset.table)
_TABLE_REF_PATTERN = re.compile(
    r"(?:FROM|JOIN|,)\s+`?([a-zA-Z0-9_\-]+(?:\.[a-zA-Z0-9_\-]+){1,2})`?",
    re.IGNORECASE,
)


def _extract_datasets_from_query(query: str) -> Set[str]:
    """Extract all dataset names referenced in a SQL query."""
    datasets = set()
    for match in _TABLE_REF_PATTERN.finditer(query):
        ref = match.group(1)
        parts = ref.split(".")
        if len(parts) == 3:
            # project.dataset.table → dataset
            datasets.add(parts[1])
        elif len(parts) == 2:
            # dataset.table → dataset
            datasets.add(parts[0])
    return datasets


def list_org_tables(org_slug: str) -> Dict[str, Any]:
    """List all tables in the org's production dataset and the shared organizations dataset.

    Returns table names, row counts, and descriptions.
    """
    settings = get_settings()
    client = get_bq_client()

    results = {"org_dataset": f"{org_slug}_prod", "shared_dataset": settings.organizations_dataset, "tables": []}

    # List tables in org's _prod dataset
    try:
        dataset_ref = f"{settings.gcp_project_id}.{org_slug}_prod"
        tables = list(client.list_tables(dataset_ref))
        for t in tables:
            results["tables"].append({
                "dataset": f"{org_slug}_prod",
                "table_id": t.table_id,
                "full_id": f"{dataset_ref}.{t.table_id}",
            })
    except Exception as e:
        results["org_dataset_error"] = str(e)

    # List tables in shared organizations dataset
    try:
        dataset_ref = f"{settings.gcp_project_id}.{settings.organizations_dataset}"
        tables = list(client.list_tables(dataset_ref))
        for t in tables:
            results["tables"].append({
                "dataset": settings.organizations_dataset,
                "table_id": t.table_id,
                "full_id": f"{dataset_ref}.{t.table_id}",
            })
    except Exception as e:
        results["shared_dataset_error"] = str(e)

    return results


def describe_table(org_slug: str, table_name: str) -> Dict[str, Any]:
    """Describe the schema of a table. Only tables in the org's dataset or shared dataset are accessible.

    Args:
        table_name: Table name (e.g., 'cost_data_standard_1_3') or full table ID.
    """
    settings = get_settings()
    client = get_bq_client()

    # Resolve table reference — only allow org's dataset or shared dataset
    allowed_datasets = [f"{org_slug}_prod", settings.organizations_dataset]

    if "." in table_name:
        # Full reference — validate BOTH project and dataset
        parts = table_name.split(".")
        dataset = parts[-2] if len(parts) >= 2 else ""
        if dataset not in allowed_datasets:
            return {"error": f"Access denied: can only query datasets {allowed_datasets}"}
        # Validate project ID if provided (project.dataset.table)
        if len(parts) == 3 and parts[0] != settings.gcp_project_id:
            return {"error": f"Access denied: can only query tables in project {settings.gcp_project_id}"}
        # Always reconstruct with our project ID to prevent cross-project attacks
        table_ref = f"{settings.gcp_project_id}.{parts[-2]}.{parts[-1]}"
    else:
        # Try org dataset first, then shared
        table_ref = f"{settings.gcp_project_id}.{org_slug}_prod.{table_name}"

    def _format_table(tbl):
        return {
            "table_id": tbl.table_id,
            "full_id": str(tbl.reference),
            "num_rows": tbl.num_rows,
            "num_bytes": tbl.num_bytes,
            "schema": [
                {
                    "name": field.name,
                    "type": field.field_type,
                    "mode": field.mode,
                    "description": field.description,
                }
                for field in tbl.schema
            ],
        }

    try:
        table = client.get_table(table_ref)
        return _format_table(table)
    except Exception as e:
        # If bare name failed in org dataset, try shared organizations dataset
        if "." not in table_name:
            try:
                shared_ref = f"{settings.gcp_project_id}.{settings.organizations_dataset}.{table_name}"
                table = client.get_table(shared_ref)
                return _format_table(table)
            except Exception:
                pass  # Return original error
        return {"error": str(e)}


def run_read_query(org_slug: str, query: str) -> Dict[str, Any]:
    """Execute a read-only SQL query against BigQuery.

    SAFETY: Only SELECT queries are allowed. The query is validated before execution.
    Results are limited to 500 rows.

    Args:
        query: SQL SELECT query to execute.
    """
    # Validate: must be SELECT, no DDL/DML
    if not _SELECT_ONLY.match(query):
        return {"error": "Only SELECT queries are allowed."}

    if _DISALLOWED.search(query):
        return {"error": "Query contains disallowed keywords (INSERT, UPDATE, DELETE, DROP, etc)."}

    # Validate: must reference only allowed datasets
    settings = get_settings()
    allowed_datasets = {f"{org_slug}_prod", settings.organizations_dataset}

    # SECURITY: Parse query to verify all referenced datasets are allowed
    referenced_datasets = _extract_datasets_from_query(query)
    disallowed = referenced_datasets - allowed_datasets
    if disallowed:
        return {
            "error": f"Access denied: query references disallowed datasets {sorted(disallowed)}. "
                     f"Only {sorted(allowed_datasets)} are permitted."
        }

    # Ensure LIMIT is present (inject if missing)
    if not re.search(r"\bLIMIT\b", query, re.IGNORECASE):
        query = query.rstrip().rstrip(";") + " LIMIT 500"

    try:
        rows = execute_query(query, timeout_ms=30000)
        # Cap at 500 rows
        rows = rows[:500]
        return {
            "row_count": len(rows),
            "rows": rows,
        }
    except Exception as e:
        return {"error": str(e)}
