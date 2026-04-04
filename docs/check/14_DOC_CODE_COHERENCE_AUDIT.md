# Audit Cohérence Docs / Code

Date: 2026-04-03

Objectif: identifier les écarts entre la documentation OpsFlux et le comportement réellement implémenté, puis proposer un plan de réalignement exploitable.

## Résumé exécutif

Les écarts les plus critiques ne sont pas de simples oublis documentaires. Sur plusieurs sujets sensibles, la documentation décrit un système plus mature, plus cloisonné ou plus sécurisé que le code réellement présent.

Les priorités immédiates sont:

1. bootstrap initial
2. isolation multi-tenant
3. API settings
4. permissions sur les intégrations

---

## Tableau de cohérence

| Priorité | Sujet | Documentation | Implémentation réelle | Risque | Action recommandée |
|---|---|---|---|---|---|
| P0 | Bootstrap initial | Bootstrap one-shot via `BOOTSTRAP_SECRET`, puis désactivation du mode bootstrap | Seed de développement lancé au démarrage, avec admin et comptes de test | Très élevé | Implémenter le vrai bootstrap ou restreindre explicitement le seed à `development` |
| P0 | Multi-tenant | Tenant résolu via JWT + base platform + schéma dédié par tenant | Un seul `DATABASE_URL`, schéma choisi par host ou `X-Tenant` | Très élevé | Soit implémenter la couche platform, soit réécrire la doc selon l’architecture réelle |
| P0 | Settings | Scopes documentés `platform/tenant/entity/user` avec gouvernance claire | API `settings` sans contrôle de permission fort ni scoping correct | Très élevé | Corriger le code avant toute mise à jour documentaire |
| P0 | Intégrations | Accès réservé `tenant_admin` ou permission dédiée | Endpoints de test accessibles à tout utilisateur authentifié | Très élevé | Ajouter les permissions et l’isolation par entité |
| P1 | Switch tenant | Flux de changement de tenant documenté dans le refresh/token lifecycle | La réalité ressemble davantage à un contexte d’entité qu’à un vrai switch tenant complet | Élevé | Clarifier le concept réellement supporté |
| P1 | Client API frontend | Client Axios unifié avec `baseURL` cohérente | Refresh token envoyé hors de l’instance configurée | Moyen | Corriger le code ou documenter la contrainte same-origin |
| P1 | Headers de contexte | Références à `X-Tenant-ID` dans la doc | Le frontend envoie `X-Entity-ID`, le backend lit `X-Tenant` | Élevé | Normaliser les noms et mettre à jour doc + code |
| P2 | RBAC théorique | Modèle très stabilisé, rôles de plateforme et de tenant bien définis | RBAC réel présent mais plus hétérogène et plus couplé au code | Moyen | Générer la doc RBAC depuis les manifests/modules |
| P2 | Connecteurs v2 | Module complet documenté avec CRUD, preview, sync, historique | Code réel centré surtout sur tests d’intégrations | Moyen | Marquer cette doc comme cible ou roadmap, pas comme état implémenté |

---

## Écarts détaillés

### 1. Bootstrap initial

#### Ce que disent les docs

- La doc décrit un premier démarrage sur système vide.
- La création du premier compte admin passe par `BOOTSTRAP_SECRET`.
- Le mécanisme est présenté comme temporaire et désactivable après usage.

Références:

- `docs/modules/core/AUTH.md`
- `docs/08_SETTINGS.md`

#### Ce que fait le code

- Au startup, l’application appelle `seed_dev_data()`.
- Cette routine crée `admin@opsflux.io` si absent.
- Elle utilise un mot de passe par défaut si `FIRST_SUPERUSER_PASSWORD` n’est pas défini.
- Elle crée aussi plusieurs comptes de test avec mot de passe fixe.

Références:

- `app/main.py`
- `app/services/core/seed_service.py`

#### Pourquoi c’est incohérent

La doc décrit un bootstrap sécurisé et exceptionnel. Le code implémente un seed de développement automatique, avec des identifiants prédictibles.

#### Décision recommandée

Choisir une seule vérité:

- soit `bootstrap sécurisé` comme comportement officiel
- soit `seed de dev automatique` mais uniquement en `development`

---

### 2. Multi-tenant

#### Ce que disent les docs

- Le tenant est une isolation par schéma PostgreSQL.
- Une base platform gère les tenants, quotas, routage et licensing.
- Le tenant actif est résolu depuis le JWT ou le mécanisme d’auth prévu.

Références:

- `docs/00_PROJECT.md`
- `docs/01_CORE.md`
- `docs/08_SETTINGS.md`
- `docs/11_FUNCTIONAL_ANALYSIS.md`

#### Ce que fait le code

- Le backend a un unique `DATABASE_URL`.
- Le middleware résout le schéma depuis le host ou depuis `X-Tenant`.
- Le `search_path` est appliqué directement à la session SQL.

Références:

- `app/core/config.py`
- `app/core/middleware/tenant.py`
- `app/core/database.py`

#### Pourquoi c’est incohérent

La doc décrit une architecture platform multi-tenant structurée. Le code correspond à un routage de schéma beaucoup plus direct, sans vraie couche platform visible.

