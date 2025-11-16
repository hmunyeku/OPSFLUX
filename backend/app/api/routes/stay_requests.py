"""
Stay Requests API Routes
Gestion des demandes de séjour sur site (POB - Personnel On Board)
Updated: 2025-11-02 - Fixed permissions import
"""

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select, func, col

from app.api.deps import CurrentUser, SessionDep
from app.models_pob import (
    StayRequest,
    StayRequestCreate,
    StayRequestUpdate,
    StayRequestPublic,
    StayRequestsPublic,
    StayRequestValidator,
    StayRequestValidatorCreate,
    StayRequestValidatorUpdate,
    StayRequestValidatorPublic,
    StayRequestTraining,
    StayRequestCertification,
    StayRequestPeriod,
    StayRequestStatus,
    ValidatorStatus,
)
from app.core.rbac import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stay-requests", tags=["stay-requests"])


@router.get("/", response_model=StayRequestsPublic)
@require_permission("stay_requests:read")
def list_stay_requests(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    status: str | None = Query(None, description="Filter by status"),
    site: str | None = Query(None, description="Filter by site"),
    project: str | None = Query(None, description="Filter by project"),
) -> Any:
    """
    List all stay requests with optional filters
    """
    # Build query
    statement = select(StayRequest).where(StayRequest.deleted_at.is_(None))

    # Apply filters
    if status:
        statement = statement.where(StayRequest.status == status)
    if site:
        statement = statement.where(StayRequest.site.contains(site))
    if project:
        statement = statement.where(StayRequest.project.contains(project))

    # Count total
    count_statement = select(func.count()).select_from(StayRequest).where(
        StayRequest.deleted_at.is_(None)
    )
    if status:
        count_statement = count_statement.where(StayRequest.status == status)
    if site:
        count_statement = count_statement.where(StayRequest.site.contains(site))
    if project:
        count_statement = count_statement.where(StayRequest.project.contains(project))

    count = session.exec(count_statement).one()

    # Get requests
    statement = statement.offset(skip).limit(limit).order_by(col(StayRequest.created_at).desc())
    requests = session.exec(statement).all()

    # Load relationships for each request
    for request in requests:
        # Validators
        validators_statement = select(StayRequestValidator).where(
            StayRequestValidator.stay_request_id == request.id,
            StayRequestValidator.deleted_at.is_(None)
        ).order_by(StayRequestValidator.level)
        request.validators = list(session.exec(validators_statement).all())

        # Trainings
        trainings_statement = select(StayRequestTraining).where(
            StayRequestTraining.stay_request_id == request.id,
            StayRequestTraining.deleted_at.is_(None)
        )
        request.trainings = list(session.exec(trainings_statement).all())

        # Certifications
        certifications_statement = select(StayRequestCertification).where(
            StayRequestCertification.stay_request_id == request.id,
            StayRequestCertification.deleted_at.is_(None)
        )
        request.certifications = list(session.exec(certifications_statement).all())

        # Additional periods
        periods_statement = select(StayRequestPeriod).where(
            StayRequestPeriod.stay_request_id == request.id,
            StayRequestPeriod.deleted_at.is_(None)
        )
        request.additional_periods = list(session.exec(periods_statement).all())

    return StayRequestsPublic(data=requests, count=count)


