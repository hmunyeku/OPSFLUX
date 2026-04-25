# OpsFlux — Cahier des Charges Fonctionnel
# Module TIERS — Gestion des partenaires, fournisseurs et contacts

---

## 1. Vision générale

Le module Tiers centralise l'annuaire de toutes les organisations et personnes
avec lesquelles Perenco est en relation professionnelle : fournisseurs,
prestataires, sous-traitants, partenaires, clients institutionnels.

Chaque tiers est une entité organisationnelle (une société, une administration)
à laquelle sont rattachés un ou plusieurs contacts (personnes physiques).

---

## 2. Types de tiers

| Type | Description |
|---|---|
| **Fournisseur** | Société qui livre des biens ou matériaux |
| **Prestataire** | Société qui fournit des services |
| **Sous-traitant** | Société à qui Perenco délègue des travaux |
| **Partenaire** | Société partenaire dans une JV ou un accord cadre |
| **Client** | Entité à qui Perenco vend des produits |
| **Autre** | Toute autre relation professionnelle |

Le type par défaut est configurable par le tenant admin.
Un tiers peut être reclassifié à tout moment.

---

## 3. Fiche d'un tiers

### 3.1 Informations générales

- Raison sociale complète
- Nom court / nom d'usage
- Type (voir ci-dessus)
- Statut : Actif, Inactif, Blacklisté
- Secteur d'activité
- Pays et ville du siège social
- Site web
- Langue de communication préférée
- Notes internes (non visibles hors OpsFlux)

### 3.2 Informations légales

- Numéro de registre de commerce
- Numéro TVA / identifiant fiscal
- Forme juridique (SA, SARL, SAS...)

### 3.3 Onglet Contacts

Liste des personnes physiques rattachées à ce tiers.
Pour chaque contact : prénom, nom, fonction, email, téléphone.
Un contact peut être désigné comme contact principal.

### 3.4 Onglet Adresses

Adresses multiples du tiers :
- Adresse principale (siège social)
- Adresse de facturation
- Adresse de site opérationnel
- Autres adresses

### 3.5 Onglet Documents

Documents OpsFlux liés à ce tiers :
contrats, bons de commande, certifications, correspondances.

### 3.6 Onglet Activité

Historique de toutes les modifications de la fiche et des interactions enregistrées.

---

## 4. Statut Blacklisté

### 4.1 Déclenchement

Un tiers peut être blacklisté par un admin (avec motif obligatoire).

### 4.2 Effets du blacklistage

- Une bannière rouge visible s'affiche sur toute sa fiche
- Ses contacts sont également marqués en rouge dans leurs fiches
- Il est impossible de créer un document avec ce tiers comme partie prenante
- Il n'apparaît pas dans les sélecteurs (pickers) standard — filtre "inclure blacklistés" requis
- Ses données restent consultables (pas de suppression)

### 4.3 Sortie du blacklistage

Un admin peut retirer le blacklistage (avec motif). L'historique du blacklistage
est conservé dans l'onglet Activité (avec les dates, les acteurs et les motifs).

---

## 5. Gestion des contacts

### 5.1 Fiche d'un contact

- Civilité, prénom, nom
- Fonction / titre professionnel
- Département
- Email professionnel et email secondaire
- Téléphone bureau et mobile
- Tiers employeur (lien vers la fiche tiers)
- Langue préférée
- Notes internes

### 5.2 Certifications offshore (optionnel)

Si le module PaxLog (gestion du personnel offshore) est activé,
la fiche contact peut afficher les certifications obligatoires :
- HUET (Helicopter Underwater Escape Training) et date d'expiration
- BOSIET (Basic Offshore Safety Induction) et date d'expiration
- Visite médicale et date d'expiration

Des alertes automatiques notifient les gestionnaires quand
une certification approche de son expiration.

### 5.3 Création rapide d'un contact

