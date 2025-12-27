"""
pricing_loader.py

GenAI pricing loader - loads from category-based pricing CSVs.
Supports PAYG, Commitment (PTU), Infrastructure, Media, Training,
Volume Tiers, Support Tiers, Currency Conversion, and Data Egress.
"""
import csv
from pathlib import Path
from typing import Dict, Optional, List, Tuple
from dataclasses import dataclass
from functools import lru_cache
from datetime import datetime, date

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# File paths
REGISTRY_CSV = DATA_DIR / "registry" / "genai_providers.csv"
PAYG_PRICING_CSV = DATA_DIR / "pricing" / "genai_payg_pricing.csv"
COMMITMENT_PRICING_CSV = DATA_DIR / "pricing" / "genai_commitment_pricing.csv"
INFRASTRUCTURE_PRICING_CSV = DATA_DIR / "pricing" / "genai_infrastructure_pricing.csv"
MEDIA_PRICING_CSV = DATA_DIR / "pricing" / "genai_media_pricing.csv"
TRAINING_PRICING_CSV = DATA_DIR / "pricing" / "genai_training_pricing.csv"
VOLUME_TIERS_CSV = DATA_DIR / "pricing" / "genai_volume_tiers.csv"
SUPPORT_TIERS_CSV = DATA_DIR / "pricing" / "genai_support_tiers.csv"
CURRENCY_RATES_CSV = DATA_DIR / "pricing" / "genai_currency_rates.csv"
DATA_EGRESS_CSV = DATA_DIR / "pricing" / "genai_data_egress.csv"


# =============================================================================
# DATACLASSES
# =============================================================================

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
    """PAYG (token-based) pricing with all advanced columns."""
    provider: str
    model: str
    model_family: str
    model_version: str
    region: str
    # Token pricing
    input_per_1m: float
    output_per_1m: float
    cached_input_per_1m: float
    cached_write_per_1m: float
    batch_input_per_1m: float
    batch_output_per_1m: float
    # Discount percentages
    cached_discount_pct: float
    batch_discount_pct: float
    volume_tier: str
    volume_discount_pct: float
    # Free tier
    free_tier_input_tokens: int
    free_tier_output_tokens: int
    # Rate limits
    rate_limit_rpm: int
    rate_limit_tpm: int
    # Capabilities
    context_window: int
    max_output_tokens: int
    supports_vision: bool
    supports_streaming: bool
    supports_tools: bool
    # SLA and dates
    sla_uptime_pct: float
    effective_from: str
    effective_to: str
    status: str
    last_updated: str
    notes: str


@dataclass
class CommitmentPricing:
    """Commitment (PTU/GSU/Reserved) pricing with discount columns."""
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
    term_discount_pct: float
    volume_discount_pct: float
    status: str
    last_updated: str


@dataclass
class InfrastructurePricing:
    """Infrastructure (GPU/TPU) pricing with discount percentages."""
    provider: str
    resource_type: str  # gpu, tpu, inferentia, trainium
    instance_type: str
    gpu_type: str
    gpu_count: int
    gpu_memory_gb: int
    hourly_rate: float
    spot_discount_pct: float
    reserved_1yr_discount_pct: float
    reserved_3yr_discount_pct: float
    region: str
    cloud_provider: str
    status: str
    last_updated: str


@dataclass
class MediaPricing:
    """Media (Image/Audio/Video) pricing."""
    provider: str
    media_type: str  # image, audio, video
    model: str
    model_version: str
    region: str
    quality: str
    size_resolution: str
    unit: str  # image, minute, second, 1m_chars, tokens
    price_per_unit: float
    batch_discount_pct: float
    volume_tier: str
    volume_discount_pct: float
    free_tier_units: int
    rate_limit_rpm: int
    sla_uptime_pct: float
    effective_from: str
    effective_to: str
    status: str
    last_updated: str
    notes: str


@dataclass
class TrainingPricing:
    """Fine-tuning and training pricing."""
    provider: str
    training_type: str  # fine-tuning, distillation, reinforcement
    model: str
    base_model: str
    region: str
    training_per_1m_tokens: float
    inference_input_per_1m: float
    inference_output_per_1m: float
    inference_cached_per_1m: float
    min_epochs: int
    max_epochs: int
    min_examples: int
    max_training_tokens: int
    storage_per_gb_month: float
    rate_limit_rpm: int
    sla_uptime_pct: float
    effective_from: str
    effective_to: str
    status: str
    last_updated: str
    notes: str


@dataclass
class VolumeTier:
    """Volume-based discount tiers."""
    provider: str
    tier_name: str
    tier_order: int
    min_monthly_spend_usd: float
    max_monthly_spend_usd: float
    min_monthly_tokens: int
    max_monthly_tokens: int
    discount_pct: float
    input_multiplier: float
    output_multiplier: float
    applies_to_cached: bool
    applies_to_batch: bool
    commitment_required: bool
    effective_from: str
    effective_to: str
    status: str
    notes: str


@dataclass
class SupportTier:
    """Support tier pricing and SLAs."""
    provider: str
    support_tier: str
    tier_order: int
    monthly_base_cost: float
    spend_percentage: float
    min_monthly_spend: float
    response_time_critical: str
    response_time_high: str
    response_time_normal: str
    uptime_sla_pct: float
    dedicated_tam: bool
    phone_support: bool
    slack_support: bool
    training_included: bool
    effective_from: str
    effective_to: str
    status: str
    notes: str


@dataclass
class CurrencyRate:
    """Currency exchange rate."""
    currency_code: str
    currency_name: str
    rate_to_usd: float
    rate_from_usd: float
    decimal_places: int
    symbol: str
    effective_from: str
    effective_to: str
    source: str
    last_updated: str


