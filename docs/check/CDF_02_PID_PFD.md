# OpsFlux — Cahier des Charges Fonctionnel
# Module PID/PFD — Schémas de Procédé et TagRegistry

---

## 1. Vision générale

Le module PID/PFD transforme les schémas de procédé (Piping & Instrumentation Diagrams)
en base de données vivante. Chaque symbole posé sur un dessin représente un objet réel
(équipement, instrument, ligne de procédé) avec ses propriétés techniques, son historique
et ses liens avec les autres données OpsFlux.

L'objectif n'est pas de remplacer un logiciel de CAO mais de relier le dessin aux données :
un ingénieur peut cliquer sur une pompe sur le schéma et voir instantanément
ses documents de maintenance, ses tags DCS, ses rapports d'intervention.

---

## 2. Documents PID/PFD

### 2.1 Types de documents

| Type | Signification |
|---|---|
| **Process** | Schéma principal de procédé (PID standard) |
| **Utilitaires** | Circuits eau, vapeur, air instrument |
| **Instrumentation** | Boucles de contrôle et logique |
| **Électrique** | Alimentation et équipements électriques |
| **Démolition** | Équipements à décommettre |
| **Modification** | Révisions en cours sur un schéma existant |
| **As-Built** | Situation réelle après construction |

### 2.2 Numérotation

Chaque PID reçoit un numéro officiel suivant la convention Perenco.
Ce numéro est immuable après création.

### 2.3 Statuts d'un PID

| Statut | Signification |
|---|---|
| **IFC** | Issued for Comment — en cours de révision |
| **IFD** | Issued for Design — approuvé pour conception |
| **AFC** | Approved for Construction — approuvé pour travaux |
| **As-Built** | État final réel de l'installation |
| **Obsolète** | Remplacé par une version plus récente |
| **Archivé** | Retiré de la circulation |

### 2.4 Formats et révisions

Format de feuille : A0, A1, A2, A3 selon la complexité.
Chaque révision est un snapshot immuable du dessin à ce moment.
Les révisions sont numérotées : 0, A, B, C... ou selon la convention du projet.

---

## 3. Éditeur PID

### 3.1 Principe