@router.get("/{request_id}", response_model=StayRequestPublic)
@require_permission("stay_requests:read")
def get_stay_request(
    session: SessionDep,
    current_user: CurrentUser,
    request_id: UUID,
) -> Any:
    """
    Get a specific stay request by ID
    """
    statement = select(StayRequest).where(
        StayRequest.id == request_id,
        StayRequest.deleted_at.is_(None)
    )
    request = session.exec(statement).first()

    if not request:
        raise HTTPException(status_code=404, detail="Stay request not found")

    # Load all relationships
    # Validators
    validators_statement = select(StayRequestValidator).where(
        StayRequestValidator.stay_request_id == request.id,
        StayRequestValidator.deleted_at.is_(None)
    ).order_by(StayRequestValidator.level)
    request.validators = list(session.exec(validators_statement).all())

    # Trainings
    trainings_statement = select(StayRequestTraining).where(
        StayRequestTraining.stay_request_id == request.id,
        StayRequestTraining.deleted_at.is_(None)
    )
    request.trainings = list(session.exec(trainings_statement).all())

    # Certifications
    certifications_statement = select(StayRequestCertification).where(
        StayRequestCertification.stay_request_id == request.id,
        StayRequestCertification.deleted_at.is_(None)
    )
    request.certifications = list(session.exec(certifications_statement).all())

    # Additional periods
    periods_statement = select(StayRequestPeriod).where(
        StayRequestPeriod.stay_request_id == request.id,
        StayRequestPeriod.deleted_at.is_(None)
    )
    request.additional_periods = list(session.exec(periods_statement).all())

    return request


@router.post("/", response_model=StayRequestPublic)
@require_permission("stay_requests:create")
def create_stay_request(
    session: SessionDep,
    current_user: CurrentUser,
    request_in: StayRequestCreate,
) -> Any:
    """
    Create a new stay request
    """
    # Create the stay request
    request_data = request_in.model_dump(exclude={"validators", "trainings", "certifications", "additional_periods"})
    stay_request = StayRequest(**request_data)
    stay_request.created_by_id = current_user.id

    session.add(stay_request)
    session.commit()
    session.refresh(stay_request)

    # Create validators if provided
    if request_in.validators:
        for validator_data in request_in.validators:
            validator = StayRequestValidator(
                **validator_data.model_dump(),
                stay_request_id=stay_request.id,
                created_by_id=current_user.id
            )
            session.add(validator)

    # Create trainings if provided
    if request_in.trainings:
        for training_data in request_in.trainings:
            training = StayRequestTraining(
                **training_data.model_dump(),
                stay_request_id=stay_request.id,
                created_by_id=current_user.id
            )
            session.add(training)

    # Create certifications if provided
    if request_in.certifications:
        for cert_data in request_in.certifications:
            certification = StayRequestCertification(
                **cert_data.model_dump(),
                stay_request_id=stay_request.id,
                created_by_id=current_user.id
            )
            session.add(certification)

    # Create additional periods if provided
    if request_in.additional_periods:
        for period_data in request_in.additional_periods:
            period = StayRequestPeriod(
                **period_data.model_dump(),
                stay_request_id=stay_request.id,
                created_by_id=current_user.id
            )
            session.add(period)

    session.commit()

    # Reload with all relationships
    validators_statement = select(StayRequestValidator).where(
        StayRequestValidator.stay_request_id == stay_request.id,
        StayRequestValidator.deleted_at.is_(None)
    ).order_by(StayRequestValidator.level)
    stay_request.validators = list(session.exec(validators_statement).all())

    trainings_statement = select(StayRequestTraining).where(
        StayRequestTraining.stay_request_id == stay_request.id,
        StayRequestTraining.deleted_at.is_(None)
    )
    stay_request.trainings = list(session.exec(trainings_statement).all())

    certifications_statement = select(StayRequestCertification).where(
        StayRequestCertification.stay_request_id == stay_request.id,
        StayRequestCertification.deleted_at.is_(None)
    )
    stay_request.certifications = list(session.exec(certifications_statement).all())

    periods_statement = select(StayRequestPeriod).where(
        StayRequestPeriod.stay_request_id == stay_request.id,
        StayRequestPeriod.deleted_at.is_(None)
    )
    stay_request.additional_periods = list(session.exec(periods_statement).all())

    logger.info(f"Stay request created: {stay_request.id} by user {current_user.id}")

    return stay_request


