"""
Search Service - CORE Service

Service de recherche full-text pour l'application.

Fonctionnalités :
- Recherche full-text avec PostgreSQL (pg_trgm, ts_vector)
- Indexation automatique des modèles
- Support multilingue (français, anglais)
- Recherche fuzzy (tolérance aux fautes)
- Filtres et facettes
- Ranking et scoring
- Suggestions (did you mean?)
- Highlighting des résultats

Backends supportés :
- PostgreSQL Full-Text Search (intégré)
- ElasticSearch (optionnel, pour gros volumes)
- Meilisearch (optionnel, ultra-rapide)

Usage :
    from app.core.search_service import search_service

    # Indexer un document
    await search_service.index(
        collection="incidents",
        doc_id=incident.id,
        document={
            "title": incident.title,
            "description": incident.description,
            "tags": incident.tags,
        }
    )

    # Rechercher
    results = await search_service.search(
        query="incendie batiment",
        collections=["incidents"],
        limit=20
    )
"""

from typing import Any, Dict, List, Optional, Union, Tuple
from datetime import datetime
from enum import Enum

from sqlmodel import Session, select, text, func
from sqlalchemy import Index

from app.core.logger_service import get_logger
from app.core.cache_service import cache_service


logger = get_logger(__name__)


class SearchBackend(str, Enum):
    """Backends de recherche disponibles"""
    POSTGRESQL = "postgresql"
    ELASTICSEARCH = "elasticsearch"
    MEILISEARCH = "meilisearch"


class SearchLanguage(str, Enum):
    """Langues supportées"""
    FRENCH = "french"
    ENGLISH = "english"
    SPANISH = "spanish"


class SearchResult:
    """Résultat de recherche"""

    def __init__(
        self,
        doc_id: str,
        collection: str,
        score: float,
        document: Dict[str, Any],
        highlights: Optional[Dict[str, str]] = None,
    ):
        self.doc_id = doc_id
        self.collection = collection
        self.score = score
        self.document = document
        self.highlights = highlights or {}

    def to_dict(self) -> dict:
        """Convertit en dictionnaire"""
        return {
            "id": self.doc_id,
            "collection": self.collection,
            "score": self.score,
            "document": self.document,
            "highlights": self.highlights,
        }


