"""
Tests for explorer tools — SQL safety, dataset validation, cross-tenant prevention.
"""

import pytest
from unittest.mock import patch, MagicMock

from src.core.tools.explorer import (
    list_org_tables,
    describe_table,
    run_read_query,
    _extract_datasets_from_query,
)


@pytest.fixture()
def mock_settings():
    settings = MagicMock()
    settings.gcp_project_id = "test-project"
    settings.organizations_dataset = "organizations"
    return settings


class TestExtractDatasetsFromQuery:
    def test_simple_from(self):
        datasets = _extract_datasets_from_query("SELECT * FROM dataset.table")
        assert "dataset" in datasets

    def test_project_dataset_table(self):
        datasets = _extract_datasets_from_query("SELECT * FROM project.dataset.table")
        assert "dataset" in datasets

    def test_backtick_quoted(self):
        datasets = _extract_datasets_from_query("SELECT * FROM `project.dataset.table`")
        assert "dataset" in datasets

    def test_join_clause(self):
        datasets = _extract_datasets_from_query(
            "SELECT * FROM ds1.t1 JOIN ds2.t2 ON t1.id = t2.id"
        )
        assert "ds1" in datasets
        assert "ds2" in datasets

    def test_no_dataset_ref(self):
        datasets = _extract_datasets_from_query("SELECT 1")
        assert len(datasets) == 0

    def test_multiple_tables(self):
        datasets = _extract_datasets_from_query(
            "SELECT * FROM org_prod.cost_data, organizations.org_profiles"
        )
        assert "org_prod" in datasets
        assert "organizations" in datasets


class TestRunReadQuery:
    def test_select_allowed(self, mock_settings):
        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings), \
             patch("src.core.tools.explorer.execute_query", return_value=[{"a": 1}]):
            result = run_read_query("test_org", "SELECT * FROM test_org_prod.table1")
            assert result["row_count"] == 1

    def test_insert_blocked(self, mock_settings):
        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings):
            result = run_read_query("test_org", "INSERT INTO test_org_prod.table1 VALUES (1)")
            assert "error" in result
            assert "SELECT" in result["error"]

    def test_update_blocked(self, mock_settings):
        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings):
            result = run_read_query("test_org", "UPDATE test_org_prod.table1 SET x=1")
            assert "error" in result

    def test_delete_blocked(self, mock_settings):
        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings):
            result = run_read_query("test_org", "DELETE FROM test_org_prod.table1")
            assert "error" in result

    def test_drop_blocked(self, mock_settings):
        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings):
            result = run_read_query("test_org", "DROP TABLE test_org_prod.table1")
            assert "error" in result

    def test_cross_tenant_dataset_blocked(self, mock_settings):
        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings):
            result = run_read_query("test_org", "SELECT * FROM other_org_prod.secrets")
            assert "error" in result
            assert "disallowed datasets" in result["error"]

    def test_own_dataset_allowed(self, mock_settings):
        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings), \
             patch("src.core.tools.explorer.execute_query", return_value=[]):
            result = run_read_query("test_org", "SELECT * FROM test_org_prod.costs")
            assert "error" not in result

    def test_organizations_dataset_allowed(self, mock_settings):
        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings), \
             patch("src.core.tools.explorer.execute_query", return_value=[]):
            result = run_read_query("test_org", "SELECT * FROM organizations.org_profiles")
            assert "error" not in result

    def test_limit_auto_injected(self, mock_settings):
        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings), \
             patch("src.core.tools.explorer.execute_query", return_value=[]) as mock_exec:
            run_read_query("test_org", "SELECT * FROM test_org_prod.table1")
            called_query = mock_exec.call_args[0][0]
            assert "LIMIT 500" in called_query

    def test_existing_limit_preserved(self, mock_settings):
        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings), \
             patch("src.core.tools.explorer.execute_query", return_value=[]) as mock_exec:
            run_read_query("test_org", "SELECT * FROM test_org_prod.table1 LIMIT 10")
            called_query = mock_exec.call_args[0][0]
            assert "LIMIT 10" in called_query
            assert "LIMIT 500" not in called_query

    def test_results_capped_at_500(self, mock_settings):
        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings), \
             patch("src.core.tools.explorer.execute_query", return_value=[{"i": i} for i in range(600)]):
            result = run_read_query("test_org", "SELECT * FROM test_org_prod.table1 LIMIT 1000")
            assert result["row_count"] == 500


class TestDescribeTable:
    def test_simple_table_name(self, mock_settings):
        mock_table = MagicMock()
        mock_table.table_id = "cost_data"
        mock_table.reference = "test-project.test_org_prod.cost_data"
        mock_table.num_rows = 1000
        mock_table.num_bytes = 50000
        mock_table.schema = []

        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings), \
             patch("src.core.tools.explorer.get_bq_client") as mock_client:
            mock_client.return_value.get_table.return_value = mock_table
            result = describe_table("test_org", "cost_data")
            assert result["table_id"] == "cost_data"
            assert result["num_rows"] == 1000

    def test_cross_project_blocked(self, mock_settings):
        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings):
            result = describe_table("test_org", "evil-project.test_org_prod.table1")
            assert "error" in result
            assert "Access denied" in result["error"]

    def test_cross_dataset_blocked(self, mock_settings):
        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings):
            result = describe_table("test_org", "other_org_prod.secret_table")
            assert "error" in result
            assert "Access denied" in result["error"]

    def test_own_dataset_allowed(self, mock_settings):
        mock_table = MagicMock()
        mock_table.table_id = "cost_data"
        mock_table.reference = "test-project.test_org_prod.cost_data"
        mock_table.num_rows = 100
        mock_table.num_bytes = 5000
        mock_table.schema = []

        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings), \
             patch("src.core.tools.explorer.get_bq_client") as mock_client:
            mock_client.return_value.get_table.return_value = mock_table
            result = describe_table("test_org", "test_org_prod.cost_data")
            assert "error" not in result

    def test_organizations_dataset_allowed(self, mock_settings):
        mock_table = MagicMock()
        mock_table.table_id = "org_profiles"
        mock_table.reference = "test-project.organizations.org_profiles"
        mock_table.num_rows = 50
        mock_table.num_bytes = 2000
        mock_table.schema = []

        with patch("src.core.tools.explorer.get_settings", return_value=mock_settings), \
             patch("src.core.tools.explorer.get_bq_client") as mock_client:
            mock_client.return_value.get_table.return_value = mock_table
            result = describe_table("test_org", "organizations.org_profiles")
            assert "error" not in result
