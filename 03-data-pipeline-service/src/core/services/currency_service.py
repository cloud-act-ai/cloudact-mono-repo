"""
Currency Service

Handles currency conversion logic.
Currently a stub with hardcoded rates (USD base).
ref: https://api.exchangerate-api.com/v4/latest/USD (or similar source)
"""

from typing import Dict
import logging

# Hardcoded rates (Base: USD)
# TODO: Fetch live rates or sync to DB
EXCHANGE_RATES: Dict[str, float] = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "INR": 83.50,
    "JPY": 154.0,
    "CAD": 1.37,
    "AUD": 1.52
}

class CurrencyService:
    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def convert(self, amount: float, from_currency: str, to_currency: str) -> float:
        """
        Convert amount between currencies.
        
        Args:
            amount: Amount to convert
            from_currency: Source currency code (e.g. 'USD')
            to_currency: Target currency code (e.g. 'EUR')
            
        Returns:
            Converted amount
        """
        if from_currency == to_currency:
            return amount
            
        from_rate = EXCHANGE_RATES.get(from_currency.upper())
        to_rate = EXCHANGE_RATES.get(to_currency.upper())
        
        if not from_rate or not to_rate:
            self.logger.warning(f"Unknown currency pair: {from_currency} -> {to_currency}. Returning original.")
            # Fallback: strict 1:1 if unknown, or maybe should raise?
            # For now, safe fallback is 0 or original. Let's return original to avoid data loss,
            # but log warning.
            return amount
            
        # Convert to USD first (Base), then to Target
        # amount_usd = amount / from_rate
        # amount_target = amount_usd * to_rate
        return (amount / from_rate) * to_rate

def get_currency_service():
    return CurrencyService()
