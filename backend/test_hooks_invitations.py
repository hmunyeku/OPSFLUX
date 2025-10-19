"""
Script de test pour vérifier le bon fonctionnement des hooks d'invitation
"""
import asyncio
import os
import sys
from uuid import uuid4

# Ajouter le chemin du répertoire parent pour importer les modules de l'app
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlmodel import Session, create_engine, select
from app.core.config import settings
from app.models_hooks import Hook, HookExecution
from app.core.hook_trigger_service import hook_trigger


async def create_test_hook(session: Session) -> Hook:
    """
    Crée un hook de test pour l'événement user.invitation.created
    """
    # Supprimer les anciens hooks de test
    statement = select(Hook).where(Hook.name == "Test Hook - Invitation Created")
    existing_hooks = session.exec(statement).all()
    for hook in existing_hooks:
        session.delete(hook)
    session.commit()

    # Créer un nouveau hook de test
    test_hook = Hook(
        name="Test Hook - Invitation Created",
        description="Hook de test qui logue les invitations créées",
        event="user.invitation.created",
        is_active=True,
        priority=10,
        conditions=None,  # Pas de conditions, toujours exécuté
        actions=[
            {
                "type": "send_email",
                "config": {
                    "email_to": "admin@opsflux.io",
                    "subject": "Test Hook - Nouvelle invitation",
                    "html_content": "<h1>Hook déclenché!</h1><p>Une nouvelle invitation a été créée.</p>"
                }
            }
        ]
    )

    session.add(test_hook)
    session.commit()
    session.refresh(test_hook)

    print(f"✅ Hook de test créé: {test_hook.id}")
    return test_hook


async def test_hook_trigger(session: Session):
    """
    Teste le déclenchement d'un hook
    """
    print("\n🧪 Test du déclenchement de hook...")

    # Créer un contexte de test
    context = {
        "invitation_id": str(uuid4()),
        "email": "test@example.com",
        "first_name": "John",
        "last_name": "Doe",
        "role_id": str(uuid4()),
        "invited_by_id": str(uuid4()),
        "invited_by_name": "Admin User",
        "expires_at": "2025-10-26T00:00:00Z",
        "expiry_days": 7,
    }

    # Déclencher l'événement
    executed_count = await hook_trigger.trigger_event(
        event="user.invitation.created",
        context=context,
        db=session,
    )

    print(f"✅ Nombre de hooks exécutés: {executed_count}")

    # Vérifier les logs d'exécution
    statement = select(HookExecution).order_by(HookExecution.created_at.desc()).limit(1)
    last_execution = session.exec(statement).first()

    if last_execution:
        print(f"\n📊 Dernière exécution:")
        print(f"   - Hook ID: {last_execution.hook_id}")
        print(f"   - Succès: {last_execution.success}")
        print(f"   - Durée: {last_execution.duration_ms}ms")
        if last_execution.error_message:
            print(f"   - Erreur: {last_execution.error_message}")
    else:
        print("❌ Aucune exécution trouvée")


async def test_hook_with_conditions(session: Session):
    """
    Teste un hook avec des conditions
    """
    print("\n🧪 Test d'un hook avec conditions...")

    # Créer un hook qui ne se déclenche que pour un rôle spécifique
    role_id = str(uuid4())

    conditional_hook = Hook(
        name="Test Hook - Conditional",
        description="Hook qui ne se déclenche que pour un rôle spécifique",
        event="user.invitation.created",
        is_active=True,
        priority=5,
        conditions={
            "role_id": role_id
        },
        actions=[
            {
                "type": "send_email",
                "config": {
                    "email_to": "admin@opsflux.io",
                    "subject": "Hook conditionnel déclenché",
                    "html_content": "<h1>Hook conditionnel déclenché!</h1>"
                }
            }
        ]
    )

    session.add(conditional_hook)
    session.commit()
    session.refresh(conditional_hook)

    print(f"✅ Hook conditionnel créé: {conditional_hook.id}")

    # Test 1: Contexte qui ne match pas la condition
    context_no_match = {
        "invitation_id": str(uuid4()),
        "email": "test1@example.com",
        "role_id": str(uuid4()),  # Différent du role_id du hook
        "invited_by_id": str(uuid4()),
        "invited_by_name": "Admin",
        "expires_at": "2025-10-26T00:00:00Z",
        "expiry_days": 7,
    }

    print("\n   Test 1: Contexte qui ne match pas la condition...")
    executed_count = await hook_trigger.trigger_event(
        event="user.invitation.created",
        context=context_no_match,
        db=session,
    )
    print(f"   Résultat: {executed_count} hook(s) exécuté(s) (attendu: 1, car le hook sans condition doit s'exécuter)")

    # Test 2: Contexte qui match la condition
    context_match = {
        "invitation_id": str(uuid4()),
        "email": "test2@example.com",
        "role_id": role_id,  # Même role_id que le hook
        "invited_by_id": str(uuid4()),
        "invited_by_name": "Admin",
        "expires_at": "2025-10-26T00:00:00Z",
        "expiry_days": 7,
    }

    print("\n   Test 2: Contexte qui match la condition...")
    executed_count = await hook_trigger.trigger_event(
        event="user.invitation.created",
        context=context_match,
        db=session,
    )
    print(f"   Résultat: {executed_count} hook(s) exécuté(s) (attendu: 2, les deux hooks doivent s'exécuter)")

    # Nettoyer
    session.delete(conditional_hook)
    session.commit()


async def main():
    """
    Fonction principale de test
    """
    print("=" * 60)
    print("🚀 TEST DES HOOKS D'INVITATION")
    print("=" * 60)

    # Créer une connexion à la base de données
    engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI), echo=False)

    with Session(engine) as session:
        # Créer un hook de test
        await create_test_hook(session)

        # Tester le déclenchement
        await test_hook_trigger(session)

        # Tester avec conditions
        await test_hook_with_conditions(session)

    print("\n" + "=" * 60)
    print("✅ Tests terminés!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
