# RAPPORT: Clés de traduction sans valeurs par défaut

## Résumé exécutif

Sur **198 fichiers TypeScript React (.tsx)** analysés dans `src/app/`, j'ai identifié **43 fichiers** contenant **454 clés de traduction** qui utilisent la fonction `t()` **SANS valeur par défaut**.

### Statistiques globales
- ✅ **Fichiers analysés**: 198 fichiers .tsx
- ❌ **Fichiers avec problèmes**: 43 fichiers (21.7%)
- ❌ **Clés manquantes totales**: 454 clés

---

## Répartition par catégorie

| Catégorie | Fichiers | Clés manquantes | % du total |
|-----------|----------|-----------------|------------|
| Settings | 16 | 268 | 59.0% |
| Users | 9 | 103 | 22.7% |
| Developers | 7 | 42 | 9.3% |
| Authentication | 4 | 16 | 3.5% |
| Other | 5 | 17 | 3.7% |
| Tasks | 2 | 8 | 1.8% |

---

## Top 10 des fichiers les plus problématiques

| Rang | Fichier | Clés manquantes |
|------|---------|-----------------|
| 1 | `settings/profile/preferences-tab.tsx` | 65 |
| 2 | `settings/profile/profile-form.tsx` | 54 |
| 3 | `settings/cache/page.tsx` | 33 |
| 4 | `settings/profile/components/user-api-key-card.tsx` | 30 |
| 5 | `settings/queue/page.tsx` | 27 |
| 6 | `settings/storage/page.tsx` | 27 |
| 7 | `users/components/users-action-dialog.tsx` | 26 |
| 8 | `users/rbac/page.tsx` | 18 |
| 9 | `users/groups/page.tsx` | 17 |
| 10 | `users/components/users-invite-dialog.tsx` | 17 |

---

## Détails par catégorie

### 🔐 Authentication (4 fichiers, 16 clés)

#### `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/frontend/src/app/(auth)/login/components/user-auth-form.tsx` (9 clés)
```
Ligne 30: t("validation.email_required")
Ligne 31: t("validation.email_invalid")
Ligne 117: t("login.email")
Ligne 119: t("login.email_placeholder")
Ligne 131: t("login.password")
Ligne 136: t("login.forgot_password")
Ligne 140: t("login.password_placeholder")
Ligne 147: t("login.button_loading")
Ligne 147: t("login.button")
```

#### `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/frontend/src/app/(auth)/login/page.tsx` (5 clés)
```
Ligne 14: t("login.subtitle")
Ligne 19: t("login.terms_text")
Ligne 24: t("login.terms_link")
Ligne 26: t("login.terms_and")
Ligne 31: t("login.privacy_link")
```

---

### ⚙️ Settings (16 fichiers, 268 clés)

Les fichiers de la section Settings représentent **59%** du total des clés manquantes.

#### Top 3 des fichiers Settings:

**1. `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/frontend/src/app/(dashboard)/settings/profile/preferences-tab.tsx` (65 clés)**
- Affichage des préférences utilisateur (thème, sidebar, langue, etc.)
- Gestion de l'authentification 2FA
- Tableaux de configuration

**2. `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/frontend/src/app/(dashboard)/settings/profile/profile-form.tsx` (54 clés)**
- Formulaire de profil utilisateur
- Validation de champs (email, téléphone, nom, etc.)
- Gestion des mots de passe

**3. `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/frontend/src/app/(dashboard)/settings/cache/page.tsx` (33 clés)**
- Statistiques de cache Redis
- Actions de gestion du cache
- Recommandations de performance

---

### 👥 Users (9 fichiers, 103 clés)

#### Fichiers principaux:

**`/etc/dokploy/compose/perenco-opsflux-gwxapr/code/frontend/src/app/(dashboard)/users/components/users-action-dialog.tsx` (26 clés)**
```
Ligne 61: t("validation.first_name_required")
Ligne 62: t("validation.last_name_required")
Ligne 63: t("validation.phone_required")
Ligne 66: t("validation.email_required")
Ligne 67: t("validation.email_invalid")
Ligne 69: t("validation.role_required")
Ligne 271: t("create_dialog.title_edit")
Ligne 271: t("create_dialog.title_create")
...
```

**`/etc/dokploy/compose/perenco-opsflux-gwxapr/code/frontend/src/app/(dashboard)/users/rbac/page.tsx` (18 clés)**
```
Ligne 162: t("breadcrumb.home")
Ligne 168: t("breadcrumb.users")
Ligne 173: t("breadcrumb.rbac")
Ligne 179: t("page.title")
Ligne 182: t("roles.create")
...
```

---

