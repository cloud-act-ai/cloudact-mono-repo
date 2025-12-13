"""
pricing_loader.py

Shared pricing loader that reads from the advanced pricing CSV.
Provides cost calculation for all providers with full feature support.
"""
import csv
from pathlib import Path
from typing import Dict, Optional, List
from dataclasses import dataclass
from functools import lru_cache

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
ADVANCED_PRICING_CSV = DATA_DIR / "llm_pricing_advanced.csv"


@dataclass
class ModelPricing:
    """Complete pricing information for a model."""
    provider: str
    model: str
    model_family: str
    model_version: str
    model_size_params: str
    status: str
    deployment_type: str
    region: str

    # Pricing per 1M tokens
    input_per_1m: float
    output_per_1m: float
    cached_input_per_1m: float
    cached_write_per_1m: float
    batch_input_per_1m: float
    batch_output_per_1m: float
    realtime_input_per_1m: float
    realtime_output_per_1m: float
    audio_input_per_1m: float
    audio_output_per_1m: float
    image_input_per_1k: float
    image_output_per_image: float
    video_input_per_min: float
    embedding_per_1m: float
    fine_tuning_per_1m: float
    training_per_1m: float
    storage_per_gb_month: float

    # Limits
    context_window: int
    max_output_tokens: int
    requests_per_min: int
    tokens_per_min: int
    tokens_per_day: int
    concurrent_requests: int

    # Discounts (percentage)
    volume_discount_5k: float
    volume_discount_50k: float
    volume_discount_500k: float
    committed_discount_1yr: float
    committed_discount_3yr: float
    startup_discount: float
    academic_discount: float
    nonprofit_discount: float

    # Performance
    latency_p50_ms: float
    latency_p99_ms: float
    throughput_tokens_sec: float
    time_to_first_token_ms: float

    # Capabilities
    supports_streaming: bool
    supports_function_calling: bool
    supports_vision: bool
    supports_audio: bool
    supports_video: bool
    supports_json_mode: bool
    supports_tools: bool

    # GPU/Cloud
    gpu_type: str
    gpu_memory_gb: float
    cloud_provider: str
    cloud_cost_per_hour: float
    self_hosted_cost_per_gpu_hour: float

    # Compliance
    compliance_hipaa: bool
    compliance_soc2: bool
    compliance_gdpr: bool

    # Meta
    currency: str
    notes: str


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
def load_advanced_pricing() -> Dict[str, ModelPricing]:
    """Load all pricing from advanced CSV. Cached for performance."""
    pricing = {}

    if not ADVANCED_PRICING_CSV.exists():
        print(f"Warning: Advanced pricing file not found: {ADVANCED_PRICING_CSV}")
        return pricing

    with ADVANCED_PRICING_CSV.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = f"{row['provider']}:{row['model']}"

            model_pricing = ModelPricing(
                provider=row.get("provider", ""),
                model=row.get("model", ""),
                model_family=row.get("model_family", ""),
                model_version=row.get("model_version", ""),
                model_size_params=row.get("model_size_params", ""),
                status=row.get("status", ""),
                deployment_type=row.get("deployment_type", ""),
                region=row.get("region", ""),

                # Pricing
                input_per_1m=_safe_float(row.get("input_per_1m_tokens")),
                output_per_1m=_safe_float(row.get("output_per_1m_tokens")),
                cached_input_per_1m=_safe_float(row.get("cached_input_per_1m")),
                cached_write_per_1m=_safe_float(row.get("cached_write_per_1m")),
                batch_input_per_1m=_safe_float(row.get("batch_input_per_1m")),
                batch_output_per_1m=_safe_float(row.get("batch_output_per_1m")),
                realtime_input_per_1m=_safe_float(row.get("realtime_input_per_1m")),
                realtime_output_per_1m=_safe_float(row.get("realtime_output_per_1m")),
                audio_input_per_1m=_safe_float(row.get("audio_input_per_1m")),
                audio_output_per_1m=_safe_float(row.get("audio_output_per_1m")),
                image_input_per_1k=_safe_float(row.get("image_input_per_1k")),
                image_output_per_image=_safe_float(row.get("image_output_per_image")),
                video_input_per_min=_safe_float(row.get("video_input_per_min")),
                embedding_per_1m=_safe_float(row.get("embedding_per_1m")),
                fine_tuning_per_1m=_safe_float(row.get("fine_tuning_per_1m")),
                training_per_1m=_safe_float(row.get("training_per_1m_tokens")),
                storage_per_gb_month=_safe_float(row.get("storage_per_gb_month")),

                # Limits
                context_window=_safe_int(row.get("context_window")),
                max_output_tokens=_safe_int(row.get("max_output_tokens")),
                requests_per_min=_safe_int(row.get("requests_per_min")),
                tokens_per_min=_safe_int(row.get("tokens_per_min")),
                tokens_per_day=_safe_int(row.get("tokens_per_day")),
                concurrent_requests=_safe_int(row.get("concurrent_requests")),

                # Discounts
                volume_discount_5k=_safe_float(row.get("volume_discount_5k")),
                volume_discount_50k=_safe_float(row.get("volume_discount_50k")),
                volume_discount_500k=_safe_float(row.get("volume_discount_500k")),
                committed_discount_1yr=_safe_float(row.get("committed_discount_1yr")),
                committed_discount_3yr=_safe_float(row.get("committed_discount_3yr")),
                startup_discount=_safe_float(row.get("startup_discount")),
                academic_discount=_safe_float(row.get("academic_discount")),
                nonprofit_discount=_safe_float(row.get("nonprofit_discount")),

                # Performance
                latency_p50_ms=_safe_float(row.get("latency_p50_ms")),
                latency_p99_ms=_safe_float(row.get("latency_p99_ms")),
                throughput_tokens_sec=_safe_float(row.get("throughput_tokens_sec")),
                time_to_first_token_ms=_safe_float(row.get("time_to_first_token_ms")),

                # Capabilities
                supports_streaming=_safe_bool(row.get("supports_streaming")),
                supports_function_calling=_safe_bool(row.get("supports_function_calling")),
                supports_vision=_safe_bool(row.get("supports_vision")),
                supports_audio=_safe_bool(row.get("supports_audio")),
                supports_video=_safe_bool(row.get("supports_video")),
                supports_json_mode=_safe_bool(row.get("supports_json_mode")),
                supports_tools=_safe_bool(row.get("supports_tools")),

                # GPU/Cloud
                gpu_type=row.get("gpu_type_cloud", ""),
                gpu_memory_gb=_safe_float(row.get("gpu_memory_gb")),
                cloud_provider=row.get("cloud_provider", ""),
                cloud_cost_per_hour=_safe_float(row.get("cloud_cost_per_hour")),
                self_hosted_cost_per_gpu_hour=_safe_float(row.get("self_hosted_cost_per_gpu_hour")),

                # Compliance
                compliance_hipaa=_safe_bool(row.get("compliance_hipaa")),
                compliance_soc2=_safe_bool(row.get("compliance_soc2")),
                compliance_gdpr=_safe_bool(row.get("compliance_gdpr")),

                # Meta
                currency=row.get("currency", "USD"),
                notes=row.get("notes", ""),
            )

            pricing[key] = model_pricing

    return pricing


