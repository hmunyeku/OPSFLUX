"""Structured backend errors — foundation for i18n error messages.

Usage (new code should prefer this over raw HTTPException):

    from app.core.errors import StructuredHTTPException as Err

    raise Err(
        404, code="PROJECT_NOT_FOUND",
        message="Project not found",
        params={"project_id": str(pid)},
    )

Response body:

    {
      "detail": {
        "code": "PROJECT_NOT_FOUND",
        "message": "Project not found",
        "params": {"project_id": "..."}
      }
    }

The frontend's axios error handler can switch on `detail.code` to resolve
a localized message via i18next (e.g. `errors.project_not_found`), falling
back to `detail.message` when no translation is registered. This mirrors
the approach already used for auth errors (ACCOUNT_LOCKED, etc.).

Migration policy:
- New routes: use StructuredHTTPException.
- Existing routes: migrate opportunistically when touched — do not bulk-
  rewrite (71 frontend parser sites need coordinated updates).

Do NOT use this for validation errors raised by Pydantic — FastAPI already
returns a well-structured 422 for those.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException


class StructuredHTTPException(HTTPException):
    """HTTPException variant that carries a machine-readable `code`.

    The `detail` body becomes a dict with `code` / `message` / `params`
    so the frontend can localize without parsing free-form strings.
    """

    def __init__(
        self,
        status_code: int,
        *,
        code: str,
        message: str,
        params: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        if not code or not code.replace("_", "").isalnum() or not code.isupper():
            raise ValueError(
                f"Error code must be SCREAMING_SNAKE_CASE alnum/underscore, got {code!r}"
            )
        detail: dict[str, Any] = {"code": code, "message": message}
        if params:
            detail["params"] = params
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.code = code
        self.code_message = message
        self.code_params = params or {}


__all__ = ["StructuredHTTPException"]
