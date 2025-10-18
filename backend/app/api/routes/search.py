"""
Search API Routes
"""

from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.core.search_service import search_service

router = APIRouter(prefix="/search", tags=["search"])


@router.post("/index", dependencies=[Depends(get_current_active_superuser)])
def index_document(
    *,
    session: SessionDep,
    collection: str,
    doc_id: str,
    document: dict[str, Any],
    metadata: Optional[dict[str, Any]] = None,
) -> Any:
    """
    Index a document for search (Admin only)
    """
    try:
        result = search_service.index(
            session=session,
            collection=collection,
            doc_id=doc_id,
            document=document,
            metadata=metadata,
        )
        return {"success": True, "indexed": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
def search_documents(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    query: str,
    collections: Optional[list[str]] = None,
    filters: Optional[dict[str, Any]] = None,
    limit: int = Query(default=20, le=100),
    offset: int = 0,
    fuzzy: bool = True,
) -> Any:
    """
    Search documents across collections
    """
    try:
        results = search_service.search(
            session=session,
            query=query,
            collections=collections,
            filters=filters,
            limit=limit,
            offset=offset,
            fuzzy=fuzzy,
        )
        return {
            "query": query,
            "results": [
                {
                    "collection": r.collection,
                    "doc_id": r.doc_id,
                    "document": r.document,
                    "score": r.score,
                    "metadata": r.metadata,
                }
                for r in results
            ],
            "count": len(results),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/autocomplete")
def autocomplete(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    query: str,
    collections: Optional[list[str]] = None,
    limit: int = Query(default=10, le=50),
) -> Any:
    """
    Get autocomplete suggestions
    """
    try:
        suggestions = search_service.autocomplete(
            session=session,
            query=query,
            collections=collections,
            limit=limit,
        )
        return {"query": query, "suggestions": suggestions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{collection}/{doc_id}", dependencies=[Depends(get_current_active_superuser)])
def delete_document(
    *,
    session: SessionDep,
    collection: str,
    doc_id: str,
) -> Any:
    """
    Delete a document from search index (Admin only)
    """
    try:
        deleted = search_service.delete(session=session, collection=collection, doc_id=doc_id)
        return {"success": True, "deleted": deleted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/collection/{collection}", dependencies=[Depends(get_current_active_superuser)])
def clear_collection(
    *,
    session: SessionDep,
    collection: str,
) -> Any:
    """
    Clear all documents from a collection (Admin only)
    """
    try:
        count = search_service.clear_collection(session=session, collection=collection)
        return {"success": True, "deleted_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reindex/{collection}", dependencies=[Depends(get_current_active_superuser)])
def reindex_collection(
    *,
    session: SessionDep,
    collection: str,
) -> Any:
    """
    Reindex all documents in a collection (Admin only)
    """
    try:
        count = search_service.reindex(session=session, collection=collection)
        return {"success": True, "reindexed_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