@dataclass
class DataEgress:
    """Data egress pricing by tier."""
    cloud_provider: str
    egress_type: str  # internet, cross-region, same-az, cross-az
    destination: str
    region: str
    tier_start_gb: float
    tier_end_gb: float
    price_per_gb: float
    free_tier_gb: float
    effective_from: str
    effective_to: str
    status: str
    notes: str


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

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


def _is_effective(effective_from: str, effective_to: str, check_date: date = None) -> bool:
    """Check if pricing is effective for a given date."""
    if check_date is None:
        check_date = date.today()

    try:
        if effective_from:
            from_date = datetime.strptime(effective_from, "%Y-%m-%d").date()
            if check_date < from_date:
                return False

        if effective_to:
            to_date = datetime.strptime(effective_to, "%Y-%m-%d").date()
            if check_date > to_date:
                return False

        return True
    except ValueError:
        return True  # Default to active if dates are invalid


# =============================================================================
# LOADER FUNCTIONS
# =============================================================================

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
            region = row.get("region", "global")
            key = f"{row['provider']}:{row['model']}:{region}"

            pricing[key] = PaygPricing(
                provider=row.get("provider", ""),
                model=row.get("model", ""),
                model_family=row.get("model_family", ""),
                model_version=row.get("model_version", ""),
                region=region,
                input_per_1m=_safe_float(row.get("input_per_1m")),
                output_per_1m=_safe_float(row.get("output_per_1m")),
                cached_input_per_1m=_safe_float(row.get("cached_input_per_1m")),
                cached_write_per_1m=_safe_float(row.get("cached_write_per_1m")),
                batch_input_per_1m=_safe_float(row.get("batch_input_per_1m")),
                batch_output_per_1m=_safe_float(row.get("batch_output_per_1m")),
                cached_discount_pct=_safe_float(row.get("cached_discount_pct")),
                batch_discount_pct=_safe_float(row.get("batch_discount_pct")),
                volume_tier=row.get("volume_tier", "standard"),
                volume_discount_pct=_safe_float(row.get("volume_discount_pct")),
                free_tier_input_tokens=_safe_int(row.get("free_tier_input_tokens")),
                free_tier_output_tokens=_safe_int(row.get("free_tier_output_tokens")),
                rate_limit_rpm=_safe_int(row.get("rate_limit_rpm")),
                rate_limit_tpm=_safe_int(row.get("rate_limit_tpm")),
                context_window=_safe_int(row.get("context_window")),
                max_output_tokens=_safe_int(row.get("max_output_tokens")),
                supports_vision=_safe_bool(row.get("supports_vision")),
                supports_streaming=_safe_bool(row.get("supports_streaming")),
                supports_tools=_safe_bool(row.get("supports_tools")),
                sla_uptime_pct=_safe_float(row.get("sla_uptime_pct")),
                effective_from=row.get("effective_from", ""),
                effective_to=row.get("effective_to", ""),
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
                term_discount_pct=_safe_float(row.get("term_discount_pct")),
                volume_discount_pct=_safe_float(row.get("volume_discount_pct")),
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


@lru_cache(maxsize=1)
def load_media_pricing() -> Dict[str, MediaPricing]:
    """Load media (image/audio/video) pricing from CSV."""
    pricing = {}

    if not MEDIA_PRICING_CSV.exists():
        print(f"Warning: Media pricing file not found: {MEDIA_PRICING_CSV}")
        return pricing

    with MEDIA_PRICING_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = f"{row['provider']}:{row['model']}:{row.get('quality', '')}:{row.get('size_resolution', '')}"

            pricing[key] = MediaPricing(
                provider=row.get("provider", ""),
                media_type=row.get("media_type", ""),
                model=row.get("model", ""),
                model_version=row.get("model_version", ""),
                region=row.get("region", "global"),
                quality=row.get("quality", "standard"),
                size_resolution=row.get("size_resolution", ""),
                unit=row.get("unit", ""),
                price_per_unit=_safe_float(row.get("price_per_unit")),
                batch_discount_pct=_safe_float(row.get("batch_discount_pct")),
                volume_tier=row.get("volume_tier", "standard"),
                volume_discount_pct=_safe_float(row.get("volume_discount_pct")),
                free_tier_units=_safe_int(row.get("free_tier_units")),
                rate_limit_rpm=_safe_int(row.get("rate_limit_rpm")),
                sla_uptime_pct=_safe_float(row.get("sla_uptime_pct")),
                effective_from=row.get("effective_from", ""),
                effective_to=row.get("effective_to", ""),
                status=row.get("status", "active"),
                last_updated=row.get("last_updated", ""),
                notes=row.get("notes", ""),
            )

    return pricing


@lru_cache(maxsize=1)
def load_training_pricing() -> Dict[str, TrainingPricing]:
    """Load training/fine-tuning pricing from CSV."""
    pricing = {}

    if not TRAINING_PRICING_CSV.exists():
        print(f"Warning: Training pricing file not found: {TRAINING_PRICING_CSV}")
        return pricing

    with TRAINING_PRICING_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = f"{row['provider']}:{row['model']}:{row.get('region', 'global')}"

            pricing[key] = TrainingPricing(
                provider=row.get("provider", ""),
                training_type=row.get("training_type", "fine-tuning"),
                model=row.get("model", ""),
                base_model=row.get("base_model", ""),
                region=row.get("region", "global"),
                training_per_1m_tokens=_safe_float(row.get("training_per_1m_tokens")),
                inference_input_per_1m=_safe_float(row.get("inference_input_per_1m")),
                inference_output_per_1m=_safe_float(row.get("inference_output_per_1m")),
                inference_cached_per_1m=_safe_float(row.get("inference_cached_per_1m")),
                min_epochs=_safe_int(row.get("min_epochs")),
                max_epochs=_safe_int(row.get("max_epochs")),
                min_examples=_safe_int(row.get("min_examples")),
                max_training_tokens=_safe_int(row.get("max_training_tokens")),
                storage_per_gb_month=_safe_float(row.get("storage_per_gb_month")),
                rate_limit_rpm=_safe_int(row.get("rate_limit_rpm")),
                sla_uptime_pct=_safe_float(row.get("sla_uptime_pct")),
                effective_from=row.get("effective_from", ""),
                effective_to=row.get("effective_to", ""),
                status=row.get("status", "active"),
                last_updated=row.get("last_updated", ""),
                notes=row.get("notes", ""),
            )

    return pricing


@lru_cache(maxsize=1)
def load_volume_tiers() -> Dict[str, List[VolumeTier]]:
    """Load volume tiers from CSV. Returns dict keyed by provider."""
    tiers = {}

    if not VOLUME_TIERS_CSV.exists():
        print(f"Warning: Volume tiers file not found: {VOLUME_TIERS_CSV}")
        return tiers

    with VOLUME_TIERS_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            provider = row.get("provider", "")

            tier = VolumeTier(
                provider=provider,
                tier_name=row.get("tier_name", ""),
                tier_order=_safe_int(row.get("tier_order")),
                min_monthly_spend_usd=_safe_float(row.get("min_monthly_spend_usd")),
                max_monthly_spend_usd=_safe_float(row.get("max_monthly_spend_usd")),
                min_monthly_tokens=_safe_int(row.get("min_monthly_tokens")),
                max_monthly_tokens=_safe_int(row.get("max_monthly_tokens")),
                discount_pct=_safe_float(row.get("discount_pct")),
                input_multiplier=_safe_float(row.get("input_multiplier"), 1.0),
                output_multiplier=_safe_float(row.get("output_multiplier"), 1.0),
                applies_to_cached=_safe_bool(row.get("applies_to_cached")),
                applies_to_batch=_safe_bool(row.get("applies_to_batch")),
                commitment_required=_safe_bool(row.get("commitment_required")),
                effective_from=row.get("effective_from", ""),
                effective_to=row.get("effective_to", ""),
                status=row.get("status", "active"),
                notes=row.get("notes", ""),
            )

            if provider not in tiers:
                tiers[provider] = []
            tiers[provider].append(tier)

    # Sort tiers by order
    for provider in tiers:
        tiers[provider].sort(key=lambda x: x.tier_order)

    return tiers


@lru_cache(maxsize=1)
def load_support_tiers() -> Dict[str, List[SupportTier]]:
    """Load support tiers from CSV. Returns dict keyed by provider."""
    tiers = {}

    if not SUPPORT_TIERS_CSV.exists():
        print(f"Warning: Support tiers file not found: {SUPPORT_TIERS_CSV}")
        return tiers

    with SUPPORT_TIERS_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            provider = row.get("provider", "")

            tier = SupportTier(
                provider=provider,
                support_tier=row.get("support_tier", ""),
                tier_order=_safe_int(row.get("tier_order")),
                monthly_base_cost=_safe_float(row.get("monthly_base_cost")),
                spend_percentage=_safe_float(row.get("spend_percentage")),
                min_monthly_spend=_safe_float(row.get("min_monthly_spend")),
                response_time_critical=row.get("response_time_critical", ""),
                response_time_high=row.get("response_time_high", ""),
                response_time_normal=row.get("response_time_normal", ""),
                uptime_sla_pct=_safe_float(row.get("uptime_sla_pct")),
                dedicated_tam=_safe_bool(row.get("dedicated_tam")),
                phone_support=_safe_bool(row.get("phone_support")),
                slack_support=_safe_bool(row.get("slack_support")),
                training_included=_safe_bool(row.get("training_included")),
                effective_from=row.get("effective_from", ""),
                effective_to=row.get("effective_to", ""),
                status=row.get("status", "active"),
                notes=row.get("notes", ""),
            )

            if provider not in tiers:
                tiers[provider] = []
            tiers[provider].append(tier)

    # Sort tiers by order
    for provider in tiers:
        tiers[provider].sort(key=lambda x: x.tier_order)

    return tiers


@lru_cache(maxsize=1)
def load_currency_rates() -> Dict[str, CurrencyRate]:
    """Load currency exchange rates from CSV."""
    rates = {}

    if not CURRENCY_RATES_CSV.exists():
        print(f"Warning: Currency rates file not found: {CURRENCY_RATES_CSV}")
        return rates

    with CURRENCY_RATES_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row.get("currency_code", "")

            rates[code] = CurrencyRate(
                currency_code=code,
                currency_name=row.get("currency_name", ""),
                rate_to_usd=_safe_float(row.get("rate_to_usd"), 1.0),
                rate_from_usd=_safe_float(row.get("rate_from_usd"), 1.0),
                decimal_places=_safe_int(row.get("decimal_places"), 2),
                symbol=row.get("symbol", ""),
                effective_from=row.get("effective_from", ""),
                effective_to=row.get("effective_to", ""),
                source=row.get("source", ""),
                last_updated=row.get("last_updated", ""),
            )

    return rates


@lru_cache(maxsize=1)
def load_data_egress() -> Dict[str, List[DataEgress]]:
    """Load data egress pricing from CSV. Returns dict keyed by cloud provider."""
    egress = {}

    if not DATA_EGRESS_CSV.exists():
        print(f"Warning: Data egress file not found: {DATA_EGRESS_CSV}")
        return egress

    with DATA_EGRESS_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            provider = row.get("cloud_provider", "")

            entry = DataEgress(
                cloud_provider=provider,
                egress_type=row.get("egress_type", "internet"),
                destination=row.get("destination", ""),
                region=row.get("region", ""),
                tier_start_gb=_safe_float(row.get("tier_start_gb")),
                tier_end_gb=_safe_float(row.get("tier_end_gb")),
                price_per_gb=_safe_float(row.get("price_per_gb")),
                free_tier_gb=_safe_float(row.get("free_tier_gb")),
                effective_from=row.get("effective_from", ""),
                effective_to=row.get("effective_to", ""),
                status=row.get("status", "active"),
                notes=row.get("notes", ""),
            )

            if provider not in egress:
                egress[provider] = []
            egress[provider].append(entry)

    return egress


# =============================================================================
# LOOKUP FUNCTIONS
# =============================================================================

def get_provider_info(provider: str) -> Optional[ProviderInfo]:
    """Get provider information from registry."""
    registry = load_provider_registry()
    return registry.get(provider)


def get_pricing_model(provider: str) -> str:
    """Get pricing model for a provider (payg, commitment, infrastructure)."""
    info = get_provider_info(provider)
    if info:
        return info.pricing_model
    return "payg"


def get_model_pricing(
    provider: str,
    model: str,
    region: str = "global"
) -> Optional[PaygPricing]:
    """Get PAYG pricing for a specific model and region."""
    pricing = load_payg_pricing()

    # Try exact match with region
    key = f"{provider}:{model}:{region}"
    if key in pricing:
        return pricing[key]

    # Try global region
    key_global = f"{provider}:{model}:global"
    if key_global in pricing:
        return pricing[key_global]

    # Try prefix matching for versioned models
    for k, v in pricing.items():
        if k.startswith(f"{provider}:"):
            if v.model in model or model in v.model:
                if v.region == region or v.region == "global":
                    return v

    # Try model family matching
    for k, v in pricing.items():
        if k.startswith(f"{provider}:"):
            if v.model_family and v.model_family in model:
                if v.region == region or v.region == "global":
                    return v

    return None


def get_commitment_pricing(
    provider: str,
    model: str,
    region: str = ""
) -> Optional[CommitmentPricing]:
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


def get_infrastructure_pricing(
    provider: str,
    instance_type: str,
    region: str = ""
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


def get_media_pricing(
    provider: str,
    model: str,
    quality: str = "standard",
    size_resolution: str = ""
) -> Optional[MediaPricing]:
    """Get media pricing for specific model/quality/resolution."""
    pricing = load_media_pricing()

    key = f"{provider}:{model}:{quality}:{size_resolution}"
    if key in pricing:
        return pricing[key]

    # Try without size
    for k, v in pricing.items():
        if k.startswith(f"{provider}:{model}:{quality}"):
            return v

    # Try just provider:model
    for k, v in pricing.items():
        if k.startswith(f"{provider}:{model}"):
            return v

    return None


def get_training_pricing(
    provider: str,
    model: str,
    region: str = "global"
) -> Optional[TrainingPricing]:
    """Get training/fine-tuning pricing."""
    pricing = load_training_pricing()

    key = f"{provider}:{model}:{region}"
    if key in pricing:
        return pricing[key]

    # Try global
    key_global = f"{provider}:{model}:global"
    if key_global in pricing:
        return pricing[key_global]

    return None


def get_volume_tier(
    provider: str,
    monthly_spend_usd: float = 0,
    monthly_tokens: int = 0
) -> Optional[VolumeTier]:
    """Get applicable volume tier for a provider based on usage."""
    tiers = load_volume_tiers()

    if provider not in tiers:
        return None

    # Find the highest tier that applies
    applicable_tier = None
    for tier in tiers[provider]:
        # Check spend threshold
        if tier.min_monthly_spend_usd <= monthly_spend_usd:
            if tier.max_monthly_spend_usd == 0 or monthly_spend_usd <= tier.max_monthly_spend_usd:
                applicable_tier = tier

        # Check token threshold
        if tier.min_monthly_tokens <= monthly_tokens:
            if tier.max_monthly_tokens == 0 or monthly_tokens <= tier.max_monthly_tokens:
                applicable_tier = tier

    return applicable_tier


def get_support_tier(
    provider: str,
    tier_name: str = None,
    monthly_spend: float = 0
) -> Optional[SupportTier]:
    """Get support tier by name or calculate based on spend."""
    tiers = load_support_tiers()

    if provider not in tiers:
        return None

    if tier_name:
        for tier in tiers[provider]:
            if tier.support_tier == tier_name:
                return tier

    # Find applicable tier based on spend
    for tier in reversed(tiers[provider]):
        if tier.min_monthly_spend <= monthly_spend:
            return tier

    return tiers[provider][0] if tiers[provider] else None


def get_currency_rate(currency_code: str) -> Optional[CurrencyRate]:
    """Get exchange rate for a currency."""
    rates = load_currency_rates()
    return rates.get(currency_code.upper())


# =============================================================================
# COST CALCULATION FUNCTIONS
# =============================================================================

def calculate_cost(
    provider: str,
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cached_input_tokens: int = 0,
    cached_write_tokens: int = 0,
    is_batch: bool = False,
    region: str = "global",
    apply_volume_discount: bool = False,
    monthly_spend_usd: float = 0,
    monthly_tokens: int = 0,
    custom_discount_pct: float = None,
    currency: str = "USD",
) -> Dict:
    """
    Calculate cost for PAYG usage with all features.

    Args:
        provider: Provider ID
        model: Model name
        input_tokens: Input tokens used
        output_tokens: Output tokens used
        cached_input_tokens: Cached input tokens (read)
        cached_write_tokens: Cached write tokens
        is_batch: Use batch pricing
        region: Region for regional pricing
        apply_volume_discount: Apply volume tier discount
        monthly_spend_usd: Monthly spend for volume tier calculation
        monthly_tokens: Monthly tokens for volume tier calculation
        custom_discount_pct: Custom discount override
        currency: Output currency (default USD)

    Returns dict with detailed cost breakdown.
    """
    pricing = get_model_pricing(provider, model, region)

    if not pricing:
        return {
            "total_cost": 0,
            "input_cost": 0,
            "output_cost": 0,
            "cached_cost": 0,
            "pricing_found": False,
            "model_used": model,
            "provider": provider,
            "currency": currency,
        }

    # Check if pricing is effective
    if not _is_effective(pricing.effective_from, pricing.effective_to):
        return {
            "total_cost": 0,
            "pricing_found": False,
            "error": "Pricing not effective for current date",
            "effective_from": pricing.effective_from,
            "effective_to": pricing.effective_to,
            "model_used": model,
            "provider": provider,
            "currency": currency,
        }

    # Determine which rates to use
    if is_batch:
        input_rate = pricing.batch_input_per_1m or pricing.input_per_1m
        output_rate = pricing.batch_output_per_1m or pricing.output_per_1m
    else:
        input_rate = pricing.input_per_1m
        output_rate = pricing.output_per_1m

    # Apply volume tier discount
    volume_tier = None
    volume_discount = 0
    if apply_volume_discount:
        volume_tier = get_volume_tier(provider, monthly_spend_usd, monthly_tokens)
        if volume_tier:
            volume_discount = volume_tier.discount_pct
            input_rate *= volume_tier.input_multiplier
            output_rate *= volume_tier.output_multiplier

    # Apply custom discount if provided
    if custom_discount_pct is not None:
        discount_multiplier = 1 - (custom_discount_pct / 100)
        input_rate *= discount_multiplier
        output_rate *= discount_multiplier

    # Calculate free tier adjustment
    billable_input = max(0, input_tokens - pricing.free_tier_input_tokens)
    billable_output = max(0, output_tokens - pricing.free_tier_output_tokens)
    free_input_used = input_tokens - billable_input
    free_output_used = output_tokens - billable_output

    # Calculate costs (per 1M tokens)
    input_cost = (billable_input / 1_000_000) * input_rate
    output_cost = (billable_output / 1_000_000) * output_rate

    # Cached tokens
    cached_read_cost = (cached_input_tokens / 1_000_000) * pricing.cached_input_per_1m
    cached_write_cost = (cached_write_tokens / 1_000_000) * pricing.cached_write_per_1m
    cached_cost = cached_read_cost + cached_write_cost

    total_cost = input_cost + output_cost + cached_cost

    # Currency conversion
    currency_rate = None
    if currency != "USD":
        currency_rate = get_currency_rate(currency)
        if currency_rate:
            total_cost *= currency_rate.rate_from_usd
            input_cost *= currency_rate.rate_from_usd
            output_cost *= currency_rate.rate_from_usd
            cached_cost *= currency_rate.rate_from_usd

    result = {
        "total_cost": round(total_cost, 10),
        "input_cost": round(input_cost, 10),
        "output_cost": round(output_cost, 10),
        "cached_cost": round(cached_cost, 10),
        "pricing_found": True,
        "model_used": pricing.model,
        "model_family": pricing.model_family,
        "provider": provider,
        "region": pricing.region,
        "input_rate_per_1m": input_rate,
        "output_rate_per_1m": output_rate,
        "context_window": pricing.context_window,
        "max_output_tokens": pricing.max_output_tokens,
        "sla_uptime_pct": pricing.sla_uptime_pct,
        "currency": currency,
        "is_batch": is_batch,
        # Token details
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "billable_input_tokens": billable_input,
        "billable_output_tokens": billable_output,
        "free_input_tokens_used": free_input_used,
        "free_output_tokens_used": free_output_used,
        # Rate limits
        "rate_limit_rpm": pricing.rate_limit_rpm,
        "rate_limit_tpm": pricing.rate_limit_tpm,
    }

    # Add volume tier info
    if volume_tier:
        result["volume_tier"] = volume_tier.tier_name
        result["volume_discount_pct"] = volume_discount

    # Add custom discount info
    if custom_discount_pct is not None:
        result["custom_discount_pct"] = custom_discount_pct

    # Add currency conversion info
    if currency_rate:
        result["exchange_rate"] = currency_rate.rate_from_usd
        result["currency_symbol"] = currency_rate.symbol

    return result


def calculate_ptu_cost(
    provider: str,
    model: str,
    ptu_count: int,
    hours: float = 24,
    region: str = "",
    custom_discount_pct: float = None,
    currency: str = "USD",
) -> Dict:
    """
    Calculate cost for PTU/GSU/commitment usage.

    Supports:
    - Azure PTU (hourly rate)
    - AWS Bedrock PT (hourly rate)
    - GCP Vertex AI GSU (monthly rate - pricing not public)
    """
    pricing = get_commitment_pricing(provider, model, region)

    if not pricing:
        return {
            "total_cost": 0,
            "ptu_cost": 0,
            "pricing_found": False,
            "model": model,
            "provider": provider,
            "currency": currency,
        }

    # Handle GCP GSU (no public pricing)
    if pricing.commitment_type == "gsu":
        return {
            "total_cost": 0,
            "ptu_cost": 0,
            "gsu_count": ptu_count,
            "tokens_per_minute": pricing.tokens_per_ptu_minute,
            "throughput_tokens_per_sec": pricing.tokens_per_ptu_minute // 60 if pricing.tokens_per_ptu_minute else 0,
            "pricing_found": False,
            "pricing_note": "Contact Google Cloud sales for GSU pricing",
            "model": pricing.model,
            "provider": provider,
            "region": pricing.region,
            "commitment_type": pricing.commitment_type,
            "currency": currency,
        }

    # Standard PTU/PT calculation (hourly rate)
    hourly_rate = pricing.ptu_hourly_rate

    # Apply discounts
    total_discount = pricing.term_discount_pct + pricing.volume_discount_pct
    if custom_discount_pct is not None:
        total_discount = custom_discount_pct

    if total_discount > 0:
        hourly_rate *= (1 - total_discount / 100)

    ptu_cost = ptu_count * hourly_rate * hours

    # Currency conversion
    if currency != "USD":
        currency_rate = get_currency_rate(currency)
        if currency_rate:
            ptu_cost *= currency_rate.rate_from_usd

    return {
        "total_cost": round(ptu_cost, 2),
        "ptu_cost": round(ptu_cost, 2),
        "ptu_count": ptu_count,
        "ptu_hourly_rate": hourly_rate,
        "hours": hours,
        "pricing_found": True,
        "model": pricing.model,
        "provider": provider,
        "region": pricing.region,
        "commitment_type": pricing.commitment_type,
        "term_discount_pct": pricing.term_discount_pct,
        "volume_discount_pct": pricing.volume_discount_pct,
        "custom_discount_pct": custom_discount_pct,
        "currency": currency,
    }


def calculate_infrastructure_cost(
    provider: str,
    instance_type: str,
    hours: float = 24,
    instance_count: int = 1,
    region: str = "",
    pricing_type: str = "on_demand",
    custom_discount_pct: float = None,
    currency: str = "USD",
) -> Dict:
    """
    Calculate cost for infrastructure (GPU/TPU) usage.

    Args:
        pricing_type: on_demand, spot, reserved_1yr, reserved_3yr
        custom_discount_pct: Override discount % (e.g., 50 = 50% off)
        currency: Output currency (default USD)
    """
    pricing = get_infrastructure_pricing(provider, instance_type, region)

    if not pricing:
        return {
            "total_cost": 0,
            "hourly_cost": 0,
            "pricing_found": False,
            "instance_type": instance_type,
            "provider": provider,
            "currency": currency,
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

    # Currency conversion
    if currency != "USD":
        currency_rate = get_currency_rate(currency)
        if currency_rate:
            total_cost *= currency_rate.rate_from_usd
            hourly_cost *= currency_rate.rate_from_usd
            savings *= currency_rate.rate_from_usd

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
        "currency": currency,
        "on_demand_rate": pricing.hourly_rate,
        "spot_discount_pct": pricing.spot_discount_pct,
        "reserved_1yr_discount_pct": pricing.reserved_1yr_discount_pct,
        "reserved_3yr_discount_pct": pricing.reserved_3yr_discount_pct,
        "savings_vs_on_demand": round(savings, 2),
    }


def calculate_media_cost(
    provider: str,
    model: str,
    units: int = 1,
    quality: str = "standard",
    size_resolution: str = "",
    custom_discount_pct: float = None,
    currency: str = "USD",
) -> Dict:
    """
    Calculate cost for media generation (image/audio/video).

    Args:
        units: Number of units (images, minutes, seconds, etc.)
        quality: Quality level (standard, hd, etc.)
        size_resolution: Size/resolution specification
    """
    pricing = get_media_pricing(provider, model, quality, size_resolution)

    if not pricing:
        return {
            "total_cost": 0,
            "pricing_found": False,
            "model": model,
            "provider": provider,
            "currency": currency,
        }

    # Calculate billable units (after free tier)
    billable_units = max(0, units - pricing.free_tier_units)
    free_units_used = units - billable_units

    # Base price
    unit_price = pricing.price_per_unit

    # Apply discounts
    if custom_discount_pct is not None:
        unit_price *= (1 - custom_discount_pct / 100)
    elif pricing.volume_discount_pct > 0:
        unit_price *= (1 - pricing.volume_discount_pct / 100)

    total_cost = billable_units * unit_price

    # Currency conversion
    if currency != "USD":
        currency_rate = get_currency_rate(currency)
        if currency_rate:
            total_cost *= currency_rate.rate_from_usd

    return {
        "total_cost": round(total_cost, 6),
        "unit_price": unit_price,
        "units_requested": units,
        "billable_units": billable_units,
        "free_units_used": free_units_used,
        "pricing_found": True,
        "model": pricing.model,
        "media_type": pricing.media_type,
        "quality": pricing.quality,
        "size_resolution": pricing.size_resolution,
        "unit_type": pricing.unit,
        "provider": provider,
        "sla_uptime_pct": pricing.sla_uptime_pct,
        "rate_limit_rpm": pricing.rate_limit_rpm,
        "currency": currency,
    }


def calculate_training_cost(
    provider: str,
    model: str,
    training_tokens: int = 0,
    epochs: int = 1,
    storage_gb: float = 0,
    storage_months: float = 1,
    region: str = "global",
    currency: str = "USD",
) -> Dict:
    """
    Calculate cost for fine-tuning/training.

    Args:
        training_tokens: Total tokens in training dataset
        epochs: Number of training epochs
        storage_gb: Model storage in GB
        storage_months: Duration of storage
    """
    pricing = get_training_pricing(provider, model, region)

    if not pricing:
        return {
            "total_cost": 0,
            "pricing_found": False,
            "model": model,
            "provider": provider,
            "currency": currency,
        }

    # Training cost = tokens * epochs * rate
    total_training_tokens = training_tokens * epochs
    training_cost = (total_training_tokens / 1_000_000) * pricing.training_per_1m_tokens

    # Storage cost
    storage_cost = storage_gb * pricing.storage_per_gb_month * storage_months

    total_cost = training_cost + storage_cost

    # Currency conversion
    if currency != "USD":
        currency_rate = get_currency_rate(currency)
        if currency_rate:
            total_cost *= currency_rate.rate_from_usd
            training_cost *= currency_rate.rate_from_usd
            storage_cost *= currency_rate.rate_from_usd

    return {
        "total_cost": round(total_cost, 4),
        "training_cost": round(training_cost, 4),
        "storage_cost": round(storage_cost, 4),
        "training_tokens": training_tokens,
        "epochs": epochs,
        "total_training_tokens": total_training_tokens,
        "storage_gb": storage_gb,
        "storage_months": storage_months,
        "pricing_found": True,
        "model": pricing.model,
        "base_model": pricing.base_model,
        "training_type": pricing.training_type,
        "training_rate_per_1m": pricing.training_per_1m_tokens,
        "inference_input_per_1m": pricing.inference_input_per_1m,
        "inference_output_per_1m": pricing.inference_output_per_1m,
        "provider": provider,
        "region": pricing.region,
        "sla_uptime_pct": pricing.sla_uptime_pct,
        "currency": currency,
    }


def calculate_support_cost(
    provider: str,
    tier_name: str = None,
    monthly_spend: float = 0,
    currency: str = "USD",
) -> Dict:
    """
    Calculate monthly support cost.

    Args:
        tier_name: Specific tier name (optional)
        monthly_spend: Monthly infrastructure/API spend
    """
    tier = get_support_tier(provider, tier_name, monthly_spend)

    if not tier:
        return {
            "total_cost": 0,
            "pricing_found": False,
            "provider": provider,
            "currency": currency,
        }

    # Calculate support cost
    if tier.spend_percentage > 0:
        percentage_cost = monthly_spend * (tier.spend_percentage / 100)
        support_cost = max(tier.monthly_base_cost, percentage_cost)
    else:
        support_cost = tier.monthly_base_cost

    # Ensure minimum spend requirement
    if monthly_spend < tier.min_monthly_spend:
        return {
            "total_cost": 0,
            "pricing_found": True,
            "eligible": False,
            "min_spend_required": tier.min_monthly_spend,
            "current_spend": monthly_spend,
            "tier": tier.support_tier,
            "provider": provider,
            "currency": currency,
        }

    # Currency conversion
    if currency != "USD":
        currency_rate = get_currency_rate(currency)
        if currency_rate:
            support_cost *= currency_rate.rate_from_usd

    return {
        "total_cost": round(support_cost, 2),
        "monthly_base_cost": tier.monthly_base_cost,
        "spend_percentage": tier.spend_percentage,
        "pricing_found": True,
        "eligible": True,
        "tier": tier.support_tier,
        "provider": provider,
        "response_time_critical": tier.response_time_critical,
        "response_time_high": tier.response_time_high,
        "response_time_normal": tier.response_time_normal,
        "uptime_sla_pct": tier.uptime_sla_pct,
        "dedicated_tam": tier.dedicated_tam,
        "phone_support": tier.phone_support,
        "slack_support": tier.slack_support,
        "training_included": tier.training_included,
        "currency": currency,
    }


def calculate_egress_cost(
    cloud_provider: str,
    data_gb: float,
    egress_type: str = "internet",
    region: str = "",
    destination: str = "worldwide",
    currency: str = "USD",
) -> Dict:
    """
    Calculate data egress cost with tiered pricing.

    Args:
        cloud_provider: aws, gcp, azure
        data_gb: Total data transfer in GB
        egress_type: internet, cross-region, same-az, cross-az
        region: Source region
        destination: Destination (worldwide, specific region, etc.)
    """
    egress_data = load_data_egress()

    if cloud_provider not in egress_data:
        return {
            "total_cost": 0,
            "pricing_found": False,
            "cloud_provider": cloud_provider,
            "currency": currency,
        }

    # Find matching egress tiers
    matching_tiers = []
    for entry in egress_data[cloud_provider]:
        if entry.egress_type == egress_type:
            if not region or entry.region == region:
                if not destination or entry.destination == destination or entry.destination == "worldwide":
                    matching_tiers.append(entry)

    if not matching_tiers:
        return {
            "total_cost": 0,
            "pricing_found": False,
            "cloud_provider": cloud_provider,
            "egress_type": egress_type,
            "currency": currency,
        }

    # Sort tiers by start GB
    matching_tiers.sort(key=lambda x: x.tier_start_gb)

    # Calculate tiered cost
    total_cost = 0
    remaining_gb = data_gb
    free_tier_applied = 0
    tier_breakdown = []

    for tier in matching_tiers:
        if remaining_gb <= 0:
            break

        # Apply free tier
        if tier.free_tier_gb > 0 and free_tier_applied < tier.free_tier_gb:
            free_gb = min(remaining_gb, tier.free_tier_gb - free_tier_applied)
            remaining_gb -= free_gb
            free_tier_applied += free_gb
            tier_breakdown.append({
                "tier": "free",
                "gb": free_gb,
                "cost": 0,
            })

        if remaining_gb <= 0:
            break

        # Calculate tier range
        tier_start = tier.tier_start_gb
        tier_end = tier.tier_end_gb if tier.tier_end_gb > 0 else float('inf')

        if data_gb - remaining_gb >= tier_end:
            continue

        gb_in_tier = min(remaining_gb, tier_end - max(tier_start, data_gb - remaining_gb))
        if gb_in_tier > 0:
            tier_cost = gb_in_tier * tier.price_per_gb
            total_cost += tier_cost
            remaining_gb -= gb_in_tier
            tier_breakdown.append({
                "tier": f"{tier.tier_start_gb}-{tier.tier_end_gb if tier.tier_end_gb > 0 else '∞'}GB",
                "gb": gb_in_tier,
                "rate_per_gb": tier.price_per_gb,
                "cost": tier_cost,
            })

    # Currency conversion
    if currency != "USD":
        currency_rate = get_currency_rate(currency)
        if currency_rate:
            total_cost *= currency_rate.rate_from_usd
            for t in tier_breakdown:
                t["cost"] *= currency_rate.rate_from_usd

    return {
        "total_cost": round(total_cost, 4),
        "data_gb": data_gb,
        "free_tier_gb_used": free_tier_applied,
        "billable_gb": data_gb - free_tier_applied,
        "pricing_found": True,
        "cloud_provider": cloud_provider,
        "egress_type": egress_type,
        "region": region,
        "destination": destination,
        "tier_breakdown": tier_breakdown,
        "currency": currency,
    }


# =============================================================================
# CURRENCY CONVERSION
# =============================================================================

def convert_currency(
    amount: float,
    from_currency: str,
    to_currency: str
) -> Tuple[float, bool]:
    """
    Convert amount between currencies.

    Returns: (converted_amount, success)
    """
    if from_currency == to_currency:
        return amount, True

    rates = load_currency_rates()

    if from_currency not in rates or to_currency not in rates:
        return amount, False

    # Convert to USD first, then to target
    from_rate = rates[from_currency]
    to_rate = rates[to_currency]

    usd_amount = amount * from_rate.rate_to_usd
    converted = usd_amount * to_rate.rate_from_usd

    return round(converted, to_rate.decimal_places), True


# =============================================================================
# LISTING FUNCTIONS
# =============================================================================

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
    elif pricing_model == "media":
        pricing = load_media_pricing()
    elif pricing_model == "training":
        pricing = load_training_pricing()
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
                "region": p.region,
                "status": p.status,
                "input_per_1m": p.input_per_1m,
                "output_per_1m": p.output_per_1m,
                "context_window": p.context_window,
                "supports_vision": p.supports_vision,
                "supports_tools": p.supports_tools,
                "free_tier_input": p.free_tier_input_tokens,
                "free_tier_output": p.free_tier_output_tokens,
                "sla_uptime_pct": p.sla_uptime_pct,
            })
        elif pricing_model == "commitment":
            models.append({
                "provider": p.provider,
                "model": p.model,
                "commitment_type": p.commitment_type,
                "region": p.region,
                "ptu_hourly_rate": p.ptu_hourly_rate,
                "term_discount_pct": p.term_discount_pct,
                "status": p.status,
            })
        elif pricing_model == "media":
            models.append({
                "provider": p.provider,
                "model": p.model,
                "media_type": p.media_type,
                "quality": p.quality,
                "unit": p.unit,
                "price_per_unit": p.price_per_unit,
                "free_tier_units": p.free_tier_units,
                "status": p.status,
            })
        elif pricing_model == "training":
            models.append({
                "provider": p.provider,
                "model": p.model,
                "training_type": p.training_type,
                "base_model": p.base_model,
                "training_per_1m": p.training_per_1m_tokens,
                "inference_input_per_1m": p.inference_input_per_1m,
                "status": p.status,
            })

    return sorted(models, key=lambda x: (x["provider"], x["model"]))


