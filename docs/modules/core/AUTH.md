# Module Auth & Onboarding — Spécification complète

## 1. Vue d'ensemble

OpsFlux supporte deux modes d'authentification selon le type d'utilisateur :

| Type | Méthode | Compte OpsFlux |
|---|---|---|
| Employé Perenco | SSO intranet (SAML2/OIDC/LDAP) | Créé automatiquement à la 1ère connexion |
| Prestataire externe avec compte limité | Invitation par email | Créé manuellement par un admin |
| Capitaine / portail externe | Code accès voyage / token OTP | Pas de compte OpsFlux |

---

## 2. SSO pour les internes Perenco

### 2.1 Protocoles supportés

| Protocole | Cas d'usage | Bibliothèque |
|---|---|---|
| SAML 2.0 | Active Directory Federation Services (ADFS) | `python3-saml` |
| OIDC / OAuth2 | Azure AD, Okta, Google Workspace | `authlib` |
| LDAP direct | Authentification LDAP sans SSO centralisé | `python-ldap` |

La configuration est choisie selon ce que l'intranet Perenco expose. Un seul protocole est actif à la fois (configurable par `SYS_ADMIN`).

### 2.2 Flux SSO (SAML/OIDC)

```
Utilisateur → OpsFlux login page
    ↓ Clic "Connexion Perenco"
Redirect → Identity Provider (IDP) intranet
    ↓ Authentification réussie
IDP → OpsFlux callback avec token/assertion
    ↓
OpsFlux extrait : email, first_name, last_name, (department, badge si disponibles)
    ↓
Cherche un user avec cet email dans la table users
    ↓
Si trouvé → mise à jour last_login_at + session → dashboard
Si non trouvé → création automatique du compte (provisionnement JIT)
    ↓ (seulement si c'est une nouvelle création)
OpsFlux crée : users + pax_profiles (type=internal)
Affecte le groupe par défaut (configurable : "Demandeur" ou basé sur le dept)
Envoie email de bienvenue avec guide d'utilisation
```

**Just-In-Time (JIT) provisionnement :** L'utilisateur n'a pas besoin d'être créé à l'avance dans OpsFlux. À sa première connexion SSO réussie, son compte est créé automatiquement.

### 2.3 Attributs récupérés depuis l'IDP

Configurable via mapping JSON (un par protocole) :

```json
{
  "email":       "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  "first_name":  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
  "last_name":   "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
  "department":  "http://schemas.xmlsoap.org/claims/Department",
  "badge":       "http://schemas.perenco.com/claims/BadgeNumber"
}
```

### 2.4 Variables d'environnement SSO

```env
# Mode SSO
SSO_ENABLED=true
SSO_PROTOCOL=saml2            # saml2 | oidc | ldap

# SAML2
SAML_IDP_METADATA_URL=https://sts.perenco.com/FederationMetadata/2007-06/FederationMetadata.xml
SAML_SP_ENTITY_ID=https://app.opsflux.io
SAML_SP_ACS_URL=https://app.opsflux.io/auth/saml/callback
SAML_ATTRIBUTE_MAPPING={"email": "...", "first_name": "...", ...}

# OIDC
OIDC_DISCOVERY_URL=https://login.microsoftonline.com/{tenant}/.well-known/openid-configuration
OIDC_CLIENT_ID=...
OIDC_CLIENT_SECRET=...
OIDC_SCOPE=openid email profile

# JWT OpsFlux (généré après SSO)
JWT_SECRET_KEY=...
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60   # Plus long si SSO actif (session gérée par IDP)
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
```

---

## 3. Invitation email pour les externes

### 3.1 Concept

