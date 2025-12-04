"""
Schedule Calculator
Calculate next run times from cron expressions using croniter.

Supports standard cron syntax with timezone awareness using pendulum.
"""

from datetime import datetime
from croniter import croniter
import pendulum

from src.core.utils.logging import get_logger

logger = get_logger(__name__)


class ScheduleCalculator:
    """
    Calculate next run times from cron expressions using croniter.

    Supports standard cron syntax with timezone awareness using pendulum.
    """

    def calculate_next_run(
        self,
        cron_expression: str,
        timezone: str,
        after: datetime = None
    ) -> datetime:
        """
        Calculate next run time from cron expression.

        Args:
            cron_expression: Cron expression (e.g., "0 2 * * *")
            timezone: Timezone string (e.g., "America/New_York")
            after: Calculate next run after this time (defaults to now)

        Returns:
            Next run datetime in UTC

        Examples:
            - "0 2 * * *" → Daily at 2:00 AM
            - "0 */4 * * *" → Every 4 hours
            - "0 0 * * 0" → Weekly on Sunday
            - "0 0 1 * *" → Monthly on 1st
        """
        try:
            # Get current time in specified timezone
            if after is None:
                after = pendulum.now(timezone)
            else:
                after = pendulum.instance(after, tz=timezone)

            # Create croniter instance
            cron = croniter(cron_expression, after)

            # Get next run time
            next_run = cron.get_next(datetime)

            # Convert to UTC
            next_run_utc = pendulum.instance(next_run, tz=timezone).in_timezone('UTC')

            logger.debug(
                f"Calculated next run time: {next_run_utc.isoformat()}",
                extra={
                    "cron_expression": cron_expression,
                    "timezone": timezone,
                    "after": after.isoformat()
                }
            )

            return next_run_utc

        except Exception as e:
            logger.error(
                f"Error calculating next run time: {e}",
                extra={"cron_expression": cron_expression, "timezone": timezone},
                exc_info=True
            )
            raise ValueError(f"Invalid cron expression: {cron_expression}") from e

    def is_due(
        self,
        cron_expression: str,
        last_run: datetime,
        timezone: str
    ) -> bool:
        """
        Check if pipeline is due to run.

        Args:
            cron_expression: Cron expression
            last_run: Last execution time
            timezone: Timezone string

        Returns:
            True if pipeline should run now
        """
        try:
            next_run = self.calculate_next_run(cron_expression, timezone, after=last_run)
            now = pendulum.now('UTC')

            is_due = next_run <= now

            logger.debug(
                f"Pipeline due check: {is_due}",
                extra={
                    "cron_expression": cron_expression,
                    "last_run": last_run.isoformat(),
                    "next_run": next_run.isoformat(),
                    "now": now.isoformat()
                }
            )

            return is_due

        except Exception as e:
            logger.error(
                f"Error checking if pipeline is due: {e}",
                extra={"cron_expression": cron_expression},
                exc_info=True
            )
            return False
