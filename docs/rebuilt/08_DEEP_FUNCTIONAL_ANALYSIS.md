# 08 Deep Functional Analysis

Date: 2026-04-03

## 1. Objet

Ce document répond à une question simple:

- est-ce que l'expérience actuelle est réellement adaptée au produit visé
- est-ce que les portails publics et liens sécurisés sont clairs
- est-ce que la conformité temps réel est vraiment maîtrisée
- est-ce qu'il reste des trous fonctionnels ou de sécurité majeurs

La réponse globale est:

- le socle est déjà sérieux
- plusieurs concepts sont déjà bien présents
- mais certains sujets critiques ne sont pas encore assez normalisés pour être considérés comme complets et sans faille

## 2. Verdict global

### 2.1 Ce qui est déjà bon

- le produit a une vraie structure modulaire
- le Core existe réellement: auth, RBAC, settings, events, notifications, websocket, audit
- le pattern UI général est cohérent
- les modules métier importants existent déjà à un niveau non trivial
- la logique multi-module est pensée en événements, pas seulement en écrans isolés

### 2.2 Ce qui n'est pas encore assez clair ou assez verrouillé

- la spécialisation des vues par module opérationnel
- la doctrine unique des accès externes/publics
- la définition exacte de ce que veut dire "temps réel"
- la séparation entre donnée locale, donnée validée et donnée exploitable métier
- la standardisation sécurité des liens d'accès externes

### 2.3 Position finale

Vous avez déjà une base exploitable pour construire un vrai produit métier.
En revanche, si l'objectif est "avancer sereinement sans bug, sans oubli, sans faille fonctionnelle ou sécurité", il faut encore transformer plusieurs intentions en règles de plateforme obligatoires.

## 3. Audit des vues UI

## 3.1 Le pattern actuel

Le frontend repose sur un modèle très clair:

- `Topbar`
- `Sidebar`
- panneau principal
- panneau dynamique de détail/édition
- navigation croisée inter-modules

Le commentaire d'architecture dans `AppLayout.tsx` fixe même explicitement la règle:

- la liste reste visible
- pas de CRUD en modale
- le détail/édition passe par panneau

Ce pattern est excellent pour:

- référentiels
- administration
- configuration
- données maîtres
- exploitation bureautique dense

Il est moins suffisant, seul, pour:

- coordination opérationnelle temps réel
- pilotage visuel d'état
- arbitrage multi-ressources
- supervision mouvement / mission / compliance

## 3.2 Jugement par module

### Dashboard

Le Dashboard doit être un vrai module, et aussi un socle transverse.
Votre cible est bonne:

- dashboard global
- dashboard par module
- personnalisation par utilisateur
- filtrage par permission

Ce qui manque encore à clarifier complètement:

- la taxonomie des widgets
- le contrat de chaque widget
- la différence entre widget d'information, widget d'action et widget d'alerte
- la profondeur de personnalisation autorisée par rôle

Règle à imposer:

- un widget est un composant métier gouverné comme une mini-route
- il déclare module source, permissions requises, niveau de criticité, fréquence de rafraîchissement, type de données, et action de drill-down

### Tiers

La vue actuelle est bien adaptée.
Le pattern master-detail panneau latéral est pertinent pour:

- sociétés
- contacts
- blocs
- références externes

Je ne recommande pas de changement majeur de structure.
Le vrai enjeu n'est pas visuel, mais sécurité et lisibilité des statuts.

### Projets

La vue actuelle est utilisable, mais elle risque vite la surcharge.
Un projet concentre:

- données de base
- membres
- tâches
- jalons
- dépendances
- deliverables
- actions
- révisions

Le panneau latéral reste utile, mais il faut éviter qu'un seul écran devienne un "ERP infini".

Recommandation:

- garder la page projet comme hub
- segmenter en sous-vues métier explicites
- réserver le panneau aux actions courtes et aux détails ciblés

### Planner

Le Planner n'est pas seulement un module CRUD.
C'est un module d'arbitrage visuel.

