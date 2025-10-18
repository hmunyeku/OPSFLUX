# Guide d'implémentation i18n - OpsFlux

## 📊 État actuel

### ✅ Pages avec i18n implémentée (13/50+)

| Page | Namespace | Clés | Status |
|------|-----------|------|--------|
| Login | `core.auth` | 29 | ✅ Complète |
| Cache | `core.cache` | - | ✅ Complète |
| Storage | `core.storage` | 38 | ✅ Complète |
| Queue | `core.queue` | 4 | ✅ Complète |
| Users | `core.users` | 101 | ✅ Complète (composants principaux) |
| Groups | `core.groups` | 55 | ✅ Complète (page principale) |
| RBAC | `core.rbac` | 78 | ✅ Complète (page principale) |
| API Keys | `core.developers` | 76 | ✅ Complète |
| Webhooks | `core.developers` | 76 | ✅ Complète |
| Hooks | `core.developers` | 76 | ✅ Complète |
| Events & Logs | `core.developers` | 76 | ✅ Complète |
| Dashboard | `core.dashboard` | 28 | ✅ Complète |
| Tasks | `core.tasks` | 68 | ✅ Complète |

**Total: 243+ clés implémentées dans 13 pages**

### 📦 Namespaces disponibles en base de données

| Namespace | Clés | Description |
|-----------|------|-------------|
| `core.common` | 51 | Éléments réutilisables (boutons, messages, navigation) |
| `core.auth` | 29 | Login, 2FA, password, validation |
| `core.users` | 101 | Gestion utilisateurs (stats, table, filtres, dialogs) |
| `core.groups` | 55 | Gestion groupes (breadcrumb, actions, stats, table, dialogs) |
| `core.rbac` | 78 | Rôles et permissions (create, assign, fields, stats, messages) |
| `core.settings` | 6 | Paramètres profil/sécurité |
| `core.developers` | 76 | API keys, webhooks, hooks, logs (complète) |
| `core.dashboard` | 28 | Tableau de bord (widgets, actions, stats) |
| `core.tasks` | 68 | Gestion tâches (status, priority, fields, dialogs) |
| `core.queue` | 4 | Queues Celery |
| `core.storage` | 38 | Stockage fichiers |
| `core.cache` | - | Cache Redis |
| `core.metrics` | - | Métriques système |

**Total: 13 namespaces | 439 clés | 878 traductions (FR+EN)**

## 🔧 Scripts disponibles

### Seed scripts (backend/scripts/)

1. **seed_core_translations.py** - Queue, Storage, Cache
2. **seed_all_translations.py** - Tous namespaces (ORM, 280+ clés)
3. **seed_all_translations_sql.py** - Tous namespaces (SQL, recommandé)

### Exécution

```bash
# Dans le container backend
docker exec code-backend-1 python3 /app/scripts/seed_all_translations_sql.py
```

## 📝 Pattern d'implémentation

### Étape 1: Importer le hook

```tsx
import { useTranslation } from "@/hooks/use-translation"
```

### Étape 2: Utiliser dans le composant

```tsx
export default function MyPage() {
  const { t } = useTranslation("core.namespace")

  return (
    <div>
      <h1>{t("page.title")}</h1>
      <p>{t("page.description")}</p>
      <Button>{t("button.save")}</Button>
    </div>
  )
}
```

### Étape 3: Avec interpolation

```tsx
<p>{t("message.welcome", { name: user.name })}</p>
// Clé en base: "Bienvenue {name}"
```

### Étape 4: Validation Zod

```tsx
function getFormSchema(t: (key: string) => string) {
  return z.object({
    email: z.string()
      .min(1, { message: t("validation.email_required") })
      .email({ message: t("validation.email_invalid") }),
  })
}

// Dans le composant
const { t } = useTranslation("core.auth")
const formSchema = getFormSchema(t)
```

## 🎯 Pages prioritaires à implémenter

