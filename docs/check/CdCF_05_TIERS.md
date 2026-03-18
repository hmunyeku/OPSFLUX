# OpsFlux — Cahier des Charges Fonctionnel
# MODULE TIERS ET CONTACTS
# Version 1.0 — Usage interne Perenco

---

## OBJET DU DOCUMENT

Ce document décrit les fonctionnalités du module Tiers. Il couvre la gestion des entreprises partenaires, fournisseurs et prestataires de Perenco, ainsi que leurs contacts.

---

## 1. VISION GÉNÉRALE

### 1.1 Finalité

Le module Tiers centralise l'annuaire des entreprises externes avec lesquelles Perenco est en relation : fournisseurs de matériel, prestataires de services, partenaires opérateurs, clients, sous-traitants. Il sert de référentiel commun à tous les modules : les documents peuvent référencer un fournisseur, les assets peuvent indiquer leur exploitant, les PID peuvent mentionner l'installateur.

### 1.2 Deux niveaux : Tiers et Contacts

**Tiers** — Une entreprise, une organisation ou une entité légale.

**Contact** — Une personne physique, généralement employée d'un Tiers. Un contact peut exister sans être rattaché à un tiers (contact indépendant, prestataire individuel).

---

## 2. GESTION DES TIERS

### 2.1 Données d'un tiers

**Identification** :
- Raison sociale complète
- Nom court / acronyme
- Type (fournisseur, prestataire, partenaire, client, sous-traitant, autre)
- Statut (actif, inactif, en cours de qualification, sur liste noire)
- Numéro RCCM (Registre du Commerce)
- Numéro d'identification fiscale
- Code TVA intracommunautaire

**Informations générales** :
- Secteur d'activité
- Description de l'activité
- Pays d'immatriculation
- Site web

**Adresses** :
- Adresse principale
- Adresse de facturation (si différente)
- Adresse du site d'exploitation (si différente)

**Notes** :
- Zone de notes libres pour informations internes

### 2.2 Type de tiers

Les types disponibles sont configurables par l'administrateur tenant. Les types par défaut Perenco sont :
- **Fournisseur** : entreprise qui vend des biens à Perenco
- **Prestataire** : entreprise qui fournit des services à Perenco
- **Partenaire** : co-exploitant ou partenaire de développement
- **Client** : acheteur de production
- **Sous-traitant** : entreprise travaillant pour Perenco sous la direction d'un prestataire principal

### 2.3 Statut "Liste noire"

Un tiers peut être mis sur liste noire pour des raisons légales, éthiques ou contractuelles. Ce statut déclenche :
- Une bannière d'avertissement rouge visible sur toute la fiche du tiers et de ses contacts
- Une alerte si quelqu'un tente de lier ce tiers à un nouveau document ou contrat
- Une impossibilité de créer de nouveaux documents avec ce tiers comme partie prenante

Seul un administrateur peut mettre ou retirer un tiers de la liste noire, avec saisie obligatoire d'un motif.

---

## 3. CONTACTS

### 3.1 Données d'un contact

**Identité** :
- Prénom et nom
- Titre de civilité
- Poste / fonction
- Département

**Coordonnées** :
- Email professionnel (principal)
- Email secondaire
- Téléphone bureau
- Téléphone mobile
- Fax

**Certifications offshore** :
- Certificat médical d'aptitude (type, validité)
- HUET (certificat de survie en mer, type, validité)
- BOSIET / FOET (formation survie, niveau, validité)

**Notes** :
- Zone de notes libres

### 3.2 Rattachement à un tiers

