# Analyse Fonctionnelle Complète — Module TravelWiz

## 1. Vue d'ensemble

TravelWiz est le **module de gestion logistique des déplacements et du cargo**. Il gère tout ce qui concerne le transport physique : comment les personnes et le matériel arrivent sur site, se déplacent entre sites, et reviennent à la base.

**Deux flux distincts et indépendants :**
- **Flux PAX** : les personnes, alimenté par les AdS approuvées de PaxLog
- **Flux Cargo** : le matériel, géré indépendamment des PAX

Ces deux flux peuvent utiliser le même vecteur (un hélicoptère transporte à la fois des personnes et du fret) mais ils ont des manifestes séparés et des workflows indépendants.

**Principe d'agnosticisme des vecteurs :** TravelWiz ne fait aucune distinction de traitement entre un hélicoptère, une vedette, un surfeur, un bus ou un vol commercial. Tout vecteur est enregistré avec ses caractéristiques et la logique est identique.

---

## 2. Gestion des vecteurs

### 2.1 Enregistrement d'un vecteur

Un vecteur est tout moyen de transport utilisé pour les déplacements Perenco.

**Types courants :** `helicopter`, `boat`, `surfer`, `bus`, `4x4`, `commercial_flight`, `barge`, `tug`
→ Le type est libre (texte configurable) — pas une liste fermée.

**Mode de transport :** `air`, `sea`, `road` — ces 3 valeurs sont fixes.

**Capacités déclarées :**
- `capacity_pax` : nombre max de PAX (obligatoire)
- `capacity_weight_kg` : charge max en kg (optionnel)
- `capacity_volume_m3` : volume max en m³ (optionnel)

**Particularités :**
- `home_base_asset_id` : base de départ habituelle. Utile pour savoir où est le vecteur par défaut et calculer les disponibilités.
- `ais_mmsi` : identifiant AIS (Automatic Identification System) pour les navires. Permet l'intégration avec des flux AIS externes pour le tracking automatique de position.
- `weighing_required` : champ booléen sur la fiche vecteur. Activé par défaut pour les hélicoptères et petits aéronefs. Si activé : le capitaine/pilote doit saisir le poids de chaque passager dans le portail capitaine avant le départ. Le poids total PAX + bagages est calculé et affiché, avec alerte si la charge maximale du vecteur est dépassée.
- Les vecteurs ne sont jamais supprimés — uniquement désactivés (`active = false`). L'historique des voyages reste attaché.

### 2.2 Surfaces de chargement (Deck Surfaces)

Un vecteur peut avoir plusieurs zones de chargement. Chaque zone a ses propres caractéristiques de charge.

**Exemple pour un navire de service :**
- "Pont principal" — rectangle 20m × 12m, charge max 50T
- "Pont arrière" — forme irrégulière, charge max 20T
- "Soute B1" — 3m × 4m × 2.5m (hauteur contrainte), charge max 15T

**4 modes de définition d'une surface :**

**`rectangle` (le plus simple) :** On renseigne longueur et largeur. La surface utile est L × l moins les zones d'exclusion.

**`polygon` :** Pour les formes irrégulières (ex: un pont en L). On fournit une liste de points [{x, y}] en mètres. La surface utile est calculée par l'algorithme de Shoelace.

**`image_overlay` :** L'administrateur uploade un plan du pont en image et trace les contours utilisables directement dans l'interface. Le tracé est converti en coordonnées polygon.

**`composite` :** Combinaison de plusieurs sous-surfaces (ex: pont principal + extension arrière).

**Zones d'exclusion :** Obstacles fixes (mat, bollards, équipements permanents) définis comme rectangles sur le plan. Ces zones sont retirées de la surface utile.

**Charge surfacique :** La valeur `max_surface_load_kg_m2` permet de détecter si la distribution du poids sur une zone crée une pression trop élevée sur le pont (important pour les navires).

---

## 3. Gestion des voyages

### 3.1 Cycle de vie d'un voyage (Trip)

```
planned → confirmed → boarding → departed → arrived → completed
                ↓
           cancelled
                ↓
           delayed (retour vers planned ou confirmed)
```

**`planned` :** Voyage créé manuellement ou généré par une rotation périodique. Pas encore de manifeste PAX associé obligatoirement.

**`confirmed` :** Le voyage est confirmé. Le manifeste PAX peut être en cours de génération.

**`boarding` :** Les PAX commencent à embarquer. Le manifeste PAX doit être validé à ce stade.

**`departed` :** Le vecteur a quitté le point de départ. Déclenché manuellement par le coordinateur ou par le capitaine via le portail.

**`arrived` :** Le vecteur est arrivé à destination.

**`completed` :** Voyage clôturé — le manifeste est fermé, les KPIs sont calculés.

**`cancelled` :** Annulation avec motif. Les PAX inscrits au manifeste sont notifiés. Les AdS PaxLog liées passent en `requires_review`.

**`delayed` :** Retard signalé. La `departure_datetime` est mise à jour. Les PAX sont notifiés si le délai dépasse un seuil configurable.

### 3.2 Création d'un voyage

**Création manuelle :**
1. Sélection du vecteur, de l'origine et de la destination (depuis Asset Registry).
2. Saisie de la date/heure de départ prévue.
3. Le voyage est créé en statut `planned`.
4. Le système propose automatiquement d'ajouter les PAX ayant des AdS approuvées sur ce trajet et cette période.

