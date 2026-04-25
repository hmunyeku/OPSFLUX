# OpsFlux — Cahier des Charges Fonctionnel
# MODULE CORE PLATFORM
# Version 1.0 — Usage interne Perenco

---

## OBJET DU DOCUMENT

Ce document décrit l'ensemble des fonctionnalités de la plateforme centrale OpsFlux (Core). Il constitue la référence fonctionnelle pour la recette, la formation et l'évolution du système. Il ne contient aucune référence technique.

---

## 1. GESTION DES ORGANISATIONS (MULTI-TENANT)

### 1.1 Notion de Tenant

Un **tenant** est une organisation indépendante au sein d'OpsFlux. Chaque entité Perenco (PCM, PCG, Siège) constitue un tenant distinct. Les données d'un tenant sont totalement isolées de celles des autres tenants.

Un utilisateur peut appartenir à plusieurs tenants. Lors de sa connexion, il voit tous les tenants auxquels il a accès et peut basculer de l'un à l'autre à tout moment sans se déconnecter.

### 1.2 Business Units (BU)

Au sein d'un tenant, les données sont organisées en **Business Units** (ex : BIPAGA, EBOME, CLIVANA, Siège). Une BU représente une entité opérationnelle ou géographique.

Un utilisateur peut appartenir à une ou plusieurs BU. Lorsqu'il sélectionne une BU active dans l'interface, toutes les listes, tous les rapports et toutes les vues sont automatiquement filtrés sur cette BU. Il peut aussi choisir de voir l'ensemble des BU s'il en a le droit.

La BU sélectionnée est mémorisée entre les sessions.

### 1.3 Création d'un tenant

Seul le super-administrateur d'OpsFlux peut créer un nouveau tenant. Il définit :
- Le nom complet et le nom court de l'organisation
- La langue par défaut
- Les modules à activer
- L'email de l'administrateur principal

À la création, un email d'invitation est envoyé automatiquement à l'administrateur principal avec les instructions pour configurer son espace (assistant de démarrage).

---

## 2. AUTHENTIFICATION ET ACCÈS

### 2.1 Connexion

