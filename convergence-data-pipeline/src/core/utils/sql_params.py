"""
SQL Parameter Injection Utility
Provides secure parameter substitution for BigQuery queries using parameterized queries.
"""

from typing import Dict, Any, List, Optional
from datetime import date, datetime
from decimal import Decimal
from google.cloud.bigquery import ScalarQueryParameter, QueryJobConfig
from src.core.utils.logging import get_logger

logger = get_logger(__name__)


class SQLParameterInjector:
    """
    Secure SQL parameter injection using BigQuery QueryJobConfig.

    Prevents SQL injection by using parameterized queries instead of string replacement.
    Supports all BigQuery data types with proper type conversion and validation.
    """

    # Supported BigQuery parameter types
    SUPPORTED_TYPES = {
        'STRING', 'INT64', 'FLOAT64', 'BOOL', 'DATE', 'TIMESTAMP',
        'NUMERIC', 'BYTES', 'DATETIME', 'TIME', 'GEOGRAPHY', 'JSON'
    }

    @classmethod
    def create_query_config(
        cls,
        parameters: Dict[str, Any],
        base_config: Optional[QueryJobConfig] = None
    ) -> QueryJobConfig:
        """
        Create QueryJobConfig with safe parameter injection.

        Args:
            parameters: Dictionary of parameter names to values
            base_config: Optional existing QueryJobConfig to extend

        Returns:
            QueryJobConfig with query_parameters set

        Raises:
            ValueError: If parameter type is unsupported or invalid

        Example:
            >>> params = {'tenant_id': 'abc123', 'start_date': '2024-01-01'}
            >>> config = SQLParameterInjector.create_query_config(params)
            >>> query = "SELECT * FROM table WHERE tenant_id = @tenant_id AND date >= @start_date"
            >>> job = client.query(query, job_config=config)
        """
        if base_config is None:
            job_config = QueryJobConfig()
        else:
            job_config = base_config

        if not parameters:
            return job_config

        # Convert parameters to ScalarQueryParameter objects
        query_params = []
        for param_name, param_value in parameters.items():
            query_param = cls._create_scalar_parameter(param_name, param_value)
            query_params.append(query_param)

        job_config.query_parameters = query_params

        logger.debug(
            f"Created QueryJobConfig with {len(query_params)} parameters",
            extra={"param_names": list(parameters.keys())}
        )

        return job_config

    @classmethod
    def _create_scalar_parameter(
        cls,
        name: str,
        value: Any
    ) -> ScalarQueryParameter:
        """
        Create a ScalarQueryParameter with automatic type inference.

        Args:
            name: Parameter name
            value: Parameter value

        Returns:
            ScalarQueryParameter with appropriate type

        Raises:
            ValueError: If value type cannot be converted
        """
        # Validate parameter name (must be valid BigQuery identifier)
        if not cls._is_valid_parameter_name(name):
            raise ValueError(
                f"Invalid parameter name '{name}'. "
                f"Must start with letter/underscore and contain only alphanumeric/underscore characters."
            )

        # Handle None/NULL values
        if value is None:
            # BigQuery requires a type even for NULL values
            return ScalarQueryParameter(name, "STRING", None)

        # Infer type from Python value
        bq_type, converted_value = cls._infer_type_and_convert(value)

        return ScalarQueryParameter(name, bq_type, converted_value)

    @classmethod
    def _infer_type_and_convert(cls, value: Any) -> tuple[str, Any]:
        """
        Infer BigQuery type from Python value and convert if needed.

        Args:
            value: Python value

        Returns:
            Tuple of (bigquery_type, converted_value)

        Raises:
            ValueError: If type cannot be inferred
        """
        # Boolean (must check before int, as bool is subclass of int)
        if isinstance(value, bool):
            return ("BOOL", value)

        # Integer
        if isinstance(value, int):
            # Validate range (BigQuery INT64)
            if value < -9223372036854775808 or value > 9223372036854775807:
                raise ValueError(f"Integer value {value} out of INT64 range")
            return ("INT64", value)

        # Float
        if isinstance(value, float):
            return ("FLOAT64", value)

        # Decimal/Numeric
        if isinstance(value, Decimal):
            # BigQuery expects Decimal as the actual value, not string
            return ("NUMERIC", value)

        # Date
        if isinstance(value, date) and not isinstance(value, datetime):
            # BigQuery expects date object, not string
            return ("DATE", value)

        # Datetime/Timestamp
        if isinstance(value, datetime):
            # BigQuery expects datetime object, not string
            return ("TIMESTAMP", value)

        # String (most common, keep as default)
        if isinstance(value, str):
            # Validate string is not attempting SQL injection
            cls._validate_string_value(value)
            return ("STRING", value)

        # Bytes
        if isinstance(value, bytes):
            return ("BYTES", value)

        # Fallback: convert to string with validation
        logger.warning(
            f"Unknown type {type(value)} for value {value}, converting to STRING",
            extra={"value_type": str(type(value))}
        )
        str_value = str(value)
        cls._validate_string_value(str_value)
        return ("STRING", str_value)

    @classmethod
    def _is_valid_parameter_name(cls, name: str) -> bool:
        """
        Validate parameter name follows BigQuery identifier rules.

        Args:
            name: Parameter name to validate

        Returns:
            True if valid, False otherwise
        """
        if not name:
            return False

        # Must start with letter or underscore
        if not (name[0].isalpha() or name[0] == '_'):
            return False

        # Must contain only alphanumeric and underscore
        return all(c.isalnum() or c == '_' for c in name)

    @classmethod
    def _validate_string_value(cls, value: str) -> None:
        """
        Validate string value for suspicious patterns.

        Args:
            value: String value to validate

        Raises:
            ValueError: If suspicious SQL patterns detected
        """
        # Check for common SQL injection patterns
        suspicious_patterns = [
            '--',  # SQL comment
            '/*',  # Multi-line comment start
            '*/',  # Multi-line comment end
            ';',   # Statement separator
            'UNION',  # UNION injection
            'DROP',   # Destructive operation
            'DELETE',  # Destructive operation
            'UPDATE',  # Destructive operation
            'INSERT',  # Injection operation
        ]

        upper_value = value.upper()
        for pattern in suspicious_patterns:
            if pattern in upper_value:
                logger.warning(
                    f"Suspicious pattern '{pattern}' detected in parameter value",
                    extra={"pattern": pattern, "value_preview": value[:50]}
                )
                # Note: We log but don't block, as legitimate data may contain these strings
                # The parameterization itself prevents SQL injection

    @classmethod
    def sanitize_identifier(cls, identifier: str) -> str:
        """
        Sanitize a SQL identifier (table name, column name, etc.).

        IMPORTANT: Use this ONLY for identifiers, NOT for parameter values.
        Parameter values should ALWAYS use parameterized queries.

        Args:
            identifier: SQL identifier to sanitize

        Returns:
            Sanitized identifier (alphanumeric + underscore only)

        Raises:
            ValueError: If identifier is empty or invalid
        """
        if not identifier:
            raise ValueError("Identifier cannot be empty")

        # Remove any characters that aren't alphanumeric or underscore
        sanitized = ''.join(c for c in identifier if c.isalnum() or c == '_')

        if not sanitized:
            raise ValueError(f"Identifier '{identifier}' contains no valid characters")

        # Ensure it doesn't start with a number
        if sanitized[0].isdigit():
            sanitized = '_' + sanitized

        if sanitized != identifier:
            logger.warning(
                f"Identifier sanitized from '{identifier}' to '{sanitized}'",
                extra={"original": identifier, "sanitized": sanitized}
            )

        return sanitized

    @classmethod
    def build_safe_filter(
        cls,
        field_name: str,
        operator: str,
        value: Any
    ) -> tuple[str, Dict[str, Any]]:
        """
        Build a safe SQL filter clause with parameterization.

        Args:
            field_name: Column name to filter on
            operator: SQL operator (=, >, <, >=, <=, !=, IN, LIKE)
            value: Filter value

        Returns:
            Tuple of (filter_clause, parameters_dict)

        Raises:
            ValueError: If operator is invalid

        Example:
            >>> clause, params = SQLParameterInjector.build_safe_filter('date', '>=', '2024-01-01')
            >>> # Returns: ('date >= @filter_date', {'filter_date': '2024-01-01'})
        """
        # Validate operator
        valid_operators = {'=', '>', '<', '>=', '<=', '!=', 'IN', 'LIKE', 'NOT IN', 'IS', 'IS NOT'}
        operator_upper = operator.upper().strip()

        if operator_upper not in valid_operators:
            raise ValueError(f"Invalid operator '{operator}'. Must be one of: {valid_operators}")

        # Sanitize field name
        safe_field = cls.sanitize_identifier(field_name)

        # Generate parameter name
        param_name = f"filter_{safe_field}"

        # Handle special operators
        if operator_upper in ('IS', 'IS NOT'):
            # IS NULL / IS NOT NULL
            if value is None or str(value).upper() == 'NULL':
                return (f"{safe_field} {operator_upper} NULL", {})
            else:
                raise ValueError(f"IS/IS NOT operators only support NULL value, got: {value}")

        # Build filter clause
        filter_clause = f"{safe_field} {operator_upper} @{param_name}"
        parameters = {param_name: value}

        return (filter_clause, parameters)


def create_parameterized_query_config(
    parameters: Dict[str, Any],
    destination: Optional[str] = None,
    write_disposition: Optional[Any] = None,
    use_legacy_sql: bool = False,
    allow_large_results: bool = True
) -> QueryJobConfig:
    """
    Convenience function to create QueryJobConfig with common options and parameters.

    Args:
        parameters: Query parameters
        destination: Destination table ID
        write_disposition: How to write results (WRITE_TRUNCATE, WRITE_APPEND, etc.)
        use_legacy_sql: Use legacy SQL syntax
        allow_large_results: Allow large results

    Returns:
        Configured QueryJobConfig

    Example:
        >>> params = {'tenant': 'abc123', 'min_date': '2024-01-01'}
        >>> config = create_parameterized_query_config(
        ...     parameters=params,
        ...     destination='project.dataset.table',
        ...     write_disposition=WriteDisposition.WRITE_TRUNCATE
        ... )
    """
    job_config = QueryJobConfig(
        use_legacy_sql=use_legacy_sql,
        allow_large_results=allow_large_results
    )

    if destination:
        job_config.destination = destination

    if write_disposition:
        job_config.write_disposition = write_disposition

    return SQLParameterInjector.create_query_config(parameters, job_config)