**Création via rotation périodique :**
Les voyages sont générés automatiquement par le batch des rotations (voir section 4). Ils sont créés en statut `planned` sans manifeste PAX associé a priori.

**Particularité des voyages intra-champ :**
Les voyages `is_intrafield = true` sont générés par les Programmes de Séjour PaxLog approuvés. Ils utilisent le vecteur de type `surfer` disponible sur le champ.

### 3.3 Génération du manifeste PAX depuis les AdS

Quand une AdS est approuvée dans PaxLog, l'événement `ads.approved` est émis. TravelWiz réagit :

**Étape 1 — Recherche d'un voyage compatible :**
TravelWiz cherche un `Trip` existant avec :
- `destination_asset_id` correspondant au `site_entry_asset_id` de l'AdS
- Statut `planned` ou `confirmed`
- `departure_datetime` compatible avec la `start_date` de l'AdS (dans une fenêtre configurable, ex: ±3 jours)

**Étape 2a — Voyage trouvé :**
- Les PAX de l'AdS sont ajoutés dans le `PaxManifest` existant.
- Si le manifeste est déjà en `pending_validation` → les nouveaux PAX sont ajoutés en statut `standby`.
- Le coordinateur logistique est notifié.

**Étape 2b — Aucun voyage trouvé :**
- Un nouveau `Trip` est créé en statut `planned` (sans date de départ précise).
- Un `PaxManifest` draft est créé pour ce voyage.
- Les PAX sont ajoutés en statut `confirmed`.
- Le coordinateur logistique est notifié qu'un nouveau trip draft est disponible.

**Étape 3 — Si PAX préalablement bloqué se débloque :**
L'événement `ads_pax.unblocked` est émis → TravelWiz ajoute le PAX au manifeste draft existant.

**Étape 4 — Si AdS annulée/rejetée :**
L'événement `ads.cancelled` ou `ads.rejected` est émis → TravelWiz passe les entrées manifeste correspondantes en `cancelled`. La capacité disponible sur le trip est recalculée.

---

## 4. Rotations périodiques

### 4.1 Configuration d'une rotation

Une rotation périodique est un voyage récurrent sur un trajet fixe avec un vecteur fixe.

**Exemple :** Hélico DOLPHIN 1 — Wouri → Munja, tous les lundis à 7h00.

```
RRule : FREQ=WEEKLY;BYDAY=MO;BYHOUR=7;BYMINUTE=0
```

**Champ `recurrence_rule` :** Format iCal/RRule standard (FREQ, BYDAY, BYHOUR, INTERVAL, UNTIL).

**Validation :** La RRule est parsée et validée à la création. Si invalide → erreur 400.

**Statuts d'une rotation :**
- `active` : génère des trips normalement
- `suspended` : arrêt temporaire, trips futurs annulés, raison obligatoire
- `cancelled` : arrêt définitif, impossible de réactiver

### 4.2 Génération des trips

**Quand ?** Deux déclencheurs :
1. Lors de l'activation d'une rotation → génère les 30 prochains trips
2. Batch quotidien → génère les trips pour J+30 si pas encore créés

**Comment ?** Pour chaque occurrence de la RRule dans la fenêtre :
1. Créer un `Trip` en statut `planned` avec `rotation_id` renseigné
2. Associer le vecteur de la rotation
3. Définir `departure_datetime` selon la RRule

**Pas de manifeste automatique :** Les trips générés par rotation n'ont pas de manifeste PAX a priori. Les PAX s'y ajoutent via leurs AdS ou manuellement.

### 4.3 Suspension d'une rotation

Quand une rotation est suspendue :
1. Tous les trips futurs en statut `planned` passent en `cancelled`.
2. Les trips en statut `confirmed` (avec PAX inscrits) ne sont pas automatiquement annulés — le coordinateur choisit : annuler ou maintenir avec vecteur alternatif.
3. Notification aux PAX inscrits sur les trips annulés.

---

## 5. Manifestes PAX

### 5.1 Cycle de vie d'un manifeste PAX

```
draft → pending_validation → validated → (voyage) → closed
      ↓
   cancelled
      ↓
requires_review (si activité Planner modifiée ou AdS annulée)
```

**`draft` :** Manifeste en construction. Le coordinateur peut ajouter/retirer des PAX librement.

**`pending_validation` :** Le coordinateur a soumis pour validation. Seules les annulations individuelles sont possibles.

**`validated` :** Manifeste approuvé. Plus aucune modification. Les PAX supplémentaires éventuels sont en `standby`.

**`closed` :** Voyage terminé. Chaque PAX est marqué `boarded` ou `no_show`. Déclenche le calcul des KPIs et l'événement `pax_manifest.closed` vers PaxLog.

**`requires_review` :** L'activité Planner associée a été modifiée ou l'AdS d'un PAX a été annulée. Le coordinateur doit reconfirmer la liste.

### 5.2 Gestion des ajouts manuels

Le coordinateur logistique (`LOG_COORD`) peut ajouter manuellement un PAX à un manifeste (ex: urgence, PAX sans AdS formelle, invité VIP).

