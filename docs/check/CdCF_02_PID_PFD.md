# OpsFlux — Cahier des Charges Fonctionnel
# MODULE PID/PFD — SCHÉMAS DE PROCÉDÉ ET INSTRUMENTATION
# Version 1.0 — Usage interne Perenco

---

## OBJET DU DOCUMENT

Ce document décrit l'ensemble des fonctionnalités du module PID/PFD d'OpsFlux. Il couvre la création, la gestion et la maintenance des schémas de procédé et d'instrumentation (P&ID), du registre d'équipements, du registre de tags DCS et de la bibliothèque d'objets process.

---

## 1. VISION GÉNÉRALE

### 1.1 Finalité

Un P&ID (Piping and Instrumentation Diagram) est le schéma de référence d'une installation industrielle. Il représente l'ensemble des équipements, des tuyauteries et des instruments de contrôle d'un procédé. Dans le contexte de Perenco, un P&ID est un document d'ingénierie vivant qui doit refléter en permanence l'état réel de l'installation.

Le module PID/PFD d'OpsFlux permet de :
- Dessiner et maintenir les PID directement dans l'interface web
- Relier chaque objet graphique à une fiche de données en base
- Naviguer dans le procédé à travers plusieurs schémas (traçage multi-PID)
- Gérer le registre des tags DCS (instruments de mesure et de contrôle)
- Maintenir une bibliothèque d'objets process standardisés

### 1.2 Lien avec l'Asset Registry

Les équipements représentés dans les PID peuvent être liés aux assets de l'Asset Registry. Un puits, une plateforme ou un équipement majeur peut être présent à la fois dans le registre d'assets et dans un PID.

---

## 2. DOCUMENTS PID/PFD

### 2.1 Types de schémas

Le module gère plusieurs types de schémas :

**Process Flow Diagram (PFD)** — Vue d'ensemble simplifié d'un procédé, montrant les équipements principaux et les flux entre eux. Niveau de détail moins élevé que le PID.

**Piping and Instrumentation Diagram (PID)** — Schéma détaillé montrant tous les équipements, tuyauteries, vannes, instruments et connexions. Document de référence pour les opérations et la maintenance.

**Schéma utilitaire** — PID dédié aux fluides auxiliaires (vapeur, eau de refroidissement, azote, air instrument).

**Schéma électrique** — Représentation simplifiée des alimentations électriques des équipements.

**Schéma de démantèlement** — PID marquant les équipements et tuyauteries à retirer dans le cadre d'une modification.

**As-built** — Version définitive du PID reflétant l'état réel de l'installation après travaux.

### 2.2 Formats de feuille

Les PID peuvent être créés aux formats standards : A0, A1, A2, A3. Le format A1 est le standard par défaut pour les installations Perenco.

### 2.3 Numérotation des PID

Chaque PID reçoit un numéro unique suivant la nomenclature définie. Exemple : `PID-PCM-BIPAGA-0101` pour le premier PID de l'installation BIPAGA de Perenco Cameroun.

### 2.4 Statuts d'un PID

Un PID suit le cycle de vie suivant :

**IFC (Issued for Comment)** — Version provisoire soumise à commentaires. Modifiable.

**IFD (Issued for Design)** — Version stabilisée pour la conception. Modifiable avec validation.

**AFC (Approved for Construction)** — Version approuvée pour les travaux. Modifications très encadrées.

**As-Built** — Version finale reflétant le construit réel. Modifications interdites sans processus formel.

**Obsolète** — PID remplacé par une version plus récente.

---

## 3. L'ÉDITEUR PID

### 3.1 Interface de l'éditeur

L'éditeur PID est intégré directement dans OpsFlux. Il s'ouvre en pleine page avec :
- Un canvas de dessin au centre
- Une barre d'outils en haut
- Le panneau de propriétés de l'objet sélectionné à droite

### 3.2 Dessin des objets

Pour dessiner un équipement ou un instrument :
1. L'utilisateur ouvre le panneau de bibliothèque d'objets
2. Il cherche ou navigue dans les catégories (pompes, cuves, échangeurs, vannes, instruments...)
3. Il fait glisser l'objet souhaité sur le canvas
4. L'objet est positionné sur le canvas avec ses points de connexion préétablis

Les objets peuvent être déplacés, redimensionnés, copiés et supprimés librement.

### 3.3 Connexions

Pour connecter deux équipements :
- Cliquer sur un point de connexion d'un objet (cercle visible au survol)
- Tracer la ligne jusqu'au point de connexion de l'objet cible
- La connexion est automatiquement enregistrée en base (liaison entre les deux équipements)

