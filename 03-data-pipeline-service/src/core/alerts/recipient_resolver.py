"""
Recipient Resolver

Dynamic recipient resolution for alerts.

Resolvers:
- org_owners: Query Supabase for org owners
- hierarchy_node: Query BigQuery for hierarchy members
- all_members: All active org members
- custom: Static email list from config
"""

from typing import Dict, Any, List, Optional
import os
import logging

from src.app.config import settings

logger = logging.getLogger(__name__)


class RecipientResolver:
    """
    Resolves alert recipients based on configuration.

    Supports multiple resolution strategies for flexible recipient targeting.
    """

    def __init__(self):
        """Initialize recipient resolver with Supabase credentials."""
        self._supabase_url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        self._supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        self._supabase_client = None

    def _get_supabase_client(self):
        """Get or create Supabase client."""
        if self._supabase_client is None:
            if not self._supabase_url or not self._supabase_key:
                logger.warning("Supabase credentials not configured")
                return None

            try:
                from supabase import create_client
                self._supabase_client = create_client(self._supabase_url, self._supabase_key)
            except ImportError:
                logger.error("supabase-py not installed. Run: pip install supabase")
                return None
            except Exception as e:
                logger.error(f"Failed to create Supabase client: {e}")
                return None

        return self._supabase_client

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

    async def _resolve_org_owners(self, org_slug: str) -> List[str]:
        """
        Get email addresses of org owners from Supabase.

        Queries:
        1. organizations table to get org_id
        2. organization_members to get owner user_ids
        3. profiles to get email addresses

        Args:
            org_slug: Organization slug

        Returns:
            List of owner email addresses
        """
        supabase = self._get_supabase_client()
        if not supabase:
            logger.warning("Supabase client not available, cannot resolve org owners")
            return []

        try:
            # Get org ID from slug
            org_result = supabase.table("organizations") \
                .select("id") \
                .eq("org_slug", org_slug) \
                .single() \
                .execute()

            if not org_result.data:
                logger.warning(f"Organization not found: {org_slug}")
                return []

            org_id = org_result.data["id"]

            # Get owner members with profile join
            members_result = supabase.table("organization_members") \
                .select("user_id, profiles(id, email, full_name)") \
                .eq("org_id", org_id) \
                .eq("role", "owner") \
                .eq("status", "active") \
                .execute()

            if not members_result.data:
                logger.warning(f"No owners found for org: {org_slug}")
                return []

            # Extract emails from nested profile data
            emails = []
            for member in members_result.data:
                profile = member.get("profiles")
                if profile and profile.get("email"):
                    emails.append(profile["email"])

            logger.info(f"Resolved {len(emails)} org owners for {org_slug}")
            return emails

        except Exception as e:
            logger.error(f"Failed to resolve org owners for {org_slug}: {e}")
            return []

    async def _resolve_hierarchy_node(
        self,
        org_slug: str,
        node_code: str,
        include_children: bool = False
    ) -> List[str]:
        """
        Get email addresses from hierarchy node owners.

        GAP-002 FIX: Query central table (organizations.org_hierarchy) instead of MV
        to avoid stale data in alert routing. The MV may have streaming buffer lag
        after hierarchy updates, but alerts need real-time accuracy.

        Args:
            org_slug: Organization slug
            node_code: Hierarchy entity code (e.g., DEPT-CIO)
            include_children: Include children node owners

        Returns:
            List of email addresses
        """
        from google.cloud import bigquery

        try:
            from src.core.engine.bq_client import get_bigquery_client
            bq_client = get_bigquery_client()

            # GAP-002 FIX: Use central table with org_slug filter for real-time data
            # instead of org-specific MV which may be stale
            if include_children:
                # Get node and all descendants
                query = f"""
                SELECT DISTINCT owner_email
                FROM `{settings.gcp_project_id}.organizations.org_hierarchy`
                WHERE org_slug = @org_slug
                  AND (entity_id = @node_code OR path LIKE CONCAT('%/', @node_code, '/%'))
                  AND owner_email IS NOT NULL
                  AND end_date IS NULL
                """
            else:
                # Get just this node
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
        """
        Get email addresses of all active org members.

        Args:
            org_slug: Organization slug

        Returns:
            List of email addresses
        """
        supabase = self._get_supabase_client()
        if not supabase:
            return []

        try:
            # Get org ID
            org_result = supabase.table("organizations") \
                .select("id") \
                .eq("org_slug", org_slug) \
                .single() \
                .execute()

            if not org_result.data:
                return []

            org_id = org_result.data["id"]

            # Get all active members
            members_result = supabase.table("organization_members") \
                .select("user_id, profiles(email)") \
                .eq("org_id", org_id) \
                .eq("status", "active") \
                .execute()

            if not members_result.data:
                return []

            emails = []
            for member in members_result.data:
                profile = member.get("profiles")
                if profile and profile.get("email"):
                    emails.append(profile["email"])

            logger.info(f"Resolved {len(emails)} total members for {org_slug}")
            return emails

        except Exception as e:
            logger.error(f"Failed to resolve all members for {org_slug}: {e}")
            return []