Un utilisateur externe (prestataire de service avec besoin d'accès régulier, non géré par SSO) peut recevoir une invitation OpsFlux. Son compte est créé manuellement par un `SYS_ADMIN` ou `PAX_ADMIN`.

**Différence avec le portail EXT_SUPV :** Le portail EXT_SUPV (superviseur externe) est un accès par lien OTP sans compte. L'invitation email crée un **vrai compte OpsFlux limité** — utile pour des prestataires récurrents qui ont besoin d'accéder régulièrement sans passer par OTP.

### 3.2 Processus d'invitation

1. `SYS_ADMIN` ou `PAX_ADMIN` crée un utilisateur depuis l'admin :
   - Email, prénom, nom, entreprise (Tiers)
   - Groupe(s) assigné(s) (définit les droits)
   - Date d'expiration du compte (optionnel)

2. OpsFlux génère un lien d'invitation : `https://app.opsflux.io/invite/{token}`
   - Token UUID, valide 72h
   - Révocable à tout moment

3. Email envoyé à l'externe :
   ```
   Objet : Invitation OpsFlux — Perenco Cameroun
   
   Bonjour [Prénom],
   
   Vous avez été invité à accéder à OpsFlux, le système de gestion
   opérationnelle de Perenco Cameroun.
   
   [Créer mon compte →] (lien valide 72h)
   
   Ce compte vous permettra de : [liste des droits selon le groupe]
   ```

4. L'externe clique → saisit son mot de passe → compte activé

5. Connexions suivantes : email + mot de passe (pas de SSO)

### 3.3 Limites d'un compte externe invité

- Pas d'accès SSO intranet (email + mot de passe uniquement)
- Peut avoir une date d'expiration (`account_expires_at`)
- Peut être révoqué à tout moment par `SYS_ADMIN`
- Les droits sont strictement limités aux groupes assignés
- Reçoit l'email d'expiration 7 jours avant si `account_expires_at` est défini

---

## 4. Démarrage du système from scratch (Bootstrap)

### 4.1 Premier démarrage

Lors du premier déploiement, le système est vide. Le processus de bootstrap :

**Étape 1 — Compte super-admin initial**

Au démarrage, si aucun utilisateur n'existe, OpsFlux accepte une connexion spéciale via `BOOTSTRAP_SECRET` (variable d'environnement). Ce secret est utilisé une seule fois.

```env
BOOTSTRAP_SECRET=un-secret-tres-long-et-aleatoire
```

L'admin système accède à `https://app.opsflux.io/bootstrap` avec ce secret et crée le premier compte `SYS_ADMIN`.

**Étape 2 — Configuration SSO** (si applicable)

Le `SYS_ADMIN` configure le SSO depuis `Administration > Auth > SSO`. Les paramètres IDP sont saisis et testés avant activation.

**Étape 3 — Configuration de l'entité**

```
Administration > Entités > Créer
  - Nom : Perenco Cameroun
  - Code : perenco_cam
  - Pays : Cameroun
  - Timezone : Africa/Douala (UTC+1)
  - Devise : XAF
```

**Étape 4 — Import de la hiérarchie assets**

L'`ASSET_ADMIN` importe le CSV des assets (champs, sites, plateformes).

**Étape 5 — Import des référentiels**

- Centres de coût (CSV depuis SAP)
- Départements
- Types de certifications HSE (liste standard prédéfinie + ajouts)

**Étape 6 — Création des groupes et affectation des rôles**

Le `SYS_ADMIN` crée les groupes correspondant à l'organisation Perenco et y affecte les premiers utilisateurs.

**Étape 7 — Test avec utilisateurs pilotes**

Avant ouverture générale : test avec 3-5 utilisateurs clés (DO, CDS, LOG_BASE) pour valider les workflows.

---

## 5. Gestion des sessions

### 5.1 JWT OpsFlux

Après authentification (SSO ou email/password) → OpsFlux émet deux tokens :

```
Access Token  : JWT, durée 60min (si SSO) ou 15min (si email/pwd)
Refresh Token : JWT, durée 7 jours, httpOnly cookie
```

