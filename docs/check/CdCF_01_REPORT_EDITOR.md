# OpsFlux — Cahier des Charges Fonctionnel
# MODULE ÉDITEUR DE DOCUMENTS (REPORT EDITOR)
# Version 1.0 — Usage interne Perenco

---

## OBJET DU DOCUMENT

Ce document décrit l'ensemble des fonctionnalités du module de gestion et d'édition documentaire d'OpsFlux. Il couvre la création, la rédaction, la validation, la publication et la distribution des documents techniques et opérationnels de Perenco.

---

## 1. VISION GÉNÉRALE DU MODULE

### 1.1 Finalité

Le module Éditeur de Documents centralise la production documentaire de Perenco : rapports de production, procédures opératoires, fiches techniques, notes de service, comptes-rendus. Il remplace les échanges par email et les dossiers partagés par un système structuré, traçable et collaboratif.

### 1.2 Principes fondamentaux

**Numérotation automatique** — Chaque document reçoit un numéro unique et permanent attribué au moment de sa création, selon une nomenclature configurable par l'administrateur.

**Contrôle de version** — Toute modification approuvée d'un document génère une nouvelle révision. L'historique complet des révisions est conservé.

**Circuit de validation** — Chaque type de document peut être associé à un circuit de validation défini à l'avance. La publication d'un document ne peut se faire qu'après l'approbation des validateurs désignés.

**Collaboration temps réel** — Plusieurs utilisateurs peuvent travailler simultanément sur le même document et voir les modifications des autres en direct.

---

## 2. ORGANISATION DES DOCUMENTS

### 2.1 Projets et arborescences

Les documents sont organisés par **projets**. Chaque projet dispose d'une arborescence libre que l'administrateur peut structurer selon les besoins opérationnels (par zone géographique, par discipline, par activité).

Un document appartient à un projet et peut être positionné dans un nœud de l'arborescence. Il peut être déplacé dans l'arborescence sans changer son numéro.

### 2.2 Types de documents

Chaque document a un **type** (ex : Rapport de production, Procédure, Fiche technique, Compte-rendu). Le type détermine :
- Le template à utiliser pour la rédaction
- Le circuit de validation applicable
- La nomenclature pour le numéro

Les types de documents sont créés et configurés par le gestionnaire de templates.

### 2.3 Nomenclature

Le numéro d'un document est généré automatiquement selon un pattern configurable par l'administrateur. Le pattern peut inclure des segments variables : code du projet, code de la BU, code du type de document, discipline, phase, séquence numérique, année.

Exemples de numéros générés :
- `RPT-PCM-BIPAGA-0042` (Rapport Perenco Cameroun BIPAGA, séquence 42)
- `PRC-PCM-BIPAGA-2025-007` (Procédure avec année et séquence)

Une fois attribué, le numéro d'un document ne change jamais, même si le document est archivé.

Les séquences numériques peuvent utiliser des caractères alphanumériques pour réduire la longueur des codes (ex : `A4` au lieu de `36`).

---

## 3. CYCLE DE VIE D'UN DOCUMENT

### 3.1 Statuts

Un document traverse les statuts suivants :

**Brouillon (draft)** — Document en cours de rédaction. Visible uniquement par l'auteur et les administrateurs. Modifiable librement.

**En révision (in_review)** — Document soumis au circuit de validation. L'éditeur passe en lecture seule pour l'auteur. Les validateurs peuvent consulter et commenter.

**Approuvé (approved)** — Tous les validateurs ont donné leur accord. L'auteur peut publier le document.

**Publié (published)** — Document officiel, accessible à tous les utilisateurs selon leurs droits. La distribution automatique est déclenchée.

**Archivé (archived)** — Document obsolète. Toujours consultable mais ne remonte plus dans les listes standard.

### 3.2 Transitions entre statuts