Le fait d'avoir:

- gantt
- activités
- conflits
- capacité

est juste.
Mais le Planner doit avoir comme vue dominante les vues de pilotage:

- Gantt
- heatmap capacité
- conflit board
- impact preview

Le tableau simple doit devenir la vue de support, pas la vue identitaire du module.

### PaxLog

PaxLog est le module le plus dense fonctionnellement:

- profils
- AdS
- AVM
- compliance
- incidents
- rotations

Le risque actuel est de tout faire tenir dans une seule page à onglets, avec trop de contextes différents.

Recommandation forte:

- garder un hub PaxLog
- mais séparer clairement:
  - opérations d'entrée/séjour/sortie
  - gestion des profils
  - contrôle conformité
  - supervision mission/AVM

La vue centrale du module doit devenir le cycle de séjour, pas seulement une collection d'onglets CRUD.

### TravelWiz

TravelWiz est déjà plus proche de la bonne direction:

- voyages
- manifestes
- cargo
- vecteurs
- carte flotte
- météo
- ramassage

Mais il faut aller au bout de la logique.
TravelWiz doit être conçu comme une salle d'exploitation:

- vue mouvement
- vue manifestes
- vue cargo
- vue exceptions
- vue météo/impact

La table seule ne suffit pas comme vue primaire.

### Conformité

Le module est bien cadré côté logique, mais l'UI doit mieux séparer:

- ce qui est conforme
- ce qui est incomplet
- ce qui est expiré
- ce qui est en attente de vérification humaine
- ce qui est bloquant pour une opération

Aujourd'hui, le danger est de mélanger "document présent" et "document réellement validé".

## 3.3 Règle UI transversale à imposer

Il faut maintenant reconnaître trois familles de vues:

### Vue Référentiel

Pour:

- Tiers
- Users
- Assets
- Réglages
- bibliothèques

Pattern:

- table + filtres + panneau de détail

### Vue Pilotage

Pour:

- Dashboard
- Planner
- PaxLog opérations
- TravelWiz
- Conformité supervision

Pattern:

- KPI
- timeline / board / agenda / heatmap / map
- focus sur alertes, statuts, impacts, arbitrages

### Vue Transactionnelle

Pour:

- création d'AdS
- préparation d'AVM
- validation manifeste
- saisie cargo
- vérification conformité

Pattern:

- formulaire guidé
- étapes explicites
- validation forte
- résumé avant confirmation

Conclusion UI:

- votre socle UI n'est pas mauvais
- il est même bon pour le back-office
- il doit maintenant être complété par des vues de pilotage spécialisées pour les modules les plus opérationnels

## 4. Audit des portails publics et liens sécurisés

## 4.1 Ce qui existe déjà

Le produit a déjà plusieurs mécanismes d'accès externe:

- lien externe PaxLog pour saisie par tiers
- partage public de document dans Report Editor
- mode TV pour Dashboard
- portail capitaine TravelWiz
- annonces publiques Messaging

Donc le concept n'est pas absent.
Au contraire, il est déjà diffus dans plusieurs modules.

## 4.2 Le vrai problème

Le problème est l'absence de doctrine unique.

Aujourd'hui, plusieurs variantes coexistent:

- token simple
- token avec OTP possible
- token avec limite d'accès
- code capitaine
- accès public anonyme type TV

Conceptuellement c'est intéressant.
Techniquement, ce n'est pas encore assez unifié.

## 4.3 Problèmes observés

### Tokens stockés en clair

Les modèles actuels stockent des tokens bruts:

- `ShareLink.token`
- `PaxExternalLink.token`
- `Dashboard.tv_token`

Pour un système "security first", ce n'est pas acceptable comme doctrine cible.

Règle à imposer:

- ne jamais stocker le secret brut
- stocker un hash
- n'afficher le secret complet qu'à la création

### Flux OTP incomplet ou implicite

Le lien PaxLog expose `otp_required`, mais l'endpoint public retourne encore directement des données sans challenge OTP complet.
Le partage document retourne `401 if OTP required`, mais la séquence opérationnelle complète n'est pas encore standardisée comme politique transverse.

