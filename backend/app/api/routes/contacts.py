"""
Contacts API Routes
Gestion des contacts (tiers)
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
    Contact,
    ContactCreate,
    ContactUpdate,
    ContactPublic,
    ContactsPublic,
    ContactStatus,
    Company,
)
from app.core.rbac import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/contacts", tags=["contacts"])


@router.get("/", response_model=ContactsPublic)
@require_permission("contacts:read")
def list_contacts(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    company_id: UUID | None = Query(None, description="Filter by company"),
    status: str | None = Query(None, description="Filter by status"),
    search: str | None = Query(None, description="Search by name or email"),
) -> Any:
    """
    List all contacts with optional filters
    """
    # Build query
    statement = select(Contact).where(Contact.deleted_at.is_(None))

    # Apply filters
    if company_id:
        statement = statement.where(Contact.company_id == company_id)
    if status:
        statement = statement.where(Contact.status == status)
    if search:
        statement = statement.where(
            (Contact.first_name.contains(search)) |
            (Contact.last_name.contains(search)) |
            (Contact.email.contains(search))
        )

    # Count total
    count_statement = select(func.count()).select_from(Contact).where(
        Contact.deleted_at.is_(None)
    )
    if company_id:
        count_statement = count_statement.where(Contact.company_id == company_id)
    if status:
        count_statement = count_statement.where(Contact.status == status)
    if search:
        count_statement = count_statement.where(
            (Contact.first_name.contains(search)) |
            (Contact.last_name.contains(search)) |
            (Contact.email.contains(search))
        )

    count = session.exec(count_statement).one()

    # Get contacts
    statement = statement.offset(skip).limit(limit).order_by(
        col(Contact.last_name),
        col(Contact.first_name)
    )
    contacts = session.exec(statement).all()

    # Build public response with company names
    contacts_public = []
    for contact in contacts:
        contact_dict = contact.model_dump()
        # Get company name
        if contact.company_rel:
            contact_dict["company_name"] = contact.company_rel.name
        else:
            contact_dict["company_name"] = "Unknown"
        contacts_public.append(ContactPublic(**contact_dict))

    return ContactsPublic(data=contacts_public, count=count)


@router.get("/{contact_id}", response_model=ContactPublic)
@require_permission("contacts:read")
def get_contact(
    session: SessionDep,
    current_user: CurrentUser,
    contact_id: UUID,
) -> Any:
    """
    Get a specific contact by ID
    """
    statement = select(Contact).where(
        Contact.id == contact_id,
        Contact.deleted_at.is_(None)
    )
    contact = session.exec(statement).first()

    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    # Build public response
    contact_dict = contact.model_dump()
    if contact.company_rel:
        contact_dict["company_name"] = contact.company_rel.name
    else:
        contact_dict["company_name"] = "Unknown"

    return ContactPublic(**contact_dict)


@router.post("/", response_model=ContactPublic)
@require_permission("contacts:create")
def create_contact(
    session: SessionDep,
    current_user: CurrentUser,
    contact_in: ContactCreate,
) -> Any:
    """
    Create a new contact
    """
    # Verify company exists
    company = session.exec(
        select(Company).where(
            Company.id == contact_in.company_id,
            Company.deleted_at.is_(None)
        )
    ).first()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Check if contact with same email already exists for this company
    existing = session.exec(
        select(Contact).where(
            Contact.email == contact_in.email,
            Contact.company_id == contact_in.company_id,
            Contact.deleted_at.is_(None)
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Contact with email {contact_in.email} already exists for this company"
        )

    # Create the contact
    contact_data = contact_in.model_dump()
    contact = Contact(**contact_data)
    contact.created_by_id = current_user.id

    session.add(contact)
    session.commit()
    session.refresh(contact)

    logger.info(
        f"Contact created: {contact.id} ({contact.first_name} {contact.last_name}) "
        f"by user {current_user.id}"
    )

    # Build public response
    contact_dict = contact.model_dump()
    contact_dict["company_name"] = company.name

    return ContactPublic(**contact_dict)


@router.patch("/{contact_id}", response_model=ContactPublic)
@require_permission("contacts:update")
def update_contact(
    session: SessionDep,
    current_user: CurrentUser,
    contact_id: UUID,
    contact_in: ContactUpdate,
) -> Any:
    """
    Update a contact
    """
    statement = select(Contact).where(
        Contact.id == contact_id,
        Contact.deleted_at.is_(None)
    )
    contact = session.exec(statement).first()

    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    # If company_id is being updated, verify new company exists
    update_data = contact_in.model_dump(exclude_unset=True)
    if "company_id" in update_data:
        company = session.exec(
            select(Company).where(
                Company.id == update_data["company_id"],
                Company.deleted_at.is_(None)
            )
        ).first()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

    # Update fields
    for key, value in update_data.items():
        setattr(contact, key, value)

    contact.updated_at = datetime.utcnow()
    contact.updated_by_id = current_user.id

    session.add(contact)
    session.commit()
    session.refresh(contact)

    logger.info(
        f"Contact updated: {contact.id} ({contact.first_name} {contact.last_name}) "
        f"by user {current_user.id}"
    )

    # Build public response
    contact_dict = contact.model_dump()
    if contact.company_rel:
        contact_dict["company_name"] = contact.company_rel.name
    else:
        contact_dict["company_name"] = "Unknown"

    return ContactPublic(**contact_dict)


@router.delete("/{contact_id}")
@require_permission("contacts:delete")
def delete_contact(
    session: SessionDep,
    current_user: CurrentUser,
    contact_id: UUID,
) -> Any:
    """
    Delete a contact (soft delete)
    """
    statement = select(Contact).where(
        Contact.id == contact_id,
        Contact.deleted_at.is_(None)
    )
    contact = session.exec(statement).first()

    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    # Soft delete
    contact.deleted_at = datetime.utcnow()
    contact.deleted_by_id = current_user.id

    session.add(contact)
    session.commit()

    logger.info(
        f"Contact deleted: {contact_id} ({contact.first_name} {contact.last_name}) "
        f"by user {current_user.id}"
    )

    return {"success": True, "message": "Contact deleted successfully"}


# =====================================================
# Statistics
# =====================================================

@router.get("/stats/summary")
@require_permission("contacts:read")
def get_contacts_summary(
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Get summary statistics for contacts
    """
    # Count by status
    stats_by_status = {}
    for status in ContactStatus:
        count = session.exec(
            select(func.count()).select_from(Contact).where(
                Contact.status == status.value,
                Contact.deleted_at.is_(None)
            )
        ).one()
        stats_by_status[status.value] = count

    # Total contacts
    total = session.exec(
        select(func.count()).select_from(Contact).where(
            Contact.deleted_at.is_(None)
        )
    ).one()

    return {
        "total": total,
        "by_status": stats_by_status,
    }