Les connexions peuvent être typées (ligne de procédé, ligne d'instrumentation, ligne d'utilitaire, drain, event).

### 3.4 Propriétés des objets

Lorsqu'un objet est sélectionné sur le canvas, son panneau de propriétés s'affiche à droite. Les propriétés sont éditables directement depuis ce panneau.

Les données saisies dans les propriétés sont synchronisées automatiquement en base de données lors de chaque sauvegarde. Ces données deviennent interrogeables via la recherche et l'IA.

### 3.5 Labels dynamiques

Le label affiché sur chaque objet du canvas correspond au tag de l'équipement ou de l'instrument. Si le tag est modifié dans le panneau de propriétés, le label sur le canvas se met à jour automatiquement.

### 3.6 Sauvegarde

L'utilisateur sauvegarde manuellement son travail via le bouton "Sauvegarder" ou le raccourci clavier. Chaque sauvegarde déclenche une synchronisation des données du schéma vers la base de données (extraction automatique des équipements, instruments et connexions).

### 3.7 Verrouillage en édition

Un PID ne peut être modifié que par un utilisateur à la fois. Quand un utilisateur ouvre un PID en édition, un verrou est posé pendant 30 minutes. Si un second utilisateur tente d'ouvrir ce PID, il voit un message "PID en cours de modification par [nom]" et peut seulement le consulter en lecture seule.

Le verrou est libéré automatiquement si l'éditeur ferme sa session ou si 30 minutes s'écoulent sans activité. Un administrateur peut forcer la libération du verrou.

---

## 4. REGISTRE D'ÉQUIPEMENTS

### 4.1 Données d'un équipement

Chaque équipement posé sur un PID génère automatiquement une fiche dans le registre d'équipements. Cette fiche contient :

**Identification** :
- Tag (identifiant unique : ex. V-101, P-101A)
- Description
- Type d'équipement (cuve, pompe, compresseur, échangeur, vanne, séparateur...)
- Service (ex : "Séparateur de production")

**Données de procédé** :
- Pression de design (barg)
- Température de design (°C)
- Pression d'exploitation
- Température d'exploitation
- Fluide traité
- Phase du fluide (liquide, gaz, mixte)

**Données de capacité** :
- Valeur et unité (m³, m³/h, kW, bbl/j selon le type)

**Données d'ingénierie** :
- Matériau de construction
- Classe de pression (ASME)

**Liens** :
- PID(s) où l'équipement apparaît
- Asset lié (si l'équipement est dans l'Asset Registry)
- Tags DCS installés sur cet équipement

### 4.2 Gestion des suppressions

Si un équipement est effacé du canvas d'un PID et que ce PID appartient à un projet existant en exploitation, la fiche de l'équipement n'est pas supprimée de la base. Elle est marquée "retiré du PID" mais reste consultable. Cela permet de conserver l'historique.

Si le PID appartient à un nouveau projet en phase de conception, l'effacement de l'équipement sur le canvas entraîne la suppression de sa fiche en base.

---

## 5. REGISTRE DE TAGS DCS (TAGREGISTRY)

### 5.1 Qu'est-ce qu'un tag DCS ?

Un tag DCS est l'identifiant d'un instrument dans le système de contrôle commande (DCS) de l'installation. Par exemple :
- `BIP-PT-101` : transmetteur de pression en zone BIPAGA, séquence 101
- `BIP-TT-205` : transmetteur de température, séquence 205
- `BIP-FV-302` : vanne de régulation de débit, séquence 302

### 5.2 Types d'instruments

Les principaux types de tags gérés :
- **PT** — Transmetteur de pression
- **TT** — Transmetteur de température
- **FT** — Transmetteur de débit
- **LT** — Transmetteur de niveau
- **PDT** — Transmetteur de pression différentielle
- **AT** — Analyseur
- **XV** — Vanne tout-ou-rien
- **FV / LV / PV** — Vannes de régulation (débit, niveau, pression)
- **HS** — Sélecteur manuel
- **ZT** — Transmetteur de position

### 5.3 Données d'un tag

Chaque tag contient :
- Nom du tag (identifiant DCS)
- Type d'instrument
- Zone / installation (BIP, EBM, CLV...)
- Description
- Équipement sur lequel il est installé
- Adresse dans le DCS
- Plage de mesure (min/max)
- Unité d'ingénierie
- Seuils d'alarme (bas / haut)
- Seuils de déclenchement (trip)