Règle à imposer:

- chaque accès externe a un état d'authentification externe explicite:
  - token valide
  - OTP validé
  - session externe ouverte
  - session externe expirée

### Portail capitaine non verrouillé

Le code indique explicitement que certaines routes capitaine devraient valider une vraie session, mais ne le font pas encore.
Le commentaire "in production, this should validate a captain session token" est un drapeau rouge.

Règle à imposer:

- aucune route externe opérationnelle ne doit exposer une ressource métier directe sur simple identifiant de voyage

### Absence de classification des liens

Tous les liens externes n'ont pas la même criticité.
Il faut au minimum classer:

- lecture publique non sensible
- lecture authentifiée légère
- contribution externe contrôlée
- action opérationnelle forte

## 4.4 Architecture cible à imposer

Créer un sous-système unifié `external_access` avec:

- type d'accès
- resource_type
- resource_id
- entity_id
- secret_hash
- expires_at
- max_uses
- use_count
- otp_required
- password_required
- allowed_ip_ranges optionnel
- scope de permissions externes
- session externe dérivée
- révocation
- journal d'accès

Et une politique de plateforme:

### Public Display

Exemple:

- dashboard TV

Caractéristiques:

- lecture seule
- aucun PII
- rotation de token
- durée courte

### Secure External Read

Exemple:

- partage de document

Caractéristiques:

- token + expiration
- OTP ou mot de passe selon sensibilité
- journal d'accès

### Secure External Contribution

Exemple:

- tiers qui complète des données PaxLog

Caractéristiques:

- token + OTP obligatoire
- champ autorisés strictement limités
- écriture bornée
- workflow de validation interne derrière

### Operational External Portal

Exemple:

- portail capitaine

Caractéristiques:

- authentification dédiée
- session courte
- journal d'événements
- périmètre strict
- révocation immédiate

Conclusion portail:

- le concept est là
- il n'est pas encore assez normalisé
- il faut le transformer en composant Core transversal

## 5. Audit de la conformité temps réel

## 5.1 Ce qui existe réellement

La conformité n'est pas un simple champ booléen.
Le système possède déjà:

- règles
- records
- vérification humaine
- exemptions
- expiration
- connecteurs externes
- événements
- notifications
- invalidation cache

Le endpoint `check_compliance` est déjà riche:

- vérification compte
- règles permanentes
- règles contextuelles
- distinction local / externe / both
- records non vérifiés comptés comme non conformes

Cela montre que la logique métier est sérieuse.

## 5.2 Ce que "temps réel" veut dire aujourd'hui

Aujourd'hui, le temps réel est surtout:

- événement produit
- notification envoyée
- invalidation cache diffusée
- client qui recharge

Ce n'est pas encore un "state streaming" complet de tous les objets.

Donc la réponse honnête est:

- oui, il y a déjà du temps réel utile
- non, ce n'est pas encore un modèle entièrement explicite et uniforme de temps réel métier

## 5.3 Risques de confusion

### Conforme vs validé

Un record peut exister sans être exploitable.
Le système le sait déjà, mais l'UI doit le rendre impossible à mal interpréter.

Règle à imposer:

- ne jamais afficher "conforme" si le record est seulement présent ou pending

### Check ponctuel vs état continu

Aujourd'hui, plusieurs modules peuvent appeler la conformité sous des angles différents:

- PaxLog pour AdS
- Conformité pour contrôle
- Dashboard pour KPI
- Planner potentiellement pour arbitrage

Il faut une source unique de vérité calculée.

Règle à imposer:

- une fonction de décision commune:
  - `is owner compliant for context X at time T`

Cette fonction doit être la seule base pour:

- autoriser une AdS
- empêcher un embarquement
- déclencher une alerte dashboard
- bloquer une assignation Planner si nécessaire

### Temps réel de supervision vs temps réel de décision

Il faut distinguer:

- l'actualisation des écrans
- la validité métier opposable

Une interface peut être à jour visuellement, mais une décision métier doit revalider au moment de l'action.

Règle à imposer:

- toute action critique doit refaire un contrôle serveur à l'instant T

## 5.4 Architecture cible conformité

La conformité temps réel doit être définie comme:

- calculée côté serveur
- contextualisée
- horodatée
- explicable
- rejouable

Chaque résultat de contrôle devrait fournir:

- verdict global
- statut du compte
- liste des exigences requises
- statut par exigence
- source locale/externe
- date de calcul
- raisons bloquantes
- recommandation métier

## 6. Notifications, emails et temps réel

## 6.1 Ce qui est clair

Le socle existe vraiment:

- notifications in-app
- websocket JWT
- Redis pub/sub
- templates email
- envoi SMTP
- digest

## 6.2 Ce qui n'est pas encore assez mature

### Notifications comme "produit"

Il manque encore une doctrine transverse:

- quand on notifie
- à qui
- avec quel niveau de priorité
- par quel canal
- avec quelle obligation d'accusé / action

### Email queue

Le fait d'utiliser la table `notifications` comme support de queue email fonctionne, mais ce n'est pas encore une architecture nette à long terme.

### Temps réel métier généralisé

Le websocket est réel, mais il sert surtout:

- notifications
- invalidation cache

Pas encore un vrai bus de présence opérationnelle généralisé pour Planner, PaxLog, TravelWiz.

## 6.3 Règle à imposer

Définir 4 niveaux d'événements:

- `info`
- `action_required`
- `blocking`
- `critical_broadcast`

Et 4 niveaux de diffusion:

- in-app
- email
- websocket push
- dashboard alert widget

## 7. Sécurité fonctionnelle et angles morts

## 7.1 Ce qui est solide

- JWT
- MFA
- lockout
- rate limiting
- audit
- RBAC réel
- websocket authentifié

## 7.2 Ce qui reste bloquant

### Multi-tenant

Le point reste critique.
Tant que le schéma actif peut être influencé côté requête et que le fallback `public` existe, vous n'êtes pas au niveau "security first" cible.

### Liens externes

Tant que les secrets sont stockés en clair et que certains parcours externes ne valident pas une vraie session bornée, il reste un risque sérieux.

### Permissions de lecture

Tant que plusieurs modules exposent des endpoints GET sans permission explicite, le système n'est pas homogène.

### Fail-open

Les comportements de sécurité qui "laissent passer si le provider échoue" doivent disparaître des chemins critiques.

## 8. Règles de plateforme à inscrire maintenant

### 8.1 Règles UI

1. Un module doit déclarer son type de vue dominante: référentiel, pilotage ou transactionnelle.
2. Les modules de pilotage ne peuvent pas se limiter à table + panneau.
3. Tout statut critique doit être lisible sans dépendre uniquement de la couleur.
4. Tout écran métier doit séparer clairement information, alerte, blocage, action.

### 8.2 Règles portail externe

1. Aucun token brut stocké en base.
2. Toute contribution externe impose token + OTP.
3. Toute action externe opérationnelle impose une session externe dédiée.
4. Toute ressource externe doit avoir journal d'accès, révocation et durée de vie courte.
5. Aucun endpoint externe ne doit s'appuyer uniquement sur un identifiant métier prédictible.

### 8.3 Règles conformité

1. Un document non vérifié ne compte pas comme conforme.
2. Toute décision critique relance un contrôle serveur au moment de l'action.
3. Les résultats de conformité doivent être explicables et contextualisés.
4. Dashboard, PaxLog, Planner et TravelWiz doivent partager la même source de vérité conformité.

### 8.4 Règles temps réel

1. Définir ce qui relève du push, du refresh et de la validation serveur finale.
2. Un événement temps réel ne remplace jamais un contrôle d'autorisation.
3. Les écrans critiques doivent recevoir soit un push structuré, soit une invalidation standardisée, jamais un mélange implicite.

