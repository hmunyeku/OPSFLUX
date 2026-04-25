# Cahier des Charges Fonctionnel — Report Editor & Documents

> Ce document décrit la gestion documentaire dans OpsFlux : création, collaboration,
> workflow de validation et archivage des documents opérationnels.

---

## Sommaire

1. [Rôle du module](#1-rôle-du-module)
2. [Création et édition d'un document](#2-création-et-édition-dun-document)
3. [Classification et accès](#3-classification-et-accès)
4. [Workflow de validation](#4-workflow-de-validation)
5. [Collaboration temps réel](#5-collaboration-temps-réel)
6. [Versioning et historique](#6-versioning-et-historique)
7. [Export et partage](#7-export-et-partage)
8. [Modèles de documents](#8-modèles-de-documents)
9. [Lien avec les autres modules](#9-lien-avec-les-autres-modules)

---

## 1. Rôle du module

Le Report Editor est l'outil de **production et de gestion documentaire** d'OpsFlux. Il sert à créer, valider et archiver les documents opérationnels : rapports HSE, procédures, comptes-rendus de réunion, rapports d'intervention, notes techniques.

Contrairement à un simple stockage de fichiers, le Report Editor permet d'**écrire et d'éditer les documents directement dans OpsFlux**, avec un éditeur riche (texte formaté, tableaux, images, graphiques). Les documents restent liés aux données opérationnelles des autres modules.

---

## 2. Création et édition d'un document

### 2.1 L'éditeur de texte riche

L'éditeur permet de produire des documents professionnels structurés :
- Titres et sous-titres (hiérarchie jusqu'à 6 niveaux)
- Paragraphes, listes, listes numérotées
- Tableaux (avec redimensionnement des colonnes)
- Images et photos (upload direct, glisser-déposer)
- Blocs de code pour les données techniques
- Graphiques dynamiques liés aux données OpsFlux

### 2.2 Auto-sauvegarde

Chaque modification est sauvegardée automatiquement toutes les 30 secondes (configurable). Si la connexion est perdue, les modifications sont conservées localement et synchronisées à la reconnexion.

### 2.3 Mode hors-ligne

Les documents récemment ouverts sont disponibles hors-ligne dans un quota configuré. Les modifications faites hors-ligne sont synchronisées à la reconnexion avec gestion automatique des conflits.

---

## 3. Classification et accès

### 3.1 Niveaux de classification

Chaque document est classé selon son niveau de sensibilité :

| Niveau | Code | Signification |
|---|---|---|
| Confidentiel | CONF | Accès restreint aux personnes nominativement désignées |
| Restreint | REST | Accès limité aux membres de l'équipe projet ou du département |
| Interne | INT | Accessible à tous les employés Perenco sur ce tenant |
| Public | PUB | Accessible aux prestataires externes autorisés |

La classification par défaut est "Interne". Elle peut être modifiée par l'auteur ou un administrateur.

### 3.2 Contrôle d'accès fin

Pour les documents "Confidentiel" et "Restreint", la liste des personnes autorisées est définie explicitement. En dehors de cette liste, le document est invisible.

---

## 4. Workflow de validation

### 4.1 Circuit de validation

Certains documents (rapports officiels, procédures, rapports d'incident) doivent passer par un circuit de validation avant d'être diffusés.

Le créateur configure le circuit lors de la création : liste des validateurs dans l'ordre, type de validation (séquentiel ou parallèle), délai attendu.

### 4.2 Statuts du document

```
Brouillon → En cours de révision → En validation → Validé → Archivé
```

**En révision :** Des relecteurs suggèrent des modifications (commentaires, suivi des modifications).

**En validation :** Les validateurs approuvent ou rejettent.

**Un seul rejet suffit** à renvoyer le document en brouillon. Le motif du rejet est obligatoire.

### 4.3 Signatures électroniques

Les documents validés peuvent recevoir des signatures électroniques. La signature est horodatée et liée au compte de l'utilisateur.

---

## 5. Collaboration temps réel

Plusieurs personnes peuvent travailler simultanément sur le même document. Les modifications de chaque utilisateur apparaissent en temps réel avec un indicateur de présence (nom et couleur). Aucune modification n'est perdue grâce à la synchronisation automatique.

### 5.1 Suivi des modifications

Le mode "suivi des modifications" (similaire à Word) permet de proposer des changements qui seront acceptés ou rejetés par le propriétaire. Utile pour les cycles de relecture.

### 5.2 Commentaires et mentions

Des commentaires peuvent être ajoutés sur n'importe quelle partie du document. L'utilisation de `@nom` dans un commentaire envoie une notification à la personne mentionnée.

---

## 6. Versioning et historique

OpsFlux conserve automatiquement toutes les versions d'un document (jusqu'à 50 versions configurables). Chaque version est horodatée et identifie son auteur.

L'utilisateur peut :
- Consulter n'importe quelle version précédente
- Comparer deux versions (différences surlignées)
- Restaurer une version précédente

Les versions ne peuvent pas être supprimées manuellement — elles s'archivent automatiquement au-delà du nombre maximum configuré.

---

## 7. Export et partage

### 7.1 Export

Un document peut être exporté en :
- **PDF** : pour diffusion et archivage officiel
- **Word (DOCX)** : pour édition externe si nécessaire

L'export PDF inclut un pied de page automatique avec le nom du document, la date d'export, le niveau de classification, et le nom de l'exportateur.

### 7.2 Partage par lien

Un lien de partage temporaire peut être généré pour les destinataires sans compte OpsFlux. Le lien a une durée de vie configurable et une protection par code OTP optionnelle.

---

## 8. Modèles de documents

### 8.1 Concept

Des modèles pré-structurés peuvent être créés par les administrateurs pour les types de documents récurrents : rapport d'incident HSE, rapport mensuel de compliance, compte-rendu de réunion, rapport d'inspection.

Quand un utilisateur crée un nouveau document à partir d'un modèle, il obtient une structure pré-remplie avec les sections, les titres, et les instructions de saisie.

### 8.2 Modèles avec données dynamiques

Certaines sections d'un modèle peuvent être liées automatiquement à des données OpsFlux. Par exemple, le rapport HSE mensuel peut inclure automatiquement :
- Le tableau des signalements du mois (récupéré depuis PaxLog)
- Les statistiques de compliance (récupérées depuis PaxLog)
- Les KPIs de voyage (récupérés depuis TravelWiz)

L'utilisateur rédige l'analyse narrative ; les données se remplissent automatiquement.

---

## 9. Lien avec les autres modules

**PaxLog :** Les rapports HSE (signalements, compliance, incidents) peuvent être générés directement depuis PaxLog avec les données du module.

**TravelWiz :** Les journaux de bord et rapports de voyage sont édités et archivés dans le Report Editor.

**Projets :** Les rapports d'avancement de projet, les compte-rendus de réunion, et les documents techniques sont liés aux projets correspondants.

**Asset Registry :** Les procédures opérationnelles, les fiches de sécurité, et les plans d'urgence sont associés aux assets concernés.
