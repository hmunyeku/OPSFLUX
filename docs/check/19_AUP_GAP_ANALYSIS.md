# Rapport d'audit — Gap OpsFlux vs AUP Perenco

**Document source :** `GRP-ITS-POL-USER-001-Acceptable Use Policy-FR_U01.00`
**Rédacteur :** `Herve DUCHENNE CRETIER (CIO)` — approuvé `Armel SIMONDIN (PDG)` le `23/09/2025`
**Date d'audit :** 2026-04-20

Ce document couvre uniquement les exigences où **OpsFlux en tant que plateforme a un rôle technique ou organisationnel à jouer**. Les obligations purement humaines (ne pas ouvrir un document confidentiel en public, verrouiller son poste, etc.) sont hors périmètre.

## Code lecture
- ✅ Conforme à date
- 🟡 Partiellement conforme — gap identifié
- ❌ Non conforme — action requise
- ⚠️ Conflit potentiel avec la politique — escalade nécessaire

---

## 1. §4.6 Exigences de base

| Exigence | État | Détail |
|---|---|---|
| Non-divulgation des mots de passe (suppression auto dans les tickets) | ❌ | Le module Support accepte des pièces jointes + descriptions libres. Rien ne scanne le contenu à la recherche de chaînes ressemblant à des secrets. |
| Verrouillage de session inactif | 🟡 | `password_changed_at` existe mais pas de session-timeout côté serveur explicite. JWT a une expiration, mais aucune déconnexion forcée à inactivité côté web. |
| Interdiction d'introduction de logiciels/matériels non autorisés | ✅ | OpsFlux n'installe rien côté poste utilisateur (web + Expo). |

## 2. §5 Sécurité

### 5.1 Comptes / UPN

| Exigence | État | Détail |
|---|---|---|
| UPN = email unique | ✅ | `users.email` est unique, format enforcé (Pydantic EmailStr). |
| Création via ticket d'assistance (pas self-service) | 🟡 | OpsFlux permet la création manuelle par admin. Pas de workflow « ticket → admin crée le compte → notification ». Peut être acceptable si les admins OpsFlux sont les mêmes personnes que le support IT. |
| Ne jamais partager les identifiants | ✅ | Authentification nominative, audit log sur chaque action. |

### 5.2 Mots de passe

| Exigence AUP | OpsFlux | État |
|---|---|---|
| Min 10 caractères | `AUTH_PASSWORD_MIN_LENGTH = 12` | ✅ (plus strict) |
| 3 classes sur 4 (maj, min, chiffres, spéciaux) | `REQUIRE_SPECIAL + REQUIRE_UPPERCASE + REQUIRE_DIGIT` (minuscules implicites) | ✅ (impose les 4) |
| Ne doit PAS contenir l'UPN | Non vérifié côté code | ❌ |
| Différent par application | Hors scope (géré par bon sens utilisateur) | n/a |
| Très différent des précédents | Aucune historique de hashes | ❌ |
| Changement périodique imposé | `password_changed_at` stocké mais pas de job d'expiration | 🟡 |
| Mot de passe initial temporaire à changer | À vérifier dans le flow d'invite | 🟡 |

### 5.3 MFA

| Exigence | État | Détail |
|---|---|---|
| MFA activable | ✅ | Routes MFA présentes dans l'app mobile (`auth/mfaCode`, `verify`) + backend MFA. |
| MFA contextuelle (transparente en local, requise à distance) | ❌ | Actuellement MFA tout-ou-rien. AUP demande « 2e facteur = la localisation depuis bureau Perenco ». Nécessite intégration SSO + détection IP trust zones. |
| Authenticator TOTP via smartphone | ✅ | TOTP standard implémenté (écran `scanQr`). |

### 5.9 Signalement des incidents

| Exigence | État | Détail |
|---|---|---|
| Signalement via ticket, email, chat, téléphone | ✅ | Module Support + refonte AssistantPanel (commit `1299b5c7`) — ticket avec screenshot, vidéo, console log auto-attachés. |
| Signalement immédiat en cas de perte matériel | 🟡 | Procédure humaine, pas spécifique OpsFlux. Pourrait être un modèle de ticket dédié. |

---

## 3. §6 Lignes directrices

### 6.3 Assistant IA — ⚠️ **POINT CRITIQUE** ⚠️

**AUP §6.3 (verbatim) :** *« Microsoft Copilot est le seul assistant basé sur l'IA autorisé dont l'utilisation est autorisée au sein de la Société. L'utilisation d'assistants à base d'IA externes tels que ChatGPT, Google Gemini, Apple Siri, Amazon Alexa AI+ ou d'autres outils similaires est strictement interdite. »*

**Gap :** OpsFlux embarque un assistant IA natif (`AssistantPanel` → Chat, route `/api/v1/ai-chat`). Le modèle sous-jacent est probablement Anthropic/OpenAI via MCP — **potentiellement un « outil similaire » au sens de l'AUP**.

