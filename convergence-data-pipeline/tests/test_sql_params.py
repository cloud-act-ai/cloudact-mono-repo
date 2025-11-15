"""
Unit tests for SQL Parameter Injection utility.

Tests cover:
- Secure parameter injection
- Type inference and conversion
- SQL injection prevention
- Parameter validation
- Safe filter building
"""

import pytest
from datetime import date, datetime
from decimal import Decimal
from google.cloud.bigquery import ScalarQueryParameter, QueryJobConfig, WriteDisposition

from src.core.utils.sql_params import (
    SQLParameterInjector,
    create_parameterized_query_config
)


class TestSQLParameterInjector:
    """Test SQLParameterInjector class."""

    def test_create_query_config_with_string_params(self):
        """Test creating QueryJobConfig with string parameters."""
        params = {
            'tenant_id': 'test_tenant_123',
            'status': 'active'
        }

        config = SQLParameterInjector.create_query_config(params)

        assert config.query_parameters is not None
        assert len(config.query_parameters) == 2

        param_dict = {p.name: (p.type_, p.value) for p in config.query_parameters}
        assert param_dict['tenant_id'] == ('STRING', 'test_tenant_123')
        assert param_dict['status'] == ('STRING', 'active')

    def test_create_query_config_with_int_params(self):
        """Test creating QueryJobConfig with integer parameters."""
        params = {
            'limit': 100,
            'offset': 50
        }

        config = SQLParameterInjector.create_query_config(params)

        param_dict = {p.name: (p.type_, p.value) for p in config.query_parameters}
        assert param_dict['limit'] == ('INT64', 100)
        assert param_dict['offset'] == ('INT64', 50)

    def test_create_query_config_with_float_params(self):
        """Test creating QueryJobConfig with float parameters."""
        params = {
            'threshold': 0.95,
            'rate': 1.5
        }

        config = SQLParameterInjector.create_query_config(params)

        param_dict = {p.name: (p.type_, p.value) for p in config.query_parameters}
        assert param_dict['threshold'] == ('FLOAT64', 0.95)
        assert param_dict['rate'] == ('FLOAT64', 1.5)

    def test_create_query_config_with_bool_params(self):
        """Test creating QueryJobConfig with boolean parameters."""
        params = {
            'is_active': True,
            'is_deleted': False
        }

        config = SQLParameterInjector.create_query_config(params)

        param_dict = {p.name: (p.type_, p.value) for p in config.query_parameters}
        assert param_dict['is_active'] == ('BOOL', True)
        assert param_dict['is_deleted'] == ('BOOL', False)

    def test_create_query_config_with_date_params(self):
        """Test creating QueryJobConfig with date parameters."""
        test_date = date(2024, 1, 1)
        params = {
            'start_date': test_date
        }

        config = SQLParameterInjector.create_query_config(params)

        param_dict = {p.name: (p.type_, p.value) for p in config.query_parameters}
        assert param_dict['start_date'] == ('DATE', test_date)

    def test_create_query_config_with_timestamp_params(self):
        """Test creating QueryJobConfig with timestamp parameters."""
        test_datetime = datetime(2024, 1, 1, 12, 30, 45)
        params = {
            'event_time': test_datetime
        }

        config = SQLParameterInjector.create_query_config(params)

        param_dict = {p.name: (p.type_, p.value) for p in config.query_parameters}
        # BigQuery adds UTC timezone if not present
        assert param_dict['event_time'][0] == 'TIMESTAMP'
        # Check the datetime values match (ignoring timezone info that BigQuery may add)
        assert param_dict['event_time'][1].replace(tzinfo=None) == test_datetime

    def test_create_query_config_with_decimal_params(self):
        """Test creating QueryJobConfig with decimal parameters."""
        params = {
            'amount': Decimal('123.45')
        }

        config = SQLParameterInjector.create_query_config(params)

        param_dict = {p.name: (p.type_, p.value) for p in config.query_parameters}
        assert param_dict['amount'] == ('NUMERIC', Decimal('123.45'))

    def test_create_query_config_with_none_params(self):
        """Test creating QueryJobConfig with None/NULL parameters."""
        params = {
            'optional_field': None
        }

        config = SQLParameterInjector.create_query_config(params)

        param_dict = {p.name: (p.type_, p.value) for p in config.query_parameters}
        assert param_dict['optional_field'] == ('STRING', None)

    def test_create_query_config_with_mixed_types(self):
        """Test creating QueryJobConfig with mixed parameter types."""
        params = {
            'tenant_id': 'test_123',
            'limit': 100,
            'threshold': 0.95,
            'is_active': True,
            'start_date': date(2024, 1, 1)
        }

        config = SQLParameterInjector.create_query_config(params)

        assert len(config.query_parameters) == 5
        param_dict = {p.name: (p.type_, p.value) for p in config.query_parameters}

        assert param_dict['tenant_id'][0] == 'STRING'
        assert param_dict['limit'][0] == 'INT64'
        assert param_dict['threshold'][0] == 'FLOAT64'
        assert param_dict['is_active'][0] == 'BOOL'
        assert param_dict['start_date'][0] == 'DATE'

    def test_create_query_config_extends_base_config(self):
        """Test that parameters are added to existing QueryJobConfig."""
        base_config = QueryJobConfig(
            destination='project.dataset.table',
            write_disposition=WriteDisposition.WRITE_TRUNCATE
        )

        params = {'tenant_id': 'test_123'}

        config = SQLParameterInjector.create_query_config(params, base_config)

        # Destination gets converted to TableReference by BigQuery client
        assert str(config.destination) == 'project.dataset.table'
        assert config.write_disposition == WriteDisposition.WRITE_TRUNCATE
        assert len(config.query_parameters) == 1

    def test_create_query_config_empty_params(self):
        """Test creating QueryJobConfig with empty parameters."""
        config = SQLParameterInjector.create_query_config({})

        # Should still return valid config
        assert config is not None
        assert config.query_parameters is None or len(config.query_parameters) == 0

    def test_invalid_parameter_name_with_hyphen(self):
        """Test that parameter names with hyphens are rejected."""
        params = {'tenant-id': 'test_123'}

        with pytest.raises(ValueError, match="Invalid parameter name"):
            SQLParameterInjector.create_query_config(params)

    def test_invalid_parameter_name_starting_with_number(self):
        """Test that parameter names starting with numbers are rejected."""
        params = {'123tenant': 'test'}

        with pytest.raises(ValueError, match="Invalid parameter name"):
            SQLParameterInjector.create_query_config(params)

    def test_invalid_parameter_name_with_special_chars(self):
        """Test that parameter names with special characters are rejected."""
        params = {'tenant@id': 'test_123'}

        with pytest.raises(ValueError, match="Invalid parameter name"):
            SQLParameterInjector.create_query_config(params)

    def test_int64_range_validation_max(self):
        """Test INT64 range validation for maximum value."""
        params = {'big_num': 9223372036854775807}  # Max INT64

        config = SQLParameterInjector.create_query_config(params)
        param_dict = {p.name: (p.type_, p.value) for p in config.query_parameters}
        assert param_dict['big_num'][0] == 'INT64'

    def test_int64_range_validation_overflow(self):
        """Test INT64 range validation rejects overflow."""
        params = {'too_big': 9223372036854775808}  # Max INT64 + 1

        with pytest.raises(ValueError, match="out of INT64 range"):
            SQLParameterInjector.create_query_config(params)

    def test_sanitize_identifier_valid(self):
        """Test sanitizing valid identifiers."""
        assert SQLParameterInjector.sanitize_identifier('valid_name') == 'valid_name'
        assert SQLParameterInjector.sanitize_identifier('table123') == 'table123'
        assert SQLParameterInjector.sanitize_identifier('_private') == '_private'

    def test_sanitize_identifier_removes_invalid_chars(self):
        """Test that invalid characters are removed from identifiers."""
        result = SQLParameterInjector.sanitize_identifier('table-name!')
        assert result == 'tablename'

    def test_sanitize_identifier_fixes_leading_digit(self):
        """Test that identifiers starting with digits are fixed."""
        result = SQLParameterInjector.sanitize_identifier('123table')
        assert result == '_123table'

    def test_sanitize_identifier_empty_raises(self):
        """Test that empty identifiers raise an error."""
        with pytest.raises(ValueError, match="cannot be empty"):
            SQLParameterInjector.sanitize_identifier('')

    def test_sanitize_identifier_only_invalid_chars_raises(self):
        """Test that identifiers with only invalid characters raise an error."""
        with pytest.raises(ValueError, match="contains no valid characters"):
            SQLParameterInjector.sanitize_identifier('!!!')

    def test_build_safe_filter_equals(self):
        """Test building safe filter with = operator."""
        clause, params = SQLParameterInjector.build_safe_filter(
            field_name='status',
            operator='=',
            value='active'
        )

        assert clause == 'status = @filter_status'
        assert params == {'filter_status': 'active'}

    def test_build_safe_filter_greater_than(self):
        """Test building safe filter with > operator."""
        clause, params = SQLParameterInjector.build_safe_filter(
            field_name='count',
            operator='>',
            value=100
        )

        assert clause == 'count > @filter_count'
        assert params == {'filter_count': 100}

    def test_build_safe_filter_like(self):
        """Test building safe filter with LIKE operator."""
        clause, params = SQLParameterInjector.build_safe_filter(
            field_name='name',
            operator='LIKE',
            value='%test%'
        )

        assert clause == 'name LIKE @filter_name'
        assert params == {'filter_name': '%test%'}

    def test_build_safe_filter_is_null(self):
        """Test building safe filter with IS NULL."""
        clause, params = SQLParameterInjector.build_safe_filter(
            field_name='deleted_at',
            operator='IS',
            value=None
        )

        assert clause == 'deleted_at IS NULL'
        assert params == {}

    def test_build_safe_filter_is_not_null(self):
        """Test building safe filter with IS NOT NULL."""
        clause, params = SQLParameterInjector.build_safe_filter(
            field_name='created_at',
            operator='IS NOT',
            value=None
        )

        assert clause == 'created_at IS NOT NULL'
        assert params == {}

    def test_build_safe_filter_invalid_operator(self):
        """Test that invalid operators are rejected."""
        with pytest.raises(ValueError, match="Invalid operator"):
            SQLParameterInjector.build_safe_filter(
                field_name='status',
                operator='INVALID',
                value='test'
            )

    def test_build_safe_filter_sanitizes_field_name(self):
        """Test that field names are sanitized in filters."""
        clause, params = SQLParameterInjector.build_safe_filter(
            field_name='field-name!',
            operator='=',
            value='test'
        )

        # Should sanitize field name
        assert 'fieldname' in clause
        assert '@filter_fieldname' in clause


