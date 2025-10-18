"""
Search API Routes
"""

from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from app.api.deps import CurrentUser, SessionDep
from app.core.search_service import search_service
from app.core.rbac import require_permission
from app.core.hook_trigger_service import hook_trigger

router = APIRouter(prefix="/search", tags=["search"])


@router.post("/index")
@require_permission("core.search.index")
async def index_document(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    collection: str,
    doc_id: str,
    document: dict[str, Any],
    metadata: Optional[dict[str, Any]] = None,
) -> Any:
    """
    Index a document for search

    Requiert la permission: core.search.index
    """
    try:
        result = search_service.index(
            session=session,
            collection=collection,
            doc_id=doc_id,
            document=document,
            metadata=metadata,
        )

        # Trigger hook: search.document_indexed
        try:
            await hook_trigger.trigger_event(
                event="search.document_indexed",
                context={
                    "user_id": str(current_user.id),
                    "collection": collection,
                    "doc_id": doc_id,
                    "document_keys": list(document.keys()),
                    "has_metadata": metadata is not None,
                },
                db=session,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to trigger search.document_indexed hook: {e}")

        return {"success": True, "indexed": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/")
@require_permission("core.search.query")
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

    Requiert la permission: core.search.query
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
@require_permission("core.search.query")
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

    Requiert la permission: core.search.query
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


@router.delete("/{collection}/{doc_id}")
@require_permission("core.search.index")
async def delete_document(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    collection: str,
    doc_id: str,
) -> Any:
    """
    Delete a document from search index

    Requiert la permission: core.search.index
    """
    try:
        deleted = search_service.delete(session=session, collection=collection, doc_id=doc_id)

        # Trigger hook: search.document_deleted
        if deleted:
            try:
                await hook_trigger.trigger_event(
                    event="search.document_deleted",
                    context={
                        "user_id": str(current_user.id),
                        "collection": collection,
                        "doc_id": doc_id,
                        "deleted_by": str(current_user.id),
                    },
                    db=session,
                )
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"Failed to trigger search.document_deleted hook: {e}")

        return {"success": True, "deleted": deleted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/collection/{collection}")
@require_permission("core.search.reindex")
async def clear_collection(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    collection: str,
) -> Any:
    """
    Clear all documents from a collection

    Requiert la permission: core.search.reindex
    """
    try:
        count = search_service.clear_collection(session=session, collection=collection)

        # Trigger hook: search.collection_cleared
        try:
            await hook_trigger.trigger_event(
                event="search.collection_cleared",
                context={
                    "user_id": str(current_user.id),
                    "collection": collection,
                    "deleted_count": count,
                    "cleared_by": str(current_user.id),
                },
                db=session,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to trigger search.collection_cleared hook: {e}")

        return {"success": True, "deleted_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reindex/{collection}")
@require_permission("core.search.reindex")
async def reindex_collection(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    collection: str,
) -> Any:
    """
    Reindex all documents in a collection

    Requiert la permission: core.search.reindex
    """
    try:
        count = search_service.reindex(session=session, collection=collection)

        # Trigger hook: search.collection_reindexed
        try:
            await hook_trigger.trigger_event(
                event="search.collection_reindexed",
                context={
                    "user_id": str(current_user.id),
                    "collection": collection,
                    "reindexed_count": count,
                    "reindexed_by": str(current_user.id),
                },
                db=session,
            )
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Failed to trigger search.collection_reindexed hook: {e}")

        return {"success": True, "reindexed_count": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