**Arguments en faveur d'une tolérance :**
- OpsFlux est une **application métier** et non un assistant généraliste comme ChatGPT.
- L'IA y est scopée au contexte Perenco (RAG sur modules, permissions, audit log).
- Les prompts/réponses passent par un backend contrôlé Perenco (Dokploy) — pas de fuite de données directe vers des LLMs publics.
- L'AUP n'interdit pas un module IA intégré dans une application métier d'entreprise.

**Arguments en faveur d'un blocage :**
- Si le backend appelle une API Anthropic/OpenAI publique, les prompts sortent du périmètre ISO27001 Perenco.
- L'AUP est explicite sur la liste blanche (Copilot).

**Action requise :**
1. **Clarifier avec la DSI Perenco** la qualification de l'assistant OpsFlux (outil métier vs assistant IA).
2. Documenter dans `docs/check/CDF_06_AI_MCP.md` :
   - Quel LLM est appelé
   - Où tournent les inférences (self-hosted ? Azure OpenAI privé ? Public ?)
   - Quelles données sortent du réseau Perenco
   - Quelle rétention côté fournisseur
3. Option de repli : router l'IA OpsFlux vers **Azure OpenAI tenant Perenco** (aligné Microsoft → acceptable par extension du principe Copilot) OU désactiver le chat IA en production Perenco.
4. Mode kill-switch : exposer une feature flag `AI_CHAT_ENABLED` (settings admin) pour couper le chat en 1 clic si la DSI refuse.

### 6.6 Internet & filtrage

| Exigence | État | Détail |
|---|---|---|
| Journalisation activité 1 an | 🟡 | `audit_log` existe, rétention non configurée. |
| Quotas de bande passante | n/a | OpsFlux est côté applicatif, pas réseau. |

### 6.12 Sauvegarde & 6.13 Rétention

| Exigence | État | Détail |
|---|---|---|
| Sauvegarde régulière | 🟡 | Dépend de la configuration Dokploy/Postgres de production. À documenter dans `docs/OPS.md`. |
| Rétention 2 ans / 10 ans selon rôle | ❌ | Aucun job de purge automatique dans OpsFlux. Les users supprimés restent indéfiniment dans la base. |
| Cold-storage des données départ utilisateur | ❌ | Pas d'archive séparée. |

### 6.17 Systèmes en nuage — prérequis SaaS

| Prérequis AUP | OpsFlux | État |
|---|---|---|
| Business Product Owner nommé | ✅ | OpsFlux est développé en interne, owner identifié. |
| Revue juridique | 🟡 | À formaliser par Perenco si OpsFlux passe en SaaS multi-tenant. |
| Fournisseur + datacenter ISO 27001 | 🟡 | Dokploy hébergé — à vérifier la certification du datacenter. |
| API REST standard | ✅ | FastAPI, OpenAPI exposé. |
| Stratégie backup + DR | 🟡 | À documenter formellement. |
| Plan de réversibilité | ❌ | Pas de procédure d'export complet documentée. |

---

## 4. §7 Réglementation

### 7.1 Surveillance & journalisation

| Exigence | État | Détail |
|---|---|---|
| Journalisation activités | ✅ | Table `audit_log` renseignée sur actions clés. |
| Rétention 1 an | ❌ | Pas de purge auto. Par défaut la table grossit indéfiniment. |
| Accès restreint aux admins | ✅ | Module audit sous permission `audit.read`. |

### 7.2 Formation & sensibilisation

| Exigence | État | Détail |
|---|---|---|
| Formation annuelle | n/a | Hors scope OpsFlux (plateforme Perenco séparée). |
| Tutoriel / onboarding | ✅ | Système de visites guidées (`AssistantPanel` → onglet Visites) — post-commit `1299b5c7` il est robuste et fonctionnel. Peut être étendu pour y injecter les rappels AUP. |

### 7.5 RGPD

| Exigence | État | Détail |
|---|---|---|
| Données personnelles minimales par utilisateur | ✅ | Champs users limités au nécessaire. |
| Partage interne seulement si pertinent | ✅ | RBAC par permission + isolation par entité. |
| Suppression des données personnelles quand obsolète | 🟡 | Pas de job auto. Les contacts peuvent être archivés (`archive_contact`). |
| Registre des traitements / DPIA | ❌ | À produire (hors OpsFlux — côté Perenco DPO). |

---

## 5. Plan d'action priorisé

### P0 — Bloquant production chez Perenco (à traiter avant go-live)

1. **⚠️ AI Chat — clarifier statut vs AUP §6.3** *(owner : Matthieu + CIO Perenco)*
   - Décision écrite : maintenu / redirigé vers Azure OpenAI Perenco / désactivé.
   - Feature flag `AI_CHAT_ENABLED` ajoutée dans Settings admin.
   - ETA : avant déploiement pilote.

2. **Rétention audit log 1 an** *(owner : backend)*
   - Alembic migration : index `created_at` sur `audit_log` (probablement déjà là).
   - Cron (Celery Beat ou pg_cron) : `DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '1 year'`.
   - Paramètre configurable via Settings : `AUDIT_LOG_RETENTION_DAYS` (défaut 365).

