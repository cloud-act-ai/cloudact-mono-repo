"""
Currency Service

Handles currency conversion logic.
Exchange rates are configurable via CURRENCY_RATES_USD_BASE environment variable.
"""

from typing import Dict, Optional
import logging

from src.app.config import get_settings


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
            Converted amount. Returns original amount if conversion fails
            and currency_fallback_return_original is True.
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
        return (amount / from_rate) * to_rate

    def get_supported_currencies(self) -> list:
        """Get list of supported currency codes."""
        return list(self.exchange_rates.keys())

    def is_currency_supported(self, currency_code: str) -> bool:
        """Check if a currency code is supported."""
        return currency_code.upper() in self.exchange_rates


def get_currency_service() -> CurrencyService:
    """Factory function to get currency service instance."""
    return CurrencyService()
