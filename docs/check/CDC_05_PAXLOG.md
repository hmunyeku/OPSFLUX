# Cahier des Charges Fonctionnel — Module PaxLog

> Ce document décrit la gestion complète de la mobilisation du personnel sur les
> sites industriels Perenco : profils, certifications, demandes de séjour,
> compliance HSE, signalements, et avis de mission.

---

## Sommaire

1. [Rôle et périmètre](#1-rôle-et-périmètre)
2. [Les profils PAX](#2-les-profils-pax)
3. [Certifications et compliance HSE](#3-certifications-et-compliance-hse)
4. [L'Avis de Séjour (AdS) — le circuit complet](#4-lavis-de-séjour-ads--le-circuit-complet)
5. [Workflow de validation](#5-workflow-de-validation)
6. [Gestion des cas particuliers](#6-gestion-des-cas-particuliers)
7. [Programme de Séjour (intra-champ)](#7-programme-de-séjour-intra-champ)
8. [Cycles de rotation](#8-cycles-de-rotation)
9. [Signalements](#9-signalements)
10. [Avis de Mission (AVM)](#10-avis-de-mission-avm)
11. [Portail externe superviseur](#11-portail-externe-superviseur)
12. [Permissions](#12-permissions)

---

## 1. Rôle et périmètre

PaxLog gère la **mobilisation du personnel sur les sites industriels**. Il répond à la question : "Qui est autorisé à être sur quel site, pour quelle raison, et pendant combien de temps ?"

**La règle absolue** : Sans demande approuvée dans PaxLog, personne ne monte sur site. PaxLog est la porte d'entrée de toute présence physique sur les installations.

PaxLog couvre :
- La gestion des profils des personnes susceptibles d'intervenir sur site (employés Perenco et sous-traitants)
- La vérification des prérequis HSE (certifications de sécurité)
- Les demandes d'autorisation d'accès (Avis de Séjour)
- La détection et gestion des anomalies de compliance
- Les signalements d'incidents ou de comportements
- L'orchestration des missions complexes (Avis de Mission)

---

## 2. Les profils PAX

### 2.1 Qu'est-ce qu'un profil PAX ?

Un profil PAX est la **fiche d'identité opérationnelle** d'une personne susceptible d'intervenir sur site. Il est distinct du compte utilisateur OpsFlux :
- Un employé Perenco a un compte OpsFlux **et** un profil PAX liés
- Un sous-traitant externe a un profil PAX **sans** compte OpsFlux
- Un profil PAX peut être créé à l'avance, avant que la personne ne soit jamais venue sur site

Le profil PAX contient :
- Identité complète (nom, prénom, date de naissance, nationalité)
- Photo d'identité
- Entreprise d'appartenance
- Badge / matricule
- Toutes ses certifications de sécurité avec leurs dates d'expiration
- Son statut de compliance pour chaque site
- L'historique de toutes ses présences sur site

### 2.2 Employés Perenco — synchronisation automatique

Les profils des employés Perenco sont synchronisés automatiquement depuis l'annuaire intranet. Un employé n'a pas besoin d'être créé manuellement — il apparaît dans OpsFlux dès sa première connexion ou lors de la synchronisation planifiée.

Les données synchronisées (nom, département, poste) ne peuvent pas être modifiées manuellement dans OpsFlux. Elles sont toujours écrasées par la prochaine synchronisation.

Quand un employé quitte Perenco et que son compte intranet est désactivé, OpsFlux suspend son profil PAX automatiquement et passe toutes ses AdS actives en statut "nécessite révision".

### 2.3 Sous-traitants — création manuelle avec déduplication

Les profils des sous-traitants sont créés manuellement (par un administrateur ou par le superviseur de l'entreprise via le portail externe).

Pour éviter les doublons (le même technicien créé plusieurs fois avec des variantes de son nom), OpsFlux applique un algorithme de recherche phonétique. Avant de créer un profil, le système cherche des personnes similaires et propose de lier ou de fusionner si le nom + prénom + date de naissance correspondent.

**3 cas possibles :**
- Aucune ressemblance → création normale
- Ressemblance modérée → le système affiche les profils similaires et demande confirmation ("Voulez-vous utiliser ce profil existant ?")
- Forte ressemblance dans la même entreprise → fusion automatique proposée
- Forte ressemblance dans une entreprise différente → alerte au validateur (même personne qui travaille pour plusieurs entreprises ?)

### 2.4 Score de complétude

Chaque profil a un score de complétude automatique qui mesure si les données essentielles sont renseignées. Un profil incomplet peut exister et être utilisé dans une AdS, mais les éléments manquants seront bloquants lors de la vérification HSE.

---

## 3. Certifications et compliance HSE

### 3.1 Types de certifications

L'administrateur HSE définit le catalogue des certifications reconnues par Perenco. Chaque type de certification a :
- Un code et un libellé (ex : "H2S_AWARENESS", "Formation H2S Awareness")
- Une durée de validité (ex : 2 ans, ou illimité)
- Un indicateur "preuve obligatoire" (document à uploader ou simple enregistrement)

Exemples de certifications courantes sur sites pétroliers offshore :
- **H2S Awareness** : formation sur les risques du gaz sulfureux — valide 2 ans
- **BOSIET** : sécurité offshore de base (sauvetage, incendie, évacuation) — valide 4 ans
- **Aptitude médicale** : certificat médical délivré par un médecin agréé — valide 2 ans
- **HUET** : entraînement à l'évacuation d'un hélicoptère sous l'eau — valide 4 ans
- **Habilitation électrique** : selon le niveau (B1, B2, H1, etc.) — durée variable

### 3.2 Enregistrement d'une certification

Un CHSE, PAX_ADMIN, ou le superviseur externe du sous-traitant peut enregistrer une certification :
1. Sélection du type de certification
2. Saisie de la date d'obtention et de la date d'expiration
3. Upload du document justificatif
4. La certification est en attente de validation CHSE
5. Le CHSE valide (ou rejette avec motif)
6. Si validée → la certification devient effective

Un PAX ne peut pas s'auto-valider ses propres certifications.

### 3.3 Alertes d'expiration

OpsFlux surveille en continu les dates d'expiration. Quand une certification approche de son expiration :
- À J-30 : notification au PAX et au responsable HSE de son entreprise
- À J-7 : rappel urgent
- À J-0 : la certification passe "expirée" et bloque toute nouvelle AdS pour les sites qui l'exigent

Les PAX avec des certifications expirées dont les AdS sont en cours ou approuvées déclenchent une alerte sur le tableau de bord du CHSE.

### 3.4 Comment la compliance est évaluée

Pour chaque PAX et chaque site, OpsFlux calcule automatiquement le statut de compliance en comparant les certifications du PAX avec les prérequis du site. Les prérequis d'un site héritent de tous les niveaux hiérarchiques supérieurs (voir module Asset Registry §5).

**7 statuts possibles :**
1. **Conforme** : toutes les certifications requises sont valides
2. **Expire pendant le séjour** : une certification expirera avant la fin du séjour prévu
3. **Durée résiduelle insuffisante** : la certification expire trop tôt par rapport à la durée minimale requise par le site
4. **Expirée** : la certification a dépassé sa date d'expiration
5. **En période de grâce** : expirée mais dans la fenêtre de grâce autorisée par le site
6. **Non validée** : certification saisie mais pas encore validée par le CHSE
7. **Manquante** : aucune certification de ce type n'existe pour ce PAX

### 3.5 Les 3 couches de compliance

La compliance d'un PAX pour un site donné se vérifie sur 3 niveaux :

**Couche 1 — Exigences du site** : certifications requises par l'Asset Registry pour accéder au site (H2S, BOSIET, aptitude médicale...).

**Couche 2 — Profil métier** : si le PAX intervient dans un rôle spécifique (soudeur, électricien, grutier), des certifications supplémentaires liées au métier sont requises (permis de soudage, habilitation électrique, CACES...).

**Couche 3 — Autodéclaration** : le PAX peut déclarer posséder une habilitation non encore enregistrée dans OpsFlux, en joignant un justificatif. Cette déclaration est mise en attente de validation CHSE. En attendant, elle compte comme "non validée" (non bloquante si la configuration le permet).

---

## 4. L'Avis de Séjour (AdS) — le circuit complet

### 4.1 La règle fondamentale

Toute présence physique sur un site industriel Perenco nécessite un Avis de Séjour approuvé. Sans AdS approuvée, le manifeste TravelWiz ne peut pas inclure le PAX, donc il ne peut pas embarquer.

### 4.2 Qui peut créer une AdS ?

- Un employé Perenco pour lui-même ou pour son équipe (rôle DEMANDEUR)
- Un chef de projet pour les besoins de son projet
- Un LOG_BASE pour créer des AdS d'exploitation
- Un superviseur externe via le portail (pour ses sous-traitants)

### 4.3 Contenu d'une AdS

**Pour qui :** un PAX unique ou une équipe de plusieurs PAX.

**Pour aller où :** le site de destination (sélectionné depuis l'Asset Registry).

**Pour quoi :** la catégorie de visite (projet, workover, forage, maintenance, inspection, visite simple...) et la description de l'objet de la visite.

**Quand :** les dates de début et fin de séjour prévues.

**Lien projet :** si la visite est liée à un projet et une tâche WBS, ces références sont renseignées.

**Transport :** des préférences de transport peuvent être exprimées pour l'aller et le retour indépendamment (mode de transport, point de départ préféré, notes).

### 4.4 Vérification instantanée lors de la saisie

Dès qu'un PAX est ajouté à une AdS en cours de création, OpsFlux affiche immédiatement son statut de compliance pour le site cible :
- ✓ Conforme pour ce site
- ⚠ Certification qui expire pendant le séjour (avertissement)
- ✗ Certification manquante ou expirée (bloquant)

Le demandeur voit en temps réel si sa demande pourra être approuvée ou non.

---

## 5. Workflow de validation

### 5.1 Vue d'ensemble du circuit

Une AdS soumise traverse un circuit de validation en 5 étapes potentielles selon le contexte :

```
SOUMISSION
    ↓
ÉTAPE 0-A — Validation par l'initiateur
  (si l'AdS a été créée par quelqu'un d'autre que le demandeur)
    ↓
ÉTAPE 0-B — Validation par le chef de projet
  (si l'AdS est liée à un projet ou une tâche)
    ↓
ÉTAPE 1 — Vérification compliance HSE (automatique)
    ↓
ÉTAPE 2 — Validation CDS (Chef de Site)
    ↓
ÉTAPE 3 — Validation DPROD (selon configuration du site)
    ↓
APPROUVÉE ✓
```

Toutes ces étapes ne sont pas systématiques — chacune ne s'applique que si les conditions le requièrent.

### 5.2 Étape 0-A — Validation initiateur

**Quand :** Si une personne crée une AdS pour le compte de quelqu'un d'autre (ex : un assistant administratif crée une AdS pour son directeur).

**Pourquoi :** S'assurer que le demandeur réel est bien au courant et approuve la demande faite en son nom.

**Qui valide :** La personne pour qui l'AdS est créée reçoit une notification et confirme que la demande est correcte.

**Si la personne refuse :** L'AdS est annulée.

### 5.3 Étape 0-B — Validation chef de projet

**Quand :** Si l'AdS est liée à un projet ou une tâche spécifique.

**Pourquoi :** S'assurer que la présence sur site est cohérente avec le planning du projet.

**Qui valide :** Le chef de projet (ou son délégué si absent).

**Si le chef de projet rejette :** L'AdS est définitivement rejetée. Le demandeur peut créer une nouvelle AdS s'il souhaite recourir.

**Exception :** Les AdS générées automatiquement depuis un Avis de Mission (AVM) sautent cette étape — l'AVM elle-même constitue la validation du projet.

### 5.4 Étape 1 — Vérification compliance HSE

**Automatique** — le système vérifie les certifications de chaque PAX par rapport aux prérequis du site.

**Si tous les PAX sont conformes :** Passage direct à la validation CDS.

**Si certains PAX ont des problèmes de certifications :** L'AdS entre en statut "en attente compliance". Le CHSE est notifié. L'AdS reste bloquée jusqu'à ce que les certifications soient régularisées (upload + validation) ou qu'une dérogation soit accordée par le DO.

### 5.5 Étape 2 — Validation CDS

Le Chef de Site est la première autorité de validation. Il approuve ou rejette chaque PAX individuellement (pas l'AdS en bloc).

**Approbation partielle possible :** Sur une AdS de 5 personnes, le CDS peut approuver 3 et rejeter 2. Les 2 rejetés sont définitivement exclus de cette AdS. Le demandeur peut créer une nouvelle AdS pour les 2 personnes rejetées s'il souhaite contester.

**Délégation :** Si le CDS est absent, il peut déléguer ses droits de validation à un autre utilisateur ayant le même rôle sur le même périmètre.

### 5.6 Étape 3 — Validation DPROD (optionnelle)

Un deuxième niveau de validation activable selon le type de visite ou la politique du site. Même logique que le CDS.

### 5.7 Statut "nécessite révision"

Une AdS approuvée peut revenir en statut "nécessite révision" suite à des événements post-approbation :
- Une certification d'un PAX expire
- L'activité Planner liée est annulée ou reportée
- Un signalement d'exclusion de site est émis pour un des PAX
- L'OMAA signale une absence non confirmée

Le demandeur est notifié et doit resoumettre l'AdS avec un motif. L'AdS repart en circuit de validation depuis le début.

**Exception :** Si la personne est déjà sur site (AdS "en cours"), la resoumission va directement devant le CDS — pas besoin de repasser par toutes les étapes préliminaires.

### 5.8 Expiration d'un "nécessite révision"

Si une AdS reste en statut "nécessite révision" sans action du demandeur pendant 14 jours, un rappel est envoyé. Après 28 jours, le CDS peut forcer l'annulation.

---

## 6. Gestion des cas particuliers

### 6.1 Extension de séjour

Deux approches possibles :
- **Modifier la date de fin** de l'AdS existante : la compliance est re-vérifiée sur la nouvelle durée. Si un manifeste retour existe déjà, le PAX est automatiquement retiré du manifeste et LOG_BASE est notifié.
- **Créer une nouvelle AdS** pour la période complémentaire : l'ancienne AdS se clôture normalement à sa date prévue.

### 6.2 Transport aller/retour différents

Un PAX peut partir en hélicoptère et rentrer en navire. Les préférences de transport (mode, point de départ) sont renseignées séparément pour l'aller et le retour dans l'AdS.

Sur une AdS d'équipe, un PAX peut avoir un retour différent des autres (par exemple, il reste plus longtemps). Cette exception est saisie individuellement.

Si le PAX est déjà sur site et souhaite changer son mode de retour, la modification est possible avec un motif obligatoire. Si un manifeste retour existe déjà et est validé, LOG_BASE est notifié pour mettre à jour le manifeste.

### 6.3 Visite d'une journée

Si la date de début et la date de fin sont identiques, l'AdS est une visite d'une journée. Les règles de compliance et de validation s'appliquent normalement — pas de traitement spécifique.

### 6.4 Clôture d'une AdS

Trois mécanismes de clôture, par ordre de priorité :

1. **TravelWiz** (source principale) : quand le manifeste de retour est clôturé avec le PAX à bord, l'AdS est automatiquement clôturée.

2. **Déclaration manuelle OMAA** : si le PAX quitte le site par un moyen non tracé dans TravelWiz (évacuation médicale, départ imprévu), l'OMAA déclare manuellement le départ avec un motif.

3. **Batch automatique nocturne** : si la date de fin est dépassée et que l'AdS n'est toujours pas clôturée, le système envoie une alerte et clôture automatiquement au bout d'un délai configurable.

---

## 7. Programme de Séjour (intra-champ)

### 7.1 Concept

Une fois qu'un PAX a une AdS approuvée pour un site d'entrée (ex : Munja), il peut se déplacer entre les différentes plateformes du champ (ESF1, ESF2, RDRW...). Ces déplacements intra-champ sont gérés dans le Programme de Séjour.

C'est un workflow allégé par rapport à l'AdS principale — il n'y a pas de validation multi-niveaux. L'OMAA crée le programme, le CDS le valide.

TravelWiz génère ensuite les manifestes de transport intra-champ correspondants.

### 7.2 Lien avec l'AdS principale

Le Programme de Séjour est rattaché à une AdS existante. Le PAX doit déjà avoir une AdS approuvée pour le site d'entrée. Les prérequis HSE des sites de destination intra-champ sont vérifiés lors de la création du programme.

---

## 8. Cycles de rotation

### 8.1 Concept

Certains personnels travaillent en rotation régulière sur site (ex : "21 jours sur site, 21 jours de repos"). Pour ces personnes, la création manuelle d'AdS pour chaque cycle serait fastidieuse.

Les cycles de rotation permettent de définir une fois pour toutes le rythme de rotation, et OpsFlux crée automatiquement les AdS au bon moment.

### 8.2 Configuration

Un LOG_BASE ou PAX_ADMIN configure un cycle de rotation :
- Le PAX concerné
- Le site de destination
- La durée on/off (ex : 21 jours sur site, 21 jours hors site)
- La date de début du premier cycle
- La catégorie de visite (généralement `permanent_ops`)

### 8.3 Création automatique des AdS

Un batch quotidien (exécuté à 6h du matin) détecte les prochaines rotations à créer. Une AdS est créée automatiquement en brouillon, N jours avant la date de départ (configurable). Le PAX est notifié et confirme sa disponibilité.

Si une certification va expirer pendant la prochaine rotation, une alerte est déclenchée en plus.

---

## 9. Signalements

### 9.1 Concept

Le module de signalement permet à Perenco de gérer des incidents, comportements inappropriés, ou exclusions de personnes ou d'entreprises. Contrairement à une sanction légale, il s'agit d'une décision opérationnelle interne qui peut bloquer ou restreindre l'accès aux sites.

### 9.2 Types de signalements

| Type | Description | Effets |
|---|---|---|
| Avertissement | Incident sans blocage d'accès | Notification seulement |
| Exclusion de site | Interdit sur un site spécifique | AdS en cours → révision |
| Blacklist temporaire | Interdit sur tous les sites pendant une période | AdS pending → rejet automatique |
| Blacklist permanent | Interdit définitivement | AdS pending → rejet, AdS in_progress → révision |

Un signalement peut cibler :
- Un PAX individuel
- Toute l'équipe d'une entreprise
- L'entreprise entière (Tiers)

### 9.3 Workflow

1. CHSE ou CDS crée le signalement avec motif et preuves
2. Selon la gravité, validation par CDS (avertissement) ou DO (blacklist)
3. À la validation, les effets s'appliquent automatiquement :
   - Les AdS en attente de validation sont rejetées
   - Les AdS approuvées mais non commencées passent en révision
   - Les AdS en cours : le CDS décide si le PAX est rapatrié ou peut terminer son séjour

### 9.4 Durée et levée

Les blacklists temporaires ont une date de fin. Les blacklists permanentes peuvent être levées uniquement par le DO avec un motif documenté.

---

## 10. Avis de Mission (AVM)

### 10.1 Concept

L'AVM est un dossier de mission complet qui orchestre toutes les actions préparatoires avant une mission terrain. Il remplace les échanges d'emails non structurés pour organiser une mission complexe impliquant plusieurs personnes, plusieurs sites, et plusieurs actions administratives.

### 10.2 Quand utiliser un AVM plutôt qu'une AdS directe ?

L'AVM est utilisé pour les missions qui nécessitent de la coordination multi-parties :
- Mission impliquant plusieurs experts sur plusieurs sites
- Mission nécessitant des démarches administratives (visa, badge, EPI)
- Mission officielle avec parties prenantes multiples à informer
- Mission liée à plusieurs projets avec des intervenants de plusieurs entreprises

Pour une demande simple d'un employé pour lui-même sur un seul site, une AdS directe est suffisante.

### 10.3 Structure d'un AVM

Un AVM contient :

**Programme ligne par ligne :** chaque ligne décrit une étape de la mission :
- Site visité, dates prévues
- Description de l'activité (réunion de revue, inspection, formation...)
- Intervenants sur cette ligne (qui participe à cette étape)
- Projet d'imputation
- Notes spécifiques

**Indicateurs à cocher :**
- Besoin de badge d'accès → tâche automatiquement créée pour LOG_BASE
- Besoin d'EPI avec mensurations → tâche créée pour le service Achats
- Visa nécessaire → formulaire de suivi visa créé pour les RH
- Éligible indemnité grand déplacement → formulaire créé pour RH/Finance

**Pièces jointes :**
- Documents de la mission (lettre d'intention, ordre de mission, contrat)
- Documents par PAX (passeport, visa, aptitude médicale)

**Créneaux de réunion :**
- Liste des réunions et briefings à organiser, avec date, heure, lieu, participants

**Parties prenantes :**
- Personnes à tenir informées du déroulement (avec niveau de notification : tout / jalons / synthèse)

### 10.4 Lancement d'un AVM

Quand l'AVM est lancé par son créateur, OpsFlux exécute automatiquement dans l'ordre :
1. Création des tâches préparatoires selon les indicateurs (badge, EPI, visa, indemnité)
2. Création automatique d'une AdS pour chaque ligne de programme ayant un site défini
3. Création des fichiers de documents vides pour chaque PAX × type de document requis
4. Envoi du mail d'annonce aux parties prenantes (en dernier, quand les AdS existent déjà)

### 10.5 Suivi des travaux préparatoires

L'onglet "Travaux préparatoires" de l'AVM affiche toutes les tâches à accomplir avant la mission :

| Type | Exemple | Statut | Responsable |
|---|---|---|---|
| Badge | Vérifier badge J.DUPONT pour ESF1 | En cours | LOG_BASE |
| Visa | Demande visa J.DUPONT — France | En revue | RH |
| EPI | Commande EPI taille XL | En attente | Achats |
| Indemnité | Indemnité déplacement J.DUPONT | Soumise | RH/Finance |
| AdS | AdS ESF1 du 14-15/05 | Approuvée | AUTO |

### 10.6 Suivi visa

Pour chaque PAX nécessitant un visa, un formulaire de suivi est créé avec un cycle de statuts : "à initier → soumis → en revue → obtenu / refusé". Quand le visa est obtenu, la tâche prépa correspondante se clôt automatiquement et les documents du PAX sont mis à jour.

### 10.7 Suivi des indemnités

Un formulaire de demande d'indemnité est créé pour chaque PAX éligible. Il suit le circuit : brouillon → soumis → approuvé → payé. La référence de paiement est saisible pour traçabilité.

### 10.8 Rapport de préparation

Un indicateur "Mission prête" est disponible sur la fiche AVM. Il agrège l'état de tous les éléments :
- Toutes les tâches préparatoires terminées ?
- Toutes les AdS approuvées ?
- Tous les documents requis uploadés ?
- Compliance HSE de tous les PAX pour tous les sites ?

### 10.9 Annulation d'un AVM

**Si aucun PAX n'est encore sur site :** L'AVM peut être annulé. Toutes les AdS en attente de validation ou approuvées mais non commencées sont annulées en cascade.

**Si un PAX est déjà sur site :** L'AVM ne peut plus être annulé. Seule une modification est possible, dans les limites de ce qui a déjà été consommé :
- La date de début d'une ligne ne peut pas être avancée (la personne est déjà partie)
- Un PAX déjà sur site ne peut pas être retiré de la liste
- Les modifications de dates de fin ou d'ajout de PAX déclenchent la procédure de modification de l'AdS correspondante

---

## 11. Portail externe superviseur

Un superviseur d'entreprise externe peut accéder à un portail simplifié pour gérer son équipe sans avoir de compte OpsFlux. Ce portail est accessible via un lien OTP (code envoyé par SMS ou email).

Le superviseur peut :
- Voir le statut de compliance de son équipe pour un site donné
- Créer des AdS pour ses équipiers
- Suivre l'état des demandes en cours
- Uploader des certifications pour ses équipiers (soumises à validation CHSE)

Ce portail ne lui permet pas de voir les signalements, les données médicales, ni les informations des autres entreprises.

---

## 12. Permissions

| Action | DO | CDS | CHSE | LOG_BASE | CHEF_PROJ | DEMANDEUR |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Créer une AdS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Soumettre une AdS | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Valider une AdS (N1) | ✓ | ✓* | — | — | ✓* | — |
| Valider une AdS (N2) | ✓ | — | — | — | — | — |
| Valider des certifications | ✓ | — | ✓ | — | — | — |
| Créer un signalement | ✓ | ✓ | ✓ | — | — | — |
| Valider blacklist | ✓ | — | — | — | — | — |
| Créer un AVM | ✓ | ✓ | — | ✓ | ✓ | ✓ |
| Lancer un AVM | ✓ | ✓ | — | ✓ | ✓ | ✓* |
| Configurer prérequis HSE | ✓ | — | ✓ | — | — | — |

*dans leur périmètre
