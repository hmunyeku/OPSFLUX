# Analyse Fonctionnelle Complète — Module Planner

## 1. Vue d'ensemble et positionnement

Planner est le **module de contrôle opérationnel des activités sur site**. Il répond à la question fondamentale : "Qui peut faire quoi, où, et quand ?"

Planner est **la source de vérité de la charge PAX** sur chaque asset à chaque instant. Tous les modules qui ont besoin de savoir si un site est disponible pour accueillir des personnes interrogent Planner.

**Ce que Planner gère :**
- Les fenêtres d'occupation des assets (quelles activités se déroulent sur quel site et pendant combien de temps)
- La capacité PAX de chaque asset (combien de personnes peuvent être simultanément sur un site)
- Les conflits entre activités concurrentes
- L'arbitrage des conflits par le DO
- Les notifications des parties prenantes en cas de changement

**Ce que Planner ne gère pas :**
- La création des projets (module Projets)
- La validation des personnes qui vont sur site (module PaxLog)
- La logistique de transport (module TravelWiz)

---

## 2. Types d'activités

Planner gère 4 types d'activités, toutes traitées de façon homogène sur le plan de la capacité mais avec des sources et des workflows différents.

### 2.1 Activité `project` (Travaux projet)

**Source :** Créée depuis Planner par un `PROJ_MGR` ou poussée depuis le module Projets.

**Particularités :**
- Liée à un projet via `project_id`
- La priorité hérite du projet (mais peut être surchargée par le DO)
- Si le projet associé est annulé ou terminé → l'activité ne peut plus être approuvée
- Le quota PAX est le nombre de personnes nécessaires pour réaliser l'activité (déclaré par le demandeur)
- Ce quota est **estimé** — le nombre réel de PAX validés dans PaxLog (`pax_actual`) est calculé séparément

**Processus de soumission :**
1. Le `PROJ_MGR` navigue dans Planner, crée une activité de type `project`.
2. Il sélectionne le projet, l'asset, les dates, déclare le quota PAX estimé.
3. Il soumet l'activité (statut `draft` → `submitted`).
4. Le système vérifie immédiatement la disponibilité de capacité sur l'asset.
5. Si capacité OK → l'activité passe à la validation du responsable site ou DO.
6. Si dépassement → un conflit est créé et remonte en arbitrage DO.

### 2.2 Activité `maintenance` (CMMS)

**Source :** Créée par un `MAINT_MGR`.