Depuis n'importe quelle interface OpsFlux (formulaire de document,
relation d'un asset...), un picker de contact permet de créer
un contact à la volée sans quitter la page en cours :
un mini-formulaire apparaît avec les champs essentiels.

---

## 6. Tiers virtuels

### 6.1 Problème résolu

Dans la réalité, on connaît souvent un contact (Jean Dupont, ingénieur)
avant de connaître son employeur précis, ou un contact peut être indépendant.
OpsFlux ne doit pas bloquer la saisie d'un contact sous prétexte
qu'il n'a pas encore de tiers associé.

### 6.2 Fonctionnement

Quand un contact est créé sans tiers associé, OpsFlux crée automatiquement
un **tiers virtuel** : une entrée tiers à son nom, marquée comme virtuelle.
Ce tiers virtuel n'apparaît pas dans la liste principale des tiers.

### 6.3 Fusion

Quand l'utilisateur réalise que ce contact travaille pour un tiers réel
déjà dans le système :

1. Ouvrir la fiche du tiers virtuel
2. Cliquer "Fusionner avec un tiers existant"
3. Sélectionner le tiers réel dans le picker
4. Confirmer

**Résultat de la fusion :**
- Le contact est rattaché au tiers réel
- Les pièces jointes du tiers virtuel sont transférées vers le tiers réel
- Les documents liés au tiers virtuel sont transférés vers le tiers réel
- Le tiers virtuel est marqué inactif (jamais supprimé — traçabilité)

Cette opération est irréversible. En cas d'erreur, l'admin peut effectuer
une fusion inverse.

---

## 7. Import de tiers et contacts

### 7.1 Import de tiers

Format CSV ou Excel. Colonnes attendues (flexibles via mapping) :
nom, type, pays, ville, secteur, numéro de registre...

Comportement en cas de doublon (même nom exact ou même numéro de registre) :
l'utilisateur choisit créer/mettre à jour/ignorer.

### 7.2 Import de contacts

Format CSV ou Excel. Colonnes attendues :
prénom, nom, email, téléphone, fonction, nom de l'entreprise (pour trouver ou créer le tiers).

Si le nom de l'entreprise est trouvé → contact rattaché à ce tiers.
Si pas trouvé → tiers virtuel créé + contact rattaché.

---

## 8. Filtres et recherche

### 8.1 Filtres de la liste tiers

- Recherche textuelle (nom, nom court)
- Type (fournisseur, prestataire...)
- Statut (actif, inactif, blacklisté)
- Pays
- Secteur d'activité

### 8.2 Tiers virtuels masqués par défaut

La liste des tiers ne montre pas les tiers virtuels par défaut.
Un toggle "Afficher les contacts standalone" les révèle.
Cela évite de polluer la liste avec des entrées temporaires.

### 8.3 Recherche dans les contacts

La recherche globale (⌘K) retrouve les contacts par nom, prénom ou email.
Les résultats indiquent le tiers associé.

---

## 9. Règles métier importantes

### 9.1 Un contact par email

Un email professionnel ne peut être associé qu'à un seul contact actif.
Si on essaie de créer un contact avec un email déjà enregistré,
OpsFlux propose d'ouvrir la fiche existante plutôt que de créer un doublon.

### 9.2 Contact principal

Un tiers peut avoir plusieurs contacts "principal" (ex: un contact commercial
et un contact technique). Ce marquage est informatif et n'a pas d'effet
automatique dans le système.

### 9.3 Contacts et droits

Les contacts (personnes physiques dans le module Tiers) sont distincts
des utilisateurs OpsFlux. Un utilisateur OpsFlux peut avoir une fiche contact
associée, mais ce n'est pas obligatoire.

### 9.4 Suppression d'un contact

Un contact ne peut être supprimé que s'il n'est référencé nulle part
(aucun document, aucune liste de distribution, aucune relation).
Sinon, seul le marquage inactif est possible.

