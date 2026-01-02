"""
Template Variable Resolver
Recursively replaces template variables in YAML configurations.
"""

import yaml
import re
from pathlib import Path
from typing import Dict, Any, Union, List


class TemplateResolver:
    """
    Resolves template variables in pipeline configurations.

    Supports recursive replacement of {variable} placeholders in:
    - String values
    - Nested dictionaries
    - Lists
    - Multi-line strings (SQL queries, etc.)
    """

    # Regex pattern to match {variable_name} placeholders
    VARIABLE_PATTERN = re.compile(r'\{([a-zA-Z0-9_]+)\}')

    def __init__(self, variables: Dict[str, str]):
        """
        Initialize template resolver with variables.

        Args:
            variables: Dictionary of variable names to replacement values
        """
        self.variables = variables

    def resolve(self, value: Any) -> Any:
        """
        Recursively resolve template variables in a value.

        Args:
            value: Value to resolve (can be str, dict, list, or primitive)

        Returns:
            Value with all template variables replaced
        """
        if isinstance(value, str):
            return self._resolve_string(value)
        elif isinstance(value, dict):
            return self._resolve_dict(value)
        elif isinstance(value, list):
            return self._resolve_list(value)
        else:
            # Return primitives (int, float, bool, None) unchanged
            return value

    def _resolve_string(self, s: str) -> str:
        """
        Replace all {variable} placeholders in a string.

        Args:
            s: String with potential template variables

        Returns:
            String with variables replaced

        Examples:
            "{org_slug}.raw_data" with {"org_slug": "acme123"} -> "acme123.raw_data"
            "{pipeline_id}-{provider}" with {"pipeline_id": "billing", "provider": "gcp"}
                -> "billing-gcp"
        """
        def replacer(match):
            var_name = match.group(1)
            if var_name in self.variables:
                return str(self.variables[var_name])
            else:
                # Keep placeholder if variable not found (allows partial replacement)
                return match.group(0)

        return self.VARIABLE_PATTERN.sub(replacer, s)

    def _resolve_dict(self, d: Dict[str, Any]) -> Dict[str, Any]:
        """
        Recursively resolve variables in dictionary values.

        Args:
            d: Dictionary with potential template variables

        Returns:
            Dictionary with all variables replaced
        """
        return {key: self.resolve(value) for key, value in d.items()}

    def _resolve_list(self, lst: List[Any]) -> List[Any]:
        """
        Recursively resolve variables in list items.

        Args:
            lst: List with potential template variables

        Returns:
            List with all variables replaced
        """
        return [self.resolve(item) for item in lst]


def resolve_template(template_path: str, variables: Dict[str, str]) -> Dict[str, Any]:
    """
    Load a YAML template file and resolve all template variables.

    Args:
        template_path: Path to YAML template file
        variables: Dictionary of variable names to replacement values

    Returns:
        Resolved configuration dictionary

    Raises:
        FileNotFoundError: If template file doesn't exist
        yaml.YAMLError: If YAML parsing fails

    Example:
        >>> variables = {
        ...     "org_slug": "acmeinc_23xv2",
        ...     "provider": "gcp",
        ...     "domain": "cost",
        ...     "template_name": "bill-sample-export-template",
        ...     "pipeline_id": "acmeinc_23xv2-gcp-cost-bill-sample-export-template"
        ... }
        >>> config = resolve_template("configs/gcp/cost/bill-sample-export-template.yml", variables)
        >>> config['pipeline_name']
        'acmeinc_23xv2-gcp-cost-bill-sample-export-template'
    """
    path = Path(template_path)

    if not path.exists():
        raise FileNotFoundError(f"Template file not found: {template_path}")

    # Load YAML file
    with open(path, 'r') as f:
        template_config = yaml.safe_load(f)

    if template_config is None:
        raise ValueError(f"Template file is empty or invalid: {template_path}")

    # Resolve all variables
    resolver = TemplateResolver(variables)
    resolved_config = resolver.resolve(template_config)

    return resolved_config


def get_template_path(
    category: str,
    provider: str,
    domain: str,
    template_name: str
) -> str:
    """
    Construct template file path from category/provider/domain/template_name.

    Supports multiple path structures:
    - Cloud providers: configs/cloud/gcp/cost/billing.yml (4 segments)
    - GenAI: configs/genai/payg/openai.yml (3 segments, empty provider)
    - Subscription: configs/subscription/costs/subscription_cost.yml (3 segments, empty provider)

    Args:
        category: Top-level category (e.g., 'cloud', 'genai', 'saas')
        provider: Provider within category (e.g., 'gcp', 'aws') or empty string
        domain: Domain category (e.g., 'cost', 'payg', 'costs')
        template_name: Template name (without .yml extension)

    Returns:
        Template file path relative to configs directory

    Examples:
        >>> get_template_path("cloud", "gcp", "cost", "billing")
        'configs/cloud/gcp/cost/billing.yml'
        >>> get_template_path("genai", "", "payg", "openai")
        'configs/genai/payg/openai.yml'
        >>> get_template_path("subscription", "", "costs", "subscription_cost")
        'configs/subscription/costs/subscription_cost.yml'
    """
    if provider:
        # 4-segment path for cloud providers
        return f"configs/{category}/{provider}/{domain}/{template_name}.yml"
    else:
        # 3-segment path for genai, saas
        return f"configs/{category}/{domain}/{template_name}.yml"


def get_template_path_legacy(provider: str, domain: str, template_name: str) -> str:
    """
    Legacy function for backward compatibility.

    DEPRECATED: Use get_template_path with category parameter instead.
    """
    if domain:
        return f"configs/{provider}/{domain}/{template_name}.yml"
    else:
        return f"configs/{provider}/{template_name}.yml"