Un contact peut être :
- **Rattaché à un tiers** : employé d'une société connue dans le registre
- **Contact standalone** : personne non rattachée à un tiers (indépendant, interlocuteur dont la société n'est pas dans le registre)

### 3.3 Tiers virtuel

Quand un contact est créé sans être rattaché à un tiers, OpsFlux crée automatiquement un "tiers virtuel" pour ce contact. Ce tiers virtuel est invisible dans les listes standard et sert uniquement à maintenir la cohérence des données en interne.

Quand le tiers réel du contact est ultérieurement créé ou trouvé dans le registre, le contact peut être "fusionné" vers le tiers réel. Le tiers virtuel est alors désactivé.

---

## 4. FUSION DE TIERS

### 4.1 Cas d'usage

La fusion est nécessaire dans deux cas :
1. Un contact standalone a été créé, et on découvre ensuite qu'il appartient à une société déjà dans le registre
2. Une société a été créée en doublon sous deux noms différents

### 4.2 Processus de fusion

1. L'administrateur identifie le tiers ou contact à fusionner (source) et le tiers de destination
2. OpsFlux affiche une prévisualisation de la fusion :
   - Données qui seront transférées (contacts, documents liés, pièces jointes)
   - Données qui seront perdues ou à arbitrer (si conflit entre deux valeurs)
3. L'administrateur valide
4. Les données sont transférées vers le tiers de destination
5. Le tiers source est désactivé (non supprimé — l'historique est conservé)

### 4.3 Irréversibilité

Une fusion ne peut pas être annulée automatiquement. En cas d'erreur, il faut effectuer une fusion inverse manuellement.

---

## 5. CERTIFICATIONS OFFSHORE

### 5.1 Suivi des certifications

Les certifications offshore des contacts sont critiques pour la sécurité des opérations en mer. OpsFlux suit leurs dates d'expiration et alerte à l'avance.

### 5.2 Alertes d'expiration

Quand une certification expire dans moins de 90 jours, une alerte est générée pour l'administrateur. À l'expiration, la certification est marquée comme invalide et un avertissement s'affiche sur la fiche du contact.

### 5.3 Restriction d'accès

Un contact avec des certifications expirées ne peut pas être affecté à des missions nécessitant ces certifications (si le module de gestion des missions est activé).

---

## 6. LISTES ET RECHERCHE

### 6.1 Liste des tiers

La liste présente tous les tiers actifs. Filtres disponibles :
- Type (fournisseur, prestataire, partenaire...)
- Statut (actif, inactif, liste noire)
- Secteur d'activité
- Pays
- Recherche textuelle (raison sociale, nom court)

### 6.2 Liste des contacts

La liste présente tous les contacts. Filtres disponibles :
- Tiers d'appartenance
- Certifications (filtre "certifications valides uniquement")
- Recherche textuelle (nom, prénom, email)

### 6.3 Masquage des tiers virtuels

Les tiers virtuels sont masqués par défaut dans la liste des tiers. Un toggle "Afficher les contacts indépendants" les rend visibles.

---

## 7. LIENS AVEC LES AUTRES MODULES

### 7.1 Références dans les documents

Les champs de type "référence contact" dans les formulaires de documents permettent de lier un contact à un document (ex : contact inspecteur dans un rapport d'inspection). Ce lien est bidirectionnel.

### 7.2 Références dans les assets

Un asset logistique peut avoir un contact comme "responsable de contrat" ou un tiers comme "opérateur". Ces liens sont gérés par des champs de type référence.

### 7.3 Listes de distribution

Les contacts externes peuvent être destinataires des listes de distribution de documents publiés. Ils reçoivent les documents par email sans avoir besoin d'un compte OpsFlux.

---

## 8. IMPORT

### 8.1 Import de tiers

Les tiers peuvent être importés en masse depuis un fichier CSV ou Excel via le même processus en 3 étapes que l'Asset Registry (upload, mapping, résultats).

### 8.2 Import de contacts

Les contacts peuvent également être importés. Lors de l'import, la colonne "société" permet de lier automatiquement les contacts à leurs tiers si les noms correspondent dans le registre.

---

## 9. CAS D'UTILISATION COMPLETS

### Cas 1 : Qualification d'un nouveau prestataire

1. L'équipe approvisionnement identifie un nouveau prestataire de maintenance
2. Elle crée la fiche tiers : "ACME Services Offshore" → type Prestataire
3. Elle ajoute 3 contacts (directeur commercial, responsable technique, coordinateur terrain)
4. Elle joint le dossier de qualification (PDF) dans les pièces jointes
5. Le statut passe à "En cours de qualification" puis "Actif" après validation
6. Les ingénieurs peuvent désormais référencer ce prestataire dans leurs documents

### Cas 2 : Alerte certifications périmées

1. Le responsable opérations reçoit une notification : "5 contacts avec certifications expirant dans 30 jours"
2. Il ouvre la liste filtrée sur "certifications expirant < 30 jours"
3. Il contacte les prestataires concernés pour planifier les renouvellements
4. À la réception des nouveaux certificats, l'équipe HSE met à jour les dates dans OpsFlux

### Cas 3 : Fusion suite à doublon

1. L'équipe réalise que "Total Energies Cameroun" et "TotalEnergies CAM" sont le même partenaire
2. L'administrateur lance la fusion : source = "Total Energies Cameroun", destination = "TotalEnergies CAM"
3. OpsFlux affiche : "2 contacts seront transférés, 1 document lié sera transféré"
4. L'administrateur valide
5. "Total Energies Cameroun" est désactivé, ses données sont rattachées à "TotalEnergies CAM"