**Règles :**
- L'ajout manuel est tracé : `added_manually = true`, `added_by = user_id`
- Si le manifeste est déjà `validated` → le PAX ajouté passe directement en `standby`
- La capacité du vecteur est vérifiée à chaque ajout

**Vérification de capacité :**
```
count(confirmed) + 1 ≤ vehicle.capacity_pax
sum(weight_kg des confirmed) + weight_kg_nouveau ≤ vehicle.capacity_weight_kg
```
Si dépassement de capacité PAX → erreur bloquante. Pas de dépassement possible sauf intervention DO.

Si dépassement de poids → avertissement (pas bloquant — le coordinateur valide manuellement).

### 5.3 Score de priorité PAX

Quand plusieurs PAX sont en compétition pour un voyage (ex: manifeste proche de la limite), un score de priorité détermine l'ordre d'embarquement et qui passe en `standby`.

**Calcul du score :**
```
score = visit_category_score         # project_work=100, maintenance=90, inspection=80...
      + project_priority_bonus        # critical=50, high=30, medium=10, low=0
      + rotation_bonus               # +20 si PAX en cycle de rotation
      + early_booking_bonus          # +10 si AdS soumise >7j à l'avance
      - incident_malus               # -30 si warning, -100 si temp_ban
```

Les PAX sont triés par score décroissant dans le manifeste. Les derniers sont passés en `standby` si la capacité est atteinte.

**Affichage :** Le coordinateur voit la colonne `priority_score` et `priority_source` pour comprendre pourquoi un PAX est prioritaire.

### 5.4 Clôture du manifeste

**Processus de clôture (après le voyage) :**
1. Le coordinateur (ou le capitaine via le portail) clôture le manifeste.
2. Pour chaque PAX : marquer comme `boarded` (embarqué) ou `no_show` (absent sans prévenir).
3. Les `no_show` peuvent avoir un motif (maladie, annulation de dernière minute, etc.).
4. Le manifeste passe en `closed`.
5. L'événement `pax_manifest.closed` est émis vers PaxLog avec la liste des no-shows.
6. L'événement `trip.closed` est émis → calcul des KPIs du voyage.

**Conséquences dans PaxLog :**
- PAX `boarded` → AdS passe en `in_progress`
- PAX `no_show` → `AdSPax.status = no_show`, notification au demandeur de l'AdS

### 5.5 Distinction no-show aller vs retour

Deux types de no-show sont distingués avec un impact différent :

**No-show aller :** Le PAX ne se présente pas à l'embarquement pour le trajet aller → marqué absent, notification au demandeur de l'AdS. Un no-show aller peut entraîner un report de l'AdS.

**No-show retour :** Le PAX ne se présente pas pour le trajet retour → le PAX est encore sur site. L'OMAA (opérateur base) doit **confirmer la présence effective sur site** avant de marquer le no-show. Un no-show retour ne clôture pas l'AdS (le PAX est toujours sur site).

**Impact différencié :**
- No-show aller : l'AdS peut être reportée ou annulée selon la décision du validateur
- No-show retour : l'AdS reste en `in_progress` car le PAX est physiquement sur site, un nouveau voyage retour doit être planifié

---

## 6. Gestion du Cargo

### 6.1 Types de gestion des articles (rappel)

| Type | Description | Tracabilité |
|---|---|---|
| `unit` | Équipement individuel identifiable | Chaque pièce a son propre historique |
| `bulk_quantity` | Même article × N | Suivi par lot, quantité retournée |
| `consumable_volume` | Liquide/vrac en m³/litres/kg | Solde résiduel au retour |
| `consumable_discrete` | Consommable comptable (fûts, bouteilles) | Quantité retournée |
| `package` | Conteneur mixte multi-articles | Inventaire élément par élément au retour |
| `waste` | Déchet réglementé | Workflow spécifique |

### 6.2 Validation médicale pour les médicaments

Les colis de type "médicaments" nécessitent une **validation médicale** par le responsable médical du site de destination. Cette étape est intégrée dans le workflow de validation du manifeste cargo :
- Le responsable médical reçoit une notification avec la liste des médicaments à valider
- La validation médicale doit être obtenue avant l'embarquement du colis
- Si le responsable médical rejette un colis médicament, celui-ci est retiré du manifeste avec motif obligatoire

### 6.3 Enregistrement d'un colis

**Qui peut enregistrer ?** `LOG_COORD`, `TRANSP_COORD`, et tout utilisateur avec un rôle d'expédition configuré.

**Processus :**
1. Sélection du type de gestion.
2. Saisie de la description (texte libre). Si la description correspond à un article du catalogue SAP → suggestion automatique affichée.
3. Saisie des dimensions, poids, quantité.
4. Saisie de l'expéditeur, du destinataire, du service responsable.
5. Imputation centre de coût / projet (obligatoire selon la configuration).
6. Marquage hazmat si applicable (avec classe IMDG/IATA obligatoire).
7. Un numéro de tracking OpsFlux est généré automatiquement : `CGO-2026-004521`.
8. La référence externe physique (numéro de panier, QR code) peut être saisie ou scannée.

**Génération du tracking number :** Séquentiel par année via la table `reference_sequences`, protégée par un LOCK atomique. Format configurable par l'administrateur.

