import pytest

from app.core.email_templates import render_email


class _EmptyDb:
    async def execute(self, *_args, **_kwargs):
        class _Result:
            def scalar_one_or_none(self):
                return None

        return _Result()


@pytest.mark.asyncio
async def test_render_email_uses_builtin_default_when_db_template_missing():
    db = _EmptyDb()

    result = await render_email(
        db,
        slug="password_reset",
        entity_id=None,
        language="fr",
        variables={
            "reset_url": "https://example/reset",
            "user": {"first_name": "Alice", "email": "alice@example.com"},
            "entity": {"name": "OpsFlux"},
        },
    )

    assert result is not None
    subject, body_html = result
    assert "Réinitialisation" in subject
    assert "https://example/reset" in body_html


@pytest.mark.asyncio
async def test_render_email_uses_builtin_email_verification_default():
    db = _EmptyDb()

    result = await render_email(
        db,
        slug="email_verification",
        entity_id=None,
        language="fr",
        variables={
            "verification_url": "https://example/verify",
            "user": {"first_name": "Bob", "last_name": "X", "email": "bob@example.com"},
            "entity": {"name": "OpsFlux"},
        },
    )

    assert result is not None
    subject, body_html = result
    assert "Vérification" in subject
    assert "https://example/verify" in body_html
