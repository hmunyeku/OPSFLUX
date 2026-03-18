# Cahier des Charges Fonctionnel — Module TravelWiz

> Ce document décrit la gestion logistique complète : transport du personnel,
> gestion du cargo, tracking des vecteurs, et coordination terrain.

---

## Sommaire

1. [Rôle et périmètre](#1-rôle-et-périmètre)
2. [Les vecteurs de transport](#2-les-vecteurs-de-transport)
3. [Voyages et manifestes PAX](#3-voyages-et-manifestes-pax)
4. [Cargo — de l'enregistrement à la livraison](#4-cargo--de-lenregistrement-à-la-livraison)
5. [Organisation de pont (Deck Planning)](#5-organisation-de-pont-deck-planning)
6. [Journal de bord et portail capitaine](#6-journal-de-bord-et-portail-capitaine)
7. [Retours site (Back Cargo)](#7-retours-site-back-cargo)
8. [Ramassage terrestre](#8-ramassage-terrestre)
9. [Tracking IoT et météo](#9-tracking-iot-et-météo)
10. [Urgences et situations exceptionnelles](#10-urgences-et-situations-exceptionnelles)
11. [KPIs et analytics](#11-kpis-et-analytics)
12. [Permissions](#12-permissions)

---

## 1. Rôle et périmètre

TravelWiz gère **tout ce qui se déplace physiquement** vers, depuis et entre les sites Perenco : les personnes (flux PAX) et le matériel (flux Cargo).

**Ce que TravelWiz fait :**
- Gérer les vecteurs de transport (hélicoptères, navires, buses, surfers...)
- Planifier les voyages et les rotations
- Créer et valider les manifestes de passagers
- Suivre le cargo de l'enregistrement à la livraison
- Tracer la position des vecteurs en temps réel (IoT)
- Organiser le ramassage terrestre des passagers
- Documenter les voyages (journal de bord)

**Ce que TravelWiz ne fait pas :**
- Décider qui a le droit de monter sur site (c'est PaxLog)
- Planifier les activités et gérer la capacité des sites (c'est Planner)

Le lien entre PaxLog et TravelWiz est automatique : quand une AdS est approuvée dans PaxLog, TravelWiz reçoit automatiquement l'information et prépare le manifeste.

---

## 2. Les vecteurs de transport

### 2.1 Enregistrement d'un vecteur

Un vecteur est tout moyen de transport — hélicoptère, navire, surfeur intra-champ, bus, 4×4, barge, vol commercial. TravelWiz traite tous les vecteurs de la même façon.

Chaque vecteur est décrit par :
- Immatriculation / indicatif / numéro de flotte
- Type (hélicoptère, navire, bus...) et mode (air, mer, route)
- Capacité passagers, capacité poids, capacité volume
- Base de départ habituelle
- Indicateur "pesée passagers obligatoire" (pour les hélicoptères et petits aéronefs)
- Pour les navires : numéro MMSI pour le tracking AIS automatique

### 2.2 Surfaces de chargement (Deck Planning)

Chaque vecteur peut avoir plusieurs zones de chargement définies (pont principal, pont arrière, soute). Pour chaque zone, on définit la forme (rectangle ou polygone), les dimensions, la charge maximale, et les zones d'exclusion (obstacles fixes).

Ces surfaces sont utilisées par l'outil d'organisation de pont (voir §5).

### 2.3 Rotations périodiques

Les rotations sont des voyages récurrents planifiés à l'avance. Exemple : "L'hélicoptère DOLPHIN fait le trajet Wouri → Munja tous les lundis à 7h00."

Le calendrier des rotations est configuré une fois par l'administrateur. Les voyages sont générés automatiquement selon le planning. Chaque rotation peut être suspendue, modifiée ou annulée individuellement.

---

## 3. Voyages et manifestes PAX

### 3.1 Cycle de vie d'un voyage

```
Planifié → Confirmé → Embarquement → Parti → Arrivé → Clôturé
                                  ↓
                            Retardé
                                  ↓
                            Annulé
```

### 3.2 Alimentation automatique du manifeste

Dès qu'une AdS est approuvée dans PaxLog, TravelWiz cherche automatiquement un voyage compatible (même destination, même période). Si un voyage existe, le PAX est ajouté au manifeste. Sinon, un nouveau voyage en statut "brouillon" est créé.

**Priorité de placement :** Quand la capacité est limitée, TravelWiz trie les PAX par score de priorité (urgence médicale, statut VIP, durée d'attente, risque de certification qui expire). Les moins prioritaires passent en liste d'attente (standby).

### 3.3 Gestion du poids (hélicoptères)

Pour les vecteurs qui l'exigent, le poids des passagers est collecté en deux temps :
1. **Déclaratif** dans l'AdS (prérempli depuis le profil si déjà connu)
2. **Repesage physique** par le capitaine au check-in (valeur finale utilisée pour la sécurité)

Si le poids total prévu dépasse 90% de la charge maximale, une alerte s'affiche. À 100%, les derniers passagers sont bloqués.

### 3.4 Voyage retardé

Quand un retard est déclaré par le coordinateur ou le capitaine :
1. Les passagers et LOG_BASE sont immédiatement notifiés avec la nouvelle heure estimée
2. Le manifeste reste valide — les PAX ne sont pas retirés
3. Si le délai dépasse le seuil configuré (défaut 4h), un bouton "Annuler et réassigner" devient disponible pour LOG_BASE
4. Le réassignement propose automatiquement les vecteurs alternatifs disponibles et transfère les PAX confirmés

### 3.5 Voyage multi-escales

Un voyage peut desservir plusieurs destinations dans le même trajet (ex : Wouri → Munja → ESF1 → RDRW). Chaque passager a une escale de débarquement précisée. La vue capitaine affiche les passagers à pointer par escale.

### 3.6 Manifeste PAX — validation et clôture

Le manifeste est validé avant le départ (LOG_BASE confirme la liste définitive). À l'arrivée, le capitaine ou l'OMAA pointe chaque passager :
- **Embarqué** : présent à bord
- **No-show aller** : absent sans raison — noté dans PaxLog, impact sur le score du PAX
- **No-show retour** : rentré par un autre moyen — l'OMAA doit confirmer la présence sur site

La clôture du manifeste retour déclenche la clôture automatique des AdS PaxLog correspondantes.

---

## 4. Cargo — de l'enregistrement à la livraison

### 4.1 Principe

Le flux cargo est indépendant du flux passagers mais peut utiliser les mêmes vecteurs. Un colis peut être envoyé sur le même navire qu'une équipe de techniciens.

### 4.2 Enregistrement d'un colis

Quand un colis arrive à la base pour partir sur site, LOG_BASE l'enregistre :
- Description, type de gestion (unité / vrac / consommable / emballage / déchet)
- Poids, dimensions
- Expéditeur, destinataire, site de destination
- Imputation projet / centre de coût
- Photos (optionnel, recommandé pour les colis fragiles ou HAZMAT)

À l'enregistrement, le système essaie de matcher automatiquement le colis avec un article SAP (en suggérant des correspondances basées sur la description). Le gestionnaire confirme ou corrige.

Un **numéro de tracking** est généré automatiquement (CGO-2026-NNNNN). Une étiquette PDF A6 avec QR code est imprimée pour coller sur le colis.

### 4.3 Cycle de vie d'un colis

```
Enregistré → Prêt pour chargement → Chargé → En transit
→ Livré intermédiaire (si multi-voyages) → Livré destination finale
```

En parallèle, des statuts d'anomalie peuvent s'ajouter : signalement de dommage, colis manquant.

### 4.4 Le manifeste cargo

LOG_BASE crée ou choisit un manifeste cargo pour un voyage. Les colis à expédier sont ajoutés au manifeste. Avant validation, certains colis peuvent nécessiter des vérifications :
- Les matières dangereuses (HAZMAT) nécessitent une validation HSE
- Les médicaments nécessitent une validation médicale

Le manifeste validé déclenche le chargement physique.

### 4.5 Scan QR — tracking terrain

À chaque étape physique (chargement, déchargement, réception), l'agent scan le QR code du colis. Le statut se met à jour automatiquement et la timeline du colis se complète.

Si plusieurs colis ont la même référence physique (même référence fournisseur), la liste des résultats est affichée et l'agent choisit le bon.

### 4.6 Réception et confirmation de livraison

À la livraison sur site, l'OMAA confirme la réception :
- Quantité reçue vs déclarée
- Signalement de dommage si applicable (avec photos obligatoires si dommage)
- Si le destinataire est absent : la réception est confirmée sans signature, avec notification

### 4.7 Rapport de déchargement

À la clôture d'un manifeste cargo, un rapport de déchargement est généré automatiquement. Il liste tous les colis, les écarts (manquants, endommagés), et est diffusé aux expéditeurs concernés.

### 4.8 Colis immobile — alerte

Si un colis reste dans le même statut depuis plus de N jours (configurable, défaut 5), une alerte est déclenchée pour LOG_BASE.

---

## 5. Organisation de pont (Deck Planning)

### 5.1 Concept

Pour les vecteurs avec des surfaces de chargement définies (navires, barges), TravelWiz propose un outil visuel d'organisation du chargement cargo.

L'organisateur voit le plan du pont et place les colis virtuellement. L'outil vérifie automatiquement :
- Que la charge totale ne dépasse pas le maximum
- Que la pression surfacique par zone est respectée
- Que les HAZMAT sont dans les zones autorisées

### 5.2 Algorithme automatique

Sur demande, l'algorithme optimise automatiquement la disposition (algorithme de bin-packing 2D) en tenant compte des contraintes de poids et de la priorité de déchargement (les premiers à décharger sont accessibles en premier).

---

## 6. Journal de bord et portail capitaine

### 6.1 Journal de bord numérique

Pendant le voyage, le capitaine documente les événements en temps réel :
- Heures réelles de départ et d'arrivée
- Conditions météo
- Événements techniques (pannes, incidents)
- Consommation carburant
- Incidents de sécurité

Ce journal constitue un document officiel qui ne peut pas être modifié après clôture.

### 6.2 Portail capitaine

Le capitaine accède à OpsFlux via un portail simplifié sur tablette ou smartphone, protégé par un code à 6 chiffres (valide 48h). Il n't a pas besoin de compte OpsFlux.

Depuis son portail, le capitaine peut :
- Voir la liste de ses passagers et pointer les embarquements/débarquements
- Saisir les poids des passagers (pour les vecteurs qui l'exigent)
- Déclarer un retard ou une urgence
- Alimenter le journal de bord
- Consulter la météo et l'état des vecteurs

Le portail fonctionne aussi en mode hors-ligne. Les données sont synchronisées dès le retour de la connexion.

---

## 7. Retours site (Back Cargo)

Tout ce qui revient du site (matériel, déchets, équipements) est géré comme du "back cargo". Cinq types de retour, chacun avec ses prérequis documentaires :

| Type | Prérequis |
|---|---|
| Déchet | Zone dédiée, bordereau de déchet, marquage obligatoire |
| Retour sous-traitant | Laissez-passer, inventaire des éléments, double signature |
| Réintégration stock | Code SAP confirmé obligatoire, formulaire de réintégration |
| Ferraille | Mention "ferraille" obligatoire ou photos, zone spécifique |
| Stockage Yard | Mention "stockage Yard" + justification |

Le processus est le même qu'un cargo sortant, mais dans le sens inverse : déclaration sur site par l'OMAA, manifeste inbound, arrivée à la base, dispatch selon le type.

---

## 8. Ramassage terrestre

### 8.1 Concept

Pour les voyages au départ d'un port ou d'un aéroport, les passagers doivent être acheminés depuis leur domicile ou lieu de travail vers le point d'embarquement. Ce service de navette est géré dans TravelWiz.

### 8.2 Circuit de ramassage

1. Chaque passager renseigne son point de ramassage dans son AdS (adresse, choix sur carte interactive, ou depuis l'historique)
2. LOG_BASE crée le circuit de ramassage en regroupant les points géographiquement proches
3. L'algorithme optimise automatiquement l'ordre de passage
4. Une feuille de route est générée pour le chauffeur
5. Le chauffeur accède à son application mobile via un code OTP — pas de compte OpsFlux requis

### 8.3 Suivi en temps réel

Sur l'application du chauffeur :
- GPS en temps réel de la navette, visible sur la carte LOG_BASE
- À 100m d'un point de ramassage → le chauffeur peut confirmer "ramassé" d'un tap
- À 5 minutes d'arrivée → un SMS est envoyé automatiquement au passager

### 8.4 Gestion des no-shows

Si un passager est absent à son point de ramassage, le chauffeur le marque "no-show". LOG_BASE est alerté et peut décider d'attendre ou de continuer le circuit.

---

## 9. Tracking IoT et météo

### 9.1 Position des vecteurs en temps réel

OpsFlux reçoit les positions des vecteurs depuis plusieurs sources :
- **AIS** (Automatic Identification System) : standard maritime, automatique pour les navires équipés
- **GPS embarqué** : tracker GPS installé sur le vecteur
- **Saisie manuelle** : le capitaine ou le coordinateur saisit la position via le portail

En cas de sources multiples sur un même vecteur, la source avec la priorité la plus élevée est utilisée (configurable par vecteur). Si la source principale ne donne plus de signal depuis 5 minutes (configurable), la source secondaire prend le relais.

Les positions sont affichées en temps réel sur la carte OpsFlux.

### 9.2 Position stale

Si aucune position n'est reçue depuis 15 minutes (configurable), le vecteur est marqué "signal perdu" sur la carte. Une alerte est envoyée si la perte de signal dure.

### 9.3 Météo

OpsFlux récupère automatiquement les conditions météo pour les vecteurs actifs (vent, houle, visibilité). Si le vent dépasse la force 6 de l'échelle Beaufort (configurable), une alerte est affichée sur le voyage concerné.

---

## 10. Urgences et situations exceptionnelles

### 10.1 Déclaration d'urgence

Le capitaine ou tout utilisateur habilité peut déclarer une urgence depuis TravelWiz :
- **Panne vecteur** : le vecteur est immobilisé
- **Urgence médicale à bord** : un passager nécessite une assistance médicale urgente
- **Incident de sécurité** : tout incident affectant la sécurité des personnes à bord

La déclaration déclenche immédiatement une notification de priorité maximale à LOG_BASE, DO, et CMEDIC (pour les urgences médicales).

### 10.2 Plan de contingence

Quand un voyage est annulé après que les passagers soient déjà au point d'embarquement, OpsFlux liste automatiquement les alternatives disponibles (autres vecteurs sur des voyages compatibles) et facilite le réacheminement.

---

## 11. KPIs et analytics

À la clôture de chaque voyage, OpsFlux calcule automatiquement :
- Taux de remplissage passagers (PAX réels / capacité)
- Taux de ponctualité (départ à l'heure ?)
- Nombre de no-shows
- Taux de productivité cargo (charge réelle / charge max)

Ces KPIs alimentent les tableaux de bord et permettent de suivre la performance logistique dans le temps.

Des alertes sont déclenchées si la productivité tombe en dessous d'un seuil configurable (défaut 70%).

---

## 12. Permissions

| Action | DO | LOG_BASE | TRANSP_COORD | CAPITAINE | OMAA | DEMANDEUR |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Créer/modifier un voyage | ✓ | ✓ | ✓ | — | — | — |
| Valider un manifeste PAX | ✓ | ✓ | ✓ | — | — | — |
| Pointer les embarquements | ✓ | ✓ | ✓ | ✓ (portail) | ✓ | — |
| Enregistrer du cargo | ✓ | ✓ | — | — | ✓ | ✓* |
| Créer un manifeste cargo | ✓ | ✓ | — | — | — | — |
| Organisation de pont | ✓ | ✓ | ✓ | — | — | — |
| Déclarer urgence | ✓ | ✓ | ✓ | ✓ (portail) | ✓ | — |
| Configurer vecteurs | ✓ | ✓ | ✓ | — | — | — |
| Gérer ramassage | ✓ | ✓ | ✓ | — | — | — |

*pour son propre cargo