def get_model_pricing(provider: str, model: str) -> Optional[ModelPricing]:
    """Get pricing for a specific model."""
    pricing = load_advanced_pricing()
    key = f"{provider}:{model}"

    if key in pricing:
        return pricing[key]

    # Try prefix matching
    for k, v in pricing.items():
        if k.startswith(f"{provider}:"):
            if v.model in model or model in v.model:
                return v

    return None


def calculate_cost(
    provider: str,
    model: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cached_input_tokens: int = 0,
    cached_write_tokens: int = 0,
    audio_seconds: float = 0,
    images: int = 0,
    video_minutes: float = 0,
    is_batch: bool = False,
    is_realtime: bool = False,
    discount_type: str = None,  # volume_5k, volume_50k, committed_1yr, startup, academic, nonprofit
) -> Dict:
    """
    Calculate comprehensive cost based on advanced pricing.

    Returns dict with detailed cost breakdown.
    """
    pricing = get_model_pricing(provider, model)

    if not pricing:
        return {
            "total_cost": 0,
            "input_cost": 0,
            "output_cost": 0,
            "cached_cost": 0,
            "audio_cost": 0,
            "image_cost": 0,
            "video_cost": 0,
            "discount_applied": 0,
            "discount_type": None,
            "pricing_found": False,
            "model_used": model,
            "currency": "USD"
        }

    # Determine which rates to use
    if is_batch:
        input_rate = pricing.batch_input_per_1m or pricing.input_per_1m
        output_rate = pricing.batch_output_per_1m or pricing.output_per_1m
    elif is_realtime:
        input_rate = pricing.realtime_input_per_1m or pricing.input_per_1m
        output_rate = pricing.realtime_output_per_1m or pricing.output_per_1m
    else:
        input_rate = pricing.input_per_1m
        output_rate = pricing.output_per_1m

    # Calculate base costs (per 1M tokens -> per token)
    input_cost = (input_tokens / 1_000_000) * input_rate
    output_cost = (output_tokens / 1_000_000) * output_rate

    # Cached tokens
    cached_read_cost = (cached_input_tokens / 1_000_000) * pricing.cached_input_per_1m
    cached_write_cost = (cached_write_tokens / 1_000_000) * pricing.cached_write_per_1m
    cached_cost = cached_read_cost + cached_write_cost

    # Audio (per minute -> per second)
    audio_cost = (audio_seconds / 60) * (pricing.audio_input_per_1m / 1000) if pricing.audio_input_per_1m else 0

    # Images
    image_cost = images * pricing.image_output_per_image

    # Video (per minute)
    video_cost = video_minutes * pricing.video_input_per_min

    # Subtotal before discount
    subtotal = input_cost + output_cost + cached_cost + audio_cost + image_cost + video_cost

    # Apply discount
    discount_pct = 0
    if discount_type:
        discount_map = {
            "volume_5k": pricing.volume_discount_5k,
            "volume_50k": pricing.volume_discount_50k,
            "volume_500k": pricing.volume_discount_500k,
            "committed_1yr": pricing.committed_discount_1yr,
            "committed_3yr": pricing.committed_discount_3yr,
            "startup": pricing.startup_discount,
            "academic": pricing.academic_discount,
            "nonprofit": pricing.nonprofit_discount,
        }
        discount_pct = discount_map.get(discount_type, 0)

    discount_amount = subtotal * (discount_pct / 100)
    total_cost = subtotal - discount_amount

    return {
        "total_cost": round(total_cost, 10),
        "subtotal": round(subtotal, 10),
        "input_cost": round(input_cost, 10),
        "output_cost": round(output_cost, 10),
        "cached_read_cost": round(cached_read_cost, 10),
        "cached_write_cost": round(cached_write_cost, 10),
        "cached_cost": round(cached_cost, 10),
        "audio_cost": round(audio_cost, 10),
        "image_cost": round(image_cost, 10),
        "video_cost": round(video_cost, 10),
        "discount_pct": discount_pct,
        "discount_amount": round(discount_amount, 10),
        "discount_type": discount_type,
        "pricing_found": True,
        "model_used": pricing.model,
        "model_family": pricing.model_family,
        "input_rate_per_1m": input_rate,
        "output_rate_per_1m": output_rate,
        "context_window": pricing.context_window,
        "max_output_tokens": pricing.max_output_tokens,
        "currency": pricing.currency,
        "is_batch": is_batch,
        "is_realtime": is_realtime,
    }


def list_models(provider: str = None) -> List[Dict]:
    """List all available models, optionally filtered by provider."""
    pricing = load_advanced_pricing()
    models = []

    for key, p in pricing.items():
        if provider and p.provider != provider:
            continue

        models.append({
            "provider": p.provider,
            "model": p.model,
            "model_family": p.model_family,
            "status": p.status,
            "deployment_type": p.deployment_type,
            "input_per_1m": p.input_per_1m,
            "output_per_1m": p.output_per_1m,
            "context_window": p.context_window,
            "supports_vision": p.supports_vision,
            "supports_audio": p.supports_audio,
            "supports_tools": p.supports_tools,
        })

    return sorted(models, key=lambda x: (x["provider"], x["model"]))


def get_pricing_summary() -> Dict:
    """Get summary statistics of pricing data."""
    pricing = load_advanced_pricing()

    providers = set()
    deployment_types = set()
    total_models = len(pricing)

    for p in pricing.values():
        providers.add(p.provider)
        deployment_types.add(p.deployment_type)

    return {
        "total_models": total_models,
        "providers": sorted(list(providers)),
        "deployment_types": sorted(list(deployment_types)),
        "pricing_file": str(ADVANCED_PRICING_CSV),
    }
