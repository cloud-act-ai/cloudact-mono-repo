"""
Integration Read Service Models

Data models for integration status queries and responses.
"""

from dataclasses import dataclass
from typing import Optional, List, Dict, Any
import hashlib


@dataclass
class IntegrationQuery:
    """Query parameters for integration reads."""
    org_slug: str
    status_filter: Optional[List[str]] = None
    provider_filter: Optional[List[str]] = None
    category_filter: Optional[str] = None
    include_inactive: bool = False

    def cache_key(self) -> str:
        """Generate deterministic cache key."""
        key_parts = [
            self.org_slug,
            ",".join(sorted(self.status_filter or [])),
            ",".join(sorted(self.provider_filter or [])),
            self.category_filter or "",
            str(self.include_inactive),
        ]
        key_str = "|".join(key_parts)
        return hashlib.md5(key_str.encode()).hexdigest()[:16]


@dataclass
class IntegrationResponse:
    """Response for integration queries."""
    success: bool
    data: Optional[List[Dict[str, Any]]] = None
    summary: Optional[Dict[str, Any]] = None
    health: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    cache_hit: bool = False
    query_time_ms: float = 0.0