**Particularités :**
- Champs CMMS enrichis : `maintenance_type` (préventive/corrective/réglementaire), `equipment_asset_id` (équipement concerné), `work_order_ref` (référence OT générée), `estimated_duration_h`, `actual_duration_h`, `completion_notes`
- La référence d'ordre de travail est générée automatiquement par OpsFlux (séquence ACT-YYYY-NNNNN)
- Peut être de type `preventive` (planifiée à l'avance), `corrective` (urgence) ou `regulatory` (exigée par la réglementation)
- Pour les maintenances correctives urgentes : le DO peut approuver directement sans passer par la validation standard

**Spécificité de priorité :** Les maintenances réglementaires (`regulatory`) ont une priorité automatiquement `critical` qui ne peut pas être réduite en dessous de `high` lors d'un arbitrage.

### 2.3 Activité `permanent_ops` (Exploitation permanente)

**Source :** Créée par `SITE_MGR` ou `DO`. C'est une activité spéciale.

**Particularités :**
- Représente le quota incompressible de PAX d'exploitation du site
- Ne disparaît jamais du planning — elle est permanente ou récurrente
- Son `pax_quota` est soustrait en **premier** de la capacité avant tout calcul de disponibilité pour les autres activités
- Ne passe pas par un workflow de validation multi-niveaux — approuvée directement par `SITE_MGR` ou `DO`
- Peut avoir une date de fin (si une période spéciale de maintenance réduit les effectifs permanents)
- Toute modification du `pax_quota` de cette activité est historisée dans `asset_capacities`

**Exemple :** Site Munja a une capacité de 80 PAX. L'activité permanente consomme 12 PAX. La capacité résiduelle pour les projets est donc de 68 PAX.

### 2.4 Activité `workover` (Intervention sur puits)

**Source :** Créée par `PROJ_MGR` ou `SITE_MGR`.

**Particularités :**
- Intervention sur puits existant. Champs spécifiques : référence puits, type d'intervention (`re-completion`, `stimulation`, `fishing`, `workover`), nom du rig/unité
- Durée typique : 2-8 semaines
- Quota PAX élevé
- Validation à 2 niveaux obligatoires : CDS + DPROD
- Priorité minimale imposée à `haute` — on ne peut pas descendre en dessous (voir section priorité)

### 2.5 Activité `drilling` (Forage)

**Source :** Créée par `PROJ_MGR`.

**Particularités :**
- Forage de nouveau puits. Champs spécifiques : nom du puits, spud date prévue, profondeur cible (mètres), référence programme de forage
- Durée typique : 2-6 mois
- Quota PAX très élevé
- Validation renforcée à 3 niveaux obligatoires : CDS + DPROD + DO
- Priorité minimale imposée à `haute` — on ne peut pas descendre en dessous

### 2.6 Activité `integrity` (Intégrité)

**Source :** `SITE_MGR`, `HSE_ADMIN` ou `CHSE`.

**Particularités :**
- Inspection d'intégrité des installations
- Validation par CDS + CHSE
- Priorité par défaut `high`

### 2.7 Activité `event` (Événement)

**Source :** Tout rôle habilité.

**Particularités :**
- Réunion, deadline, jalon logistique
- Quota PAX peut être nul
- Champ libre `location_free_text` si l'événement n'est pas sur un asset physique
- Validation par CDS uniquement

### 2.8 Activité `inspection` (Inspection/Audit)

**Source :** `SITE_MGR`, `HSE_ADMIN` ou tout rôle habilité.

**Particularités :**
- Peut déclencher des prérequis HSE supplémentaires dans PaxLog (ex: inspection réglementaire → toute l'équipe doit avoir une formation spécifique)
- Priorité par défaut `high`
- Souvent de courte durée (1-3 jours)
- Peut être planifiée très à l'avance (inspections réglementaires annuelles)

---

## 3. Gestion de la capacité PAX

### 3.1 Principe de calcul

La **capacité résiduelle** d'un asset sur une période est calculée comme suit :

```
Capacité résiduelle = max_pax_total
                    − permanent_ops_quota
                    − Σ(pax_quota des activités approuvées sur la même période)
```

**Règle d'héritage dans la hiérarchie :**
La limite effective d'un asset est le minimum entre sa propre limite et celle de tous ses parents dans la hiérarchie. Exemple :
- Champ EBOME : limite 200 PAX
- Site Munja : limite 80 PAX
- Plateforme ESF1 (enfant de Munja) : limite 30 PAX
→ Si une activité sur ESF1 demande 25 PAX, on vérifie : 25 ≤ 30 (ESF1 OK), 25 ≤ 80 (Munja OK), 25 ≤ 200 (EBOME OK). Tout est OK.
→ Si on demande 35 PAX sur ESF1 : 35 > 30 → conflit sur ESF1.

**Vérification en temps réel :** À chaque soumission d'activité, le calcul est fait. Une vue matérialisée `daily_pax_load` est maintenue et rafraîchie toutes les 5 minutes pour les dashboards. La vérification de conflit lors de la soumission utilise la table `activities` directement (pas la vue matérialisée) pour être exacte.

### 3.2 Historisation des capacités (règle critique)

Toute modification de la capacité d'un asset (max_pax_total, permanent_ops_quota, max_pax_per_company) **ne modifie jamais** l'enregistrement existant. Elle crée un **nouvel enregistrement** avec une `effective_date` et un motif obligatoire.

**Pourquoi ?** Auditabilité complète. On doit pouvoir reconstituer quelle était la capacité d'un site à n'importe quelle date passée pour comprendre pourquoi une décision a été prise.

**Lecture de la capacité courante :**
```sql
SELECT * FROM asset_capacities
WHERE asset_id = :asset_id AND effective_date <= CURRENT_DATE
ORDER BY effective_date DESC LIMIT 1;
```

**Particularité :** Si la capacité est réduite alors que des activités approuvées existent sur la période, elles ne sont pas automatiquement annulées. Un conflit est créé et remonte au DO. C'est une décision humaine de savoir quoi faire.

### 3.3 Limite par entreprise

La colonne `max_pax_per_company` permet de limiter le nombre de PAX d'une même entreprise sous-traitante sur un site. Exemple : Site ESF1 accepte max 10 PAX de l'entreprise DIXSTONE simultanément.

Cette vérification est faite lors de la validation de l'AdS dans PaxLog (pas lors de la création de l'activité Planner, car on ne sait pas encore qui viendra).

---

## 4. Détection et gestion des conflits

### 4.1 Types de conflits

**`pax_overflow` (le plus courant) :** La somme des quotas PAX des activités approuvées + la nouvelle activité dépasse la capacité résiduelle de l'asset.

**`priority_clash` :** Deux activités de même priorité (`critical`) demandent la même capacité sur la même période. Le DO doit trancher.

**`resource_overlap` :** Deux activités requièrent la même ressource nominative (même PAX spécifique) sur des périodes chevauchantes.

### 4.2 Création automatique d'un conflit

Quand une activité soumise crée un dépassement :
1. L'activité passe en statut `submitted` (pas bloquée, mais signalée).
2. Un enregistrement `ActivityConflict` est créé avec :
   - `activity_a_id` = l'activité existante qui "tient" la capacité
   - `activity_b_id` = la nouvelle activité qui déborde
   - `conflict_type` = type du conflit
   - `overflow_amount` = nombre de PAX en dépassement
3. Une notification est envoyée au DO et au demandeur de la nouvelle activité.
4. L'activité ne peut pas être approuvée tant que le conflit n'est pas résolu.

**Cas de dépassement multiple :** Si une activité entre en conflit avec 3 activités existantes, 3 enregistrements de conflit sont créés.

### 4.3 Vue de l'arbitre (DO)

Le DO accède à une vue dédiée "Conflits en attente" avec :
- Les deux activités en conflit côte à côte (asset, dates, quota PAX, priorité, projet associé)
- La capacité disponible sur la période (graphique de charge)
- Le nombre d'AdS PaxLog déjà validées sur chacune des activités
- L'historique des décisions passées sur des conflits similaires
- Un champ de texte libre pour la décision (obligatoire)

**Actions disponibles :**
1. **Approuver les deux** : possible seulement si la marge est suffisante (recalcul en temps réel après révision des quotas).
2. **Reporter A** : déplacer l'activité A à des dates alternatives proposées par le système (dates sans conflit les plus proches).
3. **Reporter B** : même chose pour B.
4. **Réduire le quota de A** : le DO peut réduire le quota PAX d'une activité pour libérer de la place.
5. **Annuler A ou B** : annulation avec motif obligatoire → activité passe en `cancelled`, les AdS PaxLog liées passent en `requires_review`, les manifestes TravelWiz liés passent en `requires_review`.

**Délai d'arbitrage :** Configurable (défaut : 48h). Si le DO ne tranche pas dans ce délai → notification de rappel. Pas de résolution automatique.

### 4.4 Workflows de validation par type d'activité

Le workflow de validation est déterminé automatiquement par le type d'activité à la soumission :

| Type | Workflow de validation |
|---|---|
| `project` | CDS (validateur N1) |
| `maintenance_corrective` | DO (approbation directe, fast-track) |
| `maintenance_preventive` | CDS |
| `workover` | CDS + DPROD (2 niveaux) |
| `drilling` | CDS + DPROD + DO (3 niveaux obligatoires) |
| `integrity` | CDS + CHSE |
| `inspection` | CDS |
| `event` | CDS |

### 4.5 Priorité minimale par type d'activité

Certains types d'activités ont une priorité minimale imposée — on ne peut pas descendre en dessous :
- Les activités de type `drilling` ont une priorité minimale imposée à `haute`
- Les maintenances réglementaires (`regulatory`) ont une priorité minimale imposée à `haute` également
- Tentative de réduction en dessous du plancher → message d'erreur explicite : "La priorité minimale pour ce type d'activité est 'haute'. Impossible de réduire."

### 4.6 Surcharge de priorité par le DO

Indépendamment des conflits, le DO peut à tout moment **changer la priorité d'une activité** dans Planner sans toucher au projet source.

**Processus :**
1. Le DO sélectionne une activité dans Planner.
2. Il choisit une nouvelle priorité.
3. Il saisit un motif obligatoire.
4. Le changement est tracé dans l'audit log : `priority_override_by`, `priority_override_reason`.

**Implication :** Si deux activités en conflit ont des priorités différentes après la surcharge, l'algorithme de scoring lors du conflit en tient compte.

---

## 4bis. Dépendances entre activités Planner

### 4bis.1 Liens de dépendance

Les activités Planner peuvent être liées par des dépendances :
- Types de liens supportés : Fin→Début (FS), Début→Début (SS)
- Propagation automatique des décalages : si une activité est décalée, les successeurs sont notifiés avec l'impact calculé (nombre de jours de décalage, nouvelles dates estimées)
- Notification au chef de projet de l'activité impactée
- Visibilité dans le Gantt : flèches de dépendance entre activités, colorées selon le type de lien

---

## 5. Modification d'une activité approuvée — Le modal d'impact

C'est l'une des fonctionnalités les plus importantes de Planner. Toute modification d'une activité approuvée peut avoir des cascades sur PaxLog et TravelWiz.

### 5.1 Qui peut modifier une activité approuvée ?

- Le créateur de l'activité (avec son rôle habilité)
- Le DO (peut modifier n'importe quelle activité)

### 5.2 Processus complet

**Étape 1 — L'utilisateur initie la modification.**
Il modifie dates, quota PAX, ou statut depuis l'interface Planner.

**Étape 2 — Calcul de l'impact (côté serveur, avant persistance).**
Le système calcule :
- Nombre d'AdS PaxLog en statut `approved` ou `in_progress` liées à cette activité
- Nombre de manifestes TravelWiz validés liés
- Nombre d'autres activités potentiellement impactées (si modification de dates crée un nouveau conflit)
- Noms des demandeurs et PAX concernés

**Étape 3 — Affichage du modal de confirmation.**
Le modal présente :
- Résumé de la modification : "Vous décalez l'activité du 1er mai → 1er juin (30 jours)"
- Liste des impacts : "3 AdS approuvées, 1 manifeste TravelWiz, 2 PAX concernés"
- Cases à cocher pour les destinataires de notification (pré-cochées selon la configuration par défaut) :
  - [ ] Demandeur de l'activité
  - [x] Chef de projet associé
  - [x] PAX avec AdS approuvées (Jean DUPONT, Paul MBALLA)
  - [x] Coordinateur logistique TravelWiz
  - [ ] Autres activités sur le même site (effet domino)
- Champ de message libre optionnel
- Boutons : **Confirmer et notifier** / **Confirmer sans notifier** / **Annuler la modification**

**Étape 4 — Application des changements.**
Si l'utilisateur confirme :
1. La modification est persistée dans la base.
2. Les AdS PaxLog liées passent en statut `requires_review`.
3. Les manifestes TravelWiz liés passent en statut `requires_review`.
4. Les notifications sont envoyées aux destinataires sélectionnés.
5. L'audit log enregistre la modification avec la liste des entités impactées.

**Étape 5 — Suivi des entités en `requires_review`.**
Les entités en `requires_review` apparaissent dans les dashboards des modules concernés avec un badge d'alerte. Les validateurs responsables doivent les reconfirmer ou les adapter.

### 5.3 Cas particulier : annulation d'une activité

L'annulation d'une activité approuvée suit le même modal d'impact, avec les actions suivantes pour les entités liées :
- AdS PaxLog `approved`/`in_progress` → passent en `requires_review` avec message : "L'activité Planner associée a été annulée."
- Manifestes TravelWiz → passent en `requires_review`
- Les PAX sont notifiés individuellement

---

## 6. Vues et interface utilisateur

### 6.1 Vue Gantt (vue principale)

**Structure :**
- Axe horizontal : timeline (semaine/mois/trimestre, switchable)
- Axe vertical : assets groupés par hiérarchie (Filiale > Champ > Site > Plateforme)
- Barres colorées par type d'activité ET par statut

**Code couleur par type :**
- `project`       : bleu       (#3b82f6)
- `workover`      : vert foncé  (#16a34a)  — interventions puits
- `drilling`      : rouge foncé (#dc2626)  — forage nouveau puits
- `integrity`     : teal        (#0d9488)  — inspections d'intégrité
- `maintenance`   : orange      (#f97316)
- `permanent_ops` : gris        (#9ca3af) (toujours visible en fond)
- `inspection`    : violet      (#9333ea)
- `event`         : gris clair  (#d1d5db)

**Code couleur par statut (superposé) :**
- `draft` : opacité réduite (50%)
- `submitted` : plein, bordure pointillée
- `approved` : plein, solide
- `in_progress` : plein + indicateur de progression
- `cancelled` : barré

**Indicateur de charge PAX** sur chaque ligne asset :
- Barre de progression horizontale : PAX actuels / capacité max
- Couleur : vert < 70%, orange 70-90%, rouge > 90%, rouge vif = dépassement
- Chiffres affichés : "45 / 80 PAX"

**Interactions :**
- Clic sur une barre → panneau latéral droit avec détail de l'activité (éditable si droits suffisants)
- Drag & drop d'une barre (statut `draft` ou `submitted` uniquement) → déplace les dates + calcul impact en temps réel avant confirmation
- Double-clic sur une cellule vide → créer une nouvelle activité sur cet asset à ces dates
- Survol d'une barre → tooltip avec quota PAX, statut, demandeur

**Filtres disponibles :**
- Type d'activité (project / workover / drilling / integrity / maintenance / inspection / event)
- Statut
- Projet spécifique
- Responsable
- Afficher/masquer `permanent_ops`
- Afficher uniquement les conflits
- Période (dates de début et fin de la vue)

### 6.2 Vue Calendrier mensuel/hebdomadaire

Vue alternative à Gantt, utile pour voir les activités sur un horizon court. Présentation par asset, par jour.

### 6.3 Vue Timeline asset

Vue centrée sur un asset spécifique, montrant toutes ses activités dans le temps avec les indicateurs de capacité jour par jour. Utile pour les responsables de site.

### 6.4 Vue Conflits

Tableau dédié aux conflits non résolus, accessible uniquement au DO. Colonnes : assets concernés, type de conflit, activités en conflit, ancienneté du conflit, quota PAX en dépassement.

Tri par défaut : plus anciens en premier (pour forcer l'arbitrage des conflits traînants).

### 6.5 Vue PERT (Phase 2)

Réseau de dépendances entre activités d'un même projet sur un asset. Utile pour les planifications complexes avec de nombreuses contraintes.

---

## 7. Notifications et alertes

### 7.1 Configuration des notifications

Les notifications par défaut sont configurables par l'administrateur `PAX_ADMIN` :

| Événement | Destinataires par défaut |
|---|---|
| Activité soumise | Validateurs du site |
| Activité approuvée | Demandeur |
| Activité rejetée | Demandeur avec motif |
| Conflit détecté | DO + demandeur de la nouvelle activité |
| Conflit résolu | Les deux demandeurs |
| Activité modifiée | Demandeur + PAX concernés (configurable) |
| Activité annulée | Demandeur + PAX + LOG_COORD TravelWiz |
| Capacité modifiée | DO + SITE_MGR |

### 7.2 Canaux de notification

- **In-app** : badge dans la cloche de notification + bannière dans le module concerné
- **Email** : notification par email selon les préférences utilisateur
- **Les deux** : par défaut

### 7.3 Alertes automatiques

**Alerte de débordement** : Si la vue matérialisée `daily_pax_load` montre qu'un asset est à >90% de sa capacité sur une journée → alerte automatique au SITE_MGR et DO.

**Alerte de conflit non résolu** : Si un conflit est en attente depuis plus de 48h (configurable) → rappel au DO.

---

## 8. Gestion des activités CMMS (maintenances)

Planner absorbe le CMMS (Computerized Maintenance Management System) puisqu'il n'en existe pas chez Perenco Cameroun. Les activités de type `maintenance` **sont** le système de gestion des maintenances.

### 8.1 Ordre de travail (OT)

**Génération :** Quand une activité maintenance est créée, une référence OT est automatiquement générée : `ACT-2026-NNNNN`.

**Champs spécifiques d'une maintenance :**
- **Type de maintenance :** `preventive` (planifiée, calendrier), `corrective` (suite à une panne), `regulatory` (imposée réglementairement), `inspection` (contrôle périodique)
- **Équipement concerné :** `equipment_asset_id` — référence vers un asset de type équipement/infrastructure dans Asset Registry
- **Durée estimée** : en heures
- **Durée réelle** : saisie à la complétion
- **Notes de complétion** : rapport de fin de maintenance

### 8.2 Workflow de complétion

1. Une maintenance approuvée passe en `in_progress` quand les équipes arrivent sur site (mis à jour manuellement ou via événement PaxLog).
2. À la fin : le `MAINT_MGR` ou `SITE_MGR` renseigne la durée réelle et les notes de complétion.
3. L'activité passe en `completed`.
4. L'audit log conserve le détail (qui a réalisé, durée réelle vs estimée).

### 8.3 Maintenance récurrente

Le `MAINT_MGR` peut créer des activités de maintenance récurrentes avec des règles de récurrence :
- Fréquence : quotidienne, hebdomadaire, mensuelle, trimestrielle, annuelle
- Jour/semaine préféré
- Date de fin de la série (optionnelle)

Le système génère automatiquement les activités futures via un job APScheduler quotidien. Chaque occurrence générée est une activité indépendante modifiable. Si une occurrence est annulée, les suivantes ne sont pas impactées.

**Modèle de données :** Table `activity_recurrence_rules` avec les règles de récurrence, liée à la table `activities` via `activity_id`.

**Exemple :** Maintenance préventive trimestrielle de la pompe P-101 sur ESF1 — le système crée automatiquement une activité tous les 3 mois avec les mêmes caractéristiques (type, quota PAX, équipement) et un OT généré pour chaque occurrence.

---

## 9. Intégration avec les autres modules

### 9.1 Planner → PaxLog (vérification de capacité)

À chaque création d'une AdS dans PaxLog, PaxLog interroge Planner :
```
GET /api/v1/planner/availability/:asset_id?start=...&end=...
```
Planner retourne : capacité résiduelle, liste des activités sur la période, quota PAX utilisé.

PaxLog affiche ces informations dans le formulaire de création pour aider le demandeur à calibrer sa demande.

### 9.2 Planner → TravelWiz (impact des modifications)

Quand une activité Planner est modifiée ou annulée → l'événement `activity.modified` ou `activity.cancelled` est émis. TravelWiz identifie les manifestes et trips liés et les passe en `requires_review`.

### 9.3 PaxLog → Planner (mise à jour pax_actual)

Quand une AdS est approuvée dans PaxLog, PaxLog met à jour en temps réel le `pax_actual` de l'activité Planner correspondante. C'est le suivi "réel vs estimé".

Ce champ est en lecture seule dans Planner — il ne peut être modifié que par PaxLog.

---

## 10. RBAC détaillé Planner

| Action | DO | SITE_MGR | PROJ_MGR | MAINT_MGR | REQUESTER | READER |
|---|---|---|---|---|---|---|
| Voir le Gantt | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Créer activité project | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Créer activité maintenance | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| Créer activité permanent_ops | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Créer activité inspection | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Approuver une activité | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Modifier activité approuvée | ✓ | ✓ (la sienne) | ✓ (la sienne) | ✓ (la sienne) | ✗ | ✗ |
| Résoudre un conflit | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Surcharger priorité | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Modifier capacité asset | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Voir les conflits | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |

### 10.1 Rôle CHSE comme validateur

Le rôle **CHSE** (Chef HSE) est ajouté comme validateur pour les activités de type `integrity` et `inspection`.

**Matrice de permissions CHSE :**

| Action | CHSE |
|---|---|
| Voir le Gantt | ✓ |
| Voir toutes les activités | ✓ |
| Valider les activités integrity/inspection | ✓ |
| Consulter le Gantt | ✓ |
| Créer des activités | ✗ |
| Résoudre des conflits | ✗ |
| Modifier les quotas | ✗ |
| Surcharger la priorité | ✗ |