### 🛠️ Developers (7 fichiers, 42 clés)

#### `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/frontend/src/app/(dashboard)/developers/hooks/page.tsx` (12 clés)
```
Ligne 274: t("breadcrumb.home")
Ligne 279: t("breadcrumb.developers")
Ligne 283: t("hooks.title")
Ligne 290: t("hooks.title")
Ligne 292: t("hooks.description")
Ligne 299: t("hooks.system_title")
Ligne 301: t("hooks.system_description")
...
```

#### `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/frontend/src/app/(dashboard)/developers/api-keys/page.tsx` (9 clés)
```
Ligne 139: t("breadcrumb.home")
Ligne 144: t("breadcrumb.developers")
Ligne 148: t("api_keys.title")
...
```

---

### 📋 Tasks (2 fichiers, 8 clés)

#### `/etc/dokploy/compose/perenco-opsflux-gwxapr/code/frontend/src/app/(dashboard)/tasks/[id]/page.tsx` (6 clés)
```
Ligne 78: t("breadcrumb.tasks")
Ligne 125: t("detail.assignees")
Ligne 148: t("detail.due_date")
Ligne 219: t("detail.tabs.description")
Ligne 220: t("detail.tabs.comments")
```

---

### 🔹 Other (5 fichiers, 17 clés)

Inclut les pages de dashboard et la page 403.

---

## Exemples de patterns détectés

### ❌ Pattern INCORRECT (sans valeur par défaut)
```tsx
// Validation
.min(1, { message: t("validation.email_required") })
.email({ message: t("validation.email_invalid") })

// Labels
<FormLabel>{t("login.email")}</FormLabel>

// Placeholders
<Input placeholder={t("login.email_placeholder")} />

// Boutons
{isLoading ? t("login.button_loading") : t("login.button")}

// Titres
<h2>{t("page.title")}</h2>
```

### ✅ Pattern CORRECT (avec valeur par défaut)
```tsx
// Validation
.min(1, { message: t("validation.email_required", "Email is required") })
.email({ message: t("validation.email_invalid", "Invalid email address") })

// Labels
<FormLabel>{t("login.email", "Email")}</FormLabel>

// Placeholders
<Input placeholder={t("login.email_placeholder", "Enter your email")} />

// Boutons
{isLoading ? t("login.button_loading", "Signing in...") : t("login.button", "Sign in")}

// Titres
<h2>{t("page.title", "Dashboard")}</h2>
```

---

## Recommandations

### 1. **Priorités de correction**
   - **Haute priorité**: Authentication et Users (pages critiques)
   - **Moyenne priorité**: Settings et Developers
   - **Basse priorité**: Dashboard et Tasks

### 2. **Approche suggérée**
   - Créer un script automatisé pour ajouter des valeurs par défaut basées sur les clés
   - Réviser manuellement les valeurs générées
   - Valider avec l'équipe i18n

### 3. **Avantages d'ajouter les valeurs par défaut**
   - ✅ Meilleure expérience développeur (pas besoin d'attendre les traductions)
   - ✅ Fallback automatique si la traduction est manquante
   - ✅ Auto-documentation du code
   - ✅ Facilite le développement et les tests

### 4. **Convention proposée**
   Pour générer les valeurs par défaut à partir des clés:
   - `"login.email"` → `"Email"`
   - `"validation.email_required"` → `"Email is required"`
   - `"actions.update"` → `"Update"`
   - `"page.title"` → `"Page Title"` (à réviser contextuellement)

---

## Notes techniques

- **Méthode d'analyse**: Regex pattern matching sur tous les fichiers `.tsx` dans `src/app/`
- **Pattern recherché**: `t("key")` ou `t('key')` sans deuxième paramètre
- **Faux positifs**: Quelques cas comme `t(" ")` ou `t(",")` (à nettoyer)
- **Date de l'analyse**: 2025-10-19

---

## Fichiers problématiques avec clés étranges

Quelques fichiers contiennent des appels suspects à corriger:

```
src/app/(dashboard)/developers/overview/components/recent-activity.tsx:45: t(" ")
src/app/(dashboard)/settings/emailing/components/email-template-dialog.tsx:160: t(",")
src/app/(dashboard)/settings/emailing/components/email-template-dialog.tsx:200: t(",")
src/app/(auth)/accept-invitation/components/accept-invitation-form.tsx:48: t("token")
src/app/(dashboard)/layout.tsx:13: t("sidebar_state")
src/app/(dashboard)/settings/profile/preferences-tab.tsx:377: t("a")
```

Ces cas nécessitent une révision manuelle car ils semblent être des erreurs de code plutôt que de vraies clés de traduction.

---

**Fin du rapport**
