"""
API endpoints for company management (Third Parties module).
Routes for managing companies and their information.
"""

import uuid
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import func, select, or_

from app.api.deps import CurrentUser, SessionDep
from app.core.rbac import require_permission
from .models import (
    Company,
    CompanyCreate,
    CompanyPublic,
    CompaniesPublic,
    CompanyUpdate,
    CompanyStatus,
    CompanyType,
    Contact,
    ContactCreate,
    ContactPublic,
    ContactsPublic,
    ContactUpdate,
    ContactStatus,
    ContactRole,
    ContactInvitation,
    ContactInvitationCreate,
    ContactInvitationPublic,
    ContactInvitationsPublic,
    InvitationStatus,
)

router = APIRouter(prefix="/third-parties", tags=["third-parties"])


@router.get("/", response_model=CompaniesPublic)
@require_permission("companies.read")
def read_companies(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search in name, email, registration number"),
    company_type: Optional[CompanyType] = Query(None, description="Filter by company type"),
    status: Optional[CompanyStatus] = Query(None, description="Filter by status"),
    country: Optional[str] = Query(None, description="Filter by country"),
    tags: Optional[str] = Query(None, description="Filter by tags (comma-separated)"),
) -> Any:
    """
    Retrieve companies.
    Requires companies.read permission.
    """
    count_statement = select(func.count()).select_from(Company)
    statement = select(Company)

    # Filter deleted items
    count_statement = count_statement.where(Company.deleted_at.is_(None))
    statement = statement.where(Company.deleted_at.is_(None))

    # Search filter
    if search:
        search_filter = or_(
            Company.name.ilike(f"%{search}%"),
            Company.legal_name.ilike(f"%{search}%"),
            Company.email.ilike(f"%{search}%"),
            Company.registration_number.ilike(f"%{search}%"),
        )
        count_statement = count_statement.where(search_filter)
        statement = statement.where(search_filter)

    # Company type filter
    if company_type:
        count_statement = count_statement.where(Company.company_type == company_type)
        statement = statement.where(Company.company_type == company_type)

    # Status filter
    if status:
        count_statement = count_statement.where(Company.status == status)
        statement = statement.where(Company.status == status)

    # Country filter
    if country:
        count_statement = count_statement.where(Company.country == country)
        statement = statement.where(Company.country == country)

    # Tags filter
    if tags:
        tag_list = [tag.strip() for tag in tags.split(",")]
        for tag in tag_list:
            count_statement = count_statement.where(Company.tags.contains([tag]))
            statement = statement.where(Company.tags.contains([tag]))

    count = session.exec(count_statement).one()
    statement = statement.offset(skip).limit(limit).order_by(Company.name)
    companies = session.exec(statement).all()

    # Add contact count
    companies_with_count = []
    for company in companies:
        company_dict = company.model_dump()
        company_dict["contact_count"] = len(company.contacts) if company.contacts else 0
        companies_with_count.append(CompanyPublic(**company_dict))

    return CompaniesPublic(data=companies_with_count, count=count)


