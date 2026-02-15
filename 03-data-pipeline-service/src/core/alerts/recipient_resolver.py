"""
Recipient Resolver

Dynamic recipient resolution for alerts via API service.

Resolvers:
- org_owners: Query API service for org owners
- hierarchy_node: Query BigQuery for hierarchy members
- all_members: All active org members via API service
- custom: Static email list from config
"""

from typing import Dict, Any, List, Optional
import logging
import httpx

from src.app.config import settings

logger = logging.getLogger(__name__)


class RecipientResolver:
    """
    Resolves alert recipients based on configuration.

    Uses API service (8000) for member lookups instead of direct Supabase access.
    """

    async def resolve(
        self,
        org_slug: str,
        recipient_config: Dict[str, Any]
    ) -> List[str]:
        """
        Resolve recipients based on configuration.

        Args:
            org_slug: Organization slug
            recipient_config: Recipient configuration from alert

        Returns:
            List of email addresses
        """
        resolver_type = recipient_config.get("type", "org_owners")

        if resolver_type == "org_owners":
            return await self._resolve_org_owners(org_slug)
        elif resolver_type == "hierarchy_node":
            node_code = recipient_config.get("node_code")
            include_children = recipient_config.get("include_children", False)
            return await self._resolve_hierarchy_node(org_slug, node_code, include_children)
        elif resolver_type == "all_members":
            return await self._resolve_all_members(org_slug)
        elif resolver_type == "custom":
            return recipient_config.get("emails", [])
        else:
            logger.warning(f"Unknown recipient type: {resolver_type}")
            return []

    async def _get_member_emails(self, org_slug: str, role: Optional[str] = None) -> List[str]:
        """Get member emails from API service."""
        try:
            url = f"{settings.api_service_url}/api/v1/organizations/{org_slug}/members/emails"
            params = {}
            if role:
                params["role"] = role

            async with httpx.AsyncClient(timeout=settings.api_service_timeout) as client:
                resp = await client.get(
                    url,
                    params=params,
                    headers={"X-CA-Root-Key": settings.ca_root_api_key or ""}
                )

            if resp.status_code == 200:
                data = resp.json()
                return [m["email"] for m in data.get("members", []) if m.get("email")]
            else:
                logger.warning(f"API service returned {resp.status_code} for member emails: {org_slug}")
                return []

        except Exception as e:
            logger.error(f"Failed to get member emails from API service for {org_slug}: {e}")
            return []

    async def _resolve_org_owners(self, org_slug: str) -> List[str]:
        """Get email addresses of org owners via API service."""
        emails = await self._get_member_emails(org_slug, role="owner")
        logger.info(f"Resolved {len(emails)} org owners for {org_slug}")
        return emails

    async def _resolve_hierarchy_node(
        self,
        org_slug: str,
        node_code: str,
        include_children: bool = False
    ) -> List[str]:
        """Get email addresses from hierarchy node owners via BigQuery."""
        from google.cloud import bigquery

        try:
            from src.core.engine.bq_client import get_bigquery_client
            bq_client = get_bigquery_client()

            if include_children:
                query = f"""
                SELECT DISTINCT owner_email
                FROM `{settings.gcp_project_id}.organizations.org_hierarchy`
                WHERE org_slug = @org_slug
                  AND (entity_id = @node_code OR path LIKE CONCAT('%/', @node_code, '/%'))
                  AND owner_email IS NOT NULL
                  AND end_date IS NULL
                """
            else:
                query = f"""
                SELECT owner_email
                FROM `{settings.gcp_project_id}.organizations.org_hierarchy`
                WHERE org_slug = @org_slug
                  AND entity_id = @node_code
                  AND owner_email IS NOT NULL
                  AND end_date IS NULL
                """

            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("org_slug", "STRING", org_slug),
                    bigquery.ScalarQueryParameter("node_code", "STRING", node_code),
                ]
            )

            job = bq_client.client.query(query, job_config=job_config)
            emails = [row["owner_email"] for row in job.result() if row.get("owner_email")]

            logger.info(f"Resolved {len(emails)} hierarchy recipients for {node_code}")
            return emails

        except Exception as e:
            logger.error(f"Failed to resolve hierarchy node {node_code}: {e}")
            return []

    async def _resolve_all_members(self, org_slug: str) -> List[str]:
        """Get email addresses of all active org members via API service."""
        emails = await self._get_member_emails(org_slug)
        logger.info(f"Resolved {len(emails)} total members for {org_slug}")
        return emails
