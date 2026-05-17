import logging
import os
import threading

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


def _seed_job() -> None:
    """Runs as a scheduled or on-demand background job."""
    # Late import prevents circular dependency at module load time
    from src.seed import seed_live_trials  # noqa: PLC0415

    seed_limit = int(os.getenv("SEED_LIMIT", "100"))
    logger.info("[Scheduler] Starting seed run (limit=%d).", seed_limit)
    try:
        seed_live_trials(limit=seed_limit)
        logger.info("[Scheduler] Seed run complete.")
    except Exception as e:
        logger.error("[Scheduler] Seed run failed: %s", e)


def start_scheduler() -> None:
    """Create and start the APScheduler background scheduler.

    Reads env vars:
      SEED_INTERVAL_HOURS  — interval between automatic runs (default 168 = weekly)
      SEED_ON_STARTUP      — if "true", triggers an immediate seed run on startup
    """
    global _scheduler

    interval_hours = int(os.getenv("SEED_INTERVAL_HOURS", "168"))
    seed_on_startup = os.getenv("SEED_ON_STARTUP", "false").lower() == "true"

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        _seed_job,
        trigger=IntervalTrigger(hours=interval_hours),
        id="seed_trials",
        name="ClinicalTrials.gov scheduled seed",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(
        "[Scheduler] Started. Interval=%.1fh. Next run: %s.",
        interval_hours,
        get_next_run_time() or "unknown",
    )

    if seed_on_startup:
        logger.info("[Scheduler] SEED_ON_STARTUP=true — running immediate seed.")
        trigger_seed_now()


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler (called on API teardown)."""
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("[Scheduler] Stopped.")
    _scheduler = None


def trigger_seed_now() -> None:
    """Kick off a seed job immediately in a daemon thread (non-blocking)."""
    t = threading.Thread(target=_seed_job, daemon=True, name="manual-seed")
    t.start()
    logger.info("[Scheduler] Manual seed triggered (thread=%s).", t.name)


def get_next_run_time() -> str | None:
    """Return ISO-8601 next scheduled run time, or None if not running."""
    if not _scheduler or not _scheduler.running:
        return None
    job = _scheduler.get_job("seed_trials")
    if job and job.next_run_time:
        return job.next_run_time.isoformat()
    return None
