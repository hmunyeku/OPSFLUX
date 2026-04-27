"""
Test de reproduction — SUP-0023: Modification des parents d'assets

Ce test démontre le besoin de pouvoir transférer un asset d'un parent à un autre.
Actuellement, cette fonctionnalité existe partiellement au niveau backend mais:
1. Il manque des validations pour garantir l'intégrité des données
2. Le frontend n'expose pas cette fonctionnalité

Ce test valide que:
- On peut modifier le field_id d'un Site
- On peut modifier le site_id d'une Installation
- On peut modifier l'installation_id d'un Equipment
- Les validations appropriées sont en place
"""

import pytest
from uuid import uuid4
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_transfer_site_to_different_field(
    async_client: AsyncClient,
    test_entity_id: str,
    auth_headers: dict,
):
    """
    Test: Transférer un Site d'un Field à un autre Field

    Scénario utilisateur:
    1. Une entreprise a deux champs pétroliers: Field A et Field B
    2. Un site était initialement rattaché à Field A
    3. Suite à une réorganisation, le site doit être transféré à Field B
    """
    # Créer Field A
    field_a_data = {
        "code": "FIELD-A",
        "name": "Field Alpha",
        "country": "CM",
        "status": "OPERATIONAL",
    }
    resp = await async_client.post(
        "/api/v1/asset-registry/fields",
        json=field_a_data,
        headers=auth_headers,
    )
    assert resp.status_code == 201
    field_a = resp.json()
    field_a_id = field_a["id"]

    # Créer Field B
    field_b_data = {
        "code": "FIELD-B",
        "name": "Field Beta",
        "country": "CM",
        "status": "OPERATIONAL",
    }
    resp = await async_client.post(
        "/api/v1/asset-registry/fields",
        json=field_b_data,
        headers=auth_headers,
    )
    assert resp.status_code == 201
    field_b = resp.json()
    field_b_id = field_b["id"]

    # Créer un Site rattaché à Field A
    site_data = {
        "field_id": field_a_id,
        "code": "SITE-01",
        "name": "Site Production 01",
        "site_type": "PLATFORM",
        "environment": "OFFSHORE",
        "country": "CM",
        "status": "OPERATIONAL",
    }
    resp = await async_client.post(
        "/api/v1/asset-registry/sites",
        json=site_data,
        headers=auth_headers,
    )
    assert resp.status_code == 201
    site = resp.json()
    site_id = site["id"]
    assert site["field_id"] == field_a_id

    # TRANSFERT: Modifier le field_id du Site pour le rattacher à Field B
    update_data = {"field_id": field_b_id}
    resp = await async_client.patch(
        f"/api/v1/asset-registry/sites/{site_id}",
        json=update_data,
        headers=auth_headers,
    )
    assert resp.status_code == 200, f"Le transfert devrait réussir, mais: {resp.json()}"
    updated_site = resp.json()
    assert updated_site["field_id"] == field_b_id, "Le site devrait maintenant être rattaché à Field B"

    # Vérifier que le Site appartient bien au nouveau Field
    resp = await async_client.get(
        f"/api/v1/asset-registry/sites/{site_id}",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    site_check = resp.json()
    assert site_check["field_id"] == field_b_id


@pytest.mark.asyncio
async def test_reject_transfer_to_nonexistent_parent(
    async_client: AsyncClient,
    test_entity_id: str,
    auth_headers: dict,
):
    """
    Test: Rejeter le transfert vers un parent inexistant

    Validation: On ne doit pas pouvoir définir un field_id qui n'existe pas
    """
    # Créer un Field
    field_data = {
        "code": "FIELD-C",
        "name": "Field Charlie",
        "country": "CM",
        "status": "OPERATIONAL",
    }
    resp = await async_client.post(
        "/api/v1/asset-registry/fields",
        json=field_data,
        headers=auth_headers,
    )
    assert resp.status_code == 201
    field = resp.json()
    field_id = field["id"]

    # Créer un Site
    site_data = {
        "field_id": field_id,
        "code": "SITE-02",
        "name": "Site Production 02",
        "site_type": "PLATFORM",
        "environment": "OFFSHORE",
        "country": "CM",
        "status": "OPERATIONAL",
    }
    resp = await async_client.post(
        "/api/v1/asset-registry/sites",
        json=site_data,
        headers=auth_headers,
    )
    assert resp.status_code == 201
    site = resp.json()
    site_id = site["id"]

    # Tenter de transférer vers un Field inexistant
    fake_field_id = str(uuid4())
    update_data = {"field_id": fake_field_id}
    resp = await async_client.patch(
        f"/api/v1/asset-registry/sites/{site_id}",
        json=update_data,
        headers=auth_headers,
    )
    # Devrait échouer avec une erreur 404 ou 422
    assert resp.status_code in [404, 422], "Le transfert vers un parent inexistant devrait être rejeté"
    error_detail = resp.json()
    assert "not found" in error_detail.get("message", "").lower() or "invalid" in error_detail.get("message", "").lower()


@pytest.mark.asyncio
async def test_transfer_installation_between_sites(
    async_client: AsyncClient,
    test_entity_id: str,
    auth_headers: dict,
):
    """
    Test: Transférer une Installation d'un Site à un autre

    Scénario utilisateur:
    1. Une Installation était sur Site A
    2. Elle doit être déplacée logiquement vers Site B
    """
    # Créer un Field
    field_data = {
        "code": "FIELD-D",
        "name": "Field Delta",
        "country": "CM",
        "status": "OPERATIONAL",
    }
    resp = await async_client.post(
        "/api/v1/asset-registry/fields",
        json=field_data,
        headers=auth_headers,
    )
    assert resp.status_code == 201
    field = resp.json()
    field_id = field["id"]

    # Créer Site A
    site_a_data = {
        "field_id": field_id,
        "code": "SITE-A",
        "name": "Site Alpha",
        "site_type": "PLATFORM",
        "environment": "OFFSHORE",
        "country": "CM",
        "status": "OPERATIONAL",
    }
    resp = await async_client.post(
        "/api/v1/asset-registry/sites",
        json=site_a_data,
        headers=auth_headers,
    )
    assert resp.status_code == 201
    site_a = resp.json()
    site_a_id = site_a["id"]

    # Créer Site B
    site_b_data = {
        "field_id": field_id,
        "code": "SITE-B",
        "name": "Site Beta",
        "site_type": "PLATFORM",
        "environment": "OFFSHORE",
        "country": "CM",
        "status": "OPERATIONAL",
    }
    resp = await async_client.post(
        "/api/v1/asset-registry/sites",
        json=site_b_data,
        headers=auth_headers,
    )
    assert resp.status_code == 201
    site_b = resp.json()
    site_b_id = site_b["id"]

    # Créer une Installation sur Site A
    inst_data = {
        "site_id": site_a_id,
        "code": "INST-01",
        "name": "Installation Platform 01",
        "installation_type": "FIXED_PLATFORM",
        "environment": "OFFSHORE",
        "status": "OPERATIONAL",
    }
    resp = await async_client.post(
        "/api/v1/asset-registry/installations",
        json=inst_data,
        headers=auth_headers,
    )
    assert resp.status_code == 201
    inst = resp.json()
    inst_id = inst["id"]
    assert inst["site_id"] == site_a_id

    # TRANSFERT: Déplacer l'Installation vers Site B
    update_data = {"site_id": site_b_id}
    resp = await async_client.patch(
        f"/api/v1/asset-registry/installations/{inst_id}",
        json=update_data,
        headers=auth_headers,
    )
    assert resp.status_code == 200, f"Le transfert devrait réussir, mais: {resp.json()}"
    updated_inst = resp.json()
    assert updated_inst["site_id"] == site_b_id, "L'Installation devrait maintenant être sur Site B"
