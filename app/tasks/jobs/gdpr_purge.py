"""Scheduled job — GDPR data retention enforcement.

Runs daily at 03:00. Purges data past retention periods configured
in entity settings (gdpr.retention_*).

Purge targets:
- audit_log: gdpr.retention_audit_months (default 36)
- login_events: gdpr.retention_sessions_months (default 6)
- user_sessions: gdpr.retention_sessions_months (default 6)
- notifications: gdpr.retention_notifications_months (default 3)
- Inactive users: gdpr.retention_inactive_accounts_months (default 24)
- GDPR export files: auto-delete after configurable retention
"""

import logging
import os
from datetime import datetime, UTC, timedelta
from pathlib import Path

from sqlalchemy import text

from app.core.database import async_session_factory

logger = logging.getLogger(__name__)


async def gdpr_retention_purge() -> None:
    """Enforce GDPR data retention policies."""
    logger.info("gdpr_purge: starting retention enforcement")

    try:
        async with async_session_factory() as db:
            await db.execute(text("SET search_path TO public"))

            # Load retention settings
            result = await db.execute(
                text("SELECT key, value FROM settings WHERE key LIKE 'gdpr.retention_%'")
            )
            cfg = {}
            for row in result.fetchall():
                val = row[1]
                if isinstance(val, dict):
                    cfg[row[0]] = val.get("v", val)
                else:
                    cfg[row[0]] = val

            audit_months = int(cfg.get("gdpr.retention_audit_months", 36))
            session_months = int(cfg.get("gdpr.retention_sessions_months", 6))
            notif_months = int(cfg.get("gdpr.retention_notifications_months", 3))
            inactive_months = int(cfg.get("gdpr.retention_inactive_accounts_months", 24))

            total = 0

            # 1. Purge old audit logs
            cutoff = datetime.now(UTC) - timedelta(days=audit_months * 30)
            result = await db.execute(
                text("DELETE FROM audit_log WHERE created_at < :cutoff"),
                {"cutoff": cutoff},
            )
            count = result.rowcount or 0
            if count:
                logger.info("gdpr_purge: deleted %d audit_log entries older than %d months", count, audit_months)
            total += count

            # 2. Purge old login events
            cutoff = datetime.now(UTC) - timedelta(days=session_months * 30)
            result = await db.execute(
                text("DELETE FROM login_events WHERE created_at < :cutoff"),
                {"cutoff": cutoff},
            )
            count = result.rowcount or 0
            if count:
                logger.info("gdpr_purge: deleted %d login_events older than %d months", count, session_months)
            total += count

            # 3. Purge expired sessions
            result = await db.execute(
                text("DELETE FROM user_sessions WHERE last_active_at < :cutoff"),
                {"cutoff": cutoff},
            )
            count = result.rowcount or 0
            if count:
                logger.info("gdpr_purge: deleted %d expired sessions", count)
            total += count

            # 4. Purge old notifications
            cutoff = datetime.now(UTC) - timedelta(days=notif_months * 30)
            result = await db.execute(
                text("DELETE FROM notifications WHERE created_at < :cutoff AND read = true"),
                {"cutoff": cutoff},
            )
            count = result.rowcount or 0
            if count:
                logger.info("gdpr_purge: deleted %d old read notifications", count)
            total += count

            # 5. Anonymize inactive accounts
            cutoff = datetime.now(UTC) - timedelta(days=inactive_months * 30)
            result = await db.execute(
                text("""
                    UPDATE users SET
                        first_name = 'Utilisateur',
                        last_name = 'Inactif',
                        passport_name = NULL,
                        gender = NULL,
                        birth_date = NULL,
                        birth_city = NULL,
                        birth_country = NULL,
                        nationality = NULL,
                        avatar_url = NULL,
                        height = NULL,
                        weight = NULL,
                        last_medical_check = NULL,
                        totp_secret = NULL,
                        mfa_backup_codes = NULL,
                        active = false
                    WHERE active = true
                    AND last_login_at < :cutoff
                    AND email NOT LIKE '%@deleted.opsflux.io'
                    AND id NOT IN (
                        SELECT user_id FROM user_group_members ugm
                        JOIN user_group_roles ugr ON ugr.group_id = ugm.group_id
                        WHERE ugr.role_code = 'SUPER_ADMIN'
                    )
                """),
                {"cutoff": cutoff},
            )
            count = result.rowcount or 0
            if count:
                logger.warning("gdpr_purge: anonymized %d inactive accounts (>%d months)", count, inactive_months)
            total += count

            await db.commit()

            export_days = int(cfg.get("gdpr.retention_exports_days", 7))

            # 6. Purge old GDPR export files (> configured retention)
            export_dir = Path("/opt/opsflux/static/exports")
            if export_dir.exists():
                file_cutoff = datetime.now(UTC) - timedelta(days=max(1, export_days))
                for f in list(export_dir.glob("gdpr-export-*.zip")) + list(export_dir.glob("gdpr-export-*.json")):
                    if datetime.fromtimestamp(f.stat().st_mtime, UTC) < file_cutoff:
                        f.unlink()
                        total += 1
                        logger.info("gdpr_purge: deleted expired export file %s", f.name)

            logger.info("gdpr_purge: completed — %d total items purged/anonymized", total)

    except Exception:
        logger.exception("gdpr_purge: unhandled error")