Les utilisateurs s'authentifient via le système d'identité centralisé de Perenco (annuaire d'entreprise). Il n'y a pas de gestion de mots de passe dans OpsFlux. Aucune création de compte n'est possible depuis OpsFlux.

Au premier accès d'un utilisateur, son compte est créé automatiquement dans OpsFlux avec un statut "en attente". Il voit alors une page lui indiquant qu'un administrateur doit lui attribuer un rôle avant qu'il puisse accéder au système.

L'administrateur du tenant est notifié dès qu'un nouvel utilisateur se connecte pour la première fois.

### 2.2 Sessions

Une session dure 8 heures. Passé ce délai, la session est automatiquement renouvelée en arrière-plan si l'utilisateur est actif, sans qu'il ait à se reconnecter. S'il est inactif, il est invité à se reconnecter.

### 2.3 Accès mobile

L'application est accessible depuis un navigateur mobile ou tablette. Certaines fonctionnalités avancées (éditeur de documents, éditeur PID) sont réservées aux écrans de taille suffisante. Sur mobile, l'utilisateur peut consulter les données mais ne peut pas les modifier.

---

## 3. RÔLES ET PERMISSIONS

### 3.1 Rôles disponibles

OpsFlux dispose de 6 rôles prédéfinis au niveau tenant :

**Lecteur (reader)**
Accès en consultation uniquement. Voit les documents publiés, les assets actifs, les dashboards partagés. Ne peut rien créer, modifier ni valider.

**Éditeur (editor)**
Peut créer et modifier des documents en brouillon, créer et modifier des assets et des tiers. Peut soumettre ses documents pour validation. Ne peut pas valider les documents des autres.

**Réviseur (reviewer)**
Peut approuver ou rejeter les documents qui lui sont soumis pour validation. Accès en lecture sur l'ensemble du contenu. Ne peut pas créer de documents.

**Gestionnaire de templates (template_manager)**
Peut créer, modifier et activer les templates de documents et les circuits de validation. Accès éditeur sur les documents. Rôle réservé aux référents documentaires.

**Gestionnaire PID (pid_manager)**
Peut créer et modifier les PID/PFD, gérer la bibliothèque d'objets process et administrer les règles de nommage des tags. Accès lecteur sur les autres modules.

**Administrateur tenant (tenant_admin)**
Accès complet à toutes les fonctionnalités du tenant : création d'utilisateurs, attribution des rôles, configuration de tous les modules, gestion des templates, des circuits de validation, des connecteurs et des paramètres du tenant.

### 3.2 Droits sur les BU

En complément du rôle global, un utilisateur peut avoir des droits restreints à certaines BU. Par exemple, un éditeur peut être limité à la BU BIPAGA et ne voir que les données de cette BU, même si d'autres BU existent dans le tenant.

### 3.3 Délégation

Un utilisateur peut déléguer temporairement ses droits de validation à un autre utilisateur. La délégation est définie pour une période précise et peut couvrir l'ensemble de ses responsabilités ou seulement certains documents.

Pendant la période de délégation, le délégué voit les documents à valider du délégant dans sa propre liste de travail. Les actions effectuées par le délégué sont tracées comme telles dans l'historique du document.

Une délégation peut être annulée à tout moment par le délégant ou par un administrateur.

### 3.4 Personnalisation des permissions

L'administrateur tenant peut affiner les permissions de chaque rôle pour son organisation. Par exemple, autoriser les lecteurs à télécharger les PDF, ou restreindre certains éditeurs à la création de documents sans droit de modification.

---

## 4. ASSISTANT DE DÉMARRAGE (ONBOARDING)

Lorsqu'un administrateur accède à son tenant pour la première fois, un assistant de démarrage l'accompagne à travers les étapes de configuration initiale :

1. **Créer les Business Units** — définir la structure organisationnelle
2. **Inviter les utilisateurs** — ajouter les membres de l'équipe et leur attribuer un rôle
3. **Activer les modules** — sélectionner les fonctionnalités nécessaires
4. **Configurer l'envoi d'emails** — paramétrer les notifications
5. **Choisir la page d'accueil** — sélectionner le tableau de bord qui s'affiche au login

Les étapes optionnelles peuvent être complétées ultérieurement depuis les paramètres. L'assistant se ferme définitivement une fois l'étape obligatoire terminée.

---

## 5. NAVIGATION ET INTERFACE

### 5.1 Structure de l'interface

L'interface d'OpsFlux est organisée en zones permanentes :

**Barre supérieure** — accès au sélecteur de tenant, à la sélection de la BU active, à la recherche globale, aux notifications et aux paramètres du compte.

**Barre latérale** — navigation principale vers les modules actifs. L'utilisateur peut épingler ses pages favorites en haut de la barre. La barre peut être réduite pour maximiser l'espace de travail.

**Zone de contenu principale** — affiche le contenu de la page active.

**Panneau de détail** — s'ouvre à droite lorsqu'un objet est sélectionné dans une liste. Affiche les informations clés sans quitter la liste. Peut être épinglé pour rester ouvert lors de la navigation.

**Panneau IA** — accessible depuis la barre supérieure. Contient le briefing journalier, le chat avec l'assistant et les suggestions contextuelles.

### 5.2 Page d'accueil

La page d'accueil de chaque utilisateur affiche un tableau de bord. La résolution de ce tableau de bord suit l'ordre de priorité suivant :
1. Le tableau de bord personnellement choisi par l'utilisateur
2. Le tableau de bord par défaut de son rôle
3. Le tableau de bord par défaut de sa BU
4. Le tableau de bord par défaut du tenant
5. Si aucun n'est configuré : page d'accueil générique avec guide de démarrage

### 5.3 Favoris

L'utilisateur peut mettre en favori n'importe quelle page (un document spécifique, une liste d'assets, un tableau de bord). Les favoris apparaissent en haut de la barre latérale. Ils peuvent être réordonnés par glisser-déposer.

### 5.4 Recherche globale

Une recherche globale est accessible depuis n'importe quelle page (raccourci ⌘K). Elle cherche simultanément dans tous les types d'objets : documents, assets, équipements, tiers, tags DCS. Les résultats sont filtrés selon les droits de l'utilisateur et la BU active.

Les résultats les plus pertinents apparaissent en premier. Le moteur comprend les recherches approximatives (fautes de frappe, abréviations).

---

## 6. NOTIFICATIONS

### 6.1 Types de notifications

**Notifications d'action** — requièrent une réponse de l'utilisateur :
- Document soumis pour validation (avec deadline si définie)
- Deadline de validation imminente (48h avant)
- Deadline de validation dépassée
- Délégation reçue

**Notifications d'information** — pour garder l'utilisateur informé :
- Document approuvé ou rejeté (pour l'auteur)
- Document publié dans une liste de distribution
- Commentaire ajouté sur un document dont l'utilisateur est auteur ou réviseur
- Changement de rôle ou de permissions

### 6.2 Canaux de notification

Chaque utilisateur reçoit les notifications via deux canaux :
- **In-app** : icône cloche dans la barre supérieure avec compteur de non-lus
- **Email** : envoyé à l'adresse professionnelle de l'utilisateur

Chaque utilisateur peut désactiver les emails individuellement depuis ses préférences.

### 6.3 Gestion des notifications

Le panneau de notifications affiche les notifications non lues en premier. L'utilisateur peut :
- Cliquer sur une notification pour y accéder directement
- La marquer comme lue individuellement
- Tout marquer comme lu en un clic
- Filtrer entre "À faire" et "Activité"

Les notifications sont conservées 30 jours.

---

## 7. CHAMPS PERSONNALISÉS

### 7.1 Principe

Tout objet OpsFlux (document, asset, tiers, équipement...) peut être enrichi de champs personnalisés définis par l'administrateur du tenant. Ces champs s'ajoutent aux champs standard de chaque type d'objet.

### 7.2 Types de champs disponibles

- **Texte court** — une ligne de saisie libre
- **Texte long** — zone de saisie multi-lignes
- **Nombre entier** — valeur numérique entière avec unité optionnelle
- **Nombre décimal** — valeur numérique avec décimales et unité
- **Date** — sélecteur de date
- **Date et heure** — sélecteur de date et heure
- **Liste déroulante** — sélection parmi une liste de valeurs définies par l'admin
- **Case à cocher** — valeur oui/non
- **Référence** — lien vers un autre objet OpsFlux (ex : associer un contact à un asset)
- **Formule** — valeur calculée automatiquement à partir d'autres champs (non saisissable)

### 7.3 Règles de gestion

Chaque champ a un identifiant unique qui ne peut pas être modifié après création. Le label peut être traduit dans toutes les langues activées.

Un champ peut être marqué comme :
- **Obligatoire** : le formulaire ne peut pas être soumis sans ce champ
- **Verrouillé** : seul l'administrateur peut modifier la valeur (ex : numéro de certification)
- **Masqué** : visible uniquement pour les administrateurs

La suppression d'un champ ne supprime pas les données existantes ; le champ devient invisible mais ses valeurs sont conservées pour l'historique.

### 7.4 Groupes d'affichage

Les champs personnalisés sont organisés en groupes nommés qui s'affichent dans l'onglet "Informations" de la fiche objet, à la suite des champs standard. L'ordre des champs et des groupes est configurable.

---

## 8. LIENS DE PARTAGE

### 8.1 Principe

Tout objet OpsFlux peut être partagé avec des personnes extérieures à l'organisation via un lien sécurisé. Ce lien donne accès à une version légère de l'interface sur le portail web.opsflux.io.

### 8.2 Modes d'accès

Un lien de partage peut être configuré pour autoriser :
- **Consultation** : l'accès en lecture seule au contenu
- **Remplissage de formulaire** : la saisie de données dans un formulaire sans accès au reste de l'application
- **Téléchargement** : la consultation et le téléchargement en PDF

### 8.3 Sécurité

Chaque lien contient un code unique. L'auteur du lien peut définir :
- Une date d'expiration
- Les adresses email des destinataires autorisés (les autres adresses sont refusées)
- Un mot de passe optionnel

Les destinataires qui ont une adresse email autorisée reçoivent un lien personnel par email. Ils doivent confirmer leur identité via ce lien avant d'accéder au contenu.

Chaque accès au lien est enregistré (date, adresse IP) et consultable par les administrateurs.

---

## 9. RELATIONS ENTRE OBJETS

### 9.1 Principe

N'importe quel objet OpsFlux peut être relié à n'importe quel autre objet, quelle que soit leur nature. Par exemple, un document peut être relié à plusieurs assets, un équipement peut être relié à des tiers fournisseurs.

### 9.2 Gestion des relations

Une relation peut être créée depuis n'importe quel côté : depuis la fiche document (ajouter un asset lié) ou depuis la fiche asset (ajouter un document lié). La relation est bidirectionnelle et visible depuis les deux fiches.

Les relations sont typées (ex : "concerne", "est documenté par", "est fourni par") pour préciser la nature du lien.

### 9.3 Affichage

Chaque fiche objet dispose d'un onglet ou d'une section listant tous les objets qui lui sont liés, organisés par type. Un clic sur un objet lié navigue directement vers sa fiche.

---

## 10. AUDIT ET TRAÇABILITÉ

### 10.1 Historique des modifications

Chaque modification d'un objet est enregistrée automatiquement avec la date, l'auteur et la nature de la modification. Cet historique est accessible dans l'onglet "Activité" de chaque fiche.

Les actions tracées incluent : création, modification de chaque champ, changement de statut, ajout/suppression de relation, ajout de pièce jointe, commentaire.

### 10.2 Journal d'audit

L'administrateur tenant dispose d'un journal d'audit global accessible depuis les paramètres. Il liste toutes les actions effectuées sur le tenant, avec possibilité de filtrer par date, utilisateur, type d'action et type d'objet.

Le journal d'audit est exportable en CSV.

Les données du journal sont conservées sans limite de durée.

### 10.3 Actions des agents IA

Les actions effectuées par l'assistant IA au nom d'un utilisateur sont également tracées dans l'historique, avec la mention explicite qu'il s'agit d'une action initiée via l'IA.

---

## 11. PIÈCES JOINTES

### 11.1 Upload de fichiers

Tout objet OpsFlux peut recevoir des pièces jointes. L'upload se fait par glisser-déposer ou via un sélecteur de fichiers. La taille maximale par fichier est configurable par l'administrateur (défaut 50 Mo).

Formats acceptés : PDF, Word, Excel, images (JPG, PNG, SVG), texte (TXT, CSV), archives (ZIP).

### 11.2 Gestion des pièces jointes

Chaque pièce jointe peut être renommée et accompagnée d'une description. Elle peut être supprimée par l'auteur ou un administrateur.

Le téléchargement d'une pièce jointe est soumis aux droits de lecture de l'utilisateur sur l'objet parent.

---

## 12. COMMENTAIRES INLINE

### 12.1 Principe

Dans l'éditeur de documents, les réviseurs peuvent sélectionner du texte et y ajouter un commentaire, à la manière d'un traitement de texte collaboratif. Le texte commenté est mis en surbrillance.

### 12.2 Cycle de vie d'un commentaire

Un commentaire peut être **résolu** par le rédacteur ou le réviseur. Une fois résolu, la surbrillance disparaît mais le commentaire reste visible dans le panneau d'historique.

Un commentaire peut recevoir des réponses, créant un fil de discussion.

---

## 13. RECHERCHE ET FILTRES

### 13.1 Filtres par liste

Chaque liste d'objets dispose de filtres adaptés à son type de données. Les filtres actifs sont affichés sous forme de pastilles visibles, supprimables individuellement. Un bouton "Tout effacer" supprime tous les filtres en un clic.

### 13.2 Sauvegarde de filtres

L'utilisateur peut sauvegarder une combinaison de filtres sous un nom. Les filtres sauvegardés sont disponibles dans un menu déroulant et permettent de retrouver rapidement une vue fréquemment utilisée.

### 13.3 Recherche textuelle

La barre de recherche de chaque liste effectue une recherche sur les champs textuels principaux (nom, code, numéro, description). La recherche est insensible à la casse et aux accents.

---

## 14. ÉTAT HORS LIGNE

### 14.1 Fonctionnement sans connexion

OpsFlux fonctionne partiellement sans connexion internet, ce qui est essentiel pour les utilisateurs travaillant en offshore ou dans des zones à faible connectivité.

En mode hors ligne, l'utilisateur peut :
- **Consulter** les documents récemment ouverts (les 20 derniers)
- **Modifier** un document en cours d'édition (les modifications sont sauvegardées localement)
- **Naviguer** dans l'arborescence de projets (si consultée récemment)
- **Créer** un nouveau document (il sera synchronisé à la reconnexion)
- **Consulter** les tableaux de bord avec les données du dernier rafraîchissement

Un indicateur permanent signale à l'utilisateur qu'il est en mode hors ligne.

### 14.2 Synchronisation

Lors de la reconnexion, les modifications locales sont automatiquement synchronisées avec le serveur. En cas de conflit (modification du même contenu par deux utilisateurs), le système fusionne intelligemment les changements. Si la fusion automatique est impossible, une bannière avertit l'utilisateur pour qu'il arbitre manuellement.

---

## 15. PARAMÈTRES ET CONFIGURATION

### 15.1 Paramètres tenant

L'administrateur tenant peut configurer depuis les paramètres :
- Les informations de l'organisation (nom, logo, couleurs de marque)
- Les Business Units (créer, renommer, désactiver)
- Les utilisateurs (inviter, attribuer un rôle, désactiver)
- Les modules activés
- La configuration email (serveur SMTP, templates des emails)
- Les fournisseurs IA (Ollama local ou cloud)
- Les connecteurs de données
- Les règles de nommage (nomenclature)
- Les workflows de validation
- Les templates de documents
- Les champs personnalisés par type d'objet
- Les listes de distribution

### 15.2 Paramètres personnels

Chaque utilisateur peut configurer depuis ses préférences :
- La langue de l'interface
- Le thème (clair, sombre, automatique)
- La page d'accueil
- L'activation des notifications par email
- L'intervalle d'auto-sauvegarde dans l'éditeur
- Le format d'export par défaut (PDF ou Word)

---

## 16. SUPER-ADMINISTRATION

Le super-administrateur OpsFlux dispose d'un espace d'administration dédié qui lui permet de :
- Créer et gérer les tenants
- Consulter l'utilisation de chaque tenant (stockage, utilisateurs, documents)
- Accéder au tableau de bord de santé de l'infrastructure
- Configurer les alertes de dépassement de seuils
- Accéder au journal d'audit global (toutes organisations)
- Lancer des backups manuels

Le tableau de bord de santé affiche en temps réel : l'espace de stockage utilisé par tenant, la taille de la base de données, les files de traitement en attente, et les projections de saturation. Des alertes sont envoyées automatiquement lorsque des seuils d'alerte sont approchés.