def list_currencies() -> List[Dict]:
    """List all available currencies."""
    rates = load_currency_rates()
    return [
        {
            "code": r.currency_code,
            "name": r.currency_name,
            "symbol": r.symbol,
            "rate_to_usd": r.rate_to_usd,
            "rate_from_usd": r.rate_from_usd,
            "last_updated": r.last_updated,
        }
        for r in rates.values()
    ]


# =============================================================================
# SUMMARY AND STATS
# =============================================================================

def get_pricing_summary() -> Dict:
    """Get summary statistics of all pricing data."""
    payg = load_payg_pricing()
    commitment = load_commitment_pricing()
    infrastructure = load_infrastructure_pricing()
    media = load_media_pricing()
    training = load_training_pricing()
    volume_tiers = load_volume_tiers()
    support_tiers = load_support_tiers()
    currency_rates = load_currency_rates()
    data_egress = load_data_egress()
    registry = load_provider_registry()

    payg_providers = set(p.provider for p in payg.values())
    commitment_providers = set(p.provider for p in commitment.values())
    infrastructure_providers = set(p.provider for p in infrastructure.values())
    media_providers = set(p.provider for p in media.values())
    training_providers = set(p.provider for p in training.values())

    return {
        "total_payg_models": len(payg),
        "total_commitment_entries": len(commitment),
        "total_infrastructure_entries": len(infrastructure),
        "total_media_entries": len(media),
        "total_training_entries": len(training),
        "total_volume_tier_providers": len(volume_tiers),
        "total_support_tier_providers": len(support_tiers),
        "total_currencies": len(currency_rates),
        "total_egress_providers": len(data_egress),
        "total_providers_registered": len(registry),
        "payg_providers": sorted(list(payg_providers)),
        "commitment_providers": sorted(list(commitment_providers)),
        "infrastructure_providers": sorted(list(infrastructure_providers)),
        "media_providers": sorted(list(media_providers)),
        "training_providers": sorted(list(training_providers)),
        "pricing_files": {
            "registry": str(REGISTRY_CSV),
            "payg": str(PAYG_PRICING_CSV),
            "commitment": str(COMMITMENT_PRICING_CSV),
            "infrastructure": str(INFRASTRUCTURE_PRICING_CSV),
            "media": str(MEDIA_PRICING_CSV),
            "training": str(TRAINING_PRICING_CSV),
            "volume_tiers": str(VOLUME_TIERS_CSV),
            "support_tiers": str(SUPPORT_TIERS_CSV),
            "currency_rates": str(CURRENCY_RATES_CSV),
            "data_egress": str(DATA_EGRESS_CSV),
        },
    }


# =============================================================================
# BACKWARD COMPATIBILITY
# =============================================================================

def load_advanced_pricing():
    """Backward compatibility: load PAYG pricing."""
    return load_payg_pricing()