### 6.4 Matching SAP intelligent

**Problème :** Les utilisateurs saisissent les désignations de façon variable. "2 coudes R=SD 8 inch" et "COUDE COURT RAYON 8 POUCES" désignent le même article SAP mais sont écrits différemment.

**Solution :** L'IA du module analyse la description saisie et cherche la correspondance dans `article_catalog`.

**Algorithme de matching :**
```
1. Normalisation : minuscules, sans accents, abréviations industrielles résolues
   pce→piece, ea→each, sx→sack, drs→drums, btc→buttress thread coupling, 
   eue→external upset end, sch→schedule, wn→weld neck, rtj→ring type joint

2. TF-IDF sur la base article_catalog (rapide, ~50ms)
   → Top 5 résultats avec score de similarité

3. Si embeddings pgvector disponibles : 
   → Recherche sémantique complémentaire (~100ms)
   → Fusion et dédoublonnage des résultats

4. Affichage des suggestions si score > seuil (défaut 0.75)
   avec : code SAP, désignation, type de gestion, score de confiance
```

**Interface utilisateur :**
- À la saisie de la description → suggestions apparaissent sous le champ
- L'utilisateur sélectionne une suggestion ou ignore (saisie libre)
- Si suggestion confirmée → `sap_code_status = 'ai_suggested'` (en attente de confirmation définitive)
- Le responsable du service peut confirmer définitivement : `sap_code_status = 'confirmed'`
- Si confirmation → enrichit la base de données (feedback loop : ce mapping est mémorisé)

**Cas des packages mixtes :** Pour un package (type `package`), chaque élément constitutif peut avoir son propre code SAP. Le matching est appliqué article par article dans l'inventaire du package.

### 6.5 Tracabilité complète des mouvements

Chaque colis a une timeline complète de tous ses mouvements depuis l'enregistrement jusqu'au retour ou à la mise au rebut.

**Exemple de timeline :**
```
14/09/2026 09:00  [registered]      Base Wouri — M. Bayanack (clic)
14/09/2026 10:30  [loaded]          Wouri Jetty → HERA P (Pont principal, pos. D4)
                                    Validé: M. Bayanack + Capitaine Anthony (OTP)
14/09/2026 16:00  [arrived]         HERA P arrive à RDRW
14/09/2026 17:15  [delivered]       ESF1 — Joseph (signature tablette)
19/09/2026 08:00  [return_declared] ESF1 → Base — COMAN (clic) — stock_reintegration
19/09/2026 09:00  [return_loaded]   ESF1 → HERA P — Capitaine (OTP)
19/09/2026 15:30  [return_arrived]  Base Wouri
19/09/2026 16:00  [return_dispatched] Yard Base — Yard Officer (clic)
20/09/2026 10:00  [reintegrated]    Magasin — Gestionnaire stock (clic)
```

**Table `cargo_movements` : append-only.** Aucune ligne n'est jamais modifiée ou supprimée. C'est le grand livre du colis.

**Mise à jour automatique de `current_location_asset_id` :** À chaque mouvement, la localisation actuelle du colis est mise à jour pour permettre la question "Où est ce colis en ce moment ?".

---

## 7. Organisation de deck (Deck Planning)

### 7.1 Objectif

Optimiser le placement des colis sur les surfaces de chargement d'un vecteur pour :
- Maximiser l'utilisation de l'espace
- Respecter les contraintes de sécurité (matières dangereuses isolées, explosifs séparés)
- Optimiser la stabilité du vecteur (distribution du poids)
- Faciliter le déchargement (colis à décharger en premier accessibles directement)

### 7.2 Déclenchement de l'algorithme

1. Le coordinateur logistique a un manifeste cargo validé pour un voyage.
2. Il clique "Organiser le deck" depuis la vue du voyage.
3. Il peut surcharger les règles par défaut (activer/désactiver chaque règle).
4. L'algorithme s'exécute côté serveur (<2s pour 50 colis).
5. Le résultat est affiché en statut `proposed_by_algo` — pas encore validé.
6. Le coordinateur voit le layout proposé sur un plan de pont interactif.
7. Il peut ajuster manuellement les positions par drag & drop.
8. Il valide le layout → statut `validated` → plus modifiable.

### 7.3 Algorithme de placement (First Fit Decreasing)

**Classification préalable des colis :**
```
1. Colis explosifs → zone exclusive si règle active
2. Colis hazmat → zone périphérique si règle active
3. Colis lourds → positionnés en bas si empilement possible
4. Colis groupés par destination → ensemble si voyage multi-escale
5. Colis en priorité déchargement → en accès direct (bord de pont)
6. Colis normaux → remplissage FFD
```

**FFD (First Fit Decreasing) 2D :**
1. Trier les colis par surface occupée (L×l) décroissante.
2. Pour chaque colis : trouver la première position libre qui l'accueille.
3. Utiliser l'algorithme Guillotine Split pour gérer les rectangles libres.
4. Essayer rotation à 90° si le colis ne rentre pas en position normale.
5. Si aucune position trouvée → colis signalé comme "non placé" (alerte).

**Vérification de charge surfacique :**
Pour chaque zone de la surface, vérifier que le poids des colis placés ne dépasse pas `max_surface_load_kg_m2`.

