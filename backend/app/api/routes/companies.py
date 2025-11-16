"""
Companies API Routes
Gestion des entreprises (tiers)
Created: 2025-11-02
"""

import logging
from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select, func, col

from app.api.deps import CurrentUser, SessionDep
from app.models_tiers import (
    Company,
    CompanyCreate,
    CompanyUpdate,
    CompanyPublic,
    CompaniesPublic,
    CompanyStatus,
)
from app.core.rbac import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("/", response_model=CompaniesPublic)
@require_permission("companies:read")
def list_companies(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    status: str | None = Query(None, description="Filter by status"),
    sector: str | None = Query(None, description="Filter by sector"),
    search: str | None = Query(None, description="Search by name or SIRET"),
) -> Any:
    """
    List all companies with optional filters
    """
    # Build query
    statement = select(Company).where(Company.deleted_at.is_(None))

    # Apply filters
    if status:
        statement = statement.where(Company.status == status)
    if sector:
        statement = statement.where(Company.sector.contains(sector))
    if search:
        statement = statement.where(
            (Company.name.contains(search)) |
            (Company.siret.contains(search))
        )

    # Count total
    count_statement = select(func.count()).select_from(Company).where(
        Company.deleted_at.is_(None)
    )
    if status:
        count_statement = count_statement.where(Company.status == status)
    if sector:
        count_statement = count_statement.where(Company.sector.contains(sector))
    if search:
        count_statement = count_statement.where(
            (Company.name.contains(search)) |
            (Company.siret.contains(search))
        )

    count = session.exec(count_statement).one()

    # Get companies
    statement = statement.offset(skip).limit(limit).order_by(col(Company.name))
    companies = session.exec(statement).all()

    # Build public response with computed fields
    companies_public = []
    for company in companies:
        company_dict = company.model_dump()
        company_dict["contacts_count"] = len(company.contacts)
        company_dict["projects_count"] = 0  # TODO: Add projects relationship when implemented
        companies_public.append(CompanyPublic(**company_dict))

    return CompaniesPublic(data=companies_public, count=count)


@router.get("/{company_id}", response_model=CompanyPublic)
@require_permission("companies:read")
def get_company(
    session: SessionDep,
    current_user: CurrentUser,
    company_id: UUID,
) -> Any:
    """
    Get a specific company by ID
    """
    statement = select(Company).where(
        Company.id == company_id,
        Company.deleted_at.is_(None)
    )
    company = session.exec(statement).first()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Build public response with computed fields
    company_dict = company.model_dump()
    company_dict["contacts_count"] = len(company.contacts)
    company_dict["projects_count"] = 0  # TODO: Add projects relationship

    return CompanyPublic(**company_dict)


@router.post("/", response_model=CompanyPublic)
@require_permission("companies:create")
def create_company(
    session: SessionDep,
    current_user: CurrentUser,
    company_in: CompanyCreate,
) -> Any:
    """
    Create a new company
    """
    # Check if SIRET already exists
    existing = session.exec(
        select(Company).where(
            Company.siret == company_in.siret,
            Company.deleted_at.is_(None)
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Company with SIRET {company_in.siret} already exists"
        )

    # Create the company
    company_data = company_in.model_dump()
    # Convert CompanyType enums to strings
    company_data["types"] = [t.value if hasattr(t, 'value') else t for t in company_data.get("types", [])]

    company = Company(**company_data)
    company.created_by_id = current_user.id

    session.add(company)
    session.commit()
    session.refresh(company)

    logger.info(f"Company created: {company.id} ({company.name}) by user {current_user.id}")

    # Build public response
    company_dict = company.model_dump()
    company_dict["contacts_count"] = 0
    company_dict["projects_count"] = 0

    return CompanyPublic(**company_dict)


@router.patch("/{company_id}", response_model=CompanyPublic)
@require_permission("companies:update")
def update_company(
    session: SessionDep,
    current_user: CurrentUser,
    company_id: UUID,
    company_in: CompanyUpdate,
) -> Any:
    """
    Update a company
    """
    statement = select(Company).where(
        Company.id == company_id,
        Company.deleted_at.is_(None)
    )
    company = session.exec(statement).first()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Update fields
    update_data = company_in.model_dump(exclude_unset=True)

    # Convert CompanyType enums to strings if present
    if "types" in update_data and update_data["types"]:
        update_data["types"] = [t.value if hasattr(t, 'value') else t for t in update_data["types"]]

    for key, value in update_data.items():
        setattr(company, key, value)

    company.updated_at = datetime.utcnow()
    company.updated_by_id = current_user.id

    session.add(company)
    session.commit()
    session.refresh(company)

    logger.info(f"Company updated: {company.id} ({company.name}) by user {current_user.id}")

    # Build public response
    company_dict = company.model_dump()
    company_dict["contacts_count"] = len(company.contacts)
    company_dict["projects_count"] = 0

    return CompanyPublic(**company_dict)


@router.delete("/{company_id}")
@require_permission("companies:delete")
def delete_company(
    session: SessionDep,
    current_user: CurrentUser,
    company_id: UUID,
) -> Any:
    """
    Delete a company (soft delete)
    """
    statement = select(Company).where(
        Company.id == company_id,
        Company.deleted_at.is_(None)
    )
    company = session.exec(statement).first()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Soft delete
    company.deleted_at = datetime.utcnow()
    company.deleted_by_id = current_user.id

    session.add(company)
    session.commit()

    logger.info(f"Company deleted: {company_id} ({company.name}) by user {current_user.id}")

    return {"success": True, "message": "Company deleted successfully"}


# =====================================================
# Statistics
# =====================================================

@router.get("/stats/summary")
@require_permission("companies:read")
def get_companies_summary(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get summary statistics for companies
    """
    # Count by status
    stats_by_status = {}
    for status in CompanyStatus:
        count = session.exec(
            select(func.count()).select_from(Company).where(
                Company.status == status.value,
                Company.deleted_at.is_(None)
            )
        ).one()
        stats_by_status[status.value] = count

    # Total companies
    total = session.exec(
        select(func.count()).select_from(Company).where(
            Company.deleted_at.is_(None)
        )
    ).one()

    # Count by sector (top 5)
    sectors_query = select(
        Company.sector,
        func.count().label("count")
    ).where(
        Company.deleted_at.is_(None)
    ).group_by(Company.sector).order_by(col("count").desc()).limit(5)

    sectors_result = session.exec(sectors_query).all()
    top_sectors = {sector: count for sector, count in sectors_result}

    return {
        "total": total,
        "by_status": stats_by_status,
        "top_sectors": top_sectors,
    }
