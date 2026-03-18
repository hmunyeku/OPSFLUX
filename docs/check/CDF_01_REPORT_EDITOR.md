# OpsFlux — Cahier des Charges Fonctionnel
# Module RÉDACTEUR DE DOCUMENTS

---

## 1. Vision générale

Le Rédacteur est le cœur documentaire d'OpsFlux. Il permet de créer, réviser,
valider et publier des documents structurés : rapports de production, procédures,
comptes-rendus, spécifications techniques.

Sa particularité : chaque document combine du contenu libre (texte riche, images,
tableaux) et des données structurées (formulaires avec champs typés, données
temps réel issues de connecteurs). Ces deux dimensions coexistent dans le même
document et sont toutes deux incluses dans l'export PDF final.

---

## 2. Nomenclature et numérotation

### 2.1 Principe

Chaque document reçoit un numéro unique et immuable à sa création.
Ce numéro suit un pattern de nomenclature défini par l'administrateur.

### 2.2 Structure d'un numéro

Un numéro est composé de segments séparés par des tirets. Chaque segment
peut être :
- **Un code fixe** : le code du tenant, de la BU, du projet
- **Un code de type** : abréviation du type de document (RPT, PRC, SPC...)
- **Une séquence** : numéro incrémental avec nombre de chiffres défini (001, 0001...)
- **Une séquence alphanumérique** : base 36 pour les codes courts (A1, B2, Z9...)
- **L'année** : année courante sur 4 chiffres
- **Une partie libre** : saisie par l'auteur à la création (phase, discipline...)

**Exemple :** RPT-PCM-BIPAGA-0042 = Type RPT, Tenant PCM, BU BIPAGA, séquence 0042

### 2.3 Attribution du numéro

Le numéro est attribué à la création du document, de façon atomique
(deux créations simultanées reçoivent des numéros différents).
Il est affiché immédiatement et ne peut plus être modifié.

Si un document est supprimé (uniquement les brouillons jamais soumis),
son numéro n'est pas réattribué par défaut. L'admin peut autoriser la
réutilisation uniquement si le document supprimé était le dernier de la séquence.

### 2.4 Alerte de dépassement de capacité

Quand une séquence approche de sa limite (ex: 9900/9999),
l'admin reçoit une notification recommandant d'étendre le pattern
(passer de SEQ:4 à SEQ:5, ou adopter un suffixe alphanumérique).

---

## 3. Types de documents et templates

### 3.1 Types de documents

Un type de document définit la nature d'un document : RPT (rapport), PRC (procédure),
SPC (spécification), CR (compte-rendu), etc. Chaque type a :
- Un code court (3-5 caractères)
- Un libellé complet en plusieurs langues
- Un template par défaut associé
- Un circuit de validation par défaut associé
- La nomenclature de numérotation associée

Les types sont configurés par l'admin tenant dans les Settings.

### 3.2 Templates

Un template définit la structure d'un document : quelles sections, dans quel ordre,
avec quels champs de formulaire. Un template peut comporter :

**Section Cartouche :** En-tête officiel du document avec le logo, le numéro,
la révision, le statut, la date, l'auteur, la classification. Toujours verrouillé —
l'auteur ne peut pas le modifier manuellement.

**Section Formulaire :** Ensemble de champs structurés avec types définis
(date, nombre, référence, liste déroulante...). L'auteur remplit ces champs.
Chaque champ peut être marqué obligatoire ou optionnel.

**Section Texte libre :** Éditeur riche pour le contenu narratif.
L'auteur écrit librement : paragraphes, titres, listes, images, tableaux.

**Section Données connectées :** Un bloc lié à une source externe (connecteur).
Affiche automatiquement les données les plus récentes : une valeur KPI,
un graphe de tendance, un tableau de données. Les données sont figées
lors de l'export PDF.

**Section Tableau de saisie :** Un tableau avec lignes ajoutables par l'auteur.
Utilisé pour les arrêts de production, les maintenances, les événements.

### 3.3 Héritage et versioning des templates

