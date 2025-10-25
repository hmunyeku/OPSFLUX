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


# ==================== COMPANIES ENDPOINTS ====================


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


# ==================== CONTACTS ENDPOINTS ====================


@router.get("/contacts", response_model=ContactsPublic)
@require_permission("contacts.read")
def read_contacts(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    search: Optional[str] = Query(None, description="Search in name, email"),
    company_id: Optional[uuid.UUID] = Query(None, description="Filter by company"),
    status: Optional[ContactStatus] = Query(None, description="Filter by status"),
    role: Optional[ContactRole] = Query(None, description="Filter by role"),
) -> Any:
    """
    Retrieve contacts.
    Requires contacts.read permission.
    """
    count_statement = select(func.count()).select_from(Contact)
    statement = select(Contact)

    # Filter deleted items
    count_statement = count_statement.where(Contact.deleted_at.is_(None))
    statement = statement.where(Contact.deleted_at.is_(None))

    # Search filter
    if search:
        search_filter = or_(
            Contact.first_name.ilike(f"%{search}%"),
            Contact.last_name.ilike(f"%{search}%"),
            Contact.email.ilike(f"%{search}%"),
        )
        count_statement = count_statement.where(search_filter)
        statement = statement.where(search_filter)

    # Company filter
    if company_id:
        count_statement = count_statement.where(Contact.company_id == company_id)
        statement = statement.where(Contact.company_id == company_id)

    # Status filter
    if status:
        count_statement = count_statement.where(Contact.status == status)
        statement = statement.where(Contact.status == status)

    # Role filter
    if role:
        count_statement = count_statement.where(Contact.role == role)
        statement = statement.where(Contact.role == role)

    count = session.exec(count_statement).one()
    statement = statement.offset(skip).limit(limit).order_by(Contact.last_name, Contact.first_name)
    contacts = session.exec(statement).all()

    return ContactsPublic(data=contacts, count=count)


@router.get("/contacts/{contact_id}", response_model=ContactPublic)
@require_permission("contacts.read")
def read_contact(
    contact_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get a specific contact by id.
    Requires contacts.read permission.
    """
    contact = session.get(Contact, contact_id)
    if not contact or contact.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Contact not found")

    return contact


@router.post("/contacts", response_model=ContactPublic)
@require_permission("contacts.create")
def create_contact(
    *,
    session: SessionDep,
    contact_in: ContactCreate,
    current_user: CurrentUser,
) -> Any:
    """
    Create new contact.
    Requires contacts.create permission.
    """
    # Verify company exists
    company = session.get(Company, contact_in.company_id)
    if not company or company.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Company not found")

    # Check if email already exists for this company
    if contact_in.email:
        statement = select(Contact).where(
            Contact.email == contact_in.email,
            Contact.company_id == contact_in.company_id,
            Contact.deleted_at.is_(None)
        )
        existing = session.exec(statement).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Contact with email '{contact_in.email}' already exists for this company",
            )

    contact = Contact.model_validate(
        contact_in,
        update={"created_by_id": current_user.id, "updated_by_id": current_user.id}
    )

    session.add(contact)
    session.commit()
    session.refresh(contact)

    return contact


@router.patch("/contacts/{contact_id}", response_model=ContactPublic)
@require_permission("contacts.update")
def update_contact(
    *,
    session: SessionDep,
    contact_id: uuid.UUID,
    contact_in: ContactUpdate,
    current_user: CurrentUser,
) -> Any:
    """
    Update a contact.
    Requires contacts.update permission.
    """
    contact = session.get(Contact, contact_id)
    if not contact or contact.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Contact not found")

    # Check if changing email to one that already exists for this company
    if contact_in.email and contact_in.email != contact.email:
        statement = select(Contact).where(
            Contact.email == contact_in.email,
            Contact.company_id == contact.company_id,
            Contact.id != contact_id,
            Contact.deleted_at.is_(None)
        )
        existing = session.exec(statement).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Contact with email '{contact_in.email}' already exists for this company",
            )

    update_dict = contact_in.model_dump(exclude_unset=True)
    update_dict["updated_by_id"] = current_user.id
    contact.sqlmodel_update(update_dict)

    session.add(contact)
    session.commit()
    session.refresh(contact)

    return contact


@router.delete("/contacts/{contact_id}")
@require_permission("contacts.delete")
def delete_contact(
    contact_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Delete (soft delete) a contact.
    Requires contacts.delete permission.
    """
    from datetime import datetime, timezone

    contact = session.get(Contact, contact_id)
    if not contact or contact.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Contact not found")

    contact.deleted_at = datetime.now(timezone.utc)
    contact.deleted_by_id = current_user.id

    session.add(contact)
    session.commit()

    return {"ok": True}


# ==================== INVITATIONS ENDPOINTS ====================


@router.get("/invitations", response_model=ContactInvitationsPublic)
@require_permission("contacts.manage_invitations")
def read_invitations(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    status: Optional[InvitationStatus] = Query(None, description="Filter by status"),
    contact_id: Optional[uuid.UUID] = Query(None, description="Filter by contact"),
) -> Any:
    """
    Retrieve contact invitations.
    Requires contacts.manage_invitations permission.
    """
    count_statement = select(func.count()).select_from(ContactInvitation)
    statement = select(ContactInvitation)

    # Status filter
    if status:
        count_statement = count_statement.where(ContactInvitation.status == status)
        statement = statement.where(ContactInvitation.status == status)

    # Contact filter
    if contact_id:
        count_statement = count_statement.where(ContactInvitation.contact_id == contact_id)
        statement = statement.where(ContactInvitation.contact_id == contact_id)

    count = session.exec(count_statement).one()
    statement = statement.offset(skip).limit(limit).order_by(ContactInvitation.created_at.desc())
    invitations = session.exec(statement).all()

    return ContactInvitationsPublic(data=invitations, count=count)


@router.post("/invitations", response_model=ContactInvitationPublic)
@require_permission("contacts.invite")
def create_invitation(
    *,
    session: SessionDep,
    invitation_in: ContactInvitationCreate,
    current_user: CurrentUser,
) -> Any:
    """
    Create a new contact invitation.
    Requires contacts.invite permission.
    """
    import secrets
    from datetime import datetime, timezone, timedelta

    # Verify contact exists
    contact = session.get(Contact, invitation_in.contact_id)
    if not contact or contact.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Contact not found")

    # Check if contact already has a pending invitation
    statement = select(ContactInvitation).where(
        ContactInvitation.contact_id == invitation_in.contact_id,
        ContactInvitation.status == InvitationStatus.PENDING
    )
    existing = session.exec(statement).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Contact already has a pending invitation",
        )

    # Generate unique token
    token = secrets.token_urlsafe(32)

    # Calculate expiry date (default 7 days)
    expires_at = datetime.now(timezone.utc) + timedelta(days=invitation_in.expiry_days or 7)

    invitation = ContactInvitation(
        contact_id=invitation_in.contact_id,
        token=token,
        expires_at=expires_at,
        can_be_admin=invitation_in.can_be_admin or False,
        initial_permissions=invitation_in.initial_permissions or [],
        created_by_id=current_user.id,
    )

    session.add(invitation)
    session.commit()
    session.refresh(invitation)

    return invitation