### 1. Users ✅ (Complété - composants principaux)
- ✅ `/users/page.tsx` - Breadcrumb et titre
- ✅ `/users/components/users-stats.tsx` - 4 statistiques complètes
- ✅ `/users/components/users-table.tsx` - Messages table
- ✅ `/users/components/users-columns.tsx` - Headers et colonnes (factory pattern)
- ✅ `/users/components/users-section.tsx` - Intégration getColumns(t)
- ✅ `/users/components/data-table-toolbar.tsx` - Recherche et filtres
- ⏸️ `/users/[id]/page.tsx` - Détail utilisateur (à faire)
- ⏸️ `/users/components/users-invite-dialog.tsx` (à faire si nécessaire)
- ⏸️ `/users/components/users-action-dialog.tsx` (à faire si nécessaire)

**Clés implémentées**: 101 clés (stats, fields, table, filters, status, messages)

### 2. Groups
- `/users/groups/page.tsx`
- `/users/groups/components/*.tsx`

**Clés disponibles**: `page.title`, `action.create_group`, `field.name`, etc.

### 3. RBAC
- `/users/rbac/page.tsx`
- `/users/roles/page.tsx`
- `/users/permissions/page.tsx`

**Clés disponibles**: `roles.title`, `permissions.title`, etc.

### 4. Settings
- `/settings/profile/page.tsx`
- `/settings/profile/informations-tab.tsx`
- `/settings/profile/preferences-tab.tsx`

**Clés disponibles**: `section.profile`, `profile.first_name`, etc.

### 5. Developers
- `/developers/api-keys/page.tsx`
- `/developers/webhooks/page.tsx`
- `/developers/hooks/page.tsx`

**Clés disponibles**: `api_keys.title`, `webhooks.create`, etc.

## 💡 Bonnes pratiques

### ✅ DO
- Toujours préfixer les clés (`page.`, `button.`, `field.`, `message.`)
- Utiliser des clés descriptives (`button.save` > `save`)
- Grouper par contexte (`login.email`, `login.password`)
- Tester les 2 langues (FR + EN)

### ❌ DON'T
- Ne pas hardcoder de texte en dur
- Ne pas mélanger français et anglais
- Ne pas dupliquer des clés existantes
- Ne pas oublier les placeholders et messages d'erreur

## 🚀 Pour ajouter de nouvelles traductions

### Méthode 1: Via script SQL (recommandé)

Éditer `backend/scripts/seed_all_translations_sql.py`:

```python
"core.my_namespace": {
    "my.key": {"fr": "Texte FR", "en": "EN text"},
}
```

Puis exécuter le script.

### Méthode 2: Via API (frontend)

Créer un composant admin pour gérer les traductions directement.

## 📈 Progression

- [x] Infrastructure i18n (API, hooks, models)
- [x] Namespaces CORE créés (13)
- [x] Scripts de seed (3)
- [x] Login page (29 clés)
- [x] Storage page (38 clés)
- [x] Queue page (4 clés)
- [x] Cache page
- [x] Users page - composants principaux (101 clés)
  - [x] Page principale (breadcrumb, titre)
  - [x] Statistiques (4 cartes avec descriptions)
  - [x] Table (headers, colonnes, messages)
  - [x] Toolbar (recherche, filtres)
  - [ ] Détails utilisateur (page [id])
  - [ ] Dialogs (invite, action, assign)
- [x] Groups page principale (55 clés)
  - [x] Breadcrumb, titre, description
  - [x] Actions, stats, messages
  - [ ] Composants détails (~5 pages restantes)
- [x] RBAC page principale (78 clés)
  - [x] Breadcrumb, rôles, permissions
  - [x] Stats, filtres, messages
  - [ ] Pages détails rôles/permissions (~10 pages restantes)
- [x] Developers (76 clés) - 4 pages complètes
  - [x] API Keys
  - [x] Webhooks
  - [x] Hooks
  - [x] Events & Logs
- [x] Dashboard page (28 clés)
- [x] Tasks page (68 clés)
- [ ] Settings pages (~15 pages restantes)
- [ ] Composants communs (toasts, alerts, dialogs)

**Progression: ~25% des pages UI (13 pages complètes)**
**Traductions disponibles: 878 (439 clés × 2 langues)**

## 🎓 Exemples de référence

