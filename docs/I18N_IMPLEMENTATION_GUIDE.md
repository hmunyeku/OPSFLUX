# Guide d'implémentation i18n - OpsFlux

## 📊 État actuel

### ✅ Pages avec i18n implémentée (4/50+)

| Page | Namespace | Clés | Status |
|------|-----------|------|--------|
| Login | `core.auth` | 29 | ✅ Complète |
| Cache | `core.cache` | - | ✅ Complète |
| Storage | `core.storage` | 38 | ✅ Complète |
| Queue | `core.queue` | 4 | ✅ Complète |

**Total: 71+ clés implémentées**

### 📦 Namespaces disponibles en base de données

| Namespace | Clés | Description |
|-----------|------|-------------|
| `core.common` | 51 | Éléments réutilisables (boutons, messages, navigation) |
| `core.auth` | 29 | Login, 2FA, password, validation |
| `core.users` | 10 | Gestion utilisateurs |
| `core.groups` | 6 | Gestion groupes |
| `core.rbac` | 4 | Rôles et permissions |
| `core.settings` | 6 | Paramètres profil/sécurité |
| `core.developers` | 5 | API keys, webhooks, hooks |
| `core.dashboard` | 3 | Tableau de bord |
| `core.tasks` | 6 | Gestion tâches |
| `core.queue` | 4 | Queues Celery |
| `core.storage` | 38 | Stockage fichiers |
| `core.cache` | - | Cache Redis |
| `core.metrics` | - | Métriques système |

**Total: 13 namespaces | 162+ clés | 324+ traductions (FR+EN)**

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

### 1. Users (Haute priorité)
- `/users/page.tsx` - Liste utilisateurs
- `/users/[id]/page.tsx` - Détail utilisateur
- `/users/components/users-invite-dialog.tsx`
- `/users/components/users-action-dialog.tsx`

**Clés disponibles**: `page.title`, `action.invite_user`, `field.email`, `message.user_created`, etc.

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
- [ ] Users pages (~40 pages)
- [ ] Groups pages (~10 pages)
- [ ] RBAC pages (~15 pages)
- [ ] Settings pages (~20 pages)
- [ ] Developers pages (~20 pages)
- [ ] Dashboard pages (~5 pages)
- [ ] Composants communs (toasts, alerts, dialogs)

**Progression: ~5% des pages UI**
**Traductions disponibles: 324+**

## 🎓 Exemples de référence

Voir les implémentations existantes:
- `frontend/src/app/(auth)/login/components/user-auth-form.tsx`
- `frontend/src/app/(dashboard)/settings/storage/page.tsx`
- `frontend/src/app/(dashboard)/settings/queue/page.tsx`

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
