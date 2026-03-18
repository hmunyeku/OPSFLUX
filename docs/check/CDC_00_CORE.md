# Cahier des Charges Fonctionnel — Core OpsFlux

> Ce document décrit le comportement attendu du cœur d'OpsFlux : authentification,
> gestion des utilisateurs, droits d'accès, notifications, et administration système.
> Il ne traite pas des aspects techniques d'implémentation.

---

## Sommaire

1. [Accès et authentification](#1-accès-et-authentification)
2. [Gestion des utilisateurs](#2-gestion-des-utilisateurs)
3. [Droits et permissions (RBAC)](#3-droits-et-permissions-rbac)
4. [Délégations](#4-délégations)
5. [Notifications](#5-notifications)
6. [Paramètres et préférences](#6-paramètres-et-préférences)
7. [Audit et traçabilité](#7-audit-et-traçabilité)
8. [Administration système](#8-administration-système)

---

## 1. Accès et authentification

### 1.1 Qui peut accéder à OpsFlux ?

OpsFlux distingue trois types d'accès :

**Employés Perenco** — Ils se connectent avec leurs identifiants d'entreprise existants (Active Directory / Azure AD). Ils ne créent pas de mot de passe OpsFlux. À leur première connexion, leur compte est créé automatiquement en arrière-plan. Ils n'ont pas à demander de compte.

**Prestataires externes récurrents** — Certains prestataires ont besoin d'un accès régulier à OpsFlux (pour consulter leurs AdS, uploader des documents). Un administrateur leur envoie une invitation par email. Ils créent un mot de passe OpsFlux et accèdent avec des droits limités.

**Capitaines / portails ponctuels** — L'accès au portail capitaine ou au portail Tiers se fait sans compte OpsFlux, via un code à usage limité ou un lien sécurisé à durée de vie. Ces accès sont décrits dans les modules TravelWiz et PaxLog.

### 1.2 Connexion des employés Perenco

Le processus est transparent pour l'utilisateur :
1. Il clique "Se connecter avec Perenco"
2. Il est redirigé vers la page de connexion intranet Perenco qu'il connaît déjà
3. Il entre ses identifiants habituels
4. Il revient sur OpsFlux, connecté

L'employé **ne crée pas de mot de passe OpsFlux** et **n'a pas à se souvenir d'un identifiant supplémentaire**. Son accès OpsFlux suit automatiquement son statut dans le système Perenco : si son compte intranet est désactivé (départ, mutation), son accès OpsFlux est automatiquement révoqué à la prochaine synchronisation.

### 1.3 Provisionnement automatique (premier accès)

Lors de la toute première connexion d'un employé :
- Son profil utilisateur OpsFlux est créé automatiquement
- Son profil PAX (pour PaxLog) est créé ou lié s'il existe déjà
- Il est affecté au groupe par défaut de son département (si configuré)
- Il reçoit un email de bienvenue avec un guide d'utilisation

Un employé peut se connecter le jour de sa première visite sans aucune intervention d'un administrateur.

### 1.4 Connexion des externes par invitation

Un administrateur génère une invitation email pour le prestataire. L'invitation contient un lien valide pendant 72 heures (configurable). En cliquant sur ce lien, le prestataire :
1. Crée son mot de passe OpsFlux
2. Son compte est activé avec les droits prédéfinis
3. Il peut se connecter avec son email et ce mot de passe

Les comptes externes peuvent avoir une date d'expiration. Passé cette date, le compte est automatiquement désactivé.

### 1.5 Sécurité des sessions

La session OpsFlux d'un employé Perenco est valide pendant la durée configurée (par défaut 8 heures). Après ce délai, l'employé est automatiquement redirigé vers la page de connexion intranet — il n'a pas à retaper son mot de passe si sa session intranet est encore active.

La déconnexion depuis OpsFlux déconnecte également la session intranet si le Single Logout est activé.

Un administrateur peut révoquer immédiatement toutes les sessions d'un utilisateur (en cas de départ urgent, d'incident de sécurité).

### 1.6 Mots de passe (comptes locaux uniquement)

Les règles de mot de passe s'appliquent uniquement aux comptes locaux (prestataires externes). Les employés Perenco utilisent leur politique de mot de passe intranet.

Règles par défaut : minimum 12 caractères, au moins un chiffre, au moins un caractère spécial. Après 5 tentatives échouées, le compte est verrouillé pendant 15 minutes.

---

## 2. Gestion des utilisateurs

### 2.1 Qui peut gérer les utilisateurs ?

| Action | SYS_ADMIN | DO | RH |
|---|:---:|:---:|:---:|
| Voir la liste des utilisateurs | ✓ | ✓ | — |
| Créer un compte externe | ✓ | — | — |
| Modifier les groupes d'un utilisateur | ✓ | — | — |
| Désactiver un compte | ✓ | — | — |
| Voir l'historique de connexion | ✓ | — | — |

### 2.2 Fiche d'un utilisateur

Chaque compte OpsFlux contient :
- Identité : nom, prénom, email
- Type : interne (Perenco) ou externe (prestataire invité)
- Statut : actif, suspendu, désactivé
- Groupes d'appartenance (qui définissent ses droits)
- Date de création, dernière connexion
- Date d'expiration (pour les externes uniquement)
- Historique des connexions (IP, date, succès/échec)

### 2.3 Synchronisation avec l'intranet Perenco

Toutes les 4 heures, OpsFlux synchronise les employés depuis l'intranet Perenco. La synchronisation met à jour les données personnelles (nom, département, poste) et gère les départs :

Quand un employé quitte Perenco et que son compte intranet est désactivé, OpsFlux détecte l'absence lors de 2 cycles consécutifs et désactive automatiquement son compte. Toutes ses AdS actives passent en `requires_review`, ses sessions sont révoquées, et son chef de département est notifié.

Les données mises à jour automatiquement (nom, département) ne peuvent pas être modifiées manuellement dans OpsFlux — elles sont systématiquement écrasées par la synchronisation.

---

## 3. Droits et permissions (RBAC)

### 3.1 Principe général

Les droits dans OpsFlux fonctionnent par **groupes**. Un utilisateur n'a jamais de droits directs — il obtient ses droits en étant membre d'un ou plusieurs groupes. Chaque groupe est associé à un rôle qui définit un ensemble de permissions.

Un utilisateur peut appartenir à plusieurs groupes. Ses droits sont l'**union** de tous ses groupes — les droits s'accumulent, ne s'annulent pas.

Exemple concret : Marie est CDS du site Munja (elle valide les AdS pour Munja) et LOG_BASE de la base Wouri (elle gère la logistique à Wouri). Elle a les deux ensembles de droits, chacun limité à son périmètre géographique.

### 3.2 Périmètre géographique (asset_scope)

Un groupe peut être limité à un périmètre géographique spécifique. Un CDS avec un scope sur "Munja" ne peut valider que les AdS pour Munja — il ne voit pas les AdS destinées à ESF1.

Sans scope, le groupe donne des droits sur **tous les assets** de l'entité.

### 3.3 Les rôles disponibles

OpsFlux est livré avec les rôles suivants, reflétant l'organisation Perenco Cameroun :

**Direction et arbitrage :**
- **DO** (Directeur Opérations) — voit tout, arbitre les conflits de capacité, peut approuver en urgence
- **DPROD** (Directeur Production) — gère les activités de production sur les champs
- **DQHSE** (Directeur QHSE) — définit la politique HSE, valide les signalements majeurs
- **DPROJ** (Directeur Projets) — supervise le portefeuille de projets

**Opérationnel site :**
- **CDS** (Chef de Site) — valide les AdS pour son site, voit la capacité et les PAX présents
- **OMAA** (Agent logistique site) — pointe les PAX sur son site, gère le cargo intra-site
- **HSE_SITE** (Référent HSE terrain) — valide les certifications, signale les incidents

**Logistique base :**
- **LOG_BASE** (Logistique base) — gère les manifestes, les voyages, la flotte de vecteurs
- **TRANSP_COORD** (Coordinateur transport) — coordonne les vecteurs, les circuits de ramassage
- **PILOTE** (Capitaine / pilote) — accès portail capitaine uniquement, pointe les PAX à bord

**Projets et HSE :**
- **CHEF_PROJET** (Chef de projet) — gère ses projets, valide les AdS liées à ses tâches
- **CHSE** (Coordinateur HSE) — valide les certifications PAX, gère la compliance

**Médical :**
- **CMEDIC** (Coordinateur médical) — supervise les aptitudes médicales
- **MEDIC** (Médecin site) — accède aux données de santé, valide les aptitudes

**Autres :**
- **DEMANDEUR** — employé Perenco standard, crée des AdS pour lui-même ou son équipe
- **EXT_SUPV** (Superviseur externe) — accès limité via portail, gère son équipe prestataire
- **READER** — lecture seule, aucune modification possible

### 3.4 Ce que chaque rôle peut faire — vue d'ensemble

| Capacité | DO | CDS | LOG_BASE | CHEF_PROJ | CHSE | DEMANDEUR |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Créer une AdS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Valider une AdS | ✓ | ✓ | — | ✓* | ✓* | — |
| Arbitrer un conflit Planner | ✓ | — | — | — | — | — |
| Créer un projet | ✓ | — | — | ✓ | — | — |
| Planifier une activité site | ✓ | ✓ | — | ✓ | — | — |
| Créer un voyage / manifeste | ✓ | — | ✓ | — | — | — |
| Valider des certifications PAX | ✓ | — | — | — | ✓ | — |
| Créer un signalement | ✓ | ✓ | — | — | ✓ | — |
| Blacklister un Tiers | ✓ | — | — | — | ✓ | — |

*dans leur périmètre

### 3.5 Administration des rôles

Un SYS_ADMIN peut :
- Créer de nouveaux groupes basés sur les rôles existants
- Affecter et retirer des utilisateurs dans des groupes
- Créer de nouveaux rôles avec des combinaisons de permissions personnalisées
- Définir le périmètre géographique d'un groupe

Un administrateur ne peut pas supprimer les rôles système.

---

## 4. Délégations

### 4.1 Pourquoi les délégations ?

Dans OpsFlux, certains rôles sont des **validateurs** : les CDS valident les AdS, les chefs de projet valident les activités Planner, etc. Si un validateur est absent (congé, mission, arrêt maladie), les demandes en attente de sa validation sont bloquées.

Les délégations permettent à un validateur de désigner un remplaçant pour une période définie.

### 4.2 Comment déléguer

Avant de partir en congé, le validateur accède à son profil et crée une délégation :
- **Remplaçant** : un autre utilisateur ayant le même rôle sur le même périmètre
- **Dates** : début et fin de la délégation
- **Portée** : uniquement les nouvelles demandes, ou aussi les demandes déjà en attente au moment de la délégation

Le remplaçant reçoit une notification "Vous avez été désigné remplaçant de [nom] du [date] au [date]".

### 4.3 Comportement pendant la délégation

Pendant la période de délégation :
- Les nouvelles demandes sont envoyées au remplaçant
- Les notifications portent la mention "En tant que remplaçant de [nom]"
- Le remplaçant agit avec les mêmes droits que le délégant pour la validation
- Chaque action du remplaçant est tracée avec une référence à la délégation

Si le délégant revient plus tôt, il peut mettre fin à la délégation manuellement.

### 4.4 Contraintes

Un remplaçant doit avoir le même rôle sur le même périmètre géographique. On ne peut pas désigner un CDS de Munja comme remplaçant d'un CDS d'ESF1.

Un utilisateur peut être remplaçant de plusieurs personnes simultanément.

---

## 5. Notifications

### 5.1 Les deux canaux de notification

OpsFlux notifie les utilisateurs par deux canaux :

**Notifications in-app** — Une cloche dans l'interface affiche le nombre de notifications non lues. En cliquant, l'utilisateur voit la liste de ses notifications avec la date, le type, et un lien vers l'objet concerné. Les notifications disparaissent du compteur quand elles sont marquées comme lues.

**Notifications email** — Un email est envoyé pour les événements importants ou quand l'utilisateur est absent de l'interface. Les emails contiennent un lien direct vers l'objet concerné.

Chaque utilisateur peut choisir quels types de notification il reçoit par email (paramètres personnels).

### 5.2 Événements qui déclenchent une notification

**PaxLog :**
- AdS soumise → validateur notifié
- AdS approuvée / rejetée → demandeur notifié
- AdS passée en `requires_review` → demandeur notifié
- Certification expirée ou proche de l'expiration → PAX et responsable notifiés
- Signalement validé → demandeur et PAX concernés notifiés

**Planner :**
- Activité soumise → validateur notifié
- Conflit de capacité détecté → DO notifié
- Planning modifié affectant un autre projet → chef de projet impacté notifié

**TravelWiz :**
- Voyage retardé → PAX du manifeste + LOG_BASE notifiés
- Manifeste validé → PAX notifiés avec détail du voyage
- Colis livré → expéditeur notifié

**Projets :**
- Tâche assignée → assigné notifié
- Tâche en retard (J-7 puis J-1) → assigné notifié
- @mention dans un commentaire → personne mentionnée notifiée

### 5.3 Préférences de notification

Par défaut, tout utilisateur reçoit les notifications in-app et email pour les événements qui le concernent directement (ses demandes, ses tâches, son équipe).

L'utilisateur peut désactiver les emails pour certains types d'événements depuis ses paramètres. Les notifications in-app ne peuvent pas être désactivées (elles constituent l'interface de travail).

---

## 6. Paramètres et préférences

### 6.1 Paramètres tenant (partagés pour toute l'organisation)

Un SYS_ADMIN configure les paramètres qui s'appliquent à tous les utilisateurs de l'organisation :
- Langue par défaut et langues disponibles
- Fuseau horaire
- Format de date (JJ/MM/AAAA, MM/JJ/AAAA, AAAA-MM-JJ)
- Logo et couleurs des emails
- Comportement par défaut des modules (durées d'expiration, seuils d'alerte, etc.)

### 6.2 Préférences personnelles

Chaque utilisateur peut personaliser son expérience :
- Thème de l'interface (clair, sombre, automatique)
- Langue (si d'autres langues sont activées par le tenant)
- Taille des pages dans les listes
- Tableau de bord affiché à la page d'accueil
- Activation/désactivation des notifications email par type
- Format d'export par défaut (PDF ou Word)

Ces préférences sont sauvegardées et retrouvées sur tous les appareils.

---

## 7. Audit et traçabilité

### 7.1 Ce qui est tracé

OpsFlux conserve un journal d'audit de toutes les actions importantes. Chaque enregistrement contient :
- **Qui** a effectué l'action (nom + rôle)
- **Quand** (horodatage précis en UTC)
- **Sur quoi** (module + type d'objet + identifiant)
- **Quoi** (type d'action : création, modification, validation, rejet, suppression)
- **Avant / Après** (valeur précédente et nouvelle valeur pour les modifications)
- **Contexte** (si c'était une délégation, quel appareil, quelle IP)

### 7.2 Accès au journal

**Onglet "Historique" sur chaque fiche** — Chaque AdS, chaque projet, chaque voyage, chaque colis possède un onglet historique. Il montre toutes les actions effectuées sur cet objet, accessibles selon les droits de l'utilisateur sur cet objet.

**Journal global** — Le DO et le SYS_ADMIN accèdent à un journal global de toutes les actions du système, filtrable par module, par utilisateur, par période. Ce journal est exportable en CSV.

### 7.3 Conservation

Les journaux d'audit sont conservés pendant 7 ans. Ils ne peuvent pas être modifiés ou supprimés, même par un SYS_ADMIN.

---

## 8. Administration système

### 8.1 Bootstrap — premier démarrage

Au premier démarrage d'OpsFlux, le système est vide. Un mécanisme spécial (bootstrap) permet à un administrateur de créer le premier compte super-admin avec un code secret temporaire. Ce mécanisme est désactivé dès que le premier compte est créé — il ne peut plus être utilisé.

### 8.2 Gestion de l'organisation (tenant)

L'administrateur configure l'organisation :
- Nom de l'organisation
- Logo
- Fuseau horaire et langue par défaut
- Modules activés / désactivés
- Intégration SSO (connexion à l'Active Directory Perenco)
- Paramètres d'expiration et de sécurité

### 8.3 Onboarding initial

La séquence recommandée pour mettre OpsFlux en service :
1. Configurer le SSO (connexion à l'intranet Perenco)
2. Importer la hiérarchie des assets (sites, plateformes, bases)
3. Créer les groupes et y affecter les utilisateurs clés
4. Configurer les types de certifications HSE
5. Importer les profils PAX existants
6. Importer le catalogue articles SAP
7. Créer les vecteurs de transport
8. Configurer les rotations périodiques
9. Créer les projets en cours

### 8.4 Tableau de bord santé du système

Un tableau de bord d'administration affiche en temps réel :
- Statut des services (base de données, cache, stockage de fichiers, IA)
- Utilisation du stockage
- Nombre de connexions actives
- Âge du dernier backup
- Alertes de dépassement de capacité

Des alertes automatiques sont envoyées aux super-admins quand des seuils critiques sont atteints (stockage > 80%, backup manqué, etc.).