Voir les implémentations existantes:

**Auth & Validation:**
- `frontend/src/app/(auth)/login/components/user-auth-form.tsx` - Validation Zod avec i18n

**Pages complètes:**
- `frontend/src/app/(dashboard)/settings/storage/page.tsx` - Page complète avec dialogs
- `frontend/src/app/(dashboard)/settings/queue/page.tsx` - Page avec useCallback
- `frontend/src/app/(dashboard)/users/page.tsx` - Page principale avec breadcrumb

**Composants avancés:**
- `frontend/src/app/(dashboard)/users/components/users-stats.tsx` - Stats avec interpolation
- `frontend/src/app/(dashboard)/users/components/users-columns.tsx` - Factory pattern getColumns(t)
- `frontend/src/app/(dashboard)/users/components/data-table-toolbar.tsx` - Filtres dynamiques

**Pages récemment implémentées:**
- `frontend/src/app/(dashboard)/users/groups/page.tsx` - Groups avec stats
- `frontend/src/app/(dashboard)/users/rbac/page.tsx` - RBAC avec rôles/permissions
- `frontend/src/app/(dashboard)/developers/api-keys/page.tsx` - API Keys
- `frontend/src/app/(dashboard)/developers/webhooks/page.tsx` - Webhooks
- `frontend/src/app/(dashboard)/developers/hooks/page.tsx` - Hooks système
- `frontend/src/app/(dashboard)/(dashboard-1)/page.tsx` - Dashboard principal
- `frontend/src/app/(dashboard)/tasks/page.tsx` - Gestion tâches

## 📚 Architecture technique

### Backend

```
app/
├── models_i18n.py              # Modèles SQLAlchemy (Language, TranslationNamespace, Translation)
├── api/routes/languages.py     # API endpoints (/api/v1/languages/*)
└── alembic/versions/           # Migrations i18n
    ├── c9d4e5f12a11_add_i18n_tables.py
    └── daba4b9668a0_add_external_id_to_i18n_tables.py
```

### Frontend

```
src/
├── hooks/use-translation.ts    # Hook principal pour i18n
├── contexts/language-context.tsx
└── app/                        # Pages avec useTranslation()
```

### Scripts

```
backend/scripts/
├── seed_translations.py              # Seed basique (core.common)
├── seed_core_translations.py         # Queue, Storage, Cache
├── seed_all_translations.py          # Tous namespaces (ORM)
└── seed_all_translations_sql.py      # Tous namespaces (SQL, recommandé)
```

## 🔗 API Endpoints

- `GET /api/v1/languages/` - Liste des langues
- `GET /api/v1/languages/translations/export?namespace_code=X&language_code=Y` - Export traductions
- `POST /api/v1/languages/translations/import` - Import traductions
- `GET /api/v1/languages/namespaces/` - Liste namespaces
- `CRUD /api/v1/languages/translations/` - Gestion traductions

## 🌍 Langues supportées

- 🇫🇷 Français (fr) - Langue par défaut
- 🇬🇧 English (en)

Pour ajouter une langue:
```sql
INSERT INTO language (id, code, name, native_name, flag_emoji, is_active, is_default)
VALUES (gen_random_uuid(), 'es', 'Español', 'Español', '🇪🇸', true, false);
```

## 🆘 Dépannage

### Les traductions n'apparaissent pas

1. Vérifier que le namespace existe en base
2. Vérifier que les traductions sont bien créées (FR + EN)
3. Vérifier le code du namespace utilisé dans `useTranslation()`
4. Checker la console browser pour les erreurs API

### Ajouter une nouvelle clé

1. Éditer `backend/scripts/seed_all_translations_sql.py`
2. Ajouter la clé dans le bon namespace
3. Exécuter le script: `docker exec code-backend-1 python3 /app/scripts/seed_all_translations_sql.py`
4. Utiliser `t("ma.nouvelle.cle")` dans le frontend

### Modifier une traduction existante

```sql
UPDATE translation
SET value = 'Nouvelle valeur'
WHERE key = 'ma.cle'
  AND language_id = (SELECT id FROM language WHERE code = 'fr');
```