**Sorties de l'algorithme :**
- Position (x, y) de chaque colis sur chaque surface
- Rotation (0°, 90°, 180°, 270°)
- Niveau d'empilement (0 = sol)
- Taux d'utilisation de la surface (%)
- Poids total vs capacité max
- Centre de gravité estimé
- Liste des colis non placés (ne rentrent pas)
- Avertissements de règles non respectées

### 7.4 Validation manuelle et ajustements

Après la proposition de l'algorithme, le coordinateur peut :
- Déplacer un colis par drag & drop sur le plan
- Changer l'orientation d'un colis
- Déplacer un colis vers une autre surface
- Retirer un colis du layout (il sera chargé sur un prochain voyage)

Chaque modification manuelle est tracée (`placed_by = 'manual'` vs `'algorithm'`).

---

## 8. Journal de bord numérique

### 8.1 Concept

Chaque voyage a un journal de bord qui capture tous les événements significatifs de manière chronologique et horodatée. Ce journal remplace le journal de bord papier du capitaine.

**Sources des événements :**
- `logistician` : saisie par le coordinateur logistique depuis OpsFlux
- `captain_portal` : saisie par le capitaine depuis le portail dédié
- `iot_auto` : généré automatiquement depuis les données IoT (arrivée détectée par GPS)
- `mcp` : généré par un agent IA via le serveur MCP

### 8.2 Types d'événements

Les 22 types d'événements configurables (catalogue `voyage_event_types`) :

| Code | Label | Catégorie |
|---|---|---|
| `ARRIVED_AT` | Vecteur arrivé au point d'appareillage | navigation |
| `BOARDING_START` | Début embarquement PAX | pax_ops |
| `BOARDING_END` | Fin embarquement PAX | pax_ops |
| `CARGO_LOADING_START` | Début chargement cargo | cargo_ops |
| `CARGO_LOADING_END` | Fin chargement cargo | cargo_ops |
| `DEPARTURE` | Départ effectif | navigation |
| `UNDERWAY` | En route | navigation |
| `STANDBY` | Mise en attente | standby |
| `STANDBY_END` | Fin d'attente | standby |
| `STOPOVER` | Escale intermédiaire | navigation |
| `ANCHORED` | Mouillage | navigation |
| `STANDBY_REFUELLING` | Début ravitaillement | standby |
| `REFUELLING_END` | Fin ravitaillement | standby |
| `DISEMBARKATION_START` | Début débarquement PAX | pax_ops |
| `DISEMBARKATION_END` | Fin débarquement PAX | pax_ops |
| `CARGO_UNLOADING_START` | Début déchargement cargo | cargo_ops |
| `CARGO_UNLOADING_END` | Fin déchargement cargo | cargo_ops |
| `ARRIVED_DESTINATION` | Arrivée à destination | navigation |
| `WEATHER_UPDATE` | Mise à jour météo | weather |
| `INCIDENT` | Incident signalé | incident |
| `MAINTENANCE_STOP` | Arrêt technique | maintenance |
| `MAINTENANCE_END` | Fin arrêt technique | maintenance |

### 8.3 Prérequis (chain logique)

Le système valide que les événements sont enregistrés dans un ordre logique. Exemples de contraintes :
- `BOARDING_END` ne peut pas être saisi avant `BOARDING_START`
- `DEPARTURE` ne peut être saisi qu'après `BOARDING_END`
- `ARRIVED_DESTINATION` ne peut être saisi qu'après `DEPARTURE`

L'endpoint `GET /trips/:id/events/next-allowed` retourne la liste des événements valides contextuellement.

### 8.4 Payload des événements

Chaque événement peut avoir un payload structuré selon son type :
- `WEATHER_UPDATE` : `{wind_knots, wave_height_m, visibility_km, condition}`
- `INCIDENT` : `{description, severity, persons_involved}`
- `CARGO_LOADING_END` : `{cargo_weight_kg, items_count}`
- `BOARDING_END` : `{pax_count}`

### 8.5 Offline sur le portail capitaine