# =====================================================
# Search for autocomplete
# =====================================================

@router.get("/search", response_model=ContactsPublic)
@require_permission("contacts:read")
def search_contacts(
    session: SessionDep,
    current_user: CurrentUser,
    q: str = Query(..., min_length=2, description="Search query (minimum 2 characters)"),
    limit: int = Query(10, le=50, description="Maximum results to return"),
) -> Any:
    """
    Search contacts for autocomplete
    Returns contacts matching the query in first_name, last_name, or company name
    """
    # Build search query
    search_pattern = f"%{q}%"
    statement = (
        select(Contact)
        .join(Company, Contact.company_id == Company.id)
        .where(
            Contact.deleted_at.is_(None),
            Contact.status == ContactStatus.ACTIVE,
            (
                Contact.first_name.ilike(search_pattern) |
                Contact.last_name.ilike(search_pattern) |
                Contact.email.ilike(search_pattern) |
                Company.name.ilike(search_pattern)
            )
        )
        .order_by(
            col(Contact.last_contact).desc().nulls_last(),
            col(Contact.last_name),
            col(Contact.first_name)
        )
        .limit(limit)
    )

    contacts = session.exec(statement).all()

    # Build public response with company names and additional info
    contacts_public = []
    for contact in contacts:
        contact_dict = contact.model_dump()

        if contact.company_rel:
            contact_dict["company_name"] = contact.company_rel.name
        else:
            contact_dict["company_name"] = "Unknown"

        contacts_public.append(ContactPublic(**contact_dict))

    return ContactsPublic(data=contacts_public, count=len(contacts_public))
