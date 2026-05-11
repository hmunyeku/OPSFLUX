"""
Test SUP-0036: Employee transfer functionality in Conformite UI.

This test demonstrates that the backend transfer endpoint works correctly,
but the frontend lacks a UI to trigger it.
"""
import pytest
from datetime import date


@pytest.mark.asyncio
async def test_transfer_endpoint_exists_and_works(async_client, test_entity, test_user, db):
    """
    Verify that the backend API for creating transfers is functional.

    This test proves the backend works - the bug is that the frontend
    has no button/panel to call this endpoint.
    """
    from app.models.common import Tier, TierContact
    from sqlalchemy import select

    # Create two tiers (companies)
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

    # Create an employee initially under Company A
    employee = TierContact(
        tier_id=tier_a.id,
        first_name="John",
        last_name="Doe",
        email="john.doe@example.com",
    )
    db.add(employee)
    await db.commit()
    await db.refresh(employee)

    # Verify employee is under Company A
    assert employee.tier_id == tier_a.id

    # Call the backend API to transfer employee from A to B
    transfer_payload = {
        "contact_id": str(employee.id),
        "from_tier_id": str(tier_a.id),
        "to_tier_id": str(tier_b.id),
        "transfer_date": date.today().isoformat(),
        "reason": "Contract change",
    }

    response = await async_client.post(
        "/api/v1/conformite/transfers",
        json=transfer_payload,
    )

    # Backend should succeed
    assert response.status_code == 201, f"Transfer failed: {response.json()}"
    transfer_data = response.json()

    assert transfer_data["contact_id"] == str(employee.id)
    assert transfer_data["from_tier_id"] == str(tier_a.id)
    assert transfer_data["to_tier_id"] == str(tier_b.id)

    # Verify the employee's tier_id was actually updated
    await db.refresh(employee)
    assert employee.tier_id == tier_b.id, "Employee should now belong to Company B"

    # Verify transfer history was recorded
    from app.models.common import TierContactTransfer

    transfer_record = (
        await db.execute(
            select(TierContactTransfer).where(
                TierContactTransfer.contact_id == employee.id
            )
        )
    ).scalar_one_or_none()

    assert transfer_record is not None, "Transfer should be logged in history"
    assert transfer_record.from_tier_id == tier_a.id
    assert transfer_record.to_tier_id == tier_b.id


@pytest.mark.asyncio
async def test_transfer_list_endpoint_works(async_client, test_entity, test_user, db):
    """
    Verify the GET /transfers endpoint works (this is what the UI displays).

    The UI successfully shows the transfer list, but has no way to ADD to it.
    """
    response = await async_client.get("/api/v1/conformite/transfers")

    assert response.status_code == 200
    data = response.json()

    # Should return paginated response
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)