### 5.4 Import depuis le DCS Rockwell

La principale source de données pour le TagRegistry est l'export CSV du système DCS (Rockwell Allen-Bradley). Ce fichier est généré par l'équipe automatisme et importé dans OpsFlux.

**Processus d'import** :
1. L'utilisateur charge le fichier CSV
2. OpsFlux affiche un aperçu avec la correspondance des colonnes
3. L'utilisateur valide ou ajuste le mapping des colonnes
4. OpsFlux analyse et affiche un rapport de validation :
   - Tags conformes aux règles de nommage
   - Tags en doublon (déjà existants)
   - Tags non conformes avec détail de l'erreur
5. L'utilisateur valide l'import
6. Résultats : tags créés, mis à jour, ignorés (doublons), en erreur

### 5.5 Règles de nommage

L'administrateur PID configure des règles de nommage pour standardiser les tags. Une règle définit un pattern composé de segments :
- **Zone** : sélection parmi une liste de zones (BIP, EBM, CLV...)
- **Type** : code du type d'instrument (PT, TT, FT...)
- **Séquence** : numéro sur N chiffres

Exemple de pattern : `{ZONE}-{TYPE}-{SEQ:3}` → génère `BIP-PT-101`

En mode strict, tout tag ne respectant pas les règles est refusé à la saisie et à l'import. En mode souple, un avertissement est affiché mais la création reste possible.

### 5.6 Suggestions automatiques de noms

Quand un utilisateur crée un nouveau tag, OpsFlux suggère automatiquement des noms conformes aux règles :
1. Le prochain numéro de séquence disponible pour le type et la zone choisis
2. Des alternatives contextuelles basées sur les tags existants similaires

L'utilisateur peut accepter une suggestion ou saisir son propre nom (soumis à validation selon le mode configuré).

### 5.7 Validation d'un nom de tag

Avant toute création, OpsFlux vérifie :
- La conformité au pattern de la règle applicable
- L'absence de doublon dans le projet
- L'absence d'espace
- La mise en majuscules (convention standard)

### 5.8 Renommage en masse

Le gestionnaire PID peut renommer plusieurs tags en une seule opération. Tous les PID où ces tags apparaissent sont mis à jour automatiquement.

---

## 6. TRAÇAGE MULTI-PID

### 6.1 Principe

Une installation industrielle complexe est représentée sur plusieurs feuilles de PID. Une ligne de procédé peut traverser plusieurs feuilles (ex : une ligne de 6 pouces apparaît sur PID-0101 Sheet 1 puis continue sur PID-0102 Sheet 2).

Le traçage permet de suivre une ligne de procédé ou un équipement à travers tous les PID où il apparaît.

### 6.2 Traçage d'une ligne

L'utilisateur saisit un numéro de ligne de procédé (ex : `6"-HC-A1B-001`). Le système affiche :
- La liste de tous les PID où cette ligne apparaît
- Les équipements connectés à cette ligne sur chaque PID
- Les références de continuation (passage d'un PID à l'autre)

Un clic sur un PID dans les résultats ouvre directement ce PID avec la ligne mise en surbrillance.

### 6.3 Traçage d'un équipement

L'utilisateur cherche un équipement par son tag (ex : `V-101`). Le système affiche tous les PID où cet équipement apparaît, avec les connexions entrantes et sortantes sur chaque PID.

### 6.4 Flags de continuation

Quand une ligne sort d'une feuille de PID pour continuer sur une autre, un flag de continuation est automatiquement détecté et affiché. Il indique le numéro de PID et le numéro de sheet de continuation.

---

## 7. RÉVISIONS ET VERSIONNING

### 7.1 Révisions d'un PID

Comme pour les documents, un PID peut être révisé. Chaque révision porte un code (0, A, B, C...) et est immuable une fois créée.

La création d'une nouvelle révision sauvegarde une copie complète du XML du schéma, qui ne peut plus être modifiée. C'est la version de référence pour cette révision.

### 7.2 Comparaison de révisions

L'utilisateur peut comparer deux révisions d'un même PID. Le système identifie et liste :
- Les équipements ajoutés
- Les équipements supprimés
- Les équipements modifiés (changement de propriétés)
- Les connexions ajoutées ou supprimées

### 7.3 Navigation entre révisions

Depuis la fiche d'un PID, l'utilisateur peut consulter n'importe quelle révision passée en lecture seule. Les révisions archivées ne peuvent plus être modifiées.

