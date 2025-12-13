import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional

# Default output directory relative to the project root or script execution
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "output")).expanduser()
USAGE_FILE = OUTPUT_DIR / "usage_events.jsonl"

def get_usage_file() -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    return USAGE_FILE

def log_usage(
    provider: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    metadata: Optional[Dict[str, Any]] = None
) -> None:
    """
    Append a usage event to the JSONL log.
    """
    event = {
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "provider": provider,
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "metadata": metadata or {}
    }

    file_path = get_usage_file()
    with file_path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(event) + "\n")

    print(f"[LOG] Usage logged to {file_path}")

def get_usage(provider: Optional[str] = None, days: int = 1) -> List[Dict[str, Any]]:
    """
    Read usage events, optionally filtering by provider.
    (Simple implementation: reads whole file, real world would need rotation/indexing)
    """
    file_path = get_usage_file()
    if not file_path.exists():
        return []

    events = []
    with file_path.open("r", encoding="utf-8") as f:
        for line in f:
            try:
                event = json.loads(line)
                if provider and event.get("provider") != provider:
                    continue
                events.append(event)
            except json.JSONDecodeError:
                continue

    return events