class TestCreateParameterizedQueryConfig:
    """Test convenience function for creating parameterized query configs."""

    def test_create_with_all_options(self):
        """Test creating config with all options."""
        params = {'tenant_id': 'test_123'}

        config = create_parameterized_query_config(
            parameters=params,
            destination='project.dataset.table',
            write_disposition=WriteDisposition.WRITE_APPEND,
            use_legacy_sql=False,
            allow_large_results=True
        )

        # Destination gets converted to TableReference by BigQuery client
        assert str(config.destination) == 'project.dataset.table'
        assert config.write_disposition == WriteDisposition.WRITE_APPEND
        assert config.use_legacy_sql is False
        assert config.allow_large_results is True
        assert len(config.query_parameters) == 1

    def test_create_with_minimal_options(self):
        """Test creating config with minimal options."""
        params = {'tenant_id': 'test_123'}

        config = create_parameterized_query_config(parameters=params)

        assert config.use_legacy_sql is False
        assert config.allow_large_results is True
        assert len(config.query_parameters) == 1


class TestSQLInjectionPrevention:
    """Test that SQL injection attempts are prevented."""

    def test_prevent_sql_comment_injection(self):
        """Test that SQL comments in values don't cause injection."""
        params = {
            'user_input': "test'; DROP TABLE users; --"
        }

        config = SQLParameterInjector.create_query_config(params)

        # Should create parameter (parameterization prevents injection)
        assert len(config.query_parameters) == 1
        param = config.query_parameters[0]
        assert param.value == "test'; DROP TABLE users; --"
        # The value is passed as a parameter, not concatenated into SQL

    def test_prevent_union_injection(self):
        """Test that UNION injection attempts are prevented."""
        params = {
            'search': "' UNION SELECT * FROM passwords --"
        }

        config = SQLParameterInjector.create_query_config(params)

        # Should create parameter safely
        assert len(config.query_parameters) == 1
        param = config.query_parameters[0]
        assert 'UNION' in param.value
        # The parameterization prevents this from being executed as SQL

    def test_prevent_semicolon_injection(self):
        """Test that semicolon-based injection is prevented."""
        params = {
            'id': "1; DELETE FROM users WHERE 1=1"
        }

        config = SQLParameterInjector.create_query_config(params)

        # Should create parameter safely
        assert len(config.query_parameters) == 1

    def test_safe_filter_prevents_injection_in_field_name(self):
        """Test that field name injection is prevented."""
        # Attempt to inject SQL via field name
        malicious_field = "status; DROP TABLE users; --"

        clause, params = SQLParameterInjector.build_safe_filter(
            field_name=malicious_field,
            operator='=',
            value='test'
        )

        # Field name should be sanitized - special chars removed, but letters remain
        # Note: Letters from "DROP", "TABLE", "users" will remain (alphanumeric allowed)
        # but SQL keywords are harmless when used as identifiers
        assert ';' not in clause  # Semicolon removed
        assert '--' not in clause  # Comment removed
        # The sanitized identifier won't execute as SQL, just becomes a column name

    def test_safe_filter_prevents_injection_in_value(self):
        """Test that value injection is prevented in filters."""
        clause, params = SQLParameterInjector.build_safe_filter(
            field_name='status',
            operator='=',
            value="' OR '1'='1"
        )

        # Value is parameterized, not concatenated
        assert '@filter_status' in clause
        assert params['filter_status'] == "' OR '1'='1"
        # This will be safely passed as a parameter value, not executed as SQL