@router.get("/{company_id}", response_model=CompanyPublic)
@require_permission("companies.read")
def read_company(
    company_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get a specific company by id.
    Requires companies.read permission.
    """
    company = session.get(Company, company_id)
    if not company or company.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Company not found")

    # Add contact count
    company_dict = company.model_dump()
    company_dict["contact_count"] = len(company.contacts) if company.contacts else 0
    return CompanyPublic(**company_dict)


@router.post("/", response_model=CompanyPublic)
@require_permission("companies.create")
def create_company(
    *,
    session: SessionDep,
    company_in: CompanyCreate,
    current_user: CurrentUser,
) -> Any:
    """
    Create new company.
    Requires companies.create permission.
    """
    # Check if company with same registration number already exists
    if company_in.registration_number:
        statement = select(Company).where(
            Company.registration_number == company_in.registration_number,
            Company.deleted_at.is_(None)
        )
        existing = session.exec(statement).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Company with registration number '{company_in.registration_number}' already exists",
            )

    company = Company.model_validate(
        company_in,
        update={"created_by_id": current_user.id, "updated_by_id": current_user.id}
    )

    session.add(company)
    session.commit()
    session.refresh(company)

    # Add contact count
    company_dict = company.model_dump()
    company_dict["contact_count"] = 0
    return CompanyPublic(**company_dict)


@router.patch("/{company_id}", response_model=CompanyPublic)
@require_permission("companies.update")
def update_company(
    *,
    session: SessionDep,
    company_id: uuid.UUID,
    company_in: CompanyUpdate,
    current_user: CurrentUser,
) -> Any:
    """
    Update a company.
    Requires companies.update permission.
    """
    company = session.get(Company, company_id)
    if not company or company.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Company not found")

    # Check if changing registration number to one that already exists
    if company_in.registration_number and company_in.registration_number != company.registration_number:
        statement = select(Company).where(
            Company.registration_number == company_in.registration_number,
            Company.id != company_id,
            Company.deleted_at.is_(None)
        )
        existing = session.exec(statement).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Company with registration number '{company_in.registration_number}' already exists",
            )

    update_dict = company_in.model_dump(exclude_unset=True)
    update_dict["updated_by_id"] = current_user.id

    company.sqlmodel_update(update_dict)
    session.add(company)
    session.commit()
    session.refresh(company)

    # Add contact count
    company_dict = company.model_dump()
    company_dict["contact_count"] = len(company.contacts) if company.contacts else 0
    return CompanyPublic(**company_dict)


@router.delete("/{company_id}")
@require_permission("companies.delete")
def delete_company(
    session: SessionDep,
    company_id: uuid.UUID,
    current_user: CurrentUser,
) -> dict:
    """
    Soft delete a company.
    Requires companies.delete permission.
    """
    company = session.get(Company, company_id)
    if not company or company.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Company not found")

    # Check if company has active contacts
    active_contacts = [c for c in company.contacts if c.deleted_at is None]
    if active_contacts:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete company with {len(active_contacts)} active contact(s). Please archive or delete contacts first."
        )

    # Soft delete
    from datetime import datetime, timezone
    company.deleted_at = datetime.now(timezone.utc)
    company.deleted_by_id = current_user.id

    session.add(company)
    session.commit()

    return {"message": "Company deleted successfully"}


@router.get("/stats/summary")
@require_permission("companies.read")
def get_company_stats(
    session: SessionDep,
    current_user: CurrentUser,
) -> dict:
    """
    Get company statistics.
    Requires companies.read permission.
    """
    from datetime import datetime, timedelta

    # Total companies
    total = session.exec(
        select(func.count()).select_from(Company).where(Company.deleted_at.is_(None))
    ).one()

    # Total contacts
    total_contacts = session.exec(
        select(func.count()).select_from(Contact).where(Contact.deleted_at.is_(None))
    ).one()

    # Pending invitations
    pending_invitations = session.exec(
        select(func.count()).select_from(ContactInvitation).where(
            ContactInvitation.status == InvitationStatus.PENDING,
            ContactInvitation.deleted_at.is_(None)
        )
    ).one()

    # Companies created last 30 days for growth calculation
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    sixty_days_ago = datetime.utcnow() - timedelta(days=60)

    companies_last_30 = session.exec(
        select(func.count()).select_from(Company).where(
            Company.created_at >= thirty_days_ago,
            Company.deleted_at.is_(None)
        )
    ).one()

    companies_prev_30 = session.exec(
        select(func.count()).select_from(Company).where(
            Company.created_at >= sixty_days_ago,
            Company.created_at < thirty_days_ago,
            Company.deleted_at.is_(None)
        )
    ).one()

    # Contacts created last 30 days for growth calculation
    contacts_last_30 = session.exec(
        select(func.count()).select_from(Contact).where(
            Contact.created_at >= thirty_days_ago,
            Contact.deleted_at.is_(None)
        )
    ).one()

    contacts_prev_30 = session.exec(
        select(func.count()).select_from(Contact).where(
            Contact.created_at >= sixty_days_ago,
            Contact.created_at < thirty_days_ago,
            Contact.deleted_at.is_(None)
        )
    ).one()

    # Calculate growth percentages
    companies_growth = 0
    if companies_prev_30 > 0:
        companies_growth = round(((companies_last_30 - companies_prev_30) / companies_prev_30) * 100, 1)
    elif companies_last_30 > 0:
        companies_growth = 100

    contacts_growth = 0
    if contacts_prev_30 > 0:
        contacts_growth = round(((contacts_last_30 - contacts_prev_30) / contacts_prev_30) * 100, 1)
    elif contacts_last_30 > 0:
        contacts_growth = 100

    # By status
    active = session.exec(
        select(func.count()).select_from(Company).where(
            Company.status == CompanyStatus.ACTIVE,
            Company.deleted_at.is_(None)
        )
    ).one()

    prospect = session.exec(
        select(func.count()).select_from(Company).where(
            Company.status == CompanyStatus.PROSPECT,
            Company.deleted_at.is_(None)
        )
    ).one()

    # By type
    clients = session.exec(
        select(func.count()).select_from(Company).where(
            Company.company_type == CompanyType.CLIENT,
            Company.deleted_at.is_(None)
        )
    ).one()

    suppliers = session.exec(
        select(func.count()).select_from(Company).where(
            Company.company_type == CompanyType.SUPPLIER,
            Company.deleted_at.is_(None)
        )
    ).one()

    partners = session.exec(
        select(func.count()).select_from(Company).where(
            Company.company_type == CompanyType.PARTNER,
            Company.deleted_at.is_(None)
        )
    ).one()

    return {
        "total_companies": total,
        "total_contacts": total_contacts,
        "pending_invitations": pending_invitations,
        "companies_growth": companies_growth,
        "contacts_growth": contacts_growth,
        "total": total,  # Backward compatibility
        "by_status": {
            "active": active,
            "prospect": prospect,
        },
        "by_type": {
            "clients": clients,
            "suppliers": suppliers,
            "partners": partners,
        }
    }
