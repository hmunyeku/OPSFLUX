# 06 Explicit Platform Audit

Date: 2026-04-03

## Objet

Ce document répond explicitement aux questions suivantes:

- le Dashboard est-il réellement exploitable par les autres modules et personnalisable selon les droits
- les modules Tiers, Projets, Planner sont-ils clairs et correctement branchés
- où en est la sécurité réelle
- où en sont notifications, emails et temps réel

Le ton retenu ici est volontairement direct:

- ce qui est **clair**
- ce qui est **partiel**
- ce qui est **incohérent**
- ce qui est **dangereux**

## 1. Dashboard

### 1.1 Intention

L'intention produit est bonne:

- dashboard global
- onglets obligatoires définis par admin
- onglets personnels par utilisateur
- filtrage par rôles
- widgets issus des modules
- homepage résolue par scope

### 1.2 Ce qui est bien présent

- manifest avec permissions `dashboard.read`, `dashboard.customize`, `dashboard.admin`
- endpoint de catalogue widgets filtré par rôles
- endpoints d'onglets personnels
- endpoints d'onglets obligatoires admin
- endpoints widget data
- résolution homepage par scope utilisateur / rôle / BU / global côté intention
- page frontend qui tient compte de `dashboard.customize`

### 1.3 Ce qui n'est pas complètement propre

1. Le backend expose à la fois:
   - `/api/v1/dashboards/*`
   - `/api/v1/dashboard/*`

   La séparation n'est pas intuitive et complique le contrat API.

2. Le frontend Dashboard appelle certains endpoints avec un préfixe incohérent.

   Exemples probables d'écart:

   - service frontend `GET /api/v1/dashboard/dashboards`
   - backend réel `GET /api/v1/dashboards`

   - service frontend `PUT /api/v1/dashboard/home`
   - backend réel `POST /api/v1/dashboards/home`

3. La résolution homepage annonce un niveau `BU`, mais le backend contient encore:

   - `bu_id = None  # TODO: resolve from user's group/BU assignment`

4. Le service frontend retourne un catalogue vide si l'endpoint échoue.
   C'est pratique en dev, mais ça masque un vrai défaut d'intégration.

### 1.4 Conclusion Dashboard

Le Dashboard est **conceptuellement bien conçu**, mais **pas encore totalement fiabilisé comme socle universel**.

Verdict:

- architecture: `bonne`
- personnalisation par droits: `partielle mais réelle`
- contrat frontend/backend: `à corriger`
- homepage hiérarchique: `incomplète`

## 2. Tiers

### 2.1 Ce qui est clair

Le module Tiers est l'un des plus lisibles:

- sociétés
- contacts externes
- blocages
- références externes
- forte réutilisation des composants Core polymorphes

Le frontend montre bien ce rôle de référentiel transversal.

### 2.2 Problème principal

Plusieurs endpoints de lecture ne sont pas protégés par `require_permission("tier.read")`.

Exemples:

- liste des tiers
- détail d'un tiers
- liste globale des contacts
- certaines lectures de blocks / refs / contacts

### 2.3 Conclusion Tiers

Fonctionnellement, le module est **clair**.
En sécurité, il est **trop permissif en lecture**.

Verdict:

- métier: `clair`
- UI: `bonne base`
- sécurité lecture: `insuffisante`

## 3. Projets

### 3.1 Ce qui est clair

Le module Projets couvre bien:

- projet
- membres
- tâches
- milestones
- révisions
- deliverables
- actions
- dépendances

Le modèle de permissions est riche et le manifest est cohérent.

### 3.2 Problème principal

Comme pour Tiers, de nombreux endpoints de lecture n'ont pas de garde explicite `project.read`.

Exemples:

- liste des projets
- détail projet
- liste des tâches transverses
- plusieurs endpoints de lecture secondaires

### 3.3 Conclusion Projets

Le module est **riche et assez structuré**, mais il souffre d'un problème récurrent:

- les permissions d'écriture sont présentes
- les permissions de lecture ne sont pas systématiquement appliquées

Verdict:

- fonctionnel: `clair`
- sécurité: `partielle`

## 4. Planner

### 4.1 Ce qui est clair

Le rôle du module est bien défini:

- activités
- capacité
- conflits
- arbitrage
- dépendances
- impact preview

Le lien avec Asset Registry, Projets, PaxLog et TravelWiz est cohérent.

### 4.2 Ce qui est solide

- write permissions présentes sur les actions critiques
- usage d'un FSM service avec fallback
- événements émis vers les autres modules
- nombreuses routes utiles déjà exposées

### 4.3 Ce qui reste à surveiller

1. Plusieurs endpoints de lecture ne montrent pas de `planner.activity.read` explicite.
2. Certaines permissions semblent utilisées dans les routes mais non visibles dans le manifest fourni ici, par exemple:
   - `planner.capacity.update`
   - `planner.priority.override`

   Cela doit être vérifié et aligné.
3. Le fallback "si pas de définition FSM, on fait une mise à jour directe" est pratique, mais affaiblit la rigueur si on croit être protégé par workflow alors qu'on ne l'est pas.

### 4.4 Conclusion Planner