Chaque template a une version. Quand un template est modifié,
une nouvelle version est créée. Les documents existants conservent
leur version de template. Les nouveaux documents utilisent la dernière version.

L'admin peut activer ou désactiver un template. Un template désactivé
n'apparaît plus dans la liste de création, mais les documents existants
qui l'utilisent ne sont pas affectés.

---

## 4. Création d'un document

### 4.1 Déclenchement

Bouton "+ Nouveau document" dans la liste des documents.
Raccourci clavier disponible.

### 4.2 Assistant de création (3 étapes)

**Étape 1 — Projet :**
Sélectionner le projet auquel appartient le document.
Le sélecteur propose d'abord les projets de la BU active.
Optionnel : sélectionner un nœud dans l'arborescence du projet.

**Étape 2 — Type de document :**
Sélectionner le type parmi les types actifs pour ce projet.
Un aperçu du template associé et du circuit de validation s'affiche.
Le numéro qui sera attribué est affiché en aperçu.

**Étape 3 — Titre et options :**
Saisir le titre du document (obligatoire).
Si le pattern de nomenclature contient des parties libres (phase, discipline...),
les saisir ici.
Choisir la langue du document.

À la validation, le document est créé avec le statut "Brouillon" et la révision "0".
L'éditeur s'ouvre automatiquement.

---

## 5. Éditeur de documents

### 5.1 Structure visuelle

L'éditeur est divisé en zones :

**Barre d'outils du document (en haut) :**
Numéro | Révision | Statut | [Sauvegarder] [Soumettre] [Exporter] [...]
Indicateur de sauvegarde automatique | Collaborateurs en ligne

**Corps du document (zone principale) :**
Cartouche (verrouillé) suivi des sections du template.

**Panneau de révision (à droite, visible en mode révision) :**
Liste des commentaires inline | Boutons Approuver/Rejeter

### 5.2 Cartouche

Le cartouche en haut du document est généré automatiquement depuis les métadonnées.
Il n'est pas modifiable directement. Il affiche toujours les informations
les plus à jour : titre, numéro, révision, statut, date de modification.

### 5.3 Sections formulaire

Dans une section formulaire, chaque champ est directement éditable :
double-clic (ou simple clic selon la configuration) pour éditer inline.
La valeur se sauvegarde automatiquement.

Les champs obligatoires sont identifiés par un badge distinctif.
Un document avec des champs obligatoires non remplis ne peut pas
être soumis au workflow (le bouton "Soumettre" est désactivé).

### 5.4 Sections texte libre

L'éditeur de texte supporte :
- Titres de niveaux 1 à 3
- Paragraphes, listes à puces, listes numérotées
- Gras, italique, souligné, code inline
- Tableaux (avec ajout/suppression de lignes et colonnes)
- Images (glissées depuis l'ordinateur ou l'URL)
- Liens hypertexte

Le contenu est sauvegardé toutes les 30 secondes automatiquement.

### 5.5 Sections données connectées

Un bloc de données connectées affiche les données du connecteur configuré.
Un bouton "Actualiser" permet de forcer le rechargement des données.
L'horodatage de la dernière mise à jour est visible.

**Comportement à l'export :** Les données sont figées au moment de l'export.
La date de capture est visible dans le PDF.

### 5.6 Collaboration en temps réel

Plusieurs utilisateurs peuvent éditer le même document simultanément.
Chaque collaborateur est identifiable par un curseur coloré avec son nom.
Les modifications de chacun sont visibles en temps réel.

Les modifications simultanées sur le même champ sont réconciliées automatiquement
sans perte de données (technologie CRDT). Il n'y a pas de conflit possible
sur des champs différents.

### 5.7 Mode hors ligne dans l'éditeur

Si la connexion est perdue, l'éditeur continue de fonctionner.
Un indicateur "Mode solo — reconnexion en cours..." apparaît.
Les modifications sont sauvegardées localement.
À la reconnexion, elles sont synchronisées automatiquement.

---

## 6. Sauvegarde automatique

### 6.1 Comportement