class TestRealWorldScenarios:
    """Test real-world usage scenarios."""

    def test_pipeline_query_with_parameters(self):
        """Test typical pipeline query with parameters."""
        params = {
            'tenant_id': 'acme_corp',
            'start_date': date(2024, 1, 1),
            'end_date': date(2024, 12, 31),
            'min_amount': 100.0,
            'is_active': True
        }

        config = SQLParameterInjector.create_query_config(params)

        # Query would be:
        # SELECT * FROM table
        # WHERE tenant_id = @tenant_id
        #   AND date >= @start_date
        #   AND date <= @end_date
        #   AND amount >= @min_amount
        #   AND is_active = @is_active

        assert len(config.query_parameters) == 5
        param_dict = {p.name: p for p in config.query_parameters}

        assert param_dict['tenant_id'].type_ == 'STRING'
        assert param_dict['start_date'].type_ == 'DATE'
        assert param_dict['end_date'].type_ == 'DATE'
        assert param_dict['min_amount'].type_ == 'FLOAT64'
        assert param_dict['is_active'].type_ == 'BOOL'

    def test_partition_filter_with_date(self):
        """Test building partition filter for date partitioning."""
        partition_value = '2024-01-15'

        clause, params = SQLParameterInjector.build_safe_filter(
            field_name='date',
            operator='=',
            value=partition_value
        )

        # This would be added to query: WHERE date = @filter_date
        assert clause == 'date = @filter_date'
        assert params['filter_date'] == '2024-01-15'

    def test_multi_tenant_query_parameters(self):
        """Test parameters for multi-tenant query."""
        params = {
            'tenant_id': 'tenant_abc123',
            'user_id': 'user_xyz789',
            'workspace_id': 'ws_456',
            'limit': 1000
        }

        config = SQLParameterInjector.create_query_config(params)

        assert len(config.query_parameters) == 4

        # All should be properly typed
        param_types = {p.name: p.type_ for p in config.query_parameters}
        assert param_types['tenant_id'] == 'STRING'
        assert param_types['user_id'] == 'STRING'
        assert param_types['workspace_id'] == 'STRING'
        assert param_types['limit'] == 'INT64'