class SearchService:
    """
    Service de recherche full-text.

    Architecture :
    - Utilise PostgreSQL Full-Text Search par défaut (pas de dépendance externe)
    - Peut basculer vers ElasticSearch pour gros volumes
    - Index séparés par collection (modules, incidents, users, etc.)
    - Recherche multilingue avec stemming
    """

    def __init__(self, backend: SearchBackend = None):
        # Charger la configuration depuis la DB
        if backend is None:
            backend, language = self._load_config_from_db()
        else:
            language = SearchLanguage.FRENCH

        self.backend = backend
        self._default_language = language

        # Charger les configurations Elasticsearch/Typesense si besoin
        if backend == SearchBackend.ELASTICSEARCH:
            self._load_elasticsearch_config_from_db()

        # Collections indexées
        self._collections: Dict[str, Dict[str, Any]] = {}

    def _load_config_from_db(self) -> Tuple[SearchBackend, SearchLanguage]:
        """Charge le backend et langue de recherche depuis les settings DB"""
        try:
            from sqlmodel import Session, select
            from app.core.db import engine
            from app.models import AppSettings

            with Session(engine) as session:
                db_settings = session.exec(select(AppSettings)).first()

                if db_settings:
                    # Mapper backend
                    backend_map = {
                        "postgresql": SearchBackend.POSTGRESQL,
                        "elasticsearch": SearchBackend.ELASTICSEARCH,
                        "meilisearch": SearchBackend.MEILISEARCH,
                    }
                    backend = backend_map.get(
                        db_settings.search_backend.lower() if db_settings.search_backend else "postgresql",
                        SearchBackend.POSTGRESQL
                    )

                    # Mapper language
                    language_map = {
                        "french": SearchLanguage.FRENCH,
                        "english": SearchLanguage.ENGLISH,
                        "spanish": SearchLanguage.SPANISH,
                    }
                    language = language_map.get(
                        db_settings.search_language.lower() if db_settings.search_language else "french",
                        SearchLanguage.FRENCH
                    )

                    return backend, language
        except Exception as e:
            logger.warning(f"Failed to load search config from DB: {e}, using defaults")

        # Fallback sur POSTGRESQL + FRENCH
        return SearchBackend.POSTGRESQL, SearchLanguage.FRENCH

    def _load_elasticsearch_config_from_db(self):
        """Charge la configuration Elasticsearch depuis les settings DB"""
        try:
            from sqlmodel import Session, select
            from app.core.db import engine
            from app.models import AppSettings

            with Session(engine) as session:
                db_settings = session.exec(select(AppSettings)).first()

                if db_settings and db_settings.elasticsearch_url:
                    self.elasticsearch_url = db_settings.elasticsearch_url
                    logger.info(f"Loaded Elasticsearch config from DB: url={self.elasticsearch_url}")
        except Exception as e:
            logger.error(f"Failed to load Elasticsearch config from DB: {e}")

    def register_collection(
        self,
        name: str,
        fields: List[str],
        language: SearchLanguage = SearchLanguage.FRENCH,
        weights: Optional[Dict[str, str]] = None,
    ):
        """
        Enregistre une collection pour la recherche.

        Args:
            name: Nom de la collection (ex: "incidents")
            fields: Champs à indexer (ex: ["title", "description"])
            language: Langue pour le stemming
            weights: Poids des champs (A=highest, B, C, D=lowest)
                    Ex: {"title": "A", "description": "B"}
        """
        self._collections[name] = {
            "fields": fields,
            "language": language,
            "weights": weights or {},
        }

        logger.info(f"Search collection registered: {name}")

    async def index(
        self,
        session: Session,
        collection: str,
        doc_id: str,
        document: Dict[str, Any],
    ) -> bool:
        """
        Indexe un document.

        Args:
            session: Session SQLAlchemy
            collection: Collection (ex: "incidents")
            doc_id: ID du document
            document: Document à indexer (dict avec champs textuels)

        Returns:
            True si indexé avec succès
        """
        if collection not in self._collections:
            logger.warning(f"Collection not registered: {collection}")
            return False

        if self.backend == SearchBackend.POSTGRESQL:
            return await self._index_postgresql(session, collection, doc_id, document)

        # TODO: Implémenter ElasticSearch/Meilisearch
        return False

    async def _index_postgresql(
        self,
        session: Session,
        collection: str,
        doc_id: str,
        document: Dict[str, Any],
    ) -> bool:
        """
        Indexe un document dans PostgreSQL.

        Utilise :
        - ts_vector pour le full-text search
        - pg_trgm pour la recherche fuzzy
        - Une table search_index dédiée
        """
        try:
            config = self._collections[collection]
            language = config["language"].value
            fields = config["fields"]

            # Construire le contenu à indexer
            content_parts = []
            for field in fields:
                if field in document and document[field]:
                    content_parts.append(str(document[field]))

            content = " ".join(content_parts)

            # Créer ou mettre à jour l'index
            # Note: Nécessite une table search_index
            query = text("""
                INSERT INTO search_index (collection, doc_id, content, ts_vector, document, indexed_at)
                VALUES (:collection, :doc_id, :content, to_tsvector(:language, :content), :document, NOW())
                ON CONFLICT (collection, doc_id)
                DO UPDATE SET
                    content = EXCLUDED.content,
                    ts_vector = to_tsvector(:language, EXCLUDED.content),
                    document = EXCLUDED.document,
                    indexed_at = NOW()
            """)

            session.exec(query, {
                "collection": collection,
                "doc_id": doc_id,
                "content": content,
                "language": language,
                "document": document,
            })

            session.commit()

            logger.debug(f"Document indexed: {collection}/{doc_id}")
            return True

        except Exception as e:
            logger.error(f"Error indexing document: {e}", exc_info=True)
            session.rollback()
            return False

    async def search(
        self,
        session: Session,
        query: str,
        collections: Optional[List[str]] = None,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 20,
        offset: int = 0,
        fuzzy: bool = True,
        language: Optional[SearchLanguage] = None,
    ) -> List[SearchResult]:
        """
        Effectue une recherche full-text.

        Args:
            session: Session SQLAlchemy
            query: Requête de recherche
            collections: Collections à chercher (None = toutes)
            filters: Filtres supplémentaires
            limit: Nombre max de résultats
            offset: Offset pour pagination
            fuzzy: Activer la recherche fuzzy (tolérance aux fautes)
            language: Langue (défaut: français)

        Returns:
            Liste de SearchResult triés par pertinence
        """
        if self.backend == SearchBackend.POSTGRESQL:
            return await self._search_postgresql(
                session, query, collections, filters, limit, offset, fuzzy, language
            )

        # TODO: Implémenter ElasticSearch/Meilisearch
        return []

    async def _search_postgresql(
        self,
        session: Session,
        query: str,
        collections: Optional[List[str]],
        filters: Optional[Dict[str, Any]],
        limit: int,
        offset: int,
        fuzzy: bool,
        language: Optional[SearchLanguage],
    ) -> List[SearchResult]:
        """
        Recherche avec PostgreSQL Full-Text Search.
        """
        try:
            lang = (language or self._default_language).value

            # Construire la requête SQL
            sql_parts = ["""
                SELECT
                    collection,
                    doc_id,
                    document,
                    ts_rank(ts_vector, to_tsquery(:language, :query)) as score
                FROM search_index
                WHERE
            """]

            params = {
                "language": lang,
                "query": query.replace(" ", " & "),  # AND entre les mots
                "limit": limit,
                "offset": offset,
            }

            # Filtre de collection
            if collections:
                sql_parts.append("collection = ANY(:collections) AND")
                params["collections"] = collections

            # Recherche full-text
            if fuzzy:
                # Utiliser la similarité trigram pour fuzzy search
                sql_parts.append("""
                    (ts_vector @@ to_tsquery(:language, :query)
                     OR content % :query_fuzzy)
                """)
                params["query_fuzzy"] = query
            else:
                sql_parts.append("ts_vector @@ to_tsquery(:language, :query)")

            # Tri et pagination
            sql_parts.append("""
                ORDER BY score DESC
                LIMIT :limit OFFSET :offset
            """)

            sql = " ".join(sql_parts)

            # Exécuter la requête
            result = session.exec(text(sql), params)

            # Convertir en SearchResult
            results = []
            for row in result:
                results.append(
                    SearchResult(
                        doc_id=row.doc_id,
                        collection=row.collection,
                        score=row.score,
                        document=row.document,
                    )
                )

            logger.debug(f"Search completed: {len(results)} results for '{query}'")
            return results

        except Exception as e:
            logger.error(f"Search error: {e}", exc_info=True)
            return []

    async def suggest(
        self,
        session: Session,
        query: str,
        limit: int = 5,
    ) -> List[str]:
        """
        Génère des suggestions de recherche (autocomplete).

        Args:
            session: Session SQLAlchemy
            query: Début de la requête
            limit: Nombre de suggestions

        Returns:
            Liste de suggestions
        """
        try:
            # Utiliser pg_trgm pour la similarité
            sql = text("""
                SELECT DISTINCT content
                FROM search_index
                WHERE content % :query
                ORDER BY similarity(content, :query) DESC
                LIMIT :limit
            """)

            result = session.exec(sql, {
                "query": query,
                "limit": limit,
            })

            suggestions = [row.content for row in result]
            return suggestions

        except Exception as e:
            logger.error(f"Suggest error: {e}", exc_info=True)
            return []

    async def delete(
        self,
        session: Session,
        collection: str,
        doc_id: str,
    ) -> bool:
        """
        Supprime un document de l'index.

        Args:
            session: Session SQLAlchemy
            collection: Collection
            doc_id: ID du document

        Returns:
            True si supprimé
        """
        try:
            sql = text("""
                DELETE FROM search_index
                WHERE collection = :collection AND doc_id = :doc_id
            """)

            session.exec(sql, {
                "collection": collection,
                "doc_id": doc_id,
            })

            session.commit()

            logger.debug(f"Document deleted from index: {collection}/{doc_id}")
            return True

        except Exception as e:
            logger.error(f"Delete error: {e}", exc_info=True)
            session.rollback()
            return False

    async def clear_collection(
        self,
        session: Session,
        collection: str,
    ) -> int:
        """
        Vide une collection de l'index.

        Args:
            session: Session SQLAlchemy
            collection: Collection à vider

        Returns:
            Nombre de documents supprimés
        """
        try:
            sql = text("""
                DELETE FROM search_index
                WHERE collection = :collection
            """)

            result = session.exec(sql, {"collection": collection})
            count = result.rowcount

            session.commit()

            logger.info(f"Collection cleared: {collection} ({count} docs)")
            return count

        except Exception as e:
            logger.error(f"Clear error: {e}", exc_info=True)
            session.rollback()
            return 0

    async def reindex_collection(
        self,
        session: Session,
        collection: str,
        documents: List[Dict[str, Any]],
    ) -> int:
        """
        Ré-indexe une collection complète.

        Args:
            session: Session SQLAlchemy
            collection: Collection
            documents: Liste de documents avec 'id' et champs à indexer

        Returns:
            Nombre de documents indexés
        """
        # Vider l'index existant
        await self.clear_collection(session, collection)

        # Réindexer tous les documents
        count = 0
        for doc in documents:
            doc_id = doc.pop("id")
            success = await self.index(session, collection, doc_id, doc)
            if success:
                count += 1

        logger.info(f"Collection reindexed: {collection} ({count}/{len(documents)} docs)")
        return count

    async def get_stats(self, session: Session) -> Dict[str, Any]:
        """
        Récupère les statistiques de l'index.

        Returns:
            Statistiques (nombre de docs par collection, taille, etc.)
        """
        try:
            sql = text("""
                SELECT
                    collection,
                    COUNT(*) as count,
                    pg_size_pretty(pg_total_relation_size('search_index')) as size
                FROM search_index
                GROUP BY collection
            """)

            result = session.exec(sql)

            stats = {
                "collections": {},
                "total": 0,
            }

            for row in result:
                stats["collections"][row.collection] = {
                    "count": row.count,
                    "size": row.size,
                }
                stats["total"] += row.count

            return stats

        except Exception as e:
            logger.error(f"Stats error: {e}", exc_info=True)
            return {"collections": {}, "total": 0}


# Instance globale
search_service = SearchService()


# Helper function pour créer la table search_index
def create_search_index_table():
    """
    SQL pour créer la table search_index.

    À exécuter via une migration Alembic :

    CREATE TABLE search_index (
        id SERIAL PRIMARY KEY,
        collection VARCHAR(100) NOT NULL,
        doc_id VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        ts_vector TSVECTOR,
        document JSONB,
        indexed_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(collection, doc_id)
    );

    CREATE INDEX idx_search_collection ON search_index(collection);
    CREATE INDEX idx_search_ts_vector ON search_index USING GIN(ts_vector);
    CREATE INDEX idx_search_content_trgm ON search_index USING GIN(content gin_trgm_ops);

    -- Activer les extensions nécessaires
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
    CREATE EXTENSION IF NOT EXISTS unaccent;
    """
    pass