Le portail capitaine supporte le mode offline via Service Worker :
- Les événements saisis hors connexion sont mis en file d'attente locale (localStorage du navigateur)
- Quand la connexion revient, les événements sont envoyés au serveur dans l'ordre
- Le champ `offline_sync = true` marque les événements synchronisés a posteriori
- Le champ `recorded_at` conserve l'heure réelle de saisie sur l'appareil (pas l'heure de synchronisation)

---

## 9. Portail capitaine

### 9.1 Concept

Le portail capitaine est une mini-application légère séparée (`captain.app.opsflux.io`) destinée au capitaine du navire ou du vecteur. Il n'a pas de compte OpsFlux mais doit pouvoir :
- Voir le manifeste PAX du voyage
- Pointer les PAX embarqués / no-shows
- Enregistrer des événements dans le journal de bord
- Signaler des incidents ou des changements météo

### 9.2 Authentification par code

**Génération du code :** Le coordinateur logistique génère un code à 6 chiffres (+ QR code) pour le voyage. Ce code est valide pour toute la durée du voyage.

**Accès :** Le capitaine va sur `captain.app.opsflux.io/XXXXXX` (ou scanne le QR code). Il accède directement au voyage sans OTP.

**Ce que le capitaine peut faire :**
- Voir la liste des PAX du manifeste
- Pointer chaque PAX comme `boarded` en 1 clic
- Marquer un PAX comme `no_show`
- Enregistrer les événements du journal (BOARDING_START, DEPARTURE, etc.)
- Voir et saisir la météo
- Signaler un incident

**Ce que le capitaine ne peut pas faire :**
- Voir d'autres voyages
- Modifier le manifeste (ajouter/retirer des PAX)
- Accéder aux données PaxLog ou aux profils PAX complets

### 9.3 Sécurité du portail capitaine

- Le code est révocable à tout moment par le coordinateur
- Chaque accès est loggé dans `trip_code_access.access_log`
- Le code peut avoir une `expires_at` (optionnel — par défaut il expire à la fin du voyage)
- Rate limiting : 10 requêtes/min par IP

---

## 10. Tracking IoT et météo

### 10.1 Tracking GPS des vecteurs

**Architecture IoT :**
```
Device GPS → POST /api/v1/iot/vehicle-position (clé API device)
    → Redis cache (position courante, TTL 5min)
    → table vehicle_positions (historique partitionné par semaine)
    → SSE broadcast vers les clients connectés
```

**Authentification des devices :** Clé API par device, hash stocké dans `iot_devices`. Les positions envoyées sans clé valide sont rejetées.

**Stale detection :** Si aucun signal n'est reçu depuis un device actif depuis >5 minutes → l'anomalie `vehicle.signal_lost` est créée. Si le vecteur est en voyage → alerte urgente au coordinateur.

**Format de la position :**
```json
{
  "device_id": "GPS-HERA-P-001",
  "latitude": 3.8674,
  "longitude": 9.5234,
  "speed_knots": 12.5,
  "heading_deg": 180,
  "fuel_level_pct": 65,
  "status": "underway"
}
```

**SSE (Server-Sent Events) :** Les clients OpsFlux s'abonnent au stream de positions via `GET /api/v1/iot/stream?vehicle_ids=...`. Chaque mise à jour IoT est broadcastée en temps réel (<100ms).

**Dashboard type MarineTraffic :** Vue carte de tous les vecteurs actifs avec leurs positions, caps, vitesses et voyages en cours.

### 10.2 Données météo

**3 providers configurables :**
- `open_meteo` : gratuit, données météo générales (pas spécialisé maritime)
- `openweathermap` : gratuit dans les limites, données météo + mer
- `stormglass` : payant, spécialisé données marines (houle, période de vague, swell)

**Seuils d'alerte :** Configurable dans les paramètres (`WEATHER_WARN_BEAUFORT`). Si vent > seuil Beaufort → alerte automatique sur le voyage en cours.

**Sources des données météo :**
- `api_auto` : fetch automatique depuis le provider configuré
- `captain_manual` : saisie manuelle par le capitaine (depuis le portail)
- `logistician_manual` : saisie manuelle par le coordinateur
- `iot_sensor` : capteurs météo embarqués (si le vecteur en est équipé)

**Fetch automatique :** Déclenché à intervalles réguliers (configurable, ex: toutes les 30 minutes) pour les vecteurs en voyage.

---

## 11. Gestion des retours site (Back Cargo)

### 11.1 Les 5 types de retour

**`waste` (déchets DIS/DIB/DMET) :**
- Zone de stockage dédiée à l'arrivée obligatoire
- Marquage obligatoire (site/rig de provenance) sur chaque bac
- Bordereau d'expédition déchets obligatoire
- Signatures : OMAA + capitaine

**`contractor_return` (retour matériel sous-traitant) :**
- Laissez-passer initié par le chargé d'affaires Perenco
- Inventaire détaillé signé par le site ET le responsable sous-traitant
- Copie bleue du laissez-passer remise au magasin à l'arrivée
- Signatures : Site + responsable sous-traitant + Yard Officer

**`stock_reintegration` (réintégration stock) :**
- Code SAP obligatoire et confirmé pour chaque article
- Formulaire de réintégration signé
- Blocage si SAP non confirmé : "Code SAP confirmé obligatoire pour réintégration stock"
- Signature : Gestionnaire magasin

**`scrap` (rebut/ferraille) :**
- Mention "à rebuter/ferrailler" obligatoire sur le bordereau
- Si mention manquante : photo obligatoire + attente d'instruction avant dispatch
- Zone ferraille dédiée à l'arrivée
- Si matière dangereuse : validation QHSE supplémentaire obligatoire

**`yard_storage` (stockage base non SAP) :**
- Mention "stockage Yard" + justification obligatoire
- Bordereau précisant la justification du stockage hors SAP
- Signature : Yard Officer

### 11.2 Déclaration de retour sur site

**Processus (COMAN, OMAA ou déléguée) :**
1. Sélection du ou des colis à retourner depuis la liste des colis actifs sur le site.
2. Sélection du `return_type`.
3. Pour les packages : inventaire des éléments retournés vs envoyés :
   - `unit` : pointage pièce par pièce (présent / manquant / endommagé)
   - `bulk_quantity` : saisie de la quantité retournée
   - `consumable_volume` : saisie du volume/poids résiduel
4. Photos si requises ou si anomalie.
5. Soumission → génération d'un `CargoManifest` de type retour.

**Validation des prérequis avant soumission :**
```python
errors = back_cargo_workflow.validate_prerequisites(item, req)
if errors:
    raise HTTPException(400, detail=errors)
```

### 11.3 Rapport de déchargement

À l'arrivée au Yard, l'agent Freight & Handling effectue dans TravelWiz :
1. Contrôle physique des colis vs manifeste
2. Pointage des écarts : manquants, endommagés, non manifestés
3. Notation du poids réel si différent du déclaré
4. Signature de réception
5. Génération automatique du rapport de déchargement → diffusé aux destinataires configurés

---

## 12. KPIs du voyage

### 12.1 Calcul automatique à la clôture

Quand un voyage est clôturé → `trip.closed` déclenche le calcul de tous les KPIs depuis les événements du journal de bord.

**Durées par catégorie (parsées depuis les événements) :**
- Navigation : de `DEPARTURE` à `ARRIVED_DESTINATION`
- Standby : de `STANDBY` à `STANDBY_END` (cumulé)
- Embarquement : de `BOARDING_START` à `BOARDING_END`
- Débarquement : de `DISEMBARKATION_START` à `DISEMBARKATION_END`
- Chargement : de `CARGO_LOADING_START` à `CARGO_LOADING_END`
- Déchargement : de `CARGO_UNLOADING_START` à `CARGO_UNLOADING_END`
- Maintenance : de `MAINTENANCE_STOP` à `MAINTENANCE_END`
- Ravitaillement : de `STANDBY_REFUELLING` à `REFUELLING_END`

**Distance :**
1. Si positions GPS disponibles : calcul haversine sur la trace GPS
2. Sinon : distance haversine directe origine → destination
3. En dernier recours : saisie manuelle

**Productivité :** `navigation_time / total_time × 100`

### 12.2 Analytics flotte

Les KPIs individuels alimentent des tableaux de bord analytics :
- Taux d'utilisation par vecteur
- Taux de productivité moyen
- Consommation de carburant par mille nautique
- Taux de no-shows PAX
- Ponctualité (départs à l'heure)
- Incidents par route et par période
- Meilleure fenêtre de départ pour une route donnée (basée sur la météo historique)

---

## 13. RBAC détaillé TravelWiz

| Action | DO | LOG_COORD | TRANSP_COORD | SITE_MGR | PAX_ADMIN | READER |
|---|---|---|---|---|---|---|
| Créer un vecteur | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Modifier un vecteur | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Configurer surfaces de deck | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Créer un voyage | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Modifier voyage planifié | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Valider manifeste PAX | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Clôturer manifeste PAX | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Enregistrer cargo | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Déclarer retour site | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Valider manifeste cargo | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Configurer rotation | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |
| Valider rotation | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Lancer algo deck | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Valider layout deck | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Générer code capitaine | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Voir analytics/KPIs | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| Importer catalogue SAP | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ |
| Configurer IoT devices | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ |

---

## 14. Ramassage terrestre

### 14.1 Positionnement

Le ramassage est le premier tronçon du voyage. Il appartient à TravelWiz car c'est
du transport — un pré-acheminement terrestre vers le point d'embarquement.

Le point de ramassage est **déclaré dans l'AdS PaxLog** par le PAX ou le
demandeur (préférence de transport, avec historique pré-rempli). TravelWiz
consomme cette information pour construire les circuits terrain.

### 14.2 Flux complet

```
AdS approuvée
    → pax_pickup_points créés (depuis déclaration dans l'AdS)
    → LOG_BASE regroupe les points par voyage
    → Circuit optimisé (TSP) ou reordonné manuellement
    → PDF fiche de ramassage généré
    → PWA chauffeur activée
    → Ramassage en cours (points marqués en temps réel)
    → Arrivée à la jetty → intégration au manifeste PAX
```

### 14.3 Deux types de ramassage

**Standard :** vecteur avec `requires_pickup = true` → déclenche automatiquement
le workflow pour tous les PAX du voyage.

**Exceptionnel :** vecteur sans ramassage habituel, mais un PAX ou groupe le
demande → `is_exceptional = true` → approbation LOG_BASE requise avant intégration.

### 14.4 Optimisation du circuit

L'algorithme TSP (Travelling Salesman Problem) calcule l'ordre de passage optimal
pour minimiser la durée totale du circuit. Implémentation recommandée : OSRM
(open-source, déployable on-premise) pour éviter les coûts d'API Google à l'échelle.

Le LOG_BASE peut ajuster l'ordre par drag & drop après l'optimisation.

### 14.5 PWA chauffeur et géo-détection

Le chauffeur n'a pas de compte OpsFlux. Il accède à la PWA via un lien OTP généré
par le LOG_BASE, sur son smartphone.

La géo-détection (rayon 100m configurable) active automatiquement le bouton de
pointage lorsque le véhicule arrive à proximité d'un arrêt — même logique que
les apps de covoiturage type Yango.

Les SMS de pré-notification aux PAX (X min avant arrivée) sont envoyés automatiquement
via le provider SMS configuré (Twilio, Orange API, etc.).

---

## 15. Tracking complet d'un colis — vue utilisateur

### 15.1 L'identifiant unique : `tracking_number`

Chaque colis reçoit un numéro de tracking unique généré automatiquement à l'enregistrement : `CGO-2026-004521`. Ce numéro est :
- Imprimé sur l'étiquette physique du colis (PDF A6 avec QR code)
- Scannable pour accéder directement à la fiche du colis
- Recherchable dans la barre de recherche globale OpsFlux
- Référencé dans tous les manifestes et bordereaux liés

### 15.2 Timeline de tracking d'un colis

La fiche colis affiche l'historique chronologique de tous ses mouvements depuis `cargo_movements` — table append-only immuable.

```
Colis CGO-2026-004521
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Description : Basket outils E-LINE (unit)
Poids : 340 kg  |  Projet : Campagne E-LINE ESF1
SAP : 10043521 (confirmé)

─── TRACKING ──────────────────────────────────────────
● 14/09  09:00  Enregistré — Base Wouri
              Moise BAYANACK (clic)

● 14/09  10:30  Chargé — Wouri Jetty → HERA P
              Pont principal, position D4
              Moise BAYANACK + Capitaine ANTHONY (OTP)
              MAN-CGO-2026-01832 · TRIP-2026-03412

● 14/09  16:00  En transit — HERA P arrive à RDRW
              Système (via journal de bord)

● 14/09  17:15  Livré — ESF1
              Joseph ATEBA (signature tablette)

● 19/09  08:00  Retour déclaré — ESF1 → Base
              COMAN Roger (clic)
              Type retour : stock_reintegration
              SAP requis : confirmé

● 19/09  09:00  Chargé retour — ESF1 → HERA P
              Capitaine ANTHONY (OTP)
              MAN-CGO-2026-01901 · TRIP-2026-03445

● 19/09  15:30  Arrivé base — Wouri
              Système

● 19/09  16:00  Dispatché Yard — Base Wouri
              Yard Officer Alphonse (clic)

● 20/09  10:00  Réintégré magasin
              Gestionnaire stock (clic)
─── ────────────────────────────────────────────────────
Statut actuel : RÉINTÉGRÉ ✓
```

### 15.3 Étiquette physique (PDF A6 imprimable)

Générée depuis `GET /api/v1/travelwiz/cargo-items/:id/label` :

```
┌─────────────────────────────────────────────────┐
│  PERENCO CAMEROUN — LOGISTIQUE                  │
│                                                  │
│  [QR CODE]        CGO-2026-004521               │
│                                                  │
│  De : Base Wouri (Logistique)                   │
│  À  : ESF1 — Joseph ATEBA (E-LINE)             │
│                                                  │
│  Description : Basket outils E-LINE             │
│  Poids : 340 kg                                  │
│  Type  : unit                                    │
│                                                  │
│  Projet : Campagne E-LINE     SAP: 10043521     │
│  Slip N° : 2594                                  │
│                                                  │
│  Date : 14/09/2026    Exp : M.BAYANACK          │
└─────────────────────────────────────────────────┘
```

### 15.4 Anomalies tracées

Chaque anomalie sur un colis est tracée dans `cargo_movements` avec `anomaly=true` :
- Colis endommagé à la livraison
- Poids réel ≠ poids déclaré (> seuil configurable)
- Colis hors manifeste (arrivé sans être dans le manifeste)
- Retour partiel (quantité retournée < quantité envoyée)

L'anomalie génère automatiquement une notification au LOG_BASE et au responsable du service expéditeur.

---

## 16. Cohérence gestion des colis — règles de validation

### 16.1 Validation obligatoire du code SAP pour `stock_reintegration`

Si `return_type = 'stock_reintegration'` et `sap_code_status != 'confirmed'` → retour bloqué avec message :
```
Impossible de réintégrer en stock : le code SAP n'est pas confirmé.
Confirmez le code SAP ou changez le type de retour.
```

### 16.2 Cohérence quantités pour articles `bulk_quantity` et `consumable_*`

À chaque `return_declared`, le système vérifie :
```
quantity_returned <= quantity_sent
```
Si dépassement → erreur bloquante : "Quantité retournée supérieure à la quantité envoyée."

Si `quantity_returned < quantity_sent` → l'écart est calculé et tracé :
```
Écart : 3 unités non retournées (consommées ou perdues)
→ Saisir la raison (obligatoire) : [Consommées sur site / Perdues / Endommagées]
```

### 16.3 Photos obligatoires selon le contexte

Les étapes requérant une photo sont configurables par type d'article (`photo_required_stages` JSONB). Défauts :
- Toujours : `anomaly` (si anomalie signalée)
- `scrap` : `return` (preuve du retour pour ferrailler)
- Configurable : `loading`, `unloading`, `registration`

### 16.4 Modification d'un colis

| Action | Statut cargo | Motif requis | Qui peut |
|---|---|---|---|
| Modifier description/poids | `registered` | Non | LOG_BASE |
| Modifier description/poids | `loaded`/au-delà | **Oui** | LOG_BASE + motif |
| Modifier SAP code | Tout statut | Non (suggestion AI) | LOG_BASE |
| Modifier `return_type` | `return_declared` | **Oui** | LOG_BASE / CDS / DO |
| Annuler un colis | Avant `loaded` | Non | LOG_BASE |
| Annuler un colis | Après `loaded` | Impossible — créer un mouvement `anomaly_reported` | — |
