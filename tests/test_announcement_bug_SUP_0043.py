"""
Test de reproduction et validation du fix pour le bug SUP-0043.
Bug: Une annonce publiée n'apparaît nulle part.

Fix: Ajouter explicitement active=True lors de la création de l'annonce.

Tests:
1. Le champ 'active' est bien défini à True lors de la création
2. L'annonce créée est visible dans la liste avec active_only=True
"""
import pytest
from datetime import datetime, UTC
from uuid import uuid4

from app.models.messaging import Announcement
from app.models.common import User, Entity


@pytest.mark.asyncio
async def test_announcement_creation_active_field(db_session):
    """Test que le champ active est bien défini à True lors de la création."""
    # Setup: créer un utilisateur et une entité de test
    entity = Entity(
        id=uuid4(),
        name="Test Entity",
        code="TEST",
        type="client",
        active=True,
    )
    db_session.add(entity)

    user = User(
        id=uuid4(),
        email="test@example.com",
        first_name="Test",
        last_name="User",
        entity_id=entity.id,
        active=True,
        password_hash="dummy",
    )
    db_session.add(user)
    await db_session.flush()

    # Créer une annonce SANS spécifier le champ 'active'
    # (simule le comportement de la route API)
    announcement = Announcement(
        entity_id=entity.id,
        title="Test Announcement",
        body="This is a test",
        priority="info",
        target_type="all",
        display_location="banner",
        published_at=datetime.now(UTC),
        sender_id=user.id,
        pinned=False,
        send_email=False,
    )

    db_session.add(announcement)
    await db_session.flush()
    await db_session.refresh(announcement)

    # Vérifier que active est bien à True
    assert announcement.active is True, f"BUG: Le champ 'active' devrait être True, mais il est {announcement.active}"

    print(f"✓ Test réussi: announcement.active = {announcement.active}")


@pytest.mark.asyncio
async def test_announcement_visibility_in_list(db_session):
    """Test qu'une annonce créée est visible dans la liste."""
    from sqlalchemy import select, or_

    # Setup
    entity = Entity(
        id=uuid4(),
        name="Test Entity 2",
        code="TEST2",
        type="client",
        active=True,
    )
    db_session.add(entity)

    user = User(
        id=uuid4(),
        email="test2@example.com",
        first_name="Test",
        last_name="User2",
        entity_id=entity.id,
        active=True,
        password_hash="dummy",
    )
    db_session.add(user)
    await db_session.flush()

    # Créer une annonce comme le fait la route API
    now = datetime.now(UTC)
    announcement = Announcement(
        entity_id=entity.id,
        title="Visible Announcement",
        body="This should be visible",
        priority="info",
        target_type="all",
        display_location="banner",
        published_at=now,
        sender_id=user.id,
        pinned=False,
        send_email=False,
        # NOTE: 'active' n'est PAS spécifié ici (comme dans la route API)
    )

    db_session.add(announcement)
    await db_session.commit()
    await db_session.refresh(announcement)

    # Maintenant, faire la même requête que la route list_announcements
    # avec active_only=True (le comportement par défaut)
    stmt = select(Announcement).where(
        or_(
            Announcement.entity_id == entity.id,
            Announcement.entity_id.is_(None),
        ),
    )

    # Filtrer par active (comme le fait la route)
    stmt = stmt.where(Announcement.active == True)
    stmt = stmt.where(
        or_(
            Announcement.published_at.is_(None),
            Announcement.published_at <= now,
        )
    )

    result = await db_session.execute(stmt)
    announcements = result.scalars().all()

    # Vérifier que l'annonce est dans la liste
    announcement_ids = [a.id for a in announcements]
    assert announcement.id in announcement_ids, (
        f"BUG: L'annonce {announcement.id} devrait être visible mais elle n'apparaît pas dans la liste. "
        f"active={announcement.active}, published_at={announcement.published_at}"
    )

    print(f"✓ Test réussi: L'annonce est visible dans la liste (active={announcement.active})")
