"""
pricing_loader.py

GenAI pricing loader - loads from category-based pricing CSVs.
Supports PAYG, Commitment (PTU), and Infrastructure pricing models.
"""
import csv
from pathlib import Path
from typing import Dict, Optional, List
from dataclasses import dataclass
from functools import lru_cache

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
REGISTRY_CSV = DATA_DIR / "registry" / "genai_providers.csv"
PAYG_PRICING_CSV = DATA_DIR / "pricing" / "genai_payg_pricing.csv"
COMMITMENT_PRICING_CSV = DATA_DIR / "pricing" / "genai_commitment_pricing.csv"
INFRASTRUCTURE_PRICING_CSV = DATA_DIR / "pricing" / "genai_infrastructure_pricing.csv"

# Legacy fallback
LEGACY_PRICING_CSV = DATA_DIR / "llm_pricing_advanced.csv"


@dataclass
class ProviderInfo:
    """Provider registry information."""
    provider_id: str
    provider_name: str
    pricing_model: str  # payg, commitment, infrastructure
    api_type: str
    api_base_url: str
    auth_type: str
    status: str
    notes: str


@dataclass
class PaygPricing:
    """PAYG (token-based) pricing information."""
    provider: str
    model: str
    model_family: str
    model_version: str
    input_per_1m: float
    output_per_1m: float
    cached_input_per_1m: float
    cached_write_per_1m: float
    batch_input_per_1m: float
    batch_output_per_1m: float
    context_window: int
    max_output_tokens: int
    supports_vision: bool
    supports_streaming: bool
    supports_tools: bool
    status: str
    last_updated: str
    notes: str


@dataclass
class CommitmentPricing:
    """Commitment (PTU/Reserved) pricing information."""
    provider: str
    commitment_type: str
    model: str
    region: str
    ptu_hourly_rate: float
    ptu_monthly_rate: float
    min_ptu: int
    max_ptu: int
    commitment_term_months: int
    tokens_per_ptu_minute: int
    status: str
    last_updated: str


@dataclass
class InfrastructurePricing:
    """Infrastructure (GPU/TPU) pricing information."""
    provider: str
    resource_type: str  # gpu, tpu, inferentia, trainium
    instance_type: str
    gpu_type: str
    gpu_count: int
    gpu_memory_gb: int
    hourly_rate: float  # on-demand base rate
    spot_discount_pct: float  # spot discount % (e.g., 70 = 70% off)
    reserved_1yr_discount_pct: float  # 1-year commitment discount %
    reserved_3yr_discount_pct: float  # 3-year commitment discount %
    region: str
    cloud_provider: str
    status: str
    last_updated: str


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


def _safe_bool(val: str, default: bool = False) -> bool:
    """Safely convert string to bool."""
    if not val or val.strip() == "":
        return default
    return val.lower() in ("true", "1", "yes")


@lru_cache(maxsize=1)
def load_provider_registry() -> Dict[str, ProviderInfo]:
    """Load provider registry. Cached for performance."""
    registry = {}

    if not REGISTRY_CSV.exists():
        print(f"Warning: Provider registry not found: {REGISTRY_CSV}")
        return registry

    with REGISTRY_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            provider_id = row.get("provider_id", "")
            registry[provider_id] = ProviderInfo(
                provider_id=provider_id,
                provider_name=row.get("provider_name", ""),
                pricing_model=row.get("pricing_model", "payg"),
                api_type=row.get("api_type", ""),
                api_base_url=row.get("api_base_url", ""),
                auth_type=row.get("auth_type", ""),
                status=row.get("status", "active"),
                notes=row.get("notes", ""),
            )

    return registry


