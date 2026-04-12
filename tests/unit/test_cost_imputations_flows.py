from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.routes.core import cost_imputations
from app.models.common import CostImputation


class FakeResult:
    def __init__(self, *, scalar=None, first=None, all_rows=None):
        self._scalar = scalar
        self._first = first
        self._all_rows = all_rows or []

    def scalar(self):
        return self._scalar

    def first(self):
        return self._first

    def all(self):
        return self._all_rows

    def scalars(self):
        return self

    def unique(self):
        return self

    def first(self):
        if self._all_rows:
            return self._all_rows[0]
        return self._first


class FakeDB:
    def __init__(self, results):
        self._results = list(results)
        self.added = []
        self.deleted = []
        self.commits = 0
        self.refreshed = []
        self.scalars = []
        self.executed = []

    async def execute(self, statement, params=None):
        self.executed.append((statement, params))
        if not self._results:
            raise AssertionError("Unexpected execute call")
        return self._results.pop(0)

    async def scalar(self, statement):
        self.scalars.append(statement)
        if not self._results:
            raise AssertionError("Unexpected scalar call")
        return self._results.pop(0)

    def add(self, obj):
        self.added.append(obj)

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        self.commits += 1

    async def refresh(self, obj, attribute_names=None):
        self.refreshed.append((obj, attribute_names))


@pytest.mark.asyncio
async def test_sync_owner_project_snapshot_sets_single_project_for_ads():
    ads = SimpleNamespace(id=uuid4(), project_id=None)
    project_id = uuid4()
    db = FakeDB(
        [
            ads,
            FakeResult(all_rows=[(project_id,)]),
        ]
    )

    await cost_imputations._sync_owner_project_snapshot(
        owner_type="ads",
        owner_id=ads.id,
        db=db,
    )

    assert ads.project_id == project_id


@pytest.mark.asyncio
async def test_sync_owner_project_snapshot_clears_project_for_multi_project_ads():
    ads = SimpleNamespace(id=uuid4(), project_id=uuid4())
    db = FakeDB(
        [
            ads,
            FakeResult(all_rows=[(uuid4(),), (uuid4(),)]),
        ]
    )

    await cost_imputations._sync_owner_project_snapshot(
        owner_type="ads",
        owner_id=ads.id,
        db=db,
    )

    assert ads.project_id is None


@pytest.mark.asyncio
async def test_create_cost_imputation_syncs_ads_project_snapshot(monkeypatch):
    owner_id = uuid4()
    project_id = uuid4()
    reference = None
    project = SimpleNamespace(id=project_id, code="PRJ-001", name="Projet Alpha")
    cost_center = None
    author = SimpleNamespace(full_name="Aline Doe")
    ads = SimpleNamespace(id=owner_id, project_id=None)
    db = FakeDB(
        [
            FakeResult(scalar=0),
            ads,
            FakeResult(all_rows=[(project_id,)]),
        ]
    )

    async def fake_check_access(*_args, **_kwargs):
        return None

    async def fake_validate_refs(**_kwargs):
        return project_id, None, reference

    monkeypatch.setattr(cost_imputations, "check_polymorphic_owner_access", fake_check_access)
    monkeypatch.setattr(cost_imputations, "_validate_imputation_references", fake_validate_refs)
    monkeypatch.setattr(
        cost_imputations,
        "_serialize_imputation",
        lambda row: SimpleNamespace(project_id=row.project_id),
    )

    body = SimpleNamespace(
        owner_type="ads",
        owner_id=owner_id,
        imputation_reference_id=None,
        project_id=project_id,
        cost_center_id=None,
        percentage=100.0,
        wbs_id=None,
        cross_imputation=False,
        notes=None,
    )
    current_user = SimpleNamespace(id=uuid4())

    result = await cost_imputations.create_cost_imputation(
        body=body,
        request=SimpleNamespace(),
        entity_id=uuid4(),
        current_user=current_user,
        db=db,
    )

    created = next(obj for obj in db.added if isinstance(obj, CostImputation))
    created.project = project
    created.cost_center = cost_center
    created.author = author
    created.imputation_reference = reference

    assert result.project_id == project_id
    assert ads.project_id == project_id
    assert db.commits == 2


@pytest.mark.asyncio
async def test_delete_cost_imputation_syncs_ads_project_snapshot(monkeypatch):
    owner_id = uuid4()
    project_id = uuid4()
    obj = SimpleNamespace(id=uuid4(), owner_type="ads", owner_id=owner_id)
    ads = SimpleNamespace(id=owner_id, project_id=uuid4())
    db = FakeDB(
        [
            FakeResult(all_rows=[obj]),
            ads,
            FakeResult(all_rows=[(project_id,)]),
        ]
    )

    async def fake_check_access(*_args, **_kwargs):
        return None

    monkeypatch.setattr(cost_imputations, "check_polymorphic_owner_access", fake_check_access)

    result = await cost_imputations.delete_cost_imputation(
        imputation_id=obj.id,
        request=SimpleNamespace(),
        current_user=SimpleNamespace(id=uuid4()),
        db=db,
    )

    assert result is None
    assert ads.project_id == project_id
    assert db.deleted == [obj]
    assert db.commits == 2
