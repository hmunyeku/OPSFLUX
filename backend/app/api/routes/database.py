"""
API endpoints for database query execution.
Allows authorized users to execute read-only SQL queries.
"""

from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import text

from app.api.deps import CurrentUser, SessionDep
from app.core.security import require_permission

router = APIRouter(prefix="/database", tags=["database"])


class QueryRequest(BaseModel):
    """SQL query request model"""
    query: str


class QueryResponse(BaseModel):
    """SQL query response model"""
    rows: list[dict[str, Any]]
    row_count: int
    columns: list[str]


@router.post("/query", response_model=QueryResponse)
@require_permission("database:execute_query")
def execute_query(
    request: QueryRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> Any:
    """
    Execute a read-only SQL query.

    Security:
    - Only SELECT queries are allowed
    - Requires 'database:execute_query' permission
    - Query is sanitized to prevent dangerous operations
    """
    query = request.query.strip()

    # Validation basique: seules les requêtes SELECT sont autorisées
    query_upper = query.upper()

    # Vérifier que c'est bien une requête SELECT
    if not query_upper.startswith("SELECT"):
        raise HTTPException(
            status_code=400,
            detail="Seules les requêtes SELECT sont autorisées"
        )

    # Vérifier qu'il n'y a pas de commandes dangereuses
    dangerous_keywords = [
        "DROP", "DELETE", "INSERT", "UPDATE", "ALTER", "CREATE",
        "TRUNCATE", "REPLACE", "GRANT", "REVOKE", "EXEC", "EXECUTE"
    ]

    for keyword in dangerous_keywords:
        if keyword in query_upper:
            raise HTTPException(
                status_code=400,
                detail=f"Commande non autorisée: {keyword}"
            )

    # Vérifier la présence de point-virgule multiples (tentative d'injection)
    if query.count(";") > 1:
        raise HTTPException(
            status_code=400,
            detail="Plusieurs commandes ne sont pas autorisées"
        )

    # Limiter la taille de la requête
    if len(query) > 10000:
        raise HTTPException(
            status_code=400,
            detail="Requête trop longue (max 10000 caractères)"
        )

    try:
        # Exécuter la requête en lecture seule
        result = session.execute(text(query))

        # Récupérer les résultats
        rows = []
        columns = list(result.keys()) if result.keys() else []

        for row in result:
            row_dict = {}
            for i, col in enumerate(columns):
                value = row[i]
                # Convertir les types non-JSON en string
                if value is not None:
                    if isinstance(value, (str, int, float, bool)):
                        row_dict[col] = value
                    else:
                        row_dict[col] = str(value)
                else:
                    row_dict[col] = None
            rows.append(row_dict)

        # Limiter le nombre de résultats pour éviter les surcharges
        max_rows = 1000
        if len(rows) > max_rows:
            rows = rows[:max_rows]

        return QueryResponse(
            rows=rows,
            row_count=len(rows),
            columns=columns
        )

    except Exception as e:
        # Log l'erreur pour debug
        print(f"SQL Query Error for user {current_user.email}: {str(e)}")

        raise HTTPException(
            status_code=400,
            detail=f"Erreur lors de l'exécution de la requête: {str(e)}"
        )