```
Brouillon → En révision : action "Soumettre" par l'auteur
En révision → Approuvé : tous les validateurs approuvent
En révision → Brouillon : un validateur rejette
Approuvé → Publié : action "Publier" par l'auteur
Publié → [Nouvelle révision] : action "Nouvelle révision" → retour à Brouillon
Tout statut → Archivé : action de l'administrateur
```

### 3.3 Révisions

Quand un document publié doit être mis à jour, l'auteur crée une nouvelle révision. Le contenu du document approuvé précédent est copié dans la nouvelle révision, prête à être modifiée.

Les révisions suivent une codification : `0` (provisoire), `A`, `B`, `C`... (révisions approuvées successives).

La révision `0` est la première version du document, encore en phase de validation. Elle devient `A` lors de la première approbation. Les modifications suivantes donnent `B`, `C`, etc.

---

## 4. RÉDACTION — L'ÉDITEUR

### 4.1 Structure d'un document

Un document est composé de **sections** définies dans son template. Chaque section peut être de différents types :

**Cartouche** — Bloc d'identification officiel en haut du document. Contient le numéro, le titre, la révision, le statut, la date et la classification. Ce bloc est rempli automatiquement et ne peut pas être modifié par le rédacteur.

**Section formulaire** — Ensemble de champs structurés (dates, valeurs numériques, listes déroulantes, références). Ces champs correspondent aux données opérationnelles clés du document (ex : production journalière en bbl/j, pression séparateur, etc.).

**Section texte libre** — Zone de saisie riche permettant la rédaction libre avec mise en forme (titres, paragraphes, listes, tableaux, images).

**Section données connectées** — Affiche automatiquement des données provenant d'un système externe (DCS, base de données). Le rédacteur ne saisit pas ces données ; elles sont rafraîchies automatiquement ou à la demande.

**Tableau de saisie** — Grille de données structurées (ex : tableau des arrêts, tableau de maintenance).

### 4.2 Saisie des champs formulaire

Dans une section formulaire, chaque champ se remplit directement par double-clic. La saisie est validée immédiatement sans bouton de sauvegarde. Les champs obligatoires sont signalés clairement.

La touche Tabulation permet de naviguer de champ en champ. Entrée valide le champ et passe au suivant.

### 4.3 Éditeur de texte riche