Le module est **métierement clair** et probablement l'un des plus structurés.
Mais il faut **aligner permissions déclarées, routes réelles et workflow effectif**.

Verdict:

- métier: `clair`
- architecture: `bonne`
- sécurité / gouvernance: `à solidifier`

## 5. Sécurité plateforme

### 5.1 Points positifs

- JWT access / refresh
- hash bcrypt
- MFA support
- lockout compte après échecs
- rate limit login par IP et email
- security headers
- cache Redis pour RBAC
- audit log sur plusieurs actions critiques

### 5.2 Points faibles majeurs

1. Gestion tenant fragile:
   - `X-Tenant` accepté directement
   - fallback `public`
   - pas de validation forte d'appartenance

2. Seed dev lancé au démarrage.

3. Secrets par défaut `CHANGEME` encore présents en config.
   En production, un garde existe, mais en dehors de prod cela reste dangereux si l'environnement dérive.

4. CAPTCHA en mode `fail open`.
   Si le provider échoue ou time out, le login continue.

5. Plusieurs modules n'appliquent pas systématiquement leurs permissions de lecture.

### 5.3 Verdict sécurité

Le socle sécurité n'est **pas vide**.
Il y a déjà une vraie matière.
Mais le niveau global reste **moyen et hétérogène**, pas homogène.

Verdict:

- auth: `plutôt bonne base`
- tenant isolation: `faible`
- permission coverage: `incomplète`
- sécurité opérationnelle globale: `insuffisante pour considérer la plateforme durcie`

## 6. Notifications

### 6.1 Ce qui est présent

- table de notifications
- API de listing, lecture, unread count
- push temps réel vers websocket
- publication Redis pub/sub
- envoi bulk
- handlers métiers qui créent réellement des notifications

### 6.2 Lecture réaliste

Le système de notifications in-app est **réel**.
Ce n'est pas un simple stub.

### 6.3 Limites

- peu de garde de préférence utilisateur visibles dans les handlers
- risque de dispersion si chaque handler formate ses messages librement
- digest quotidien basé sur notifications DB, mais encore assez artisanal

### 6.4 Verdict notifications

- in-app: `implémenté`
- orchestration: `partielle`
- gouvernance de contenu: `à normaliser`

## 7. Emails

### 7.1 Ce qui est présent

- envoi SMTP
- templates email en DB
- fallback built-in
- vérification email utilisateur
- invitations et notifications via handlers
- job de queue email
- digest quotidien

### 7.2 Problèmes

1. L'email queue recycle la table `notifications` avec `category='email'` comme pseudo-queue.
   C'est fonctionnel, mais c'est un design fragile.

2. Plusieurs fallback directs existent quand les templates manquent.
   Cela masque la non-configuration réelle.

3. Le système d'email existe, mais on n'a pas ici de preuve d'un cadre fort de délivrabilité, retry robuste, outbox dédiée, ou observabilité fine.

### 7.3 Verdict emails

- capacité d'envoi: `présente`
- templating: `présent`
- architecture de messagerie: `partielle`

## 8. Temps réel

### 8.1 Ce qui est présent

- websocket `/ws/notifications`
- auth JWT sur websocket
- keepalive
- mark_read via socket
- unread queue initiale
- Redis pub/sub multi-worker
- broadcast entity-level

### 8.2 Lecture réaliste

Le temps réel pour les notifications existe vraiment.

Ce qui n'est pas établi ici, c'est un temps réel généralisé sur tous les objets métier.
Le runtime temps réel visible est surtout centré sur:

- notifications
- invalidations / broadcasts entité

### 8.3 Verdict temps réel

- temps réel notification: `implémenté`
- temps réel métier global: `partiel`

## 9. Ce qui est clair et ce qui ne l'est pas

### Clair

- Dashboard comme couche transversale cible
- Tiers comme référentiel tiers / contacts
- Projets comme référentiel projet / tâches
- Planner comme couche d'arbitrage capacité
- système de notifications réel
- email réel
- websocket réel

### Pas encore suffisamment clair ou propre

- contrat Dashboard frontend/backend
- application uniforme des permissions de lecture
- sécurité multi-tenant
- gouvernance des emails et notifications
- maturité réelle du temps réel hors notifications

## 10. Priorités recommandées

1. Corriger la couverture des permissions de lecture sur Tiers, Projets, Planner et autres modules critiques.
2. Corriger les incohérences d'API Dashboard entre frontend et backend.
3. Durcir tenant / entity isolation.
4. Isoler une vraie stratégie email:
   - queue dédiée
   - templates obligatoires pour certains messages
   - monitoring des échecs
5. Standardiser les notifications:
   - catégories
   - format
   - règles d'émission
6. Réserver le temps réel généralisé à une étape suivante, après stabilisation de PaxLog.

## 11. Arbitrages validés après audit

Les décisions suivantes sont désormais fixées:

1. **Sécurité prioritaire**
   - on durcit la plateforme même si cela impose de corriger des accès actuels

2. **Dashboard comme module plein**
   - dashboard global
   - dashboards de module
   - insights propres à chaque module

3. **Granularité fine pilotée par rôles forts**
   - la permission fine reste la brique technique
   - les rôles forts restent la brique d'exploitation métier