À l'expiration de l'access token → le client utilise le refresh token pour en obtenir un nouveau silencieusement (transparent pour l'utilisateur).

### 5.2 Révocation de session

Si un `SYS_ADMIN` désactive un compte → les tokens existants sont invalidés immédiatement via une liste noire Redis (TTL = durée max du refresh token).

### 5.3 Déconnexion SSO

Si SSO actif → la déconnexion OpsFlux envoie une requête de Single Logout (SLO) à l'IDP pour déconnecter la session intranet également (configurable, peut être désactivé).

---

## 6. Interface Administration Auth

Accessible depuis `Administration > Sécurité` :

**Onglet "Utilisateurs" :**
- Liste de tous les comptes avec statut (actif / inactif / expiré)
- Filtre par type (SSO / invité / externe)
- Actions : désactiver, révoquer sessions, réinitialiser mot de passe, voir l'historique de connexion

**Onglet "SSO" :**
- Configuration du protocole et des paramètres IDP
- Test de connexion SSO (simuler une authentication sans créer de session)
- Mapping des attributs IDP → champs OpsFlux
- Log des tentatives de connexion SSO (succès / échec avec motif)

**Onglet "Invitations" :**
- Liste des invitations envoyées (en attente / acceptées / expirées)
- Créer une nouvelle invitation
- Révoquer une invitation

**Onglet "Sessions actives" :**
- Liste des sessions actives (SYS_ADMIN uniquement)
- Révoquer une session spécifique

---

## 7. Données

```sql
-- Table users (enrichie pour l'auth)
ALTER TABLE users ADD COLUMN password_hash       TEXT;       -- null si SSO uniquement
ALTER TABLE users ADD COLUMN auth_type           VARCHAR(20) NOT NULL DEFAULT 'sso';
                                                             -- sso | email_password | both
ALTER TABLE users ADD COLUMN sso_subject         VARCHAR(200);  -- identifiant IDP
ALTER TABLE users ADD COLUMN account_expires_at  TIMESTAMPTZ;   -- null = permanent
ALTER TABLE users ADD COLUMN last_login_at       TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN last_login_ip       INET;
ALTER TABLE users ADD COLUMN failed_login_count  SMALLINT DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until        TIMESTAMPTZ;   -- verrouillage temporaire

-- Invitations en attente
CREATE TABLE user_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) NOT NULL,
  first_name      VARCHAR(100),
  last_name       VARCHAR(100),
  company_id      UUID REFERENCES tiers(id),
  token           VARCHAR(200) UNIQUE NOT NULL,
  invited_by      UUID REFERENCES users(id),
  groups_to_assign UUID[],    -- groupes à affecter dès l'activation
  expires_at      TIMESTAMPTZ NOT NULL,
  accepted_at     TIMESTAMPTZ,
  created_user_id UUID REFERENCES users(id),
  revoked         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Log des connexions (audit de sécurité)
CREATE TABLE auth_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id),
  email_attempted VARCHAR(255),  -- si user pas trouvé
  auth_type       VARCHAR(20),   -- sso | email_password | token
  success         BOOLEAN NOT NULL,
  failure_reason  VARCHAR(100),  -- wrong_password | account_locked | sso_error | ...
  ip_address      INET,
  user_agent      TEXT,
  logged_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_auth_log_user ON auth_log(user_id, logged_at DESC);
CREATE INDEX idx_auth_log_time ON auth_log(logged_at DESC);

-- Verrouillage automatique après N échecs (configurable)
-- AUTH_MAX_FAILED_ATTEMPTS=5
-- AUTH_LOCKOUT_DURATION_MIN=15
```

---

## 8. Variables d'environnement — Auth complètes

```env
# Général
AUTH_ENABLED_METHODS=sso,email_password  # sso uniquement, ou les deux
JWT_SECRET_KEY=...
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# Sécurité connexion
AUTH_MAX_FAILED_ATTEMPTS=5          # Verrouillage après N échecs
AUTH_LOCKOUT_DURATION_MIN=15        # Durée verrouillage en minutes
AUTH_PASSWORD_MIN_LENGTH=12         # Longueur min mot de passe
AUTH_PASSWORD_REQUIRE_SPECIAL=true  # Exiger caractère spécial

# Bootstrap (désactiver après le premier démarrage)
BOOTSTRAP_SECRET=...
BOOTSTRAP_ENABLED=true              # Mettre à false après setup initial

# Invitations
INVITATION_EXPIRY_HOURS=72
INVITATION_EMAIL_FROM=noreply@app.opsflux.io

# Session
SESSION_REVOCATION_BACKEND=redis    # redis | database
REDIS_URL=redis://localhost:6379/1
```