La sauvegarde se déclenche :
- Automatiquement toutes les 30 secondes (configurable par l'user de 10 à 300s)
- Automatiquement lors de la fermeture de l'onglet
- Manuellement via le bouton Sauvegarder ou le raccourci ⌘S

### 6.2 Indicateurs

- "Sauvegardé il y a 2s" → synchronisé avec le serveur
- "Sauvegardé localement" → hors ligne, en attente de sync
- "Sauvegarde en cours..." → transfert en cours

### 6.3 Quitter avec des modifications non sauvegardées

Si l'utilisateur tente de naviguer vers une autre page avec des modifications
non encore sauvegardées, une fenêtre de confirmation apparaît :
"Vos modifications ne sont pas sauvegardées. Voulez-vous les enregistrer ?"
Options : Enregistrer / Ignorer et quitter.

---

## 7. Commentaires inline

### 7.1 Ajout d'un commentaire

En mode révision (document soumis au workflow), le réviseur peut sélectionner
n'importe quel texte dans le document et ajouter un commentaire dessus.
Le texte commenté est surligné en jaune.

### 7.2 Réponse et résolution

L'auteur peut répondre à chaque commentaire.
Quand un point est traité, le commentaire peut être marqué "Résolu".
Les commentaires résolus disparaissent du surlignage mais restent accessibles
dans l'historique.

### 7.3 Visibilité

Les commentaires sont visibles par tous les participants au workflow
(auteur + validateurs). Les lecteurs (accès lecture seule) ne voient pas
les commentaires en cours de révision.

---

## 8. Workflow de validation

### 8.1 Soumettre un document

Le bouton "Soumettre pour validation" est activé uniquement quand :
- Tous les champs obligatoires sont remplis
- Le document est au statut "Brouillon"

Un commentaire optionnel peut accompagner la soumission.
Le statut passe à "En révision".

### 8.2 Expérience du validateur

Le validateur reçoit une notification. En ouvrant le document, il voit :
- Le document complet en lecture seule
- Le panneau de révision à droite avec les commentaires existants
- Les boutons "Approuver" et "Rejeter"

Il peut ajouter des commentaires inline sur n'importe quelle partie du texte.
Il peut saisir un commentaire général dans le panneau de révision.

### 8.3 Approbation

Clic "Approuver" → confirmation → document passe au nœud suivant du circuit.
Si c'était le dernier nœud : statut passe à "Approuvé".

### 8.4 Rejet

Clic "Rejeter" → champ de motif obligatoire → confirmation.
Le document retourne à l'auteur avec le motif affiché.
Le statut repasse à "Brouillon".
L'auteur peut corriger et resoumettre.

### 8.5 Publication

Après approbation, l'auteur (ou un admin) peut publier le document.
Clic "Publier" → confirmation → statut passe à "Publié".
La publication déclenche la distribution automatique.

---

## 9. Révisions de documents

### 9.1 Convention de numérotation des révisions

- **Révision 0** : document en brouillon, jamais approuvé
- **Révision A** : première version approuvée
- **Révision B, C, D...** : versions approuvées suivantes

### 9.2 Créer une nouvelle révision

Un document publié ou approuvé peut faire l'objet d'une nouvelle révision.
Clic "Nouvelle révision" → saisie du motif → le document repasse en brouillon
avec la révision suivante (A → B, B → C...).

Le contenu de la révision précédente est copié comme point de départ.
L'ancienne révision est conservée en lecture seule dans l'historique.

### 9.3 Historique des révisions

L'onglet "Révisions" de chaque document liste toutes les révisions :
- Code de révision
- Date de création
- Auteur
- Motif
- Statut (brouillon, approuvé, obsolète)

Cliquer une révision passée l'ouvre en lecture seule.

### 9.4 Révisions immuables

Une révision approuvée ne peut jamais être modifiée.
Toute modification crée obligatoirement une nouvelle révision.

---

## 10. Export PDF

### 10.1 Déclenchement

Bouton "Exporter PDF" dans la barre d'outils du document.
L'export est asynchrone : l'utilisateur peut continuer à travailler
pendant la génération. Il reçoit une notification quand le PDF est prêt.

### 10.2 Contenu du PDF

- Le cartouche officiel avec logo et métadonnées
- Toutes les sections dans l'ordre du template
- Les champs formulaire affichés en tableau
- Le texte riche mis en forme (titres, listes, images, tableaux)
- Les données connectées figées au moment de l'export (avec horodatage)
- La numérotation des pages en pied de page

### 10.3 Format et mise en page

Format A4 portrait par défaut, configuré dans les Settings.
Les marges respectent les standards de documentation technique Perenco.
Le cartouche est conforme au format officiel.

### 10.4 Export Word (DOCX)

Un export Word est également disponible. Le contenu est le même que le PDF
mais dans un format modifiable. Utile pour les documents destinés à être
partagés avec des partenaires externes qui doivent les modifier.

---

## 11. Distribution automatique

### 11.1 Principe

Quand un document est publié, il est automatiquement distribué
aux destinataires configurés dans la liste de distribution associée au type de document.

### 11.2 Ce qui est envoyé

- Un email avec le PDF en pièce jointe
- Une notification in-app (pour les destinataires ayant un compte OpsFlux)

### 11.3 Configuration des listes de distribution

Dans Settings > Modules > Rédacteur > Distribution :
- Créer une liste de distribution
- La lier à un type de document (ou à tous)
- Ajouter des destinataires : utilisateurs OpsFlux ou emails externes
- Choisir le déclencheur : à la publication ou à l'approbation

---

## 12. Gestion des documents

### 12.1 Statuts possibles

| Statut | Description | Qui peut modifier |
|---|---|---|
| Brouillon | En cours de rédaction | L'auteur |
| En révision | Soumis au workflow | Personne (lecture seule sauf commentaires) |
| Approuvé | Validé par le circuit complet | Personne |
| Publié | Distribué et accessible à tous | Personne |
| Archivé | Retiré de la circulation | Admin uniquement |
| Obsolète | Remplacé par une révision plus récente | Automatique |

### 12.2 Archivage

Un document archivé n'apparaît plus dans les listes standard.
Il est consultable via un filtre "Archivés". Il ne peut plus être modifié.
Son numéro est libéré uniquement si l'admin le supprime physiquement.

### 12.3 Suppression

Seuls les brouillons qui n'ont jamais été soumis peuvent être supprimés
(soft delete). Les documents soumis au moins une fois ne peuvent qu'être archivés.

---

## 13. Recherche dans les documents

### 13.1 Recherche dans la liste

La liste des documents dispose de filtres cumulables :
- Texte libre (recherche dans le titre et le numéro)
- Statut (multiple)
- Type de document
- Projet
- BU
- Auteur / Rédacteur
- Période (date de création ou de modification)
- Étiquettes

Ces filtres peuvent être sauvegardés sous un nom pour une utilisation ultérieure.

### 13.2 Recherche dans le contenu

La recherche globale (⌘K) permet de retrouver un document par son contenu.
Un document dont le corps contient "pression séparateur" sera trouvé
même si ces mots ne sont pas dans le titre.

---

## 14. Règles métier importantes

### 14.1 Intégrité du numéro

Un numéro de document est unique à vie. Même supprimé, il n'est jamais réattribué
(sauf autorisation explicite de l'admin dans un cas de correction d'erreur).

### 14.2 Auto-remplissage du cartouche

Les champs du cartouche (titre, numéro, révision, auteur, date) sont toujours
synchronisés avec les métadonnées réelles du document. Si le titre est modifié
dans les propriétés, le cartouche se met à jour automatiquement.

### 14.3 Documents liés

Modifier un document n'affecte pas les documents qui y sont liés.
Les liens sont de simples références — pas de données partagées.

### 14.4 Un seul brouillon actif

Il ne peut y avoir qu'une seule révision en brouillon à la fois pour un document.
Créer une nouvelle révision archive automatiquement la précédente version approuvée.

### 14.5 Traçabilité totale

Toute modification d'un document (quoi, quand, qui, depuis quelle version)
est enregistrée et consultable dans l'onglet "Activité" de chaque document.