@router.patch("/{request_id}", response_model=StayRequestPublic)
@require_permission("stay_requests:update")
def update_stay_request(
    session: SessionDep,
    current_user: CurrentUser,
    request_id: UUID,
    request_in: StayRequestUpdate,
) -> Any:
    """
    Update a stay request
    """
    statement = select(StayRequest).where(
        StayRequest.id == request_id,
        StayRequest.deleted_at.is_(None)
    )
    stay_request = session.exec(statement).first()

    if not stay_request:
        raise HTTPException(status_code=404, detail="Stay request not found")

    # Update fields
    update_data = request_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(stay_request, key, value)

    stay_request.updated_at = datetime.utcnow()
    stay_request.updated_by_id = current_user.id

    session.add(stay_request)
    session.commit()
    session.refresh(stay_request)

    # Load all relationships
    # Validators
    validators_statement = select(StayRequestValidator).where(
        StayRequestValidator.stay_request_id == stay_request.id,
        StayRequestValidator.deleted_at.is_(None)
    ).order_by(StayRequestValidator.level)
    stay_request.validators = list(session.exec(validators_statement).all())

    # Trainings
    trainings_statement = select(StayRequestTraining).where(
        StayRequestTraining.stay_request_id == stay_request.id,
        StayRequestTraining.deleted_at.is_(None)
    )
    stay_request.trainings = list(session.exec(trainings_statement).all())

    # Certifications
    certifications_statement = select(StayRequestCertification).where(
        StayRequestCertification.stay_request_id == stay_request.id,
        StayRequestCertification.deleted_at.is_(None)
    )
    stay_request.certifications = list(session.exec(certifications_statement).all())

    # Additional periods
    periods_statement = select(StayRequestPeriod).where(
        StayRequestPeriod.stay_request_id == stay_request.id,
        StayRequestPeriod.deleted_at.is_(None)
    )
    stay_request.additional_periods = list(session.exec(periods_statement).all())

    logger.info(f"Stay request updated: {stay_request.id} by user {current_user.id}")

    return stay_request


@router.delete("/{request_id}")
@require_permission("stay_requests:delete")
def delete_stay_request(
    session: SessionDep,
    current_user: CurrentUser,
    request_id: UUID,
) -> Any:
    """
    Delete a stay request (soft delete)
    """
    statement = select(StayRequest).where(
        StayRequest.id == request_id,
        StayRequest.deleted_at.is_(None)
    )
    stay_request = session.exec(statement).first()

    if not stay_request:
        raise HTTPException(status_code=404, detail="Stay request not found")

    # Soft delete
    stay_request.deleted_at = datetime.utcnow()
    stay_request.deleted_by_id = current_user.id

    # Also soft delete validators
    validators_statement = select(StayRequestValidator).where(
        StayRequestValidator.stay_request_id == request_id,
        StayRequestValidator.deleted_at.is_(None)
    )
    validators = session.exec(validators_statement).all()
    for validator in validators:
        validator.deleted_at = datetime.utcnow()
        validator.deleted_by_id = current_user.id
        session.add(validator)

    session.add(stay_request)
    session.commit()

    logger.info(f"Stay request deleted: {request_id} by user {current_user.id}")

    return {"success": True, "message": "Stay request deleted successfully"}


# =====================================================
# Validator Management
# =====================================================

@router.post("/{request_id}/validators", response_model=StayRequestValidatorPublic)
@require_permission("stay_requests:update")
def add_validator(
    session: SessionDep,
    current_user: CurrentUser,
    request_id: UUID,
    validator_in: StayRequestValidatorCreate,
) -> Any:
    """
    Add a validator to a stay request
    """
    # Check if request exists
    statement = select(StayRequest).where(
        StayRequest.id == request_id,
        StayRequest.deleted_at.is_(None)
    )
    stay_request = session.exec(statement).first()

    if not stay_request:
        raise HTTPException(status_code=404, detail="Stay request not found")

    # Create validator
    validator = StayRequestValidator(
        **validator_in.model_dump(),
        created_by_id=current_user.id
    )

    session.add(validator)
    session.commit()
    session.refresh(validator)

    return validator


