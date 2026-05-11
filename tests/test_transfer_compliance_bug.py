"""
Test de reproduction pour SUP-0038 : Transfert d'employé incomplet.

Ce test démontre que :
1. Le transfert ne réinitialise pas la conformité de l'employé
2. Le transfert ne permet pas de changer le poste de l'employé
"""
import pytest
from datetime import date, datetime, timezone
from uuid import uuid4


@pytest.mark.asyncio
async def test_transfer_should_reinitialize_compliance_but_doesnt(async_client, test_entity, test_user, db):
    """
    REPRO : Démontrer que le transfert ne gère pas la conformité.

    Scénario :
    1. Créer un employé avec des enregistrements de conformité valides
    2. Transférer l'employé vers une autre entreprise
    3. Vérifier que la conformité devrait être recalculée (mais ne l'est pas)

    ATTENDU : La conformité de l'employé devrait être invalidée/recalculée après transfert
    ACTUEL : Les anciens enregistrements de conformité restent inchangés
    """
    from app.models.common import Tier, TierContact, ComplianceType, ComplianceRecord
    from sqlalchemy import select

    # Créer deux entreprises
    tier_a = Tier(
        entity_id=test_entity.id,
        name="Company A",
        code="COMP_A",
        type="subcontractor",
        active=True,
    )
    tier_b = Tier(
        entity_id=test_entity.id,
        name="Company B",
        code="COMP_B",
        type="subcontractor",
        active=True,
    )
    db.add_all([tier_a, tier_b])
    await db.commit()
    await db.refresh(tier_a)
    await db.refresh(tier_b)

    # Créer un employé dans Company A
    employee = TierContact(
        tier_id=tier_a.id,
        first_name="Jane",
        last_name="Smith",
        email="jane.smith@example.com",
        active=True,
    )
    db.add(employee)
    await db.commit()
    await db.refresh(employee)

    # Créer un type de conformité (ex: formation sécurité)
    comp_type = ComplianceType(
        entity_id=test_entity.id,
        code="SAFETY_TRAINING",
        name="Formation Sécurité",
        category="training",
        owner_type="tier_contact",
        scope="permanent",
        active=True,
    )
    db.add(comp_type)
    await db.commit()
    await db.refresh(comp_type)

    # Créer un enregistrement de conformité pour l'employé (valide et vérifié)
    comp_record = ComplianceRecord(
        entity_id=test_entity.id,
        compliance_type_id=comp_type.id,
        owner_type="tier_contact",
        owner_id=employee.id,
        status="valid",
        verification_status="verified",
        verified_by=test_user.id,
        verified_at=datetime.now(timezone.utc),
        issued_at=datetime.now(timezone.utc),
        created_by=test_user.id,
        active=True,
    )
    db.add(comp_record)
    await db.commit()
    await db.refresh(comp_record)

    # Vérifier que l'enregistrement existe et est actif
    assert comp_record.active is True
    assert comp_record.verification_status == "verified"

    # Effectuer le transfert de Company A vers Company B
    transfer_payload = {
        "contact_id": str(employee.id),
        "from_tier_id": str(tier_a.id),
        "to_tier_id": str(tier_b.id),
        "transfer_date": date.today().isoformat(),
        "reason": "Changement de contrat",
    }

    response = await async_client.post(
        "/api/v1/conformite/transfers",
        json=transfer_payload,
    )

    assert response.status_code == 201, f"Transfer failed: {response.json()}"

    # Vérifier que l'employé a bien été transféré
    await db.refresh(employee)
    assert employee.tier_id == tier_b.id

    # POINT DE DÉFAILLANCE :
    # L'ancien enregistrement de conformité devrait être invalidé ou marqué
    # comme nécessitant une revérification, mais il reste inchangé.
    await db.refresh(comp_record)

    # Ce test DOIT échouer car le bug existe : l'enregistrement reste actif
    # alors qu'il devrait être invalidé après le transfert
    assert comp_record.active is False, (
        "BUG SUP-0038: L'enregistrement de conformité devrait être invalidé "
        "après le transfert, mais il est toujours actif. "
        "Le système ne réinitialise pas la conformité lors d'un transfert."
    )