@lru_cache(maxsize=1)
def load_payg_pricing() -> Dict[str, PaygPricing]:
    """Load PAYG pricing from CSV. Cached for performance."""
    pricing = {}

    if not PAYG_PRICING_CSV.exists():
        print(f"Warning: PAYG pricing file not found: {PAYG_PRICING_CSV}")
        return pricing

    with PAYG_PRICING_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = f"{row['provider']}:{row['model']}"

            pricing[key] = PaygPricing(
                provider=row.get("provider", ""),
                model=row.get("model", ""),
                model_family=row.get("model_family", ""),
                model_version=row.get("model_version", ""),
                input_per_1m=_safe_float(row.get("input_per_1m")),
                output_per_1m=_safe_float(row.get("output_per_1m")),
                cached_input_per_1m=_safe_float(row.get("cached_input_per_1m")),
                cached_write_per_1m=_safe_float(row.get("cached_write_per_1m")),
                batch_input_per_1m=_safe_float(row.get("batch_input_per_1m")),
                batch_output_per_1m=_safe_float(row.get("batch_output_per_1m")),
                context_window=_safe_int(row.get("context_window")),
                max_output_tokens=_safe_int(row.get("max_output_tokens")),
                supports_vision=_safe_bool(row.get("supports_vision")),
                supports_streaming=_safe_bool(row.get("supports_streaming")),
                supports_tools=_safe_bool(row.get("supports_tools")),
                status=row.get("status", "active"),
                last_updated=row.get("last_updated", ""),
                notes=row.get("notes", ""),
            )

    return pricing


@lru_cache(maxsize=1)
def load_commitment_pricing() -> Dict[str, CommitmentPricing]:
    """Load commitment (PTU) pricing from CSV. Cached for performance."""
    pricing = {}

    if not COMMITMENT_PRICING_CSV.exists():
        print(f"Warning: Commitment pricing file not found: {COMMITMENT_PRICING_CSV}")
        return pricing

    with COMMITMENT_PRICING_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = f"{row['provider']}:{row['model']}:{row.get('region', '')}"

            pricing[key] = CommitmentPricing(
                provider=row.get("provider", ""),
                commitment_type=row.get("commitment_type", "ptu"),
                model=row.get("model", ""),
                region=row.get("region", ""),
                ptu_hourly_rate=_safe_float(row.get("ptu_hourly_rate")),
                ptu_monthly_rate=_safe_float(row.get("ptu_monthly_rate")),
                min_ptu=_safe_int(row.get("min_ptu")),
                max_ptu=_safe_int(row.get("max_ptu")),
                commitment_term_months=_safe_int(row.get("commitment_term_months")),
                tokens_per_ptu_minute=_safe_int(row.get("tokens_per_ptu_minute")),
                status=row.get("status", "active"),
                last_updated=row.get("last_updated", ""),
            )

    return pricing


@lru_cache(maxsize=1)
def load_infrastructure_pricing() -> Dict[str, InfrastructurePricing]:
    """Load infrastructure (GPU/TPU) pricing from CSV. Cached for performance."""
    pricing = {}

    if not INFRASTRUCTURE_PRICING_CSV.exists():
        print(f"Warning: Infrastructure pricing file not found: {INFRASTRUCTURE_PRICING_CSV}")
        return pricing

    with INFRASTRUCTURE_PRICING_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = f"{row['provider']}:{row['instance_type']}:{row.get('region', '')}"

            pricing[key] = InfrastructurePricing(
                provider=row.get("provider", ""),
                resource_type=row.get("resource_type", "gpu"),
                instance_type=row.get("instance_type", ""),
                gpu_type=row.get("gpu_type", ""),
                gpu_count=_safe_int(row.get("gpu_count")),
                gpu_memory_gb=_safe_int(row.get("gpu_memory_gb")),
                hourly_rate=_safe_float(row.get("hourly_rate")),
                spot_discount_pct=_safe_float(row.get("spot_discount_pct")),
                reserved_1yr_discount_pct=_safe_float(row.get("reserved_1yr_discount_pct")),
                reserved_3yr_discount_pct=_safe_float(row.get("reserved_3yr_discount_pct")),
                region=row.get("region", ""),
                cloud_provider=row.get("cloud_provider", ""),
                status=row.get("status", "active"),
                last_updated=row.get("last_updated", ""),
            )

    return pricing


def get_provider_info(provider: str) -> Optional[ProviderInfo]:
    """Get provider information from registry."""
    registry = load_provider_registry()
    return registry.get(provider)


