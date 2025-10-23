import secrets
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import (
    CurrentUser,
    SessionDep,
)
from app.models import (
    Message,
    Webhook,
    WebhookCreate,
    WebhookLog,
    WebhookLogCreate,
    WebhookLogPublic,
    WebhookLogsPublic,
    WebhookPublic,
    WebhooksPublic,
    WebhookUpdate,
)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get("/", response_model=WebhooksPublic)
def read_webhooks(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve webhooks for current user.
    """
    count_statement = (
        select(func.count())
        .select_from(Webhook)
        .where(Webhook.user_id == current_user.id)
    )
    count = session.exec(count_statement).one()

    statement = (
        select(Webhook)
        .where(Webhook.user_id == current_user.id)
        .offset(skip)
        .limit(limit)
        .order_by(Webhook.created_at.desc())
    )
    webhooks = session.exec(statement).all()

    # Convert to public model
    public_webhooks = []
    for webhook in webhooks:
        public_webhooks.append(
            WebhookPublic(
                id=webhook.id,
                url=webhook.url,
                name=webhook.name,
                description=webhook.description,
                auth_type=webhook.auth_type,
                status=webhook.status,
                events=webhook.events,
                secret=webhook.secret,
                user_id=webhook.user_id,
                created_at=webhook.created_at.isoformat() if webhook.created_at else None,
                updated_at=webhook.updated_at.isoformat() if webhook.updated_at else None,
            )
        )

    return WebhooksPublic(data=public_webhooks, count=count)


@router.post("/", response_model=WebhookPublic)
def create_webhook(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    webhook_in: WebhookCreate,
) -> Any:
    """
    Create new webhook for current user.
    Automatically generates a secure HMAC secret for webhook signature verification.
    """
    # Generate a secure random secret for HMAC signing
    webhook_secret = secrets.token_hex(32)  # 64 character hex string

    # Create the webhook record
    db_webhook = Webhook(
        url=webhook_in.url,
        name=webhook_in.name,
        description=webhook_in.description,
        auth_type=webhook_in.auth_type,
        status="enabled",
        events=webhook_in.events or [],
        secret=webhook_secret,
        user_id=current_user.id,
    )

    session.add(db_webhook)
    session.commit()
    session.refresh(db_webhook)

    return WebhookPublic(
        id=db_webhook.id,
        url=db_webhook.url,
        name=db_webhook.name,
        description=db_webhook.description,
        auth_type=db_webhook.auth_type,
        status=db_webhook.status,
        events=db_webhook.events,
        secret=db_webhook.secret,
        user_id=db_webhook.user_id,
        created_at=db_webhook.created_at.isoformat() if db_webhook.created_at else None,
        updated_at=db_webhook.updated_at.isoformat() if db_webhook.updated_at else None,
    )


@router.get("/{webhook_id}", response_model=WebhookPublic)
def read_webhook(
    webhook_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get a specific webhook by id.
    """
    webhook = session.get(Webhook, webhook_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    if webhook.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to access this webhook",
        )

    return WebhookPublic(
        id=webhook.id,
        url=webhook.url,
        name=webhook.name,
        description=webhook.description,
        auth_type=webhook.auth_type,
        status=webhook.status,
        events=webhook.events,
        secret=webhook.secret,
        user_id=webhook.user_id,
        created_at=webhook.created_at.isoformat() if webhook.created_at else None,
        updated_at=webhook.updated_at.isoformat() if webhook.updated_at else None,
    )


@router.patch("/{webhook_id}", response_model=WebhookPublic)
def update_webhook(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    webhook_id: uuid.UUID,
    webhook_in: WebhookUpdate,
) -> Any:
    """
    Update a webhook.
    """
    db_webhook = session.get(Webhook, webhook_id)
    if not db_webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    if db_webhook.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to update this webhook",
        )

    # Update only provided fields
    update_data = webhook_in.model_dump(exclude_unset=True)
    db_webhook.sqlmodel_update(update_data)

    session.add(db_webhook)
    session.commit()
    session.refresh(db_webhook)

    return WebhookPublic(
        id=db_webhook.id,
        url=db_webhook.url,
        name=db_webhook.name,
        description=db_webhook.description,
        auth_type=db_webhook.auth_type,
        status=db_webhook.status,
        events=db_webhook.events,
        user_id=db_webhook.user_id,
        created_at=db_webhook.created_at.isoformat() if db_webhook.created_at else None,
        updated_at=db_webhook.updated_at.isoformat() if db_webhook.updated_at else None,
    )


@router.delete("/{webhook_id}", response_model=Message)
def delete_webhook(
    session: SessionDep,
    current_user: CurrentUser,
    webhook_id: uuid.UUID,
) -> Message:
    """
    Delete a webhook and its logs (cascade).
    """
    webhook = session.get(Webhook, webhook_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    if webhook.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to delete this webhook",
        )

    session.delete(webhook)
    session.commit()
    return Message(message="Webhook deleted successfully")


@router.get("/{webhook_id}/logs", response_model=WebhookLogsPublic)
def read_webhook_logs(
    webhook_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """
    Retrieve logs for a specific webhook.
    """
    # First verify the webhook belongs to current user
    webhook = session.get(Webhook, webhook_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    if webhook.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to access these logs",
        )

    # Get logs count
    count_statement = (
        select(func.count())
        .select_from(WebhookLog)
        .where(WebhookLog.webhook_id == webhook_id)
    )
    count = session.exec(count_statement).one()

    # Get logs
    statement = (
        select(WebhookLog)
        .where(WebhookLog.webhook_id == webhook_id)
        .offset(skip)
        .limit(limit)
        .order_by(WebhookLog.created_at.desc())
    )
    logs = session.exec(statement).all()

    # Convert to public model
    public_logs = []
    for log in logs:
        public_logs.append(
            WebhookLogPublic(
                id=log.id,
                webhook_id=log.webhook_id,
                action=log.action,
                succeeded=log.succeeded,
                status_code=log.status_code,
                response_body=log.response_body,
                error_message=log.error_message,
                datetime=log.created_at.isoformat() if log.created_at else None,
            )
        )

    return WebhookLogsPublic(data=public_logs, count=count)


@router.post("/{webhook_id}/logs", response_model=WebhookLogPublic)
def create_webhook_log(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    webhook_id: uuid.UUID,
    log_in: WebhookLogCreate,
) -> Any:
    """
    Create a new webhook log entry.
    This is typically called internally when a webhook is triggered.
    """
    # Verify the webhook belongs to current user
    webhook = session.get(Webhook, webhook_id)
    if not webhook:
        raise HTTPException(status_code=404, detail="Webhook not found")

    if webhook.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Not enough permissions to create logs for this webhook",
        )

    # Create the log entry
    db_log = WebhookLog(
        webhook_id=webhook_id,
        action=log_in.action,
        succeeded=log_in.succeeded,
        status_code=log_in.status_code,
        response_body=log_in.response_body,
        error_message=log_in.error_message,
    )

    session.add(db_log)
    session.commit()
    session.refresh(db_log)

    return WebhookLogPublic(
        id=db_log.id,
        webhook_id=db_log.webhook_id,
        action=db_log.action,
        succeeded=db_log.succeeded,
        status_code=db_log.status_code,
        response_body=db_log.response_body,
        error_message=db_log.error_message,
        datetime=db_log.created_at.isoformat() if db_log.created_at else None,
    )