#### Décision recommandée

- soit construire la couche platform promise par la doc
- soit réduire la doc à l’architecture réellement opérée aujourd’hui

---

### 3. API Settings

#### Ce que disent les docs

- Les settings ont des scopes précis: `platform`, `tenant`, `entity`, `user`.
- Les réglages sensibles sont gouvernés.
- La configuration varie proprement selon le niveau hiérarchique.

Références:

- `docs/08_SETTINGS.md`

#### Ce que fait le code

- `GET /api/v1/settings` liste par `scope` sans filtrage sérieux par entité.
- `PUT /api/v1/settings` met à jour une clé sans permission dédiée.
- Le `scope_id` n’est correctement géré que pour le scope `user`.

Références:

- `app/api/routes/core/settings.py`

#### Pourquoi c’est incohérent

La doc décrit un moteur de configuration gouverné. Le code expose une API de settings générique, largement ouverte.

#### Décision recommandée

Corriger le code avant la doc:

1. permissions dédiées
2. filtre par entité
3. gestion correcte de `scope_id`
4. interdiction des modifications globales hors admin

---

### 4. Permissions sur les intégrations

#### Ce que disent les docs

- La zone intégrations est réservée aux admins tenant.
- Les connecteurs sont cloisonnés.
- L’accès est restreint par rôle ou permission dédiée.

Références:

- `docs/02_DESIGN_SYSTEM.md`
- `docs/modules/v2/CONNECTEURS.md`

#### Ce que fait le code

- `POST /api/v1/integrations/test` ne demande qu’un utilisateur authentifié.
- `POST /api/v1/integrations/test-send` peut déclencher des envois réels.
- La lecture des settings d’intégration n’est pas correctement scindée par entité.

Références:

- `app/api/routes/core/integrations.py`

#### Pourquoi c’est incohérent

La doc présente une surface d’administration protégée. Le code correspond à une surface d’action beaucoup plus ouverte.

#### Décision recommandée

- ajouter `require_permission(...)`
- filtrer par entité
- journaliser les tests et envois réels
- séparer clairement `test connectivity` et `send real`

---

### 5. Client API frontend

#### Ce que disent les docs

- L’instance API frontend doit centraliser les appels.
- Le refresh token doit suivre le même pipeline réseau.

Référence:

- `docs/05_DEV_GUIDE.md`

#### Ce que fait le code

- L’instance `api` utilise `VITE_API_URL`.
- Le refresh utilise `axios.post('/api/v1/auth/refresh')` hors de cette instance.

Référence:

- `apps/main/src/lib/api.ts`

#### Pourquoi c’est incohérent

Le comportement documenté suppose un client API cohérent. Le code introduit une hypothèse implicite de même origine ou de proxy local.

#### Décision recommandée

Corriger le code. Si ce n’est pas fait, ajouter une note de contrainte explicite dans la doc.

---

### 6. Headers et vocabulaire de contexte

#### Ce que disent les docs

- La doc frontend mentionne `X-Tenant-ID`.
- D’autres sections parlent du tenant actif dans le JWT.

#### Ce que fait le code

- Le frontend utilise `X-Entity-ID`.
- Le middleware backend lit `X-Tenant`.

Références:

- `docs/05_DEV_GUIDE.md`
- `apps/main/src/lib/api.ts`
- `app/core/middleware/tenant.py`

#### Pourquoi c’est incohérent

Le vocabulaire mélange tenant, entity et parfois BU. Cela crée des implémentations clientes incohérentes.

#### Décision recommandée

Définir une convention officielle:

1. comment le tenant est résolu
2. comment l’entité active est transmise
3. quels headers sont supportés

---

## Recommandation de gouvernance documentaire

Le problème ne vient pas seulement du contenu. Il vient aussi du fait que les docs mélangent:

- l’état réel implémenté
- les décisions cibles
- les intentions produit

### Proposition

Ajouter un statut explicite sur les docs techniques:

- `implemented`
- `partial`
- `target`

### Exemple de règle

- `docs/00_PROJECT.md`: vision + target architecture
- `docs/check/*`: état réel constaté
- `docs/modules/*`: préciser si le module est `implemented` ou `target`

---

## Plan d’action suggéré

### Sprint 1

1. Bloquer le seed de dev hors `development`
2. Protéger `settings`
3. Protéger `integrations/test` et `integrations/test-send`
4. Normaliser les headers tenant/entity

### Sprint 2

1. Réécrire les docs Core pour refléter l’existant
2. Marquer les docs “cibles” comme telles
3. Isoler la vraie target platform multi-tenant dans une section dédiée

### Sprint 3

1. Générer automatiquement:
   - routes API
   - permissions
   - settings exposés
2. Réduire la documentation manuelle descriptive sur ces zones

---

## Conclusion

À ce stade, la documentation OpsFlux est utile pour comprendre la direction du produit, mais elle ne doit pas être prise comme description fidèle du runtime sur les sujets critiques.

La stratégie la plus saine est:

1. sécuriser le code sur les points P0
2. réétiqueter les docs
3. réaligner progressivement la documentation sur une source de vérité plus proche du code
