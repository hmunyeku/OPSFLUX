# Guide des Migrations Alembic - Bonnes Pratiques

## 🎯 Principe de base

**Une migration = Un changement de schéma UNIQUEMENT**

❌ **NE PAS faire dans les migrations :**
- Insérer des données (permissions, rôles, etc.)
- Modifier des données existantes
- Exécuter de la logique métier complexe

✅ **À faire dans les migrations :**
- Créer/modifier/supprimer des tables
- Ajouter/modifier/supprimer des colonnes
- Créer/modifier/supprimer des index
- Ajouter/modifier/supprimer des contraintes

## 📋 Workflow recommandé

### 1. Créer une migration

```bash
# Pour un changement de schéma
uv run alembic revision --autogenerate -m "description_claire"

# Vérifier le fichier généré
# Éditer si nécessaire pour améliorer
```

### 2. Créer un script de population

Si votre migration nécessite des données initiales (permissions, rôles, etc.), créez un script séparé :

```bash
# Créer dans app/scripts/
touch app/scripts/populate_<nom_descriptif>.py
```

Exemple de structure :
```python
"""
Script to populate <description>.
Run this after migration <revision_id>.
"""

from sqlmodel import Session, select
from app.core.db import engine
from app.models import YourModel
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def main() -> None:
    logger.info("Starting population...")

    with Session(engine) as session:
        # Check if data already exists (idempotent)
        existing = session.exec(select(YourModel)).first()
        if existing:
            logger.info("Data already exists, skipping...")
            return

        # Insert data
        # ...

        session.commit()
        logger.info("Population completed!")

if __name__ == "__main__":
    main()
```

### 3. Tester localement

```bash
# Appliquer la migration
uv run alembic upgrade head

# Exécuter le script de population si nécessaire
uv run python app/scripts/populate_<nom>.py

# Vérifier que tout est OK
uv run python app/scripts/verify_migrations.py
```

### 4. Documenter

Ajouter dans le docstring de la migration :

```python
"""Description de la migration

Revision ID: abc123
Revises: xyz789
Create Date: 2025-10-21

IMPORTANT: After applying this migration, run:
    python app/scripts/populate_<nom>.py
"""
```

## 🔧 Scripts de maintenance

### Vérifier l'état des migrations

```bash
# Afficher la version actuelle
uv run alembic current

# Afficher l'historique
uv run alembic history

# Vérifier que tout est appliqué correctement
uv run python app/scripts/verify_migrations.py
```

### En cas de problème

```bash
# Vérifier les tables manquantes
uv run python app/scripts/fix_missing_tables.py

# Réparer les permissions
uv run python app/scripts/populate_all_core_permissions.py

# Réparer les groupes
uv run python app/scripts/populate_default_groups.py
```

## 🚨 Problèmes courants et solutions

### Problème 1 : Migration marquée comme appliquée mais changements absents

**Cause :** Erreur silencieuse lors de l'exécution (table/colonne manquante, contrainte violée, etc.)

**Solution :**
1. Vérifier les logs de la base de données
2. Appliquer manuellement les changements
3. Créer un script de correction si nécessaire

### Problème 2 : Données insérées dans migration échouent

**Cause :** Dépendances manquantes (rôles, tables, etc.) au moment de l'exécution

**Solution :**
- ❌ Ne JAMAIS insérer de données dans `upgrade()`
- ✅ Créer un script de population séparé
- ✅ Exécuter le script après la migration

### Problème 3 : Conflit de révisions (branches multiples)

**Cause :** Plusieurs développeurs créent des migrations en parallèle

**Solution :**
```bash
# Afficher les branches
uv run alembic branches

# Créer une migration de merge
uv run alembic merge -m "merge heads" <rev1> <rev2>
```

## ✅ Checklist avant commit

- [ ] Migration testée localement
- [ ] Script de population créé si nécessaire
- [ ] Script de population testé
- [ ] `verify_migrations.py` exécuté avec succès
- [ ] Downgrade testé (si possible)
- [ ] Documentation mise à jour dans le docstring
- [ ] Pas d'insertion de données dans `upgrade()`

## 🏗️ Structure d'une bonne migration

```python
"""Description claire et concise

Revision ID: abc123
Revises: xyz789
Create Date: 2025-10-21

Tables affected:
- user: add column signature_image

IMPORTANT: This migration only changes the schema.
No data population script needed.
"""
from alembic import op
import sqlalchemy as sa

revision = 'abc123'
down_revision = 'xyz789'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Apply schema changes."""
    # Add column with proper type and constraints
    op.add_column(
        'user',
        sa.Column('signature_image', sa.Text(), nullable=True)
    )

    # Add index if needed for performance
    # op.create_index(...)


def downgrade() -> None:
    """Revert schema changes."""
    # Always implement downgrade when possible
    op.drop_column('user', 'signature_image')
```

## 🔒 Règles de sécurité

1. **Toujours tester le downgrade** avant de commiter
2. **Ne jamais supprimer de données** dans une migration automatique
3. **Créer des backups** avant d'appliquer en production
4. **Utiliser des transactions** pour garantir l'atomicité
5. **Vérifier les contraintes** avant d'ajouter des foreign keys

## 📚 Ressources

- Documentation Alembic : https://alembic.sqlalchemy.org/
- SQLModel : https://sqlmodel.tiangolo.com/
- Guide migration pattern : https://alembic.sqlalchemy.org/en/latest/cookbook.html

## 🆘 En cas d'urgence

Si une migration a cassé la production :

```bash
# 1. Identifier la version problématique
uv run alembic current

# 2. Downgrade à la version précédente (si possible)
uv run alembic downgrade -1

# 3. Ou downgrade à une version spécifique
uv run alembic downgrade <revision>

# 4. Corriger le problème
# 5. Créer une nouvelle migration de correction
uv run alembic revision -m "fix_previous_migration"
```

⚠️ **ATTENTION :** En production, toujours créer un backup avant de downgrade !