@pytest.mark.asyncio
async def test_transfer_should_allow_job_position_change_but_doesnt(async_client, test_entity, test_user, db):
    """
    REPRO : Démontrer que le transfert ne permet pas de changer le poste.

    Scénario :
    1. Créer un employé avec un poste initial (Technicien)
    2. Tenter de le transférer avec un nouveau poste (Superviseur)
    3. Vérifier que le nouveau poste devrait être appliqué (mais ne l'est pas)

    ATTENDU : Le transfert devrait accepter un champ `new_job_position_id` et mettre à jour le poste
    ACTUEL : Le champ `new_job_position_id` n'existe pas dans le schéma/API
    """
    from app.models.common import Tier, TierContact, JobPosition
    from sqlalchemy import select

    # Créer deux entreprises
    tier_a = Tier(
        entity_id=test_entity.id,
        name="Company A",
        code="COMP_A",
        type="subcontractor",
        active=True,
    )
    tier_b = Tier(
        entity_id=test_entity.id,
        name="Company B",
        code="COMP_B",
        type="subcontractor",
        active=True,
    )
    db.add_all([tier_a, tier_b])
    await db.commit()
    await db.refresh(tier_a)
    await db.refresh(tier_b)

    # Créer deux postes
    job_tech = JobPosition(
        entity_id=test_entity.id,
        code="TECH",
        name="Technicien",
        department="Operations",
        active=True,
    )
    job_super = JobPosition(
        entity_id=test_entity.id,
        code="SUPER",
        name="Superviseur",
        department="Operations",
        active=True,
    )
    db.add_all([job_tech, job_super])
    await db.commit()
    await db.refresh(job_tech)
    await db.refresh(job_super)

    # Créer un employé avec le poste "Technicien"
    employee = TierContact(
        tier_id=tier_a.id,
        first_name="John",
        last_name="Doe",
        email="john.doe@example.com",
        job_position_id=job_tech.id,
        active=True,
    )
    db.add(employee)
    await db.commit()
    await db.refresh(employee)

    # Vérifier que l'employé a bien le poste "Technicien"
    assert employee.job_position_id == job_tech.id

    # Tenter de transférer l'employé avec un nouveau poste "Superviseur"
    transfer_payload = {
        "contact_id": str(employee.id),
        "from_tier_id": str(tier_a.id),
        "to_tier_id": str(tier_b.id),
        "transfer_date": date.today().isoformat(),
        "reason": "Promotion",
        "new_job_position_id": str(job_super.id),  # Nouveau champ attendu
    }

    response = await async_client.post(
        "/api/v1/conformite/transfers",
        json=transfer_payload,
    )

    # Le transfert devrait réussir même avec le nouveau champ
    # Mais actuellement, il peut soit :
    # - Ignorer le champ (422 ou le champ est ignoré)
    # - Échouer avec une erreur de validation

    # Si l'API ignore le champ, le test échoue ici car le poste ne change pas
    if response.status_code == 201:
        # L'API a accepté le transfert, vérifions si le poste a changé
        await db.refresh(employee)

        # POINT DE DÉFAILLANCE :
        # Le poste devrait avoir changé vers "Superviseur", mais il reste "Technicien"
        assert employee.job_position_id == job_super.id, (
            f"BUG SUP-0038: Le poste de l'employé devrait être mis à jour "
            f"vers {job_super.id} (Superviseur), mais il est toujours "
            f"{employee.job_position_id} (Technicien). "
            f"Le transfert ne permet pas de changer le poste."
        )
    else:
        # L'API a rejeté le transfert à cause du champ inconnu
        pytest.fail(
            f"BUG SUP-0038: L'API a rejeté le transfert avec le champ "
            f"'new_job_position_id' (status {response.status_code}). "
            f"Le schéma TierContactTransferCreate ne supporte pas "
            f"le changement de poste pendant le transfert. "
            f"Réponse: {response.json()}"
        )


