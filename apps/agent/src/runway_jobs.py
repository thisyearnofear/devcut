"""Persistent Runway job tracker backed by Postgres (intelligence_app DB).

Persists Runway task IDs before polling begins so that if the agent process
restarts mid-run the task can be resumed rather than lost.

Usage (in runway_client.py):
    from src.runway_jobs import upsert_job, mark_done, mark_failed, resume_pending

The module is intentionally dependency-light: uses psycopg2 (already present
via Intelligence's Postgres) with a simple connection-per-call pattern.
If Postgres is unavailable the functions degrade gracefully — a warning is
logged and the caller continues without persistence.
"""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------ connection


def _dsn() -> str:
    """Return the Postgres DSN for the intelligence_app database."""
    return os.getenv(
        "RUNWAY_JOBS_DSN",
        os.getenv(
            "INTELLIGENCE_DATABASE_URL",
            "postgresql://intelligence:intelligence@localhost:5433/intelligence_app",
        ),
    )


def _connect():
    """Return a new psycopg2 connection, or None if unavailable."""
    try:
        import psycopg2  # type: ignore
        return psycopg2.connect(_dsn())
    except Exception as exc:  # noqa: BLE001
        logger.warning("runway_jobs: cannot connect to Postgres: %s", exc)
        return None


# ------------------------------------------------------------------ public API


def upsert_job(
    *,
    task_id: str,
    thread_id: str,
    run_id: str,
    kind: str,
    status: str = "pending",
) -> None:
    """Insert or update a Runway job record.

    Call this *before* starting to poll so the task_id is persisted even if
    the process dies during the polling loop.
    """
    conn = _connect()
    if conn is None:
        return
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO runway_jobs (task_id, thread_id, run_id, kind, status, updated_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                    ON CONFLICT (task_id) DO UPDATE
                        SET status     = EXCLUDED.status,
                            updated_at = NOW()
                    """,
                    (task_id, thread_id, run_id, kind, status),
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("runway_jobs.upsert_job failed: %s", exc)
    finally:
        conn.close()


def mark_done(*, task_id: str, result_url: str) -> None:
    """Mark a job as done and store the result URL."""
    conn = _connect()
    if conn is None:
        return
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE runway_jobs
                       SET status = 'done', result_url = %s, updated_at = NOW()
                     WHERE task_id = %s
                    """,
                    (result_url, task_id),
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("runway_jobs.mark_done failed: %s", exc)
    finally:
        conn.close()


def mark_failed(*, task_id: str) -> None:
    """Mark a job as failed."""
    conn = _connect()
    if conn is None:
        return
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE runway_jobs
                       SET status = 'failed', updated_at = NOW()
                     WHERE task_id = %s
                    """,
                    (task_id,),
                )
    except Exception as exc:  # noqa: BLE001
        logger.warning("runway_jobs.mark_failed failed: %s", exc)
    finally:
        conn.close()


def resume_pending(*, thread_id: str) -> list[dict]:
    """Return all pending/polling jobs for a thread so they can be resumed.

    Returns a list of dicts with keys: task_id, kind, status, created_at.
    Returns [] if Postgres is unavailable or no jobs exist.
    """
    conn = _connect()
    if conn is None:
        return []
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT task_id, kind, status, created_at
                      FROM runway_jobs
                     WHERE thread_id = %s
                       AND status IN ('pending', 'polling')
                     ORDER BY created_at ASC
                    """,
                    (thread_id,),
                )
                rows = cur.fetchall()
        return [
            {"task_id": r[0], "kind": r[1], "status": r[2], "created_at": str(r[3])}
            for r in rows
        ]
    except Exception as exc:  # noqa: BLE001
        logger.warning("runway_jobs.resume_pending failed: %s", exc)
        return []
    finally:
        conn.close()
