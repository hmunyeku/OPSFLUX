"""
Test de validation du fix SUP-0043 — Diffusion en temps réel des annonces.

Ce test vérifie que :
1. Les annonces créées déclenchent des notifications in-app
2. Les utilisateurs ciblés reçoivent les notifications
3. Les emails sont envoyés si send_email=True
4. Le champ active est bien défini à True
"""
import pytest
from datetime import datetime, UTC
from uuid import uuid4
from unittest.mock import AsyncMock, patch, MagicMock

from app.models.messaging import Announcement
from app.models.common import User, Entity, UserGroup, UserGroupMember, UserGroupRole, Role
from app.api.routes.modules.messaging import (
    _resolve_announcement_target_users,
    _broadcast_announcement,
    _send_announcement_emails,
)


@pytest.mark.asyncio
async def test_announcement_broadcast_to_all_users(db_session):
    """Test qu'une annonce target_type='all' envoie des notifications à tous les users."""
    # Setup: créer une entité et deux utilisateurs
    entity = Entity(
        id=uuid4(),
        name="Test Entity",
        code="TEST",
        type="client",
        active=True,
    )
    db_session.add(entity)

    user1 = User(
        id=uuid4(),
        email="user1@test.com",
        first_name="User",
        last_name="One",
        entity_id=entity.id,
        active=True,
        password_hash="dummy",
    )
    user2 = User(
        id=uuid4(),
        email="user2@test.com",
        first_name="User",
        last_name="Two",
        entity_id=entity.id,
        active=True,
        password_hash="dummy",
    )
    db_session.add_all([user1, user2])
    await db_session.flush()

    # Créer une annonce ciblant "all"
    announcement = Announcement(
        entity_id=entity.id,
        title="Important Announcement",
        body="This is a test announcement for everyone",
        priority="info",
        target_type="all",
        display_location="banner",
        published_at=datetime.now(UTC),
        sender_id=user1.id,
        active=True,
        pinned=False,
        send_email=False,
    )
    db_session.add(announcement)
    await db_session.commit()

    # Résoudre les utilisateurs ciblés
    targeted_users = await _resolve_announcement_target_users(
        db_session, announcement, entity.id
    )

    # Vérifier que les deux utilisateurs sont ciblés
    assert len(targeted_users) == 2
    assert user1.id in targeted_users
    assert user2.id in targeted_users

    print(f"✓ Test réussi: {len(targeted_users)} utilisateurs ciblés pour annonce 'all'")


@pytest.mark.asyncio
async def test_announcement_broadcast_to_specific_user(db_session):
    """Test qu'une annonce target_type='user' cible uniquement cet utilisateur."""
    # Setup
    entity = Entity(
        id=uuid4(),
        name="Test Entity",
        code="TEST",
        type="client",
        active=True,
    )
    db_session.add(entity)

    user1 = User(
        id=uuid4(),
        email="user1@test.com",
        first_name="Target",
        last_name="User",
        entity_id=entity.id,
        active=True,
        password_hash="dummy",
    )
    user2 = User(
        id=uuid4(),
        email="user2@test.com",
        first_name="Other",
        last_name="User",
        entity_id=entity.id,
        active=True,
        password_hash="dummy",
    )
    db_session.add_all([user1, user2])
    await db_session.flush()

    # Créer une annonce ciblant user1 spécifiquement
    announcement = Announcement(
        entity_id=entity.id,
        title="Personal Message",
        body="This is for you only",
        priority="info",
        target_type="user",
        target_value=str(user1.id),
        display_location="modal",
        published_at=datetime.now(UTC),
        sender_id=user2.id,
        active=True,
        pinned=False,
        send_email=False,
    )
    db_session.add(announcement)
    await db_session.commit()

    # Résoudre les utilisateurs ciblés
    targeted_users = await _resolve_announcement_target_users(
        db_session, announcement, entity.id
    )

    # Vérifier que seul user1 est ciblé
    assert len(targeted_users) == 1
    assert user1.id in targeted_users
    assert user2.id not in targeted_users

    print(f"✓ Test réussi: Seul l'utilisateur spécifique est ciblé")