@pytest.mark.asyncio
async def test_transfer_timeline_should_be_queryable(async_client, test_entity, test_user, db):
    """
    REPRO : Démontrer qu'il n'y a pas de vue timeline des transferts.

    Scénario :
    1. Créer un employé
    2. Faire plusieurs transferts successifs
    3. Tenter de récupérer une timeline organisée chronologiquement

    ATTENDU : Un endpoint devrait retourner l'historique des transferts sous forme de timeline
    ACTUEL : On peut lister les transferts, mais pas de vue timeline structurée
    """
    from app.models.common import Tier, TierContact
    from sqlalchemy import select

    # Créer trois entreprises
    tier_a = Tier(entity_id=test_entity.id, name="Company A", code="COMP_A", type="subcontractor", active=True)
    tier_b = Tier(entity_id=test_entity.id, name="Company B", code="COMP_B", type="subcontractor", active=True)
    tier_c = Tier(entity_id=test_entity.id, name="Company C", code="COMP_C", type="subcontractor", active=True)
    db.add_all([tier_a, tier_b, tier_c])
    await db.commit()
    await db.refresh(tier_a)
    await db.refresh(tier_b)
    await db.refresh(tier_c)

    # Créer un employé
    employee = TierContact(
        tier_id=tier_a.id,
        first_name="Alice",
        last_name="Wonder",
        email="alice@example.com",
        active=True,
    )
    db.add(employee)
    await db.commit()
    await db.refresh(employee)

    # Faire deux transferts successifs : A -> B -> C
    transfer1_payload = {
        "contact_id": str(employee.id),
        "from_tier_id": str(tier_a.id),
        "to_tier_id": str(tier_b.id),
        "transfer_date": "2025-01-01",
        "reason": "Premier transfert",
    }
    transfer2_payload = {
        "contact_id": str(employee.id),
        "from_tier_id": str(tier_b.id),
        "to_tier_id": str(tier_c.id),
        "transfer_date": "2025-06-01",
        "reason": "Deuxième transfert",
    }

    resp1 = await async_client.post("/api/v1/conformite/transfers", json=transfer1_payload)
    assert resp1.status_code == 201

    resp2 = await async_client.post("/api/v1/conformite/transfers", json=transfer2_payload)
    assert resp2.status_code == 201

    # Récupérer l'historique des transferts pour cet employé
    response = await async_client.get(
        "/api/v1/conformite/transfers",
        params={"contact_id": str(employee.id)}
    )

    assert response.status_code == 200
    data = response.json()

    # On peut lister les transferts, mais il n'y a pas de structure "timeline"
    # organisée chronologiquement avec les périodes dans chaque entreprise
    assert "items" in data
    assert len(data["items"]) == 2

    # POINT DE DÉFAILLANCE (plus léger) :
    # Il faudrait idéalement un endpoint dédié qui structure les données en timeline
    # Par exemple : GET /api/v1/conformite/contacts/{id}/timeline
    # qui retournerait :
    # [
    #   {"tier_name": "Company A", "from": null, "to": "2025-01-01"},
    #   {"tier_name": "Company B", "from": "2025-01-01", "to": "2025-06-01"},
    #   {"tier_name": "Company C", "from": "2025-06-01", "to": null},
    # ]
    #
    # Actuellement, le frontend doit reconstruire cette timeline manuellement
    # à partir de la liste des transferts.
    # Ce test ne va pas échouer, mais documente le manque.
    print("INFO: La timeline existe sous forme de liste de transferts, "
          "mais pas sous forme structurée chronologique.")