@router.post("/invitations/{token}/accept", response_model=ContactInvitationPublic)
def accept_invitation(
    token: str,
    session: SessionDep,
) -> Any:
    """
    Accept a contact invitation (public endpoint).
    Updates contact status to ACTIVE and creates user account if can_be_admin.
    """
    from datetime import datetime, timezone

    # Find invitation by token
    statement = select(ContactInvitation).where(ContactInvitation.token == token)
    invitation = session.exec(statement).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.status != InvitationStatus.PENDING:
        raise HTTPException(status_code=400, detail="Invitation already processed")

    if invitation.expires_at < datetime.now(timezone.utc):
        invitation.status = InvitationStatus.EXPIRED
        session.add(invitation)
        session.commit()
        raise HTTPException(status_code=400, detail="Invitation has expired")

    # Update invitation status
    invitation.status = InvitationStatus.ACCEPTED
    invitation.accepted_at = datetime.now(timezone.utc)

    # Update contact status
    contact = session.get(Contact, invitation.contact_id)
    if contact:
        contact.status = ContactStatus.ACTIVE

    session.add(invitation)
    session.add(contact)
    session.commit()
    session.refresh(invitation)

    return invitation


@router.post("/invitations/{token}/verify-2fa")
def verify_invitation_2fa(
    token: str,
    session: SessionDep,
) -> Any:
    """
    Verify 2FA for invitation acceptance (public endpoint).
    """
    # Find invitation by token
    statement = select(ContactInvitation).where(ContactInvitation.token == token)
    invitation = session.exec(statement).first()

    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.status != InvitationStatus.PENDING:
        raise HTTPException(status_code=400, detail="Invitation already processed")

    # TODO: Implement 2FA verification logic
    # For now, just return success
    return {"verified": True}


@router.delete("/invitations/{invitation_id}/revoke")
@require_permission("contacts.manage_invitations")
def revoke_invitation(
    invitation_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Revoke a pending invitation.
    Requires contacts.manage_invitations permission.
    """
    invitation = session.get(ContactInvitation, invitation_id)
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if invitation.status != InvitationStatus.PENDING:
        raise HTTPException(status_code=400, detail="Can only revoke pending invitations")

    invitation.status = InvitationStatus.REVOKED

    session.add(invitation)
    session.commit()

    return {"ok": True}