---

## 8. BIBLIOTHÈQUE D'OBJETS PROCESS

### 8.1 Principe

La bibliothèque contient les symboles process standardisés utilisés pour dessiner les PID. Elle est basée sur les normes internationales (ISA 5.1, ISO 10628) et les standards internes Perenco.

### 8.2 Organisation

Les objets sont organisés en catégories :
- Cuves et réservoirs
- Pompes (centrifuges, volumétriques...)
- Compresseurs
- Échangeurs de chaleur
- Séparateurs
- Vannes (manuelles, automatiques, de régulation...)
- Filtres
- Colonnes
- Instruments et analyseurs
- Accessoires (coudes, réducteurs, raccords...)

### 8.3 Données d'un objet de bibliothèque

Chaque objet de la bibliothèque contient :
- Le symbole graphique (représentation SVG normée)
- Le nom et la catégorie
- Les propriétés que ses instances peuvent renseigner (ex : pression de design, débit nominal...)
- Les points de connexion et leur type (procédé, instrument, drain, event...)

### 8.4 Création d'un objet de bibliothèque

Le gestionnaire PID peut créer de nouveaux objets :
1. Il upload ou dessine le symbole graphique
2. Il définit le nom, la catégorie et la description
3. Il configure les propriétés (liste des champs et leurs types)
4. Il place les points de connexion sur le symbole
5. Il teste l'objet dans un PID de test
6. Il publie → l'objet est disponible pour tous les utilisateurs

### 8.5 Versionnement des objets

Modifier un objet de bibliothèque crée une nouvelle version. Les PID existants qui utilisent l'ancienne version ne sont pas affectés ; ils continuent d'afficher la version utilisée lors de leur création.

---

## 9. EXPORT

### 9.1 Export SVG

Export en image vectorielle haute résolution du PID. Utilisable pour l'impression ou l'insertion dans d'autres documents.

### 9.2 Export PDF

Export en PDF au format de la feuille configurée (A0, A1, A2, A3), avec le cartouche officiel Perenco, le titre, le numéro, la révision et la date. Le PDF est généré de façon asynchrone et téléchargeable dès qu'il est prêt.

### 9.3 Export DXF

Export au format AutoCAD DXF, utilisable pour échanges avec des bureaux d'études. (Fonctionnalité avancée)

---

## 10. CAS D'UTILISATION COMPLETS

### Cas 1 : Création d'un nouveau PID

1. L'ingénieur process crée un nouveau PID pour l'extension BIPAGA
2. Il choisit le format A1, le type "PID Process", le projet "Extension BIPAGA 2025"
3. Le numéro `PID-PCM-BIPAGA-0158` est attribué automatiquement
4. Il ouvre la bibliothèque → catégorie "Séparateurs" → fait glisser un "Séparateur 3 phases" sur le canvas
5. Il renseigne le tag `V-201`, la pression de design 65 barg, le fluide HC+eau+gaz
6. Il ajoute les pompes de relèvement en aval, les connexe avec les lignes de procédé
7. Il ajoute les instruments (PT, LT, FT) en cliquant dans le menu instruments
8. Il sauvegarde → les 12 équipements et 8 instruments sont créés en base
9. Il soumet le PID au circuit de validation (IFC → IFD)

### Cas 2 : Import des tags DCS après mise en service

1. L'équipe automatisme exporte les 1 200 tags du nouveau DCS Rockwell en CSV
2. L'ingénieur instrument importe le fichier dans OpsFlux → module TagRegistry
3. OpsFlux analyse : 1 150 tags valides, 32 doublons (déjà existants), 18 erreurs
4. Pour les erreurs : `BIP_PT_105` → "Le séparateur _ doit être remplacé par -"
5. L'ingénieur corrige les 18 erreurs dans le fichier et relance → import complet
6. Les 1 150 nouveaux tags sont disponibles, liés automatiquement aux équipements correspondants via leur tag base

### Cas 3 : Traçage d'un incident

1. Une alarme se déclenche sur le tag `BIP-PT-205`
2. L'ingénieur cherche ce tag dans OpsFlux → TagRegistry
3. Il clique "Voir sur PID" → le PID-0101 s'ouvre centré sur l'instrument PT-205
4. Il identifie que PT-205 est sur la ligne `6"-HC-A1B-012`
5. Il lance le traçage de cette ligne → la ligne apparaît sur 3 PID
6. Il suit le traçage pour identifier tous les équipements en amont et en aval de l'incident

