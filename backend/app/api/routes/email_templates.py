"""
Routes API pour la gestion des templates d'email.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import Message
from app.core.rbac import require_permission
from app.models_email_templates import (
    EmailTemplate,
    EmailTemplateCreate,
    EmailTemplatePublic,
    EmailTemplatesPublic,
    EmailTemplateUpdate,
    EmailTemplateSendTestRequest,
    EmailTemplateSendTestResponse,
    EmailTemplateCategory,
)
from app.core.email_service import EmailService

router = APIRouter(prefix="/email-templates", tags=["email-templates"])


@router.get("/", response_model=EmailTemplatesPublic)
@require_permission("core.email_templates.read")
def read_email_templates(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    category: EmailTemplateCategory | None = None,
    is_active: bool | None = None,
    search: str | None = None,
) -> Any:
    """
    Récupère la liste des templates d'email.

    Filtres:
    - category: Filtrer par catégorie
    - is_active: Filtrer par statut actif/inactif
    - search: Recherche par nom ou description

    Requiert la permission: core.email_templates.read
    """
    # Base query
    statement = select(EmailTemplate).where(EmailTemplate.deleted_at == None)  # noqa: E711

    # Filtrer par catégorie
    if category:
        statement = statement.where(EmailTemplate.category == category)

    # Filtrer par statut
    if is_active is not None:
        statement = statement.where(EmailTemplate.is_active == is_active)

    # Recherche textuelle
    if search:
        search_filter = f"%{search}%"
        statement = statement.where(
            (EmailTemplate.name.ilike(search_filter))
            | (EmailTemplate.description.ilike(search_filter))
        )

    # Compter le total
    count_statement = select(func.count()).select_from(statement.subquery())
    count = session.exec(count_statement).one()

    # Récupérer avec pagination
    statement = statement.order_by(EmailTemplate.name).offset(skip).limit(limit)
    templates = session.exec(statement).all()

    # Convertir vers modèle public
    public_templates = [
        EmailTemplatePublic(
            id=t.id,
            name=t.name,
            slug=t.slug,
            description=t.description,
            category=t.category,
            subject=t.subject,
            html_content=t.html_content,
            text_content=t.text_content,
            available_variables=t.available_variables,
            preview_data=t.preview_data,
            is_active=t.is_active,
            is_system=t.is_system,
            sent_count=t.sent_count,
            last_sent_at=t.last_sent_at,
            created_at=t.created_at,
            updated_at=t.updated_at,
        )
        for t in templates
    ]

    return EmailTemplatesPublic(data=public_templates, count=count)


@router.get("/{template_id}", response_model=EmailTemplatePublic)
@require_permission("core.email_templates.read")
def read_email_template(
    template_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Récupère un template d'email spécifique par ID.

    Requiert la permission: core.email_templates.read
    """
    template = session.get(EmailTemplate, template_id)
    if not template or template.deleted_at:
        raise HTTPException(status_code=404, detail="Email template not found")

    return EmailTemplatePublic(
        id=template.id,
        name=template.name,
        slug=template.slug,
        description=template.description,
        category=template.category,
        subject=template.subject,
        html_content=template.html_content,
        text_content=template.text_content,
        available_variables=template.available_variables,
        preview_data=template.preview_data,
        is_active=template.is_active,
        is_system=template.is_system,
        sent_count=template.sent_count,
        last_sent_at=template.last_sent_at,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.post("/", response_model=EmailTemplatePublic)
@require_permission("core.email_templates.create")
def create_email_template(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    template_in: EmailTemplateCreate,
) -> Any:
    """
    Crée un nouveau template d'email.

    Requiert la permission: core.email_templates.create
    """
    # Vérifier que le slug est unique
    existing = session.exec(
        select(EmailTemplate).where(
            EmailTemplate.slug == template_in.slug, EmailTemplate.deleted_at == None
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Template with slug '{template_in.slug}' already exists",
        )

    template = EmailTemplate(
        name=template_in.name,
        slug=template_in.slug,
        description=template_in.description,
        category=template_in.category,
        subject=template_in.subject,
        html_content=template_in.html_content,
        text_content=template_in.text_content,
        available_variables=template_in.available_variables,
        preview_data=template_in.preview_data,
        is_active=template_in.is_active,
        created_by_id=current_user.id,
    )

    session.add(template)
    session.commit()
    session.refresh(template)

    return EmailTemplatePublic(
        id=template.id,
        name=template.name,
        slug=template.slug,
        description=template.description,
        category=template.category,
        subject=template.subject,
        html_content=template.html_content,
        text_content=template.text_content,
        available_variables=template.available_variables,
        preview_data=template.preview_data,
        is_active=template.is_active,
        is_system=template.is_system,
        sent_count=template.sent_count,
        last_sent_at=template.last_sent_at,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.patch("/{template_id}", response_model=EmailTemplatePublic)
@require_permission("core.email_templates.update")
def update_email_template(
    *,
    template_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    template_in: EmailTemplateUpdate,
) -> Any:
    """
    Met à jour un template d'email.

    Requiert la permission: core.email_templates.update
    """
    template = session.get(EmailTemplate, template_id)
    if not template or template.deleted_at:
        raise HTTPException(status_code=404, detail="Email template not found")

    # Vérifier qu'on ne modifie pas un template système
    if template.is_system:
        raise HTTPException(
            status_code=403, detail="Cannot modify system email templates"
        )

    # Mettre à jour uniquement les champs fournis
    update_data = template_in.model_dump(exclude_unset=True)

    # Vérifier que le slug est unique si modifié
    if "slug" in update_data and update_data["slug"] != template.slug:
        existing = session.exec(
            select(EmailTemplate).where(
                EmailTemplate.slug == update_data["slug"],
                EmailTemplate.id != template_id,
                EmailTemplate.deleted_at == None,
            )
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Template with slug '{update_data['slug']}' already exists",
            )

    for key, value in update_data.items():
        setattr(template, key, value)

    template.updated_by_id = current_user.id

    session.add(template)
    session.commit()
    session.refresh(template)

    return EmailTemplatePublic(
        id=template.id,
        name=template.name,
        slug=template.slug,
        description=template.description,
        category=template.category,
        subject=template.subject,
        html_content=template.html_content,
        text_content=template.text_content,
        available_variables=template.available_variables,
        preview_data=template.preview_data,
        is_active=template.is_active,
        is_system=template.is_system,
        sent_count=template.sent_count,
        last_sent_at=template.last_sent_at,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.delete("/{template_id}", response_model=Message)
@require_permission("core.email_templates.delete")
def delete_email_template(
    template_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> Message:
    """
    Supprime un template d'email (soft delete).

    Requiert la permission: core.email_templates.delete
    """
    template = session.get(EmailTemplate, template_id)
    if not template or template.deleted_at:
        raise HTTPException(status_code=404, detail="Email template not found")

    # Vérifier qu'on ne supprime pas un template système
    if template.is_system:
        raise HTTPException(
            status_code=403, detail="Cannot delete system email templates"
        )

    from datetime import datetime, timezone

    template.deleted_at = datetime.now(timezone.utc)
    template.deleted_by_id = current_user.id

    session.add(template)
    session.commit()

    return Message(message="Email template deleted successfully")


@router.post("/send-test", response_model=EmailTemplateSendTestResponse)
@require_permission("core.email_templates.send_test")
def send_test_email(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    request: EmailTemplateSendTestRequest,
) -> Any:
    """
    Envoie un email de test avec un template.

    Requiert la permission: core.email_templates.send_test
    """
    template = session.get(EmailTemplate, request.template_id)
    if not template or template.deleted_at:
        raise HTTPException(status_code=404, detail="Email template not found")

    # Utiliser les données de test ou les preview_data
    test_data = request.test_data if request.test_data else (template.preview_data or {})

    # Formater le sujet et le contenu avec les variables
    try:
        subject = template.subject.format(**test_data)
        html_content = template.html_content.format(**test_data)
    except KeyError as e:
        return EmailTemplateSendTestResponse(
            success=False,
            message=f"Missing variable in test data: {str(e)}"
        )

    # Envoyer l'email de test
    success = EmailService.send_email(
        email_to=request.to_email,
        subject=subject,
        html_content=html_content,
        db=session,
    )

    if success:
        return EmailTemplateSendTestResponse(
            success=True,
            message=f"Test email sent successfully to {request.to_email}"
        )
    else:
        return EmailTemplateSendTestResponse(
            success=False,
            message="Failed to send test email. Check SMTP configuration."
        )