@router.patch("/validators/{validator_id}", response_model=StayRequestValidatorPublic)
@require_permission("stay_requests:validate")
def update_validator(
    session: SessionDep,
    current_user: CurrentUser,
    validator_id: UUID,
    validator_in: StayRequestValidatorUpdate,
) -> Any:
    """
    Update a validator (typically used for approving/rejecting)
    """
    statement = select(StayRequestValidator).where(
        StayRequestValidator.id == validator_id,
        StayRequestValidator.deleted_at.is_(None)
    )
    validator = session.exec(statement).first()

    if not validator:
        raise HTTPException(status_code=404, detail="Validator not found")

    # Update fields
    update_data = validator_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(validator, key, value)

    # If status is being updated, set validation date
    if "status" in update_data and update_data["status"] != ValidatorStatus.PENDING:
        validator.validation_date = datetime.utcnow()

    validator.updated_at = datetime.utcnow()
    validator.updated_by_id = current_user.id

    session.add(validator)

    # Update stay request validation level
    stay_request = session.exec(
        select(StayRequest).where(StayRequest.id == validator.stay_request_id)
    ).first()

    if stay_request and validator.status == ValidatorStatus.APPROVED:
        # Check if all validators at this level are approved
        all_validators_at_level = session.exec(
            select(StayRequestValidator).where(
                StayRequestValidator.stay_request_id == validator.stay_request_id,
                StayRequestValidator.level == validator.level,
                StayRequestValidator.deleted_at.is_(None)
            )
        ).all()

        if all(v.status == ValidatorStatus.APPROVED for v in all_validators_at_level):
            stay_request.validation_level = validator.level

            # Check if all levels are complete
            if validator.level >= stay_request.total_levels:
                stay_request.status = StayRequestStatus.APPROVED
            else:
                stay_request.status = StayRequestStatus.IN_VALIDATION

            session.add(stay_request)

    elif stay_request and validator.status == ValidatorStatus.REJECTED:
        stay_request.status = StayRequestStatus.REJECTED
        session.add(stay_request)

    session.commit()
    session.refresh(validator)

    logger.info(f"Validator updated: {validator.id} by user {current_user.id}")

    return validator


@router.delete("/validators/{validator_id}")
@require_permission("stay_requests:update")
def delete_validator(
    session: SessionDep,
    current_user: CurrentUser,
    validator_id: UUID,
) -> Any:
    """
    Delete a validator from a stay request
    """
    statement = select(StayRequestValidator).where(
        StayRequestValidator.id == validator_id,
        StayRequestValidator.deleted_at.is_(None)
    )
    validator = session.exec(statement).first()

    if not validator:
        raise HTTPException(status_code=404, detail="Validator not found")

    # Soft delete
    validator.deleted_at = datetime.utcnow()
    validator.deleted_by_id = current_user.id

    session.add(validator)
    session.commit()

    return {"success": True, "message": "Validator deleted successfully"}


# =====================================================
# Statistics and Summary
# =====================================================

@router.get("/stats/summary")
@require_permission("stay_requests:read")
def get_stay_requests_summary(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get summary statistics for stay requests
    """
    # Count by status
    stats_by_status = {}
    for status in StayRequestStatus:
        count = session.exec(
            select(func.count()).select_from(StayRequest).where(
                StayRequest.status == status.value,
                StayRequest.deleted_at.is_(None)
            )
        ).one()
        stats_by_status[status.value] = count

    # Total requests
    total = session.exec(
        select(func.count()).select_from(StayRequest).where(
            StayRequest.deleted_at.is_(None)
        )
    ).one()

    # Pending validations (for current user)
    pending_validations = session.exec(
        select(func.count()).select_from(StayRequestValidator).where(
            StayRequestValidator.validator_user_id == current_user.id,
            StayRequestValidator.status == ValidatorStatus.PENDING,
            StayRequestValidator.deleted_at.is_(None)
        )
    ).one()

    return {
        "total": total,
        "by_status": stats_by_status,
        "pending_validations": pending_validations,
    }