def get_pricing_model(provider: str) -> str:
    """Get pricing model for a provider (payg, commitment, infrastructure)."""
    info = get_provider_info(provider)
    if info:
        return info.pricing_model
    # Default to payg for unknown providers
    return "payg"


def get_model_pricing(provider: str, model: str) -> Optional[PaygPricing]:
    """Get PAYG pricing for a specific model."""
    pricing = load_payg_pricing()
    key = f"{provider}:{model}"

    if key in pricing:
        return pricing[key]

    # Try prefix matching for versioned models
    for k, v in pricing.items():
        if k.startswith(f"{provider}:"):
            if v.model in model or model in v.model:
                return v

    # Try model family matching
    for k, v in pricing.items():
        if k.startswith(f"{provider}:"):
            if v.model_family and v.model_family in model:
                return v

    return None


def get_commitment_pricing(provider: str, model: str, region: str = "") -> Optional[CommitmentPricing]:
    """Get commitment (PTU) pricing for a specific deployment."""
    pricing = load_commitment_pricing()

    # Try exact match with region
    key = f"{provider}:{model}:{region}"
    if key in pricing:
        return pricing[key]

    # Try without region
    for k, v in pricing.items():
        if k.startswith(f"{provider}:{model}"):
            return v

    return None


def calculate_cost(
    provider: str,
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cached_input_tokens: int = 0,
    cached_write_tokens: int = 0,
    is_batch: bool = False,
) -> Dict:
    """
    Calculate cost for PAYG usage.

    Returns dict with detailed cost breakdown.
    """
    pricing = get_model_pricing(provider, model)

    if not pricing:
        return {
            "total_cost": 0,
            "input_cost": 0,
            "output_cost": 0,
            "cached_cost": 0,
            "pricing_found": False,
            "model_used": model,
            "provider": provider,
            "currency": "USD"
        }

    # Determine which rates to use
    if is_batch:
        input_rate = pricing.batch_input_per_1m or pricing.input_per_1m
        output_rate = pricing.batch_output_per_1m or pricing.output_per_1m
    else:
        input_rate = pricing.input_per_1m
        output_rate = pricing.output_per_1m

    # Calculate costs (per 1M tokens)
    input_cost = (input_tokens / 1_000_000) * input_rate
    output_cost = (output_tokens / 1_000_000) * output_rate

    # Cached tokens
    cached_read_cost = (cached_input_tokens / 1_000_000) * pricing.cached_input_per_1m
    cached_write_cost = (cached_write_tokens / 1_000_000) * pricing.cached_write_per_1m
    cached_cost = cached_read_cost + cached_write_cost

    total_cost = input_cost + output_cost + cached_cost

    return {
        "total_cost": round(total_cost, 10),
        "input_cost": round(input_cost, 10),
        "output_cost": round(output_cost, 10),
        "cached_cost": round(cached_cost, 10),
        "pricing_found": True,
        "model_used": pricing.model,
        "model_family": pricing.model_family,
        "provider": provider,
        "input_rate_per_1m": input_rate,
        "output_rate_per_1m": output_rate,
        "context_window": pricing.context_window,
        "max_output_tokens": pricing.max_output_tokens,
        "currency": "USD",
        "is_batch": is_batch,
    }