La section texte libre offre les fonctionnalités suivantes :
- Titres et sous-titres (jusqu'à 3 niveaux)
- Paragraphes avec mise en forme (gras, italique, souligné)
- Listes à puces et listes numérotées
- Tableaux (créer, ajouter des lignes/colonnes, fusionner des cellules)
- Images (upload par glisser-déposer, redimensionnement)
- Liens hypertextes

### 4.4 Données connectées

Une section "données connectées" est liée à un connecteur de données configuré. Elle affiche les données sous forme de :
- **KPI** : une valeur unique avec sa tendance
- **Graphique** : courbe ou histogramme sur une période
- **Tableau** : données tabulaires

À chaque ouverture du document, les données sont rafraîchies. Le rédacteur peut aussi forcer un rafraîchissement manuel. Lors de l'export en PDF, les données sont figées au moment de l'export (snapshot).

### 4.5 Sauvegarde automatique

Le document est sauvegardé automatiquement toutes les 30 secondes (configurable par l'utilisateur). Un indicateur indique l'état de sauvegarde en permanence.

### 4.6 Collaboration simultanée

Plusieurs utilisateurs peuvent ouvrir et modifier simultanément le même document. Les curseurs de chaque collaborateur sont visibles en temps réel avec leur nom. Les modifications de chacun apparaissent instantanément pour les autres.

Les champs formulaire supportent la collaboration : si deux utilisateurs modifient des champs différents en même temps, les deux modifications sont préservées. S'ils modifient le même champ, la dernière saisie est conservée.

---

## 5. TEMPLATES DE DOCUMENTS

### 5.1 Rôle des templates

Un template définit la structure d'un type de document : quelles sections il contient, quels champs sont dans chaque section, quelles données sont affichées automatiquement. Il est créé et maintenu par le gestionnaire de templates.

### 5.2 Création d'un template

L'interface de création de template est visuelle. Le gestionnaire compose son template en ajoutant des sections dans l'ordre souhaité, choisit le type de chaque section et configure les champs un par un.

Pour chaque champ de formulaire, il définit :
- L'identifiant unique du champ (ne change plus après création)
- Le label (dans toutes les langues activées)
- Le type de données (texte, nombre, date, liste, référence...)
- Si le champ est obligatoire
- Si le champ est verrouillé (valeur automatique non modifiable par le rédacteur)
- La valeur par défaut éventuelle

Les sections peuvent être réordonnées par glisser-déposer.

### 5.3 Versions de templates

Un template peut évoluer. La création d'une nouvelle version du template n'affecte pas les documents existants qui conservent leur ancienne version. Les nouveaux documents utilisent automatiquement la dernière version active.

### 5.4 Classification et styles

Le gestionnaire peut configurer dans le template :
- Le logo et les couleurs utilisés dans l'export PDF
- La classification par défaut (Confidentiel, Restreint, Usage interne, Public)
- Les sections verrouillées que le rédacteur ne peut pas modifier

---

## 6. CIRCUIT DE VALIDATION (WORKFLOW)

### 6.1 Définition d'un circuit

L'administrateur définit des circuits de validation réutilisables. Un circuit est une séquence d'étapes (nœuds) reliées par des transitions.

Chaque étape est configurée avec :
- Un libellé (ex : "Révision technique", "Approbation management")
- Les validateurs désignés (un rôle ou des utilisateurs spécifiques)
- Une deadline optionnelle (nombre de jours avant relance automatique)
- L'action à effectuer en cas de rejet (retour à l'auteur ou retour à une étape précédente)

### 6.2 Types d'étapes

**Étape séquentielle** — Un validateur unique doit approuver ou rejeter. Le circuit n'avance qu'après sa décision.

**Étape parallèle** — Plusieurs validateurs sont sollicités simultanément. Le circuit avance selon un seuil configurable : unanimité, majorité, ou un nombre précis d'approbateurs.

**Étape conditionnelle** — Le circuit emprunte un chemin différent selon la valeur d'un champ du document (ex : montant supérieur à un seuil → approbation supplémentaire requise).

**Étape de notification** — Envoie une notification à un groupe sans bloquer l'avancement du circuit.

### 6.3 Déroulement d'une validation

**Du côté de l'auteur :**
Lorsque le document est prêt, l'auteur clique "Soumettre pour validation". Il peut ajouter un commentaire. Le document passe en statut "En révision" et l'auteur ne peut plus le modifier.

L'auteur peut annuler le circuit tant qu'il est à la première étape et n'a pas encore été traité par un validateur.

**Du côté du validateur :**
Le validateur reçoit une notification (email + in-app) avec le lien vers le document. Il consulte le document en lecture seule.

Il peut ajouter des commentaires directement dans le texte (commentaires inline). Il peut également saisir un commentaire général dans le panneau de révision.

Il dispose de deux options :
- **Approuver** — le circuit avance à l'étape suivante
- **Rejeter** — le circuit s'interrompt et le document retourne à l'auteur avec le motif de rejet (obligatoire)

**En cas de rejet :**
L'auteur reçoit une notification avec le motif du rejet. Il corrige le document et le resoumet. Le compteur de révision n'augmente pas lors des allers-retours en validation (la révision `0` reste `0` jusqu'à la première approbation finale).

### 6.4 Suivi du circuit

Un panneau de révision s'affiche dans la fiche du document lorsqu'il est en cours de validation. Il montre :
- Les étapes du circuit avec leur statut (en attente, en cours, approuvé, rejeté)
- Les validateurs de chaque étape
- Les commentaires et décisions de chacun
- La date de chaque action

### 6.5 Deadlines et relances

Si une deadline est configurée pour une étape et que le validateur n'a pas agi dans les délais, une notification de relance est envoyée automatiquement. Le gestionnaire de documents voit également un indicateur visuel "En retard" sur les documents concernés.

### 6.6 Délégation

Si un validateur est absent, il peut déléguer ses droits à un collègue pour une période définie. Le délégué reçoit les notifications du délégant et peut agir en son nom. L'action est tracée comme effectuée "par délégation de".

---

## 7. PUBLICATION ET DISTRIBUTION

### 7.1 Publication

Après approbation finale, l'auteur clique "Publier". Cette action est distincte de l'approbation pour permettre à l'auteur de vérifier une dernière fois avant la mise à disposition générale.

La publication déclenche automatiquement la distribution si des listes de distribution sont configurées.

Un document publié peut être dépublié par l'administrateur (retour au statut "Approuvé") en cas d'erreur, dans un délai raisonnable.

### 7.2 Listes de distribution

L'administrateur peut configurer des listes de distribution associées à des types de documents. Quand un document de ce type est publié, une copie PDF est automatiquement envoyée par email à tous les destinataires de la liste.

Les destinataires peuvent être des utilisateurs OpsFlux ou des adresses email externes (partenaires, prestataires).

La liste de distribution affiche également un onglet "Envois" qui récapitule tous les envois effectués avec leur statut (envoyé, échoué).

### 7.3 Export

À tout moment, un utilisateur autorisé peut exporter un document en :
- **PDF** — rendu fidèle avec le cartouche officiel Perenco, le logo, la mise en page du template. Le PDF est généré de façon asynchrone et téléchargeable dès qu'il est prêt.
- **Word (.docx)** — version éditable du document, utile pour les échanges avec des parties externes.

---

## 8. RECHERCHE ET CONSULTATION

### 8.1 Liste des documents

La liste des documents présente par défaut les documents récents de la BU active. Elle peut être filtrée par :
- Statut (brouillon, en révision, approuvé, publié, archivé)
- Type de document
- Projet
- Auteur
- Période de création ou de modification
- Classification

Les filtres actifs sont mémorisés entre les sessions.

### 8.2 Accès selon le rôle

| Rôle | Documents visibles |
|---|---|
| Lecteur | Documents publiés de sa BU uniquement |
| Éditeur | Ses propres brouillons + tous les documents publiés de sa BU |
| Réviseur | Tous les documents de sa BU y compris en révision |
| Admin | Tous les documents du tenant |

### 8.3 Vue détaillée

La vue détaillée d'un document présente :
- Le contenu du document (lecture ou édition selon les droits)
- L'historique des révisions avec accès à chaque version archivée
- Le statut et l'avancement du circuit de validation
- Les commentaires et annotations
- Les pièces jointes
- Les objets liés (assets, équipements...)
- L'historique complet des actions

---

## 9. IMPORT DE DOCUMENTS EXISTANTS

### 9.1 Import de documents legacy

Pour faciliter la migration depuis l'existant, l'utilisateur peut importer un document Word ou PDF existant. L'assistant d'import analyse automatiquement le document et tente d'extraire les valeurs des champs formulaire du template correspondant.

L'utilisateur voit un aperçu des données extraites et peut les corriger avant de confirmer l'import. Le document est créé en statut brouillon avec les données pré-remplies.

Cette fonctionnalité est particulièrement utile pour numériser les rapports papier ou les anciens fichiers Excel.

---

## 10. GESTION DES STATUTS SPÉCIAUX

### 10.1 Documents verrouillés

Un document publié et approuvé est automatiquement verrouillé : personne ne peut le modifier. Pour le mettre à jour, il faut créer une nouvelle révision.

### 10.2 Documents archivés

L'archivage retire un document des listes standard sans le supprimer. Un document archivé reste consultable via la recherche ou en activant le filtre "Archivés". Son numéro reste réservé et ne peut être réattribué.

La suppression définitive d'un document n'est possible que pour les brouillons jamais soumis, par leur auteur.

---

## 11. NOMENCLATURE — RÈGLES COMPLÈTES

### 11.1 Segments de la nomenclature

L'administrateur construit le pattern de numérotation en combinant des segments :

**Segments fixes** — une valeur constante définie à la configuration (ex : `PCM`)

**Segments variables** :
- `{PROJ}` — code du projet sélectionné à la création
- `{BU}` — code de la BU
- `{TYPE}` — code du type de document
- `{DISC}` — code de discipline
- `{PHASE}` — phase du projet
- `{YEAR}` — année en cours (2 ou 4 chiffres)
- `{SEQ:N}` — séquence numérique sur N chiffres (ex : SEQ:4 → 0001, 0002...)
- `{ALPHA_SEQ:N}` — séquence alphanumérique (A0, A1... ZZ) pour les codes courts

Le séparateur entre segments est configurable (tiret, underscore, point, rien).

### 11.2 Gestion des séquences

La séquence est unique par combinaison de type + projet. Deux documents du même type dans des projets différents ont des séquences indépendantes.

Quand une séquence approche de la limite de son format (ex : 9900 pour SEQ:4), l'administrateur reçoit un avertissement pour ajuster le pattern avant saturation.

Si la séquence dépasse la limite, les chiffres supplémentaires s'ajoutent naturellement (0001 → 9999 → 10000).

Un numéro libéré par la suppression d'un brouillon peut être réattribué si aucun autre document n'a été créé depuis.

---

## 12. CAS D'UTILISATION COMPLETS

### Cas 1 : Rapport journalier de production

1. L'opérateur de terrain ouvre OpsFlux depuis sa tablette (ou son PC)
2. Il clique "+ Nouveau document" → sélectionne le projet BIPAGA → type "Rapport de production journalier"
3. OpsFlux attribue automatiquement le numéro `RPT-PCM-BIPAGA-0043`
4. Le template pré-rempli s'ouvre avec le cartouche rempli, la date du jour et les champs de production vides
5. L'opérateur saisit les valeurs de production, pression, température (saisie directe dans les champs)
6. La section "Tendances" se remplit automatiquement avec les données du DCS des 7 derniers jours
7. L'opérateur rédige ses commentaires opérationnels dans la section texte libre
8. Il clique "Soumettre" → le superviseur reçoit une notification
9. Le superviseur lit le rapport, approuve → l'opérateur reçoit notification d'approbation
10. L'opérateur publie → le rapport est distribué automatiquement par email au groupe "Direction BIPAGA"

### Cas 2 : Mise à jour d'une procédure

1. Un ingénieur process constate qu'une procédure de démarrage est obsolète
2. Il ouvre la procédure publiée `PRC-PCM-BIPAGA-0012` et clique "Nouvelle révision"
3. La révision `B` est créée en brouillon avec le contenu de la révision `A`
4. L'ingénieur modifie les étapes concernées
5. Il soumet → le circuit de validation à 3 approuveurs est déclenché
6. Les 3 approbateurs reçoivent la notification
7. 2 approuvent, 1 rejette avec commentaire "Manque la vérification de pression"
8. L'ingénieur reçoit le rejet, corrige, resoumet
9. Les 3 approuvent → procédure en statut "Approuvé Rev B"
10. L'ingénieur publie → l'ancienne révision A est automatiquement archivée, la révision B est la référence

### Cas 3 : Document d'urgence

1. Un incident se produit en pleine nuit
2. L'ingénieur de permanence ouvre OpsFlux sur mobile → connexion en 3G
3. OpsFlux est en mode hors ligne → il crée un brouillon de rapport d'incident localement
4. À la reconnexion → le rapport est synchronisé automatiquement
5. Il le soumet → le chef de quart est notifié

