"""
Pricing Service

Centralizes logic for retrieving model pricing.
Prioritizes BigQuery (ref_model_pricing) > Hardcoded Fallbacks.
"""

from typing import Dict, Optional, Any
import logging

# Fallback pricing data (USD per 1K tokens)
# Kept as a safety net if DB lookup fails
FALLBACK_PRICING = {
    # Anthropic
    "claude-3-5-sonnet-20241022": {"input": 0.003, "output": 0.015},
    "claude-3-opus-20240229": {"input": 0.015, "output": 0.075},
    "claude-3-haiku-20240307": {"input": 0.00025, "output": 0.00125},
    "claude-2.1": {"input": 0.008, "output": 0.024},
    "claude-2.0": {"input": 0.008, "output": 0.024},
    "claude-instant-1.2": {"input": 0.0008, "output": 0.0024},
    
    # OpenAI
    "gpt-4o-2024-05-13": {"input": 0.005, "output": 0.015},
    "gpt-4-turbo-2024-04-09": {"input": 0.01, "output": 0.03},
    "gpt-4-0125-preview": {"input": 0.01, "output": 0.03},
    "gpt-4-1106-preview": {"input": 0.01, "output": 0.03},
    "gpt-4": {"input": 0.03, "output": 0.06},
    "gpt-3.5-turbo-0125": {"input": 0.0005, "output": 0.0015},
    "gpt-3.5-turbo-1106": {"input": 0.001, "output": 0.002},
    "gpt-3.5-turbo": {"input": 0.0015, "output": 0.002},
    
    # Google (Vertex AI) - Estimates
    "gemini-1.5-pro": {"input": 0.0035, "output": 0.0105}, # < 128k context
    "gemini-1.5-flash": {"input": 0.00035, "output": 0.00105}, # < 128k context
    "gemini-1.0-pro": {"input": 0.0005, "output": 0.0015},
    
    # Generic Default
    "default": {"input": 0.001, "output": 0.002}
}

class PricingService:
    def __init__(self):
        self.logger = logging.getLogger(__name__)

    async def get_pricing(self, provider: str, bq_client=None, project_id: str = None) -> Dict[str, Dict[str, float]]:
        """
        Retrieves pricing for a specific provider.
        
        Args:
            provider: 'ANTHROPIC', 'OPENAI', 'GOOGLE'
            bq_client: Optional BigQueryClient instance to fetch specific overrides
            project_id: GCP project ID for DB lookups
            
        Returns:
            Dictionary mapping model_id -> {'input': float, 'output': float}
        """
        pricing = {}
        
        # 1. Load from DB if client provided (Preferred)
        if bq_client and project_id:
            try:
                db_pricing = await self._load_from_bq(bq_client, project_id, provider)
                if db_pricing:
                    pricing.update(db_pricing)
            except Exception as e:
                self.logger.warning(f"Failed to load pricing from DB for {provider}: {e}")

        # 2. Fill in gaps with fallback pricing
        # Only add fallbacks that aren't already covered by DB
        for model, costs in FALLBACK_PRICING.items():
            if model not in pricing:
                # Simple heuristic: matches provider if known, or add all if unsure.
                # For simplicity, we add all known models from fallback to the map
                # The caller will just lookup by key.
                pricing[model] = costs

        return pricing

    async def _load_from_bq(self, bq_client, project_id: str, provider: str) -> Dict[str, Dict[str, float]]:
        """Load pricing from ref_model_pricing table."""
        # Note: This assumes a central 'organizations.ref_model_pricing' table exists
        # or similar. Adjust query based on actual schema.
        query = f"""
            SELECT
                model_id,
                input_price_per_1k,
                output_price_per_1k
            FROM `{project_id}.organizations.ref_model_pricing`
            WHERE provider = @provider
              AND effective_date <= CURRENT_DATE()
            ORDER BY model_id, effective_date DESC
        """
        
        from google.cloud import bigquery
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("provider", "STRING", provider)
            ]
        )

        try:
            result = bq_client.client.query(query, job_config=job_config).result()
            pricing = {}
            for row in result:
                if row.model_id not in pricing:
                     pricing[row.model_id] = {
                        "input": float(row.input_price_per_1k or 0),
                        "output": float(row.output_price_per_1k or 0)
                    }
            return pricing
        except Exception as e:
            # If table doesn't exist or query fails, just return empty
            self.logger.debug(f"DB pricing lookup failed (expected if table missing): {e}")
            return {}

def get_pricing_service():
    return PricingService()