def calculate_ptu_cost(
    provider: str,
    model: str,
    ptu_count: int,
    hours: float = 24,
    region: str = "",
) -> Dict:
    """
    Calculate cost for PTU/GSU/commitment usage.

    Supports:
    - Azure PTU (hourly rate)
    - AWS Bedrock PT (hourly rate)
    - GCP Vertex AI GSU (monthly rate - pricing not public)

    Returns dict with cost breakdown.
    """
    pricing = get_commitment_pricing(provider, model, region)

    if not pricing:
        return {
            "total_cost": 0,
            "ptu_cost": 0,
            "pricing_found": False,
            "model": model,
            "provider": provider,
            "currency": "USD"
        }

    # Handle GCP GSU (no public pricing)
    if pricing.commitment_type == "gsu":
        return {
            "total_cost": 0,
            "ptu_cost": 0,
            "gsu_count": ptu_count,
            "tokens_per_minute": pricing.tokens_per_ptu_minute,
            "throughput_tokens_per_sec": pricing.tokens_per_ptu_minute // 60 if pricing.tokens_per_ptu_minute else 0,
            "pricing_found": False,  # GSU pricing not publicly available
            "pricing_note": "Contact Google Cloud sales for GSU pricing",
            "model": pricing.model,
            "provider": provider,
            "region": pricing.region,
            "commitment_type": pricing.commitment_type,
            "currency": "USD",
        }

    # Standard PTU/PT calculation (hourly rate)
    ptu_cost = ptu_count * pricing.ptu_hourly_rate * hours

    return {
        "total_cost": round(ptu_cost, 2),
        "ptu_cost": round(ptu_cost, 2),
        "ptu_count": ptu_count,
        "ptu_hourly_rate": pricing.ptu_hourly_rate,
        "hours": hours,
        "pricing_found": True,
        "model": pricing.model,
        "provider": provider,
        "region": pricing.region,
        "commitment_type": pricing.commitment_type,
        "currency": "USD",
    }


def get_infrastructure_pricing(
    provider: str, instance_type: str, region: str = ""
) -> Optional[InfrastructurePricing]:
    """Get infrastructure pricing for a specific instance type."""
    pricing = load_infrastructure_pricing()

    # Try exact match with region
    key = f"{provider}:{instance_type}:{region}"
    if key in pricing:
        return pricing[key]

    # Try without region
    for k, v in pricing.items():
        if k.startswith(f"{provider}:{instance_type}"):
            return v

    return None


def calculate_infrastructure_cost(
    provider: str,
    instance_type: str,
    hours: float = 24,
    instance_count: int = 1,
    region: str = "",
    pricing_type: str = "on_demand",  # on_demand, spot, reserved_1yr, reserved_3yr
    custom_discount_pct: float = None,  # Override with custom company discount
) -> Dict:
    """
    Calculate cost for infrastructure (GPU/TPU) usage.

    Args:
        pricing_type: on_demand, spot, reserved_1yr, reserved_3yr
        custom_discount_pct: Override discount % (e.g., 50 = 50% off).
                            If provided, ignores pricing_type discount.

    Returns dict with cost breakdown.
    """
    pricing = get_infrastructure_pricing(provider, instance_type, region)

    if not pricing:
        return {
            "total_cost": 0,
            "hourly_cost": 0,
            "pricing_found": False,
            "instance_type": instance_type,
            "provider": provider,
            "currency": "USD"
        }

    # Get discount percentage based on pricing type or custom override
    if custom_discount_pct is not None:
        discount_pct = custom_discount_pct
        effective_pricing_type = "custom"
    else:
        discount_map = {
            "on_demand": 0,
            "spot": pricing.spot_discount_pct,
            "reserved_1yr": pricing.reserved_1yr_discount_pct,
            "reserved_3yr": pricing.reserved_3yr_discount_pct,
        }
        discount_pct = discount_map.get(pricing_type, 0)
        effective_pricing_type = pricing_type

    # Calculate discounted rate
    hourly_rate = pricing.hourly_rate * (1 - discount_pct / 100)

    hourly_cost = hourly_rate * instance_count
    total_cost = hourly_cost * hours

    # Calculate savings vs on-demand
    on_demand_cost = pricing.hourly_rate * instance_count * hours
    savings = on_demand_cost - total_cost

    return {
        "total_cost": round(total_cost, 2),
        "hourly_cost": round(hourly_cost, 2),
        "hourly_rate": round(hourly_rate, 2),
        "hours": hours,
        "instance_count": instance_count,
        "pricing_type": effective_pricing_type,
        "discount_pct_applied": discount_pct,
        "pricing_found": True,
        "instance_type": pricing.instance_type,
        "gpu_type": pricing.gpu_type,
        "gpu_count": pricing.gpu_count,
        "gpu_memory_gb": pricing.gpu_memory_gb,
        "resource_type": pricing.resource_type,
        "provider": provider,
        "region": pricing.region,
        "cloud_provider": pricing.cloud_provider,
        "currency": "USD",
        # Base rate and discount percentages from pricing file
        "on_demand_rate": pricing.hourly_rate,
        "spot_discount_pct": pricing.spot_discount_pct,
        "reserved_1yr_discount_pct": pricing.reserved_1yr_discount_pct,
        "reserved_3yr_discount_pct": pricing.reserved_3yr_discount_pct,
        # Savings info
        "savings_vs_on_demand": round(savings, 2),
    }