## 9. Ce qui doit être fait avant de dire "c'est clair"

1. Formaliser le framework unique d'accès externe.
2. Formaliser la taxonomie des vues par module.
3. Formaliser le contrat des widgets dashboard.
4. Créer la fonction serveur unique de décision conformité contextuelle.
5. Fermer les endpoints externes "temporaires" non sessionnés.
6. Uniformiser les permissions de lecture.
7. Définir la matrice officielle des événements temps réel par module.

## 10. Conclusion opérationnelle

Votre vision produit est claire.
Le système actuel va déjà dans cette direction.

Mais il y a encore quatre sujets qui doivent passer du niveau "bonne idée présente dans le code" au niveau "règle de plateforme verrouillée":

- la spécialisation des vues UI des modules opérationnels
- la sécurité et l'unification des portails externes
- la définition opposable de la conformité temps réel
- la doctrine globale de temps réel / notifications / actions critiques

Tant que ces quatre sujets ne sont pas normalisés, vous pouvez continuer à développer, mais vous resterez exposé à:

- des ambiguïtés fonctionnelles
- des écarts d'implémentation entre modules
- des erreurs d'usage côté métier
- des trous de sécurité non intentionnels

La bonne nouvelle est que rien de tout cela n'impose une réécriture générale.
Cela impose surtout une consolidation de règles Core, puis l'alignement progressif des modules.

## 11. Arbitrages métier confirmés

Les arbitrages suivants sont désormais considérés comme actés.

### 11.1 Portail externe PaxLog

Un tiers externe via lien sécurisé doit pouvoir:

- compléter des données
- soumettre un dossier
- re-soumettre un dossier déjà engagé après retour ou demande de correction

Conséquence produit:

- le lien externe n'est pas une simple consultation
- c'est un canal de contribution contrôlée
- il doit donc être traité comme un mini-workflow externe sessionné

Règles complémentaires:

- le formulaire externe n'expose que les champs autorisés
- toute soumission externe repasse dans un contrôle interne
- toute re-soumission doit être historisée comme nouvelle itération, pas comme écrasement silencieux

### 11.2 Portail terrain / signage opérationnel

L'ancien "portail capitaine" ne doit pas être pensé comme une application avec navigation classique.
La bonne logique est un portail terrain de type:

- signage
- poste opérationnel simplifié
- mini-SCADA métier

Objectif:

- affichage immédiat
- très peu d'actions
- aucune recherche complexe
- aucun empilement d'onglets

Le portail terrain doit montrer en priorité:

- prochain mouvement
- manifeste courant
- alertes critiques
- action primaire disponible
- état météo / opération si utile

Règle de conception:

- un écran = une mission opérationnelle claire
- pas de navigation profonde
- pas d'architecture "ERP miniature"

### 11.3 PaxLog orienté demandeur

Pour un utilisateur standard, l'entrée dans PaxLog n'est pas:

- la configuration
- la conformité avancée
- l'administration des profils

L'entrée principale est:

- faire une demande de séjour
- faire un avis de mission

Conséquence UI:

- la home PaxLog d'un utilisateur lambda doit prioriser `Nouvelle AdS` et `Nouvel avis de mission`
- les écrans de validation, configuration, conformité détaillée, incidents et opérations avancées doivent être conditionnés par rôle

### 11.4 Rôles forts et permissions fines

Le système cible doit fonctionner ainsi:

- les permissions fines contrôlent techniquement les accès
- les rôles forts déterminent les parcours visibles et les écrans dominants

Donc:

- deux utilisateurs ayant la même permission technique mais des rôles métier différents ne doivent pas nécessairement voir la même page d'accueil module
- la permission autorise
- le rôle oriente l'expérience

Exemple pour PaxLog:

- demandeur standard: création et suivi de ses AdS / avis de mission
- valideur conformité: file de vérification, blocages, pièces à revoir
- superviseur mouvement: vue séjours en cours, mouvements, exceptions
- admin/module owner: configuration, matrices, règles, incidents, maintenance des référentiels