3. **Politique mot de passe — gaps restants** *(owner : backend)*
   - Rejet si le mot de passe contient l'UPN / email.
   - Historique des 5 derniers hashes (`password_history` table) — refus si re-utilisé.
   - Expiration configurable (`AUTH_PASSWORD_MAX_AGE_DAYS`, défaut 180) — bannière `/change-password` forcée passé le délai.
   - Mot de passe temporaire à la création avec flag `must_change_password`.

### P1 — Non-bloquant mais demandé par l'AUP

4. **Rétention données départ utilisateur** *(owner : backend)*
   - Champ `left_at` sur `users` + rôle tag `is_specific_role` (managers, legal, fiscal, assurance, RH).
   - Job mensuel : passe les comptes > 2 ans (ou 10 ans si specific) en « cold » — email/documents exportés dans un bucket séparé, compte désactivé mais non supprimé.

5. **Masquage auto des secrets dans les tickets** *(owner : backend Support)*
   - Regex sur description + fichiers texte attachés : détecte patterns `password=`, `pwd:`, tokens longs (JWT, API keys), numéros carte bancaire.
   - Remplacement par `***REDACTED***` avant stockage.
   - Alerte à l'utilisateur lors de la saisie (« On dirait un mot de passe, on le masque »).

6. **Session timeout inactivité** *(owner : frontend + backend)*
   - JWT refresh rotation + `last_activity_at` tracké en session.
   - Logout auto après 30 min d'inactivité (configurable `SESSION_IDLE_TIMEOUT_MIN`).

### P2 — Durcissement optionnel

7. **MFA contextuelle par IP trust zone** *(owner : backend)*
   - Settings : liste des CIDR des bureaux Perenco.
   - Si IP source ∈ trust zones → MFA non demandée sur cette session.
   - Sinon → MFA obligatoire à chaque login.

8. **Plan de réversibilité OpsFlux** *(owner : docs)*
   - `docs/ops/REVERSIBILITY.md` : procédure pg_dump + export attachments (S3) + export schema settings.
   - Format : SQL standard + tarball attachments + JSON settings.

9. **Module de sensibilisation AUP dans OpsFlux** *(owner : frontend)*
   - Ajout d'une visite guidée « Charte IT Perenco » dans `GUIDED_TOURS` (`AssistantPanel.tsx`).
   - Étape obligatoire à la première connexion avec acceptation tracée (`user_acceptances` table).

### P3 — Conformité organisationnelle (hors code)

10. **DPIA OpsFlux** — à produire avec le DPO Perenco avant mise en production sur données réelles.
11. **Registre de traitement RGPD** — lister les finalités, bases légales, durées de conservation par module.
12. **Attestation ISO 27001** du datacenter d'hébergement — ajouter à la documentation fournisseur.

---

## 6. Feature flags à introduire

Tous gérables dans Settings admin (`app/core/settings_registry.py`) :

| Flag | Défaut | Usage |
|---|---|---|
| `AI_CHAT_ENABLED` | `true` | Kill-switch §6.3 |
| `AUDIT_LOG_RETENTION_DAYS` | `365` | §7.1 |
| `AUTH_PASSWORD_MAX_AGE_DAYS` | `180` | §5.2 |
| `AUTH_PASSWORD_HISTORY_SIZE` | `5` | §5.2 |
| `SESSION_IDLE_TIMEOUT_MIN` | `30` | §4.6 |
| `USER_DEPARTURE_COLD_STORAGE_DAYS_REGULAR` | `730` | §6.13 |
| `USER_DEPARTURE_COLD_STORAGE_DAYS_SPECIFIC` | `3650` | §6.13 |
| `MFA_TRUST_ZONES_CIDR` | `[]` | §5.3 |

---

## 7. Notes d'implémentation

- **Ordre d'attaque recommandé :** P0-2 (rétention audit) → P0-3 (password policy) → P0-1 (AI clarif) en parallèle avec DSI Perenco → P1-4 (rétention users) → P1-5 (masquage tickets) → P1-6 (session timeout) → P2.
- **Tests à ajouter** :
  - `tests/api/test_password_policy.py` : vérifie les nouvelles règles.
  - `tests/jobs/test_audit_retention.py` : vérifie le cron de purge.
  - `tests/api/test_ticket_secret_masking.py` : vérifie le regex de redaction.
- **Migration** : à enchaîner 144 (password_history) → 145 (user_left_at + specific_role flag) → 146 (audit retention index).

---

## 8. Références

- AUP : `C:\Users\matth\Downloads\GRP-ITS-POL-USER-001-Acceptable Use Policy-FR_U01.00.pdf` (22 pages, U01.00, 23/09/2025)
- Code OpsFlux pertinent :
  - `app/core/auth_settings.py` (policy mots de passe)
  - `app/models/common.py:539` (AuditLog)
  - `app/api/routes/core/ai_chat.py` (endpoint IA — AUP §6.3)
  - `app/api/routes/modules/support.py` (tickets)
  - `apps/main/src/components/layout/AssistantPanel.tsx` (UX — visites guidées + tickets)