@pytest.mark.asyncio
async def test_announcement_broadcast_to_role(db_session):
    """Test qu'une annonce target_type='role' cible les users ayant ce rôle."""
    # Setup: entité, users, groupe, rôle
    entity = Entity(
        id=uuid4(),
        name="Test Entity",
        code="TEST",
        type="client",
        active=True,
    )
    db_session.add(entity)

    user_admin = User(
        id=uuid4(),
        email="admin@test.com",
        first_name="Admin",
        last_name="User",
        entity_id=entity.id,
        active=True,
        password_hash="dummy",
    )
    user_regular = User(
        id=uuid4(),
        email="regular@test.com",
        first_name="Regular",
        last_name="User",
        entity_id=entity.id,
        active=True,
        password_hash="dummy",
    )
    db_session.add_all([user_admin, user_regular])

    # Créer un groupe "Admins"
    group = UserGroup(
        id=uuid4(),
        name="Admins",
        code="ADMINS",
        entity_id=entity.id,
        active=True,
    )
    db_session.add(group)
    await db_session.flush()

    # Créer un rôle "ADMIN"
    role = Role(
        code="ADMIN",
        name="Administrator",
        description="Admin role",
        active=True,
    )
    db_session.add(role)

    # Assigner user_admin au groupe
    member = UserGroupMember(
        user_id=user_admin.id,
        group_id=group.id,
    )
    db_session.add(member)

    # Assigner le rôle au groupe
    group_role = UserGroupRole(
        group_id=group.id,
        role_code="ADMIN",
    )
    db_session.add(group_role)
    await db_session.flush()

    # Créer une annonce ciblant le rôle "ADMIN"
    announcement = Announcement(
        entity_id=entity.id,
        title="Admin Only",
        body="This is for admins only",
        priority="warning",
        target_type="role",
        target_value="ADMIN",
        display_location="banner",
        published_at=datetime.now(UTC),
        sender_id=user_admin.id,
        active=True,
        pinned=False,
        send_email=False,
    )
    db_session.add(announcement)
    await db_session.commit()

    # Résoudre les utilisateurs ciblés
    targeted_users = await _resolve_announcement_target_users(
        db_session, announcement, entity.id
    )

    # Vérifier que seul user_admin est ciblé
    assert user_admin.id in targeted_users
    assert user_regular.id not in targeted_users

    print(f"✓ Test réussi: Seuls les users avec le rôle ADMIN sont ciblés")


@pytest.mark.asyncio
@patch("app.api.routes.modules.messaging.send_in_app_bulk")
async def test_announcement_triggers_notification(mock_send_in_app, db_session):
    """Test que la création d'annonce déclenche l'envoi de notifications."""
    # Setup
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
        email="test@test.com",
        first_name="Test",
        last_name="User",
        entity_id=entity.id,
        active=True,
        password_hash="dummy",
    )
    db_session.add(user)
    await db_session.flush()

    # Mock send_in_app_bulk
    mock_send_in_app.return_value = None

    # Créer une annonce
    announcement = Announcement(
        entity_id=entity.id,
        title="Test Announcement",
        body="This should trigger a notification",
        priority="info",
        target_type="all",
        display_location="banner",
        published_at=datetime.now(UTC),
        sender_id=user.id,
        active=True,
        pinned=False,
        send_email=False,
    )
    db_session.add(announcement)
    await db_session.commit()

    # Diffuser l'annonce
    await _broadcast_announcement(db_session, announcement, entity.id)

    # Vérifier que send_in_app_bulk a été appelé
    assert mock_send_in_app.called
    call_args = mock_send_in_app.call_args
    assert call_args[1]["category"] == "messaging"
    assert "Test Announcement" in call_args[1]["title"]
    assert entity.id in [call_args[1]["entity_id"]]

    print("✓ Test réussi: Les notifications sont envoyées lors de la création d'annonce")


@pytest.mark.asyncio
@patch("app.api.routes.modules.messaging.render_and_send_email")
async def test_announcement_sends_email_when_requested(mock_send_email, db_session):
    """Test que les emails sont envoyés si send_email=True."""
    # Setup
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
        email="test@test.com",
        first_name="Test",
        last_name="User",
        entity_id=entity.id,
        active=True,
        password_hash="dummy",
    )
    db_session.add(user)
    await db_session.flush()

    # Mock render_and_send_email
    mock_send_email.return_value = True

    # Créer une annonce avec send_email=True
    announcement = Announcement(
        entity_id=entity.id,
        title="Email Test",
        body="This should send an email",
        priority="critical",
        target_type="all",
        display_location="banner",
        published_at=datetime.now(UTC),
        sender_id=user.id,
        active=True,
        pinned=False,
        send_email=True,
    )
    db_session.add(announcement)
    await db_session.commit()

    # Envoyer les emails
    await _send_announcement_emails(db_session, announcement, entity.id)

    # Vérifier que render_and_send_email a été appelé
    assert mock_send_email.called
    call_args = mock_send_email.call_args
    assert call_args[1]["to_email"] == "test@test.com"
    assert "Email Test" in call_args[1]["subject"]
    assert call_args[1]["template_name"] == "announcement_published"

    print("✓ Test réussi: Les emails sont envoyés quand send_email=True")


@pytest.mark.asyncio
async def test_announcement_active_field_is_true(db_session):
    """Test de régression : vérifier que active=True est bien défini."""
    # Setup
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
        email="test@test.com",
        first_name="Test",
        last_name="User",
        entity_id=entity.id,
        active=True,
        password_hash="dummy",
    )
    db_session.add(user)
    await db_session.flush()

    # Créer une annonce SANS spécifier active (comme avant le fix)
    announcement = Announcement(
        entity_id=entity.id,
        title="Active Test",
        body="Testing active field default",
        priority="info",
        target_type="all",
        display_location="banner",
        published_at=datetime.now(UTC),
        sender_id=user.id,
        # active n'est PAS spécifié ici
        pinned=False,
        send_email=False,
    )
    db_session.add(announcement)
    await db_session.commit()
    await db_session.refresh(announcement)

    # Vérifier que active est True par défaut
    assert announcement.active is True

    print("✓ Test de régression réussi: active=True par défaut")