def list_infrastructure(
    provider: str = None,
    resource_type: str = None,
    cloud_provider: str = None,
) -> List[Dict]:
    """List all infrastructure resources, optionally filtered."""
    pricing = load_infrastructure_pricing()

    resources = []
    for key, p in pricing.items():
        if provider and p.provider != provider:
            continue
        if resource_type and p.resource_type != resource_type:
            continue
        if cloud_provider and p.cloud_provider != cloud_provider:
            continue

        resources.append({
            "provider": p.provider,
            "resource_type": p.resource_type,
            "instance_type": p.instance_type,
            "gpu_type": p.gpu_type,
            "gpu_count": p.gpu_count,
            "gpu_memory_gb": p.gpu_memory_gb,
            "hourly_rate": p.hourly_rate,
            "spot_discount_pct": p.spot_discount_pct,
            "reserved_1yr_discount_pct": p.reserved_1yr_discount_pct,
            "reserved_3yr_discount_pct": p.reserved_3yr_discount_pct,
            "region": p.region,
            "cloud_provider": p.cloud_provider,
            "status": p.status,
        })

    return sorted(resources, key=lambda x: (x["cloud_provider"], x["provider"], x["hourly_rate"]))


def list_models(provider: str = None, pricing_model: str = "payg") -> List[Dict]:
    """List all available models, optionally filtered by provider."""
    if pricing_model == "payg":
        pricing = load_payg_pricing()
    elif pricing_model == "commitment":
        pricing = load_commitment_pricing()
    else:
        return []

    models = []
    for key, p in pricing.items():
        p_provider = p.provider
        if provider and p_provider != provider:
            continue

        if pricing_model == "payg":
            models.append({
                "provider": p.provider,
                "model": p.model,
                "model_family": p.model_family,
                "status": p.status,
                "input_per_1m": p.input_per_1m,
                "output_per_1m": p.output_per_1m,
                "context_window": p.context_window,
                "supports_vision": p.supports_vision,
                "supports_tools": p.supports_tools,
            })
        else:
            models.append({
                "provider": p.provider,
                "model": p.model,
                "commitment_type": p.commitment_type,
                "region": p.region,
                "ptu_hourly_rate": p.ptu_hourly_rate,
                "status": p.status,
            })

    return sorted(models, key=lambda x: (x["provider"], x["model"]))


def get_pricing_summary() -> Dict:
    """Get summary statistics of pricing data."""
    payg = load_payg_pricing()
    commitment = load_commitment_pricing()
    infrastructure = load_infrastructure_pricing()
    registry = load_provider_registry()

    payg_providers = set(p.provider for p in payg.values())
    commitment_providers = set(p.provider for p in commitment.values())
    infrastructure_providers = set(p.provider for p in infrastructure.values())

    return {
        "total_payg_models": len(payg),
        "total_commitment_entries": len(commitment),
        "total_infrastructure_entries": len(infrastructure),
        "total_providers_registered": len(registry),
        "payg_providers": sorted(list(payg_providers)),
        "commitment_providers": sorted(list(commitment_providers)),
        "infrastructure_providers": sorted(list(infrastructure_providers)),
        "pricing_files": {
            "registry": str(REGISTRY_CSV),
            "payg": str(PAYG_PRICING_CSV),
            "commitment": str(COMMITMENT_PRICING_CSV),
            "infrastructure": str(INFRASTRUCTURE_PRICING_CSV),
        },
    }


# Backward compatibility - alias for old function name
def load_advanced_pricing():
    """Backward compatibility: load PAYG pricing."""
    return load_payg_pricing()
