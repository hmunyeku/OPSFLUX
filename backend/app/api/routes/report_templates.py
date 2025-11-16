"""
Routes API REST pour les gabarits de rapports (Report Templates).
Permet aux admins de créer et gérer des modèles réutilisables.
"""

from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select, func

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.models_redacteur import (
    ReportTemplate,
    ReportTemplateCreate,
    ReportTemplatePublic,
    ReportTemplatesPublic,
    ReportTemplateUpdate,
)

router = APIRouter(prefix="/redacteur/templates", tags=["redacteur"])


@router.get("/", response_model=ReportTemplatesPublic)
def list_templates(
    session: SessionDep,
    current_user: CurrentUser,
    type: Optional[str] = Query(None, description="Filter by type"),
    category: Optional[str] = Query(None, description="Filter by category"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
) -> Any:
    """
    Récupère la liste des gabarits de rapports.
    Les gabarits système sont visibles par tous, les autres selon les permissions.
    """
    statement = select(ReportTemplate)

    # Apply filters
    if type:
        statement = statement.where(ReportTemplate.type == type)
    if category:
        statement = statement.where(ReportTemplate.category == category)
    if is_active is not None:
        statement = statement.where(ReportTemplate.is_active == is_active)

    # Get total count
    count_statement = select(func.count()).select_from(statement.subquery())
    total_count = session.exec(count_statement).one()

    # Apply pagination and ordering
    statement = (
        statement.order_by(ReportTemplate.is_system.desc(), ReportTemplate.name)
        .offset(skip)
        .limit(limit)
    )

    templates = session.exec(statement).all()

    return ReportTemplatesPublic(data=templates, count=total_count)


@router.get("/{template_id}", response_model=ReportTemplatePublic)
def get_template(
    session: SessionDep,
    current_user: CurrentUser,
    template_id: UUID,
) -> Any:
    """
    Récupère un gabarit spécifique par son ID.
    """
    template = session.get(ReportTemplate, template_id)

    if not template:
        raise HTTPException(status_code=404, detail="Gabarit non trouvé")

    return template


@router.post("/", response_model=ReportTemplatePublic)
def create_template(
    session: SessionDep,
    current_user: CurrentUser,
    template_in: ReportTemplateCreate,
) -> Any:
    """
    Crée un nouveau gabarit de rapport.
    Réservé aux administrateurs de contenu.
    """
    # TODO: Add permission check for content admin role

    # Check if name already exists
    existing = session.exec(
        select(ReportTemplate).where(ReportTemplate.name == template_in.name)
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Un gabarit avec ce nom existe déjà",
        )

    template = ReportTemplate(
        **template_in.model_dump(),
        created_by=current_user.id,
        updated_by=current_user.id,
    )

    session.add(template)
    session.commit()
    session.refresh(template)

    return template


@router.put("/{template_id}", response_model=ReportTemplatePublic)
def update_template(
    session: SessionDep,
    current_user: CurrentUser,
    template_id: UUID,
    template_in: ReportTemplateUpdate,
) -> Any:
    """
    Met à jour un gabarit existant.
    Réservé aux administrateurs de contenu et modérateurs.
    """
    template = session.get(ReportTemplate, template_id)

    if not template:
        raise HTTPException(status_code=404, detail="Gabarit non trouvé")

    # Prevent modifying system templates
    if template.is_system:
        raise HTTPException(
            status_code=403,
            detail="Les gabarits système ne peuvent pas être modifiés",
        )

    # TODO: Add permission check

    # Update fields
    update_data = template_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(template, field, value)

    template.updated_by = current_user.id

    session.add(template)
    session.commit()
    session.refresh(template)

    return template


@router.delete("/{template_id}", response_model=Message)
def delete_template(
    session: SessionDep,
    current_user: CurrentUser,
    template_id: UUID,
) -> Any:
    """
    Supprime un gabarit.
    Réservé aux administrateurs système.
    """
    template = session.get(ReportTemplate, template_id)

    if not template:
        raise HTTPException(status_code=404, detail="Gabarit non trouvé")

    # Prevent deleting system templates
    if template.is_system:
        raise HTTPException(
            status_code=403,
            detail="Les gabarits système ne peuvent pas être supprimés",
        )

    # TODO: Add permission check for system admin

    # Check if template is used by reports
    from app.models_redacteur import Report

    reports_using = session.exec(
        select(func.count(Report.id)).where(Report.template_id == template_id)
    ).one()

    if reports_using > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Ce gabarit est utilisé par {reports_using} rapport(s)",
        )

    session.delete(template)
    session.commit()

    return Message(message="Gabarit supprimé avec succès")


@router.post("/{template_id}/duplicate", response_model=ReportTemplatePublic)
def duplicate_template(
    session: SessionDep,
    current_user: CurrentUser,
    template_id: UUID,
    new_name: Optional[str] = Query(None, description="Nom du nouveau gabarit"),
) -> Any:
    """
    Duplique un gabarit existant.
    """
    original = session.get(ReportTemplate, template_id)

    if not original:
        raise HTTPException(status_code=404, detail="Gabarit non trouvé")

    # TODO: Add permission check

    # Generate new name
    if not new_name:
        new_name = f"{original.name} (Copie)"

    # Check if name exists
    existing = session.exec(
        select(ReportTemplate).where(ReportTemplate.name == new_name)
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Un gabarit avec ce nom existe déjà",
        )

    # Create duplicate
    duplicate = ReportTemplate(
        name=new_name,
        description=original.description,
        type=original.type,
        content_template=original.content_template,
        metadata_schema=original.metadata_schema,
        is_active=False,  # Duplicates start as inactive
        is_system=False,  # Duplicates are never system templates
        category=original.category,
        created_by=current_user.id,
        updated_by=current_user.id,
    )

    session.add(duplicate)
    session.commit()
    session.refresh(duplicate)

    return duplicate


@router.patch("/{template_id}/toggle", response_model=ReportTemplatePublic)
def toggle_template_status(
    session: SessionDep,
    current_user: CurrentUser,
    template_id: UUID,
) -> Any:
    """
    Active ou désactive un gabarit.
    """
    template = session.get(ReportTemplate, template_id)

    if not template:
        raise HTTPException(status_code=404, detail="Gabarit non trouvé")

    # Prevent toggling system templates
    if template.is_system:
        raise HTTPException(
            status_code=403,
            detail="Les gabarits système ne peuvent pas être désactivés",
        )

    # TODO: Add permission check

    template.is_active = not template.is_active
    template.updated_by = current_user.id

    session.add(template)
    session.commit()
    session.refresh(template)

    return template