L'éditeur PID est intégré directement dans OpsFlux. L'ingénieur dessine
sans quitter l'application. Deux vues simultanées sont disponibles :
- Le canvas de dessin (à gauche, occupe la majorité de l'écran)
- Le panneau de propriétés de l'objet sélectionné (à droite)

### 3.2 Verrouillage pour la collaboration

Un seul ingénieur peut éditer un PID à la fois (verrouillage optimiste).
Si un collègue ouvre un PID déjà en cours d'édition, il voit :
"Ce PID est en cours d'édition par [Nom]. Lecture seule."
avec l'heure d'expiration du lock (30 minutes d'inactivité).

Un admin peut forcer la libération du lock en cas d'urgence.

### 3.3 Sauvegarde

La sauvegarde est manuelle (bouton "Sauvegarder" ou ⌘S).
Après chaque sauvegarde, OpsFlux analyse le contenu du dessin
et synchronise automatiquement la base de données des équipements
et des lignes de procédé. Cette synchronisation est silencieuse
et dure quelques secondes.

### 3.4 PID sur mobile et tablette

L'éditeur PID nécessite un écran desktop. Sur mobile et tablette,
les PID sont consultables en lecture seule uniquement.

---

## 4. Bibliothèque d'objets process

### 4.1 Concept

La bibliothèque contient tous les symboles process disponibles :
pompes, séparateurs, échangeurs de chaleur, vannes, instruments...
Chaque symbole est conforme aux standards de représentation utilisés
chez Perenco (IEC, ISA ou standards internes).

### 4.2 Organisation

Les symboles sont organisés par catégorie :
- Récipients et séparateurs
- Pompes et compresseurs
- Échangeurs de chaleur
- Vannes (on/off, de régulation)
- Instruments (transmetteurs, analyseurs)
- Lignes de procédé et raccordements
- Équipements électriques

### 4.3 Accès depuis l'éditeur

La bibliothèque est accessible directement dans le panneau de gauche
de l'éditeur draw.io. L'ingénieur fait glisser un symbole sur le canvas.
Les symboles OpsFlux apparaissent dans la section "OpsFlux" de la bibliothèque draw.io,
aux côtés des bibliothèques standard.

### 4.4 Propriétés d'un objet de bibliothèque

Chaque symbole de bibliothèque est accompagné d'un schéma de propriétés :
les champs techniques qui lui sont associés (tag, pression de design,
température, fluide, capacité...). Quand l'ingénieur pose le symbole,
ces champs vides apparaissent dans le panneau "Données" de draw.io.

### 4.5 Création de nouveaux symboles

Le gestionnaire PID peut créer de nouveaux symboles :
- Importer un SVG depuis AutoCAD ou un dessin existant
- Définir les propriétés associées (champs techniques)
- Définir les points de connexion (entrée, sortie, drain, évent...)
- Tester dans un PID de test
- Publier dans la bibliothèque

---

## 5. Synchronisation dessin ↔ base de données

### 5.1 Principe fondamental

Chaque objet posé sur un PID avec un tag renseigné est automatiquement
créé ou mis à jour en base de données lors de la sauvegarde.
Il y a deux façons de modifier les propriétés d'un équipement :
1. Directement dans le panneau "Données" de draw.io (modifie le dessin)
2. Depuis la fiche de l'équipement dans OpsFlux (les modifications se
   répercutent au prochain rechargement du PID)

### 5.2 Suppression d'un objet

La suppression d'un objet du canvas a un comportement différent selon le contexte :

**Projet en cours de construction (nouveau projet) :**
L'objet est supprimé physiquement de la base de données.

**Projet existant (installation en production) :**
L'objet est marqué "Retiré du PID" mais reste en base de données.
L'équipement existe toujours physiquement, il a juste été retiré
de ce schéma. Il reste visible dans les autres PID où il apparaît.

### 5.3 Conflits de tags

Si deux objets ont le même tag dans le même projet,
un avertissement s'affiche dans le panneau de propriétés.
La sauvegarde est possible mais le conflit est signalé.

---

## 6. Équipements process

### 6.1 Fiche équipement

Chaque équipement a une fiche avec :
- Tag unique dans le projet
- Type d'équipement (pompe, séparateur, vanne...)
- Description et service
- Fluide traité et phase (liquide, gaz, mixte)
- Données de design (pression, température)
- Données opératoires (pression, température normales)
- Matériau de construction
- Capacité (avec unité)
- Localisation géographique (si l'équipement est sur une plateforme géolocalisée)
- PID(s) où il apparaît
- Tags DCS associés
- Documents liés (maintenance, spécification, historique)

### 6.2 Recherche d'équipement

La recherche globale permet de retrouver un équipement par son tag.
Taper "P-101" affiche immédiatement la liste des pompes correspondantes
avec leurs PID.

### 6.3 Lien vers l'asset registry

Un équipement process peut être lié à un asset du registre d'assets.
Ce lien permet de consulter depuis la fiche de l'équipement toutes
les informations de l'asset (localisation GPS, documents de maintenance...).

---

## 7. Lignes de procédé

### 7.1 Numérotation des lignes

Une ligne de procédé est identifiée par un numéro suivant la convention standard :
Diamètre nominal - Code fluide - Classe de spécification - Séquence

**Exemple :** 6"-HC-A1B-001
- 6" : diamètre nominal (pouces)
- HC : hydrocarbures (code fluide)
- A1B : classe de spécification (pression, matériau)
- 001 : numéro de séquence

### 7.2 Propriétés d'une ligne

- Diamètre nominal (pouces et mm)
- Programme et classe de tuyauterie
- Fluide transporté (nom complet)
- Isolation thermique ou acoustique
- Traçage (électrique ou vapeur)
- Données de design (pression, température)
- Matériau de construction
- Longueur estimée

### 7.3 Continuation entre feuilles

Quand une ligne de procédé sort d'une feuille de PID et continue sur une autre,
le flag de continuation est enregistré avec la référence de la feuille suivante.
Cela permet le traçage multi-PID.

---

## 8. Traçage multi-PID

### 8.1 Fonctionnement

L'ingénieur peut demander le traçage complet d'une ligne de procédé :
"Montrez-moi toutes les feuilles de PID où la ligne 6"-HC-001 apparaît."

Le système retourne :
- La liste de tous les PID où cette ligne est présente
- Les équipements connectés à cette ligne sur chaque feuille
- Les flags de continuation entre feuilles

### 8.2 Navigation

Depuis le résultat du traçage, l'ingénieur peut ouvrir directement
n'importe quelle feuille de PID avec la ligne mise en évidence.

---

## 9. TagRegistry (Registre des tags DCS)

### 9.1 Vision

Le TagRegistry est le référentiel de tous les instruments et actionneurs
connectés au système de contrôle-commande (DCS Rockwell).
C'est la source de vérité pour les noms des tags dans les schémas et documents.

### 9.2 Qu'est-ce qu'un tag DCS ?

Un tag DCS est l'identifiant d'un instrument ou actionneur dans le système
de contrôle. Exemples :
- PT-1011 : transmetteur de pression (PT) numéro 1011
- BIP-TT-101 : transmetteur de température (TT) zone BIP numéro 101
- XV-2045 : vanne on/off (XV) numéro 2045

### 9.3 Informations associées à un tag

- Nom du tag (clé primaire)
- Type d'instrument (PT, TT, FT, LT, XV, FV, etc.)
- Zone/Area d'installation
- Description fonctionnelle
- Équipement sur lequel il est installé (lien vers l'équipement process)
- Plage de mesure et unité d'ingénierie
- Seuils d'alarme (basse, haute)
- Seuils de déclenchement (basse, haute)
- Adresse DCS
- Source (importé du DCS, saisi manuellement, suggéré par l'IA)

### 9.4 Types d'instruments supportés

| Code | Description |
|---|---|
| PT | Transmetteur de pression |
| TT | Transmetteur de température |
| FT | Transmetteur de débit |
| LT | Transmetteur de niveau |
| PDT | Transmetteur de pression différentielle |
| AT | Analyseur |
| XV | Vanne on/off |
| FV | Vanne de régulation débit |
| LV | Vanne de régulation niveau |
| PV | Vanne de régulation pression |
| HS | Sélecteur manuel |
| ZT | Transmetteur de position |

---

## 10. Règles de nommage des tags

### 10.1 Principe

Chaque tenant configure ses propres règles de nommage pour garantir
la cohérence et la conformité aux standards internes.

### 10.2 Construction d'une règle

Une règle de nommage est construite à partir de segments :

| Type de segment | Description | Exemple |
|---|---|---|
| Zone/Area | Liste déroulante de zones prédéfinies | BIP, EBM, CLV |
| Type instrument | Rempli automatiquement selon le type sélectionné | PT, TT, FV |
| Séquence numérique | Numéro incrémental avec N chiffres | 001, 0042 |
| Séquence alphanumérique | Séquence base-36 | A1, Z9 |
| Code libre | Texte fixe | PROD, UTIL |

**Séparateur :** Configurable (tiret par défaut).

**Exemple de règle :** {AREA}-{TYPE}-{SEQ:3}
→ Pour un PT en zone BIP : BIP-PT-001, BIP-PT-002...

### 10.3 Modes de validation

**Mode strict (recommandé) :** La création d'un tag dont le nom ne respecte pas
la règle active est bloquée. Un message d'erreur indique la règle à suivre.

**Mode souple :** Un avertissement s'affiche mais la création est autorisée.
Utile pendant la phase de migration de données existantes.

### 10.4 Suggestions automatiques

Lors de la création d'un tag, OpsFlux propose 2 à 3 suggestions de noms
conformes à la règle active. Les suggestions tiennent compte :
- Du prochain numéro de séquence disponible
- Des tags existants dans la même zone pour cohérence
- Du contexte de l'équipement associé (si renseigné)

---

## 11. Import de tags depuis le DCS

### 11.1 Principe

Le gestionnaire PID peut importer massivement les tags depuis un fichier
CSV exporté du système Rockwell. Cela permet de synchroniser le TagRegistry
OpsFlux avec l'état réel du DCS.

### 11.2 Processus d'import

**Étape 1 — Upload :**
Sélectionner le fichier CSV (export Rockwell standard ou format personnalisé).

**Étape 2 — Mapping des colonnes :**
OpsFlux propose un mapping automatique basé sur les noms de colonnes.
L'utilisateur ajuste si nécessaire : "Colonne TAG_NAME → Nom du tag", etc.

**Étape 3 — Validation et prévisualisation :**
OpsFlux analyse les données et affiche un rapport :
- X tags seront créés (nouveaux)
- X tags seront mis à jour (déjà existants)
- X erreurs détectées : tag non conforme à la règle, doublon, valeur invalide

L'utilisateur peut corriger les erreurs ou les ignorer (les erreurs sont ignorées,
les autres lignes sont importées).

**Étape 4 — Import :**
Confirmation → import → rapport final avec statistiques.

### 11.3 Comportement en cas de doublon

Si un tag importé existe déjà, les champs présents dans le CSV
mettent à jour les champs existants. La source passe à "importé CSV".

---

## 12. Versionning et diff de PID

### 12.1 Créer une révision

L'ingénieur peut créer une révision officielle d'un PID :
- Saisie d'un code de révision (0, A, B... ou As-Built)
- Saisie d'une description des changements
- Saisie du type de changement (modification, démolition, as-built, correction)

La révision est un snapshot immuable. Le dessin actuel reste modifiable
pour préparer la révision suivante.

### 12.2 Comparaison entre révisions

En sélectionnant deux révisions d'un même PID, un rapport de différences
est généré :
- Objets ajoutés (nouveaux équipements ou instruments)
- Objets supprimés (équipements retirés)
- Objets modifiés (propriétés changées)

Ce rapport est exportable en PDF pour la documentation des modifications.

---

## 13. Exports

### 13.1 Export SVG

Le PID est exporté en format vectoriel SVG haute résolution.
Utilisé pour l'intégration dans des rapports ou présentations.

### 13.2 Export PDF

Le PID est exporté en PDF au format de la feuille (A0, A1...).
Le cartouche officiel est inclus. Qualité impression.

### 13.3 Export DXF (futur)

Un export DXF basique est prévu pour la compatibilité avec AutoCAD.
Les propriétés OpsFlux sont perdues dans cette conversion (format CAO standard).

---

## 14. Règles métier importantes

### 14.1 Tag unique par projet

Un tag est unique au sein d'un projet. Deux projets différents peuvent
avoir un tag portant le même nom sans conflit.

### 14.2 PID verrouillé en production

Un PID au statut AFC ou As-Built ne peut pas être modifié directement.
Pour le modifier, il faut créer une nouvelle révision.

### 14.3 Cohérence des propriétés

Quand un ingénieur modifie les propriétés d'un équipement depuis le panneau
de propriétés (hors draw.io), les changements sont répercutés dans le dessin
au prochain chargement. Le dessin reste la source de vérité pour la position
et la connectivité des équipements ; OpsFlux reste la source de vérité
pour leurs propriétés techniques.

### 14.4 Validation avant passage AFC

Avant qu'un PID puisse passer au statut AFC (Approuvé pour Construction),
OpsFlux vérifie que tous les équipements et instruments du dessin ont
leurs propriétés obligatoires renseignées. Les propriétés manquantes
sont listées dans un rapport de validation.

