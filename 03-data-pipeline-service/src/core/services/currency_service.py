"""
Currency Service

Handles currency conversion logic.
Exchange rates are configurable via CURRENCY_RATES_USD_BASE environment variable.
"""

from typing import Dict, Optional, Tuple
from datetime import datetime
import logging

from src.app.config import get_settings
from src.app.models.i18n_models import get_currency_decimals

# Staleness threshold in days (rates older than this should be reviewed)
RATE_STALENESS_THRESHOLD_DAYS = 30


class CurrencyService:
    """
    Currency conversion service with configurable exchange rates.

    Rates are loaded from settings.currency_rates_usd_base which can be
    configured via environment variable CURRENCY_RATES_USD_BASE (JSON format).
    """

    def __init__(self):
        self.settings = get_settings()
        self.logger = logging.getLogger(__name__)
        self._rates: Optional[Dict[str, float]] = None

    @property
    def exchange_rates(self) -> Dict[str, float]:
        """Get exchange rates from configuration (cached after first access)."""
        if self._rates is None:
            self._rates = self.settings.currency_rates_usd_base
            self.logger.debug(f"Loaded {len(self._rates)} currency rates from configuration")
        return self._rates

    def convert(self, amount: float, from_currency: str, to_currency: str) -> float:
        """
        Convert amount between currencies.

        Args:
            amount: Amount to convert
            from_currency: Source currency code (e.g. 'USD')
            to_currency: Target currency code (e.g. 'EUR')

        Returns:
            Converted amount rounded to currency-specific decimals.

        Fallback Behavior (configured via settings.currency_fallback_return_original):
            - True (default): Returns original amount if currency not supported
            - False: Returns 0.0 if currency not supported

        WARNING: Silent fallback can cause data integrity issues. If accuracy
        is critical, validate currencies with is_currency_supported() first.
        """
        if from_currency == to_currency:
            return amount

        from_rate = self.exchange_rates.get(from_currency.upper())
        to_rate = self.exchange_rates.get(to_currency.upper())

        if not from_rate or not to_rate:
            self.logger.warning(
                f"Unknown currency pair: {from_currency} -> {to_currency}",
                extra={
                    "from_currency": from_currency,
                    "to_currency": to_currency,
                    "available_currencies": list(self.exchange_rates.keys())
                }
            )
            # Return original or 0 based on configuration
            if self.settings.currency_fallback_return_original:
                return amount
            return 0.0

        # Convert to USD first (Base), then to Target
        result = (amount / from_rate) * to_rate

        # Round to currency-specific decimals (JPY=0, KWD/BHD/OMR=3, most=2)
        decimals = get_currency_decimals(to_currency.upper())
        return round(result, decimals)

    def get_supported_currencies(self) -> list:
        """Get list of supported currency codes."""
        return list(self.exchange_rates.keys())

    def is_currency_supported(self, currency_code: str) -> bool:
        """Check if a currency code is supported."""
        return currency_code.upper() in self.exchange_rates

    def check_rates_configured(self) -> Tuple[bool, str]:
        """
        Check if exchange rates are properly configured.

        Returns:
            Tuple of (is_configured, message):
            - (True, "OK") if rates are configured via environment
            - (False, warning_message) if using default rates

        Use this at pipeline startup to warn about potentially stale rates.
        """
        rates = self.exchange_rates
        if not rates or len(rates) == 0:
            return (False, "No exchange rates configured. Set CURRENCY_RATES_USD_BASE env var.")

        # Check if this looks like default/embedded rates (has specific count)
        # If rates come from env, they're considered fresh
        if hasattr(self.settings, 'currency_rates_source'):
            source = getattr(self.settings, 'currency_rates_source', 'default')
            if source == 'default':
                return (False, f"Using default embedded rates ({len(rates)} currencies). "
                              f"Consider setting CURRENCY_RATES_USD_BASE for current rates.")

        return (True, f"Exchange rates configured: {len(rates)} currencies")

    def log_rate_status(self) -> None:
        """Log current exchange rate configuration status."""
        is_configured, message = self.check_rates_configured()
        if is_configured:
            self.logger.info(f"[Currency] {message}")
        else:
            self.logger.warning(f"[Currency] {message}")


def get_currency_service() -> CurrencyService:
    """Factory function to get currency service instance."""
    return CurrencyService()
