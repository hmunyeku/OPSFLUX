# OpsFlux — Cahier des Charges Fonctionnel
# Module CORE — Plateforme et services transverses

---

## 1. Vision générale

Le Core est la fondation sur laquelle tous les modules reposent. Il ne gère pas de métier
(pas de documents, pas d'assets, pas de PID) mais fournit les capacités universelles :
qui peut faire quoi, comment les objets sont organisés, comment les utilisateurs
collaborent, comment les données circulent entre modules.

Un module ne peut pas exister sans le Core. Le Core peut exister sans aucun module.

---

## 2. Gestion des organisations (Multi-tenant)

### 2.1 Concept de tenant

Un tenant représente une entité organisationnelle indépendante dans OpsFlux.
Chaque tenant a ses propres données, ses propres utilisateurs, ses propres configurations.
Les données d'un tenant ne sont jamais visibles d'un autre tenant.

**Qui crée les tenants ?** Uniquement le super administrateur OpsFlux
via l'interface d'administration dédiée. Il n'y a pas d'inscription libre.

**Cycle de vie d'un tenant :**
- Création par le super admin → activation → configuration par le tenant admin → utilisation
- Désactivation possible (lecture seule) → réactivation possible
- Suppression physique irréversible (jamais effectuée en pratique)

### 2.2 Business Units (BU)

Une BU est une subdivision d'un tenant. Elle représente une entité opérationnelle :
une zone géographique, une plateforme, un département.

**Hiérarchie :** Les BU peuvent être imbriquées en arbre.
Exemple : Cameroun → BIPAGA → Plateforme Nord

**Effet du scope BU :** Quand un utilisateur active une BU dans son interface,
toutes les listes (documents, assets, etc.) sont filtrées sur cette BU.
Il peut choisir "Toutes les BU" pour voir l'ensemble.

**Droits BU :** Un utilisateur peut avoir des droits différents selon la BU.
Un éditeur sur BIPAGA peut être seulement lecteur sur EBOME.

### 2.3 Onboarding d'un nouveau tenant

À la première connexion d'un tenant admin, un assistant de configuration se déclenche :

**Étape 1 — Bienvenue :** Présentation de l'espace, nom du tenant confirmé.

**Étape 2 — Business Units :** Créer la structure organisationnelle.
Au minimum une BU est requise. L'admin peut en créer plusieurs et les organiser en arbre.

**Étape 3 — Inviter les utilisateurs :** Saisir les emails des membres de l'équipe.
Les invitations sont envoyées par email. Chaque invité devra se connecter
via le SSO pour activer son compte.

**Étape 4 — Activer les modules :** Choisir les modules à activer
(Rédacteur, PID, Dashboard, Assets, Tiers). Peuvent être activés ou désactivés
ultérieurement depuis les Settings.

**Étape 5 — Configurer les emails :** Paramétrer le serveur SMTP pour
les notifications. Étape marquée "optionnel" — peut être faite plus tard.

**Étape 6 — Choisir la page d'accueil :** Sélectionner le dashboard
qui s'affichera à la connexion pour les utilisateurs du tenant.

L'assistant peut être abandonné à tout moment et repris plus tard.
Une fois terminé, il ne se réaffiche plus.

---

## 3. Gestion des utilisateurs

### 3.1 Inscription et premier accès

OpsFlux utilise le SSO de l'entreprise (Azure Active Directory) pour l'authentification.
Il n'y a pas de création de mot de passe dans OpsFlux.

**Premier accès :**
1. L'utilisateur reçoit un email d'invitation avec un lien
2. Il clique sur le lien → redirigé vers la page de connexion Azure
3. Il s'authentifie avec ses identifiants d'entreprise
4. Son compte OpsFlux est créé automatiquement
5. Il voit la page "En attente d'assignation" car il n'a pas encore de rôle
6. Le tenant admin reçoit une notification : "Nouvel utilisateur en attente d'un rôle"
7. Le tenant admin lui assigne un rôle → l'utilisateur peut accéder à l'application

### 3.2 Rôles et droits

| Rôle | Description |
|---|---|
| **Lecteur** | Consulte les documents publiés et les données de sa BU. Aucune modification possible. |
| **Éditeur** | Crée et modifie les documents en brouillon. Crée et modifie les assets et tiers. |
| **Réviseur** | Valide ou rejette les documents soumis. Ne crée pas de documents. |
| **Gestionnaire de templates** | Crée et modifie les templates de documents et les types d'assets. |
| **Gestionnaire PID** | Gère les PID/PFD, la bibliothèque d'objets process et les règles de nommage des tags. |
| **Admin tenant** | Accès complet à tout le tenant. Configure les settings, invite les utilisateurs, gère les rôles. |
| **Super admin** | Accès à tous les tenants. Crée les tenants. Accède au dashboard infrastructure. |

**Principe fondamental :** Un utilisateur ne peut voir que les données
de sa BU active. Il ne peut effectuer que les actions autorisées par son rôle.
Ces deux contraintes s'appliquent simultanément et ne peuvent pas être contournées.

### 3.3 Délégation temporaire

Un utilisateur peut déléguer ses droits à un collègue pour une période définie.
Cas d'usage typique : congés, déplacement, absence.

**Fonctionnement :**
- Le délégant choisit le délégué, la date de début et la date de fin
- Le périmètre peut être total ou partiel (un projet spécifique, un type de document)
- Pendant la délégation, le délégué voit les validations du délégant dans sa liste
- Les actions du délégué sont tracées "Délégué par [nom]" dans l'historique
- À l'expiration de la date de fin, la délégation est désactivée automatiquement

**Règles :**
- Un lecteur ne peut pas déléguer (pas de droits à transmettre)
- Une délégation ne peut pas créer plus de droits que le délégant n'en a
- Plusieurs délégations actives simultanément sont possibles

---

## 4. Authentification et sécurité des sessions

### 4.1 Connexion

L'utilisateur clique "Se connecter" → redirigé vers Azure Active Directory
→ s'authentifie → retour dans OpsFlux avec sa session active.

La session dure 8 heures. Elle est prolongée automatiquement tant que l'utilisateur
est actif (une tentative de refresh est effectuée silencieusement avant expiration).
Après 7 jours sans aucune activité, la reconnexion est requise.

### 4.2 Multi-tenant

Un utilisateur peut appartenir à plusieurs tenants (ex: un consultant travaillant
pour plusieurs entités Perenco). Il peut switcher de tenant depuis la topbar
sans se déconnecter. Chaque switch charge les données du nouveau tenant.

### 4.3 Sécurité

Toutes les communications sont chiffrées (HTTPS/WSS).
Les mots de passe ne sont jamais stockés dans OpsFlux (délégué à Azure AD).
Les credentials des connecteurs sont chiffrés au repos.
Chaque action est tracée dans l'audit log avec horodatage et identité de l'acteur.

---

## 5. Navigation et interface

### 5.1 Structure générale

L'interface est organisée en zones permanentes :

**Topbar (barre du haut) :**
Logo | Switcher tenant | Recherche globale | Switcher BU | Bouton IA | Notifications | Paramètres | Avatar

**Sidebar (barre latérale gauche) :**
- Section Favoris : les pages/objets bookmarkés par l'utilisateur
- Section Navigation : les modules activés et leurs pages principales
- Section Admin : settings, utilisateurs (visible uniquement admin)

La sidebar peut être réduite (icônes seules) ou étendue (icônes + libellés).
La préférence est mémorisée.

**Panneau statique (zone principale) :**
Le contenu de la page courante. Toujours visible.

**Panneau dynamique (à droite, optionnel) :**
Détails de l'objet sélectionné dans la liste. S'ouvre au clic sur un élément.
Peut être épinglé pour rester ouvert lors de la navigation.

**Panneau IA (à droite, collapsible) :**
Chat avec l'assistant, briefing journalier, suggestions contextuelles.

### 5.2 Résolution de la page d'accueil

À la connexion, l'utilisateur est redirigé vers sa page d'accueil dans cet ordre de priorité :
1. Son dashboard personnel configuré
2. Le dashboard par défaut de son rôle
3. Le dashboard par défaut de sa BU
4. Le dashboard par défaut du tenant
5. Une page vide avec invitation à configurer

### 5.3 Favoris et bookmarks

L'utilisateur peut "favoriter" n'importe quelle page ou objet :
- Une page de liste (ex: "Documents BIPAGA")
- Une fiche d'objet (ex: "Plateforme BIPAGA")
- Un dashboard
- Un PID

Les favoris apparaissent en haut de la sidebar, toujours accessibles.
Leur ordre est réorganisable par glissé-déposé.

---

## 6. Recherche globale

### 6.1 Déclenchement

La recherche globale s'ouvre avec le raccourci ⌘K (ou Ctrl+K) ou
en cliquant sur la barre de recherche dans la topbar.

### 6.2 Ce qui est recherchable

La recherche couvre tous les objets accessibles par l'utilisateur dans sa BU active :
- Documents (par numéro, titre, contenu)
- Assets (par code, nom)
- Tiers et contacts (par nom, email)
- Équipements process (par tag)
- Tags DCS (par nom)
- Projets (par code, nom)

### 6.3 Résultats et navigation

Les résultats s'affichent en temps réel pendant la frappe (après 2 caractères).
Ils sont groupés par type d'objet. Les favoris et pages récentes s'affichent
avant toute frappe.

Cliquer un résultat ouvre la page correspondante et ferme la recherche.

### 6.4 Deux modes de recherche

**Recherche exacte :** Trouve les objets dont le titre, numéro ou code correspond
aux termes saisis. Résultats immédiats, insensible à la casse.

**Recherche sémantique (si l'IA est configurée) :** Trouve des documents
dont le contenu est similaire à la question posée, même sans correspondance
exacte de mots. Ex: "problème pression séparateur" retrouve un rapport
qui parle de "défaillance capteur de pression" sans que ces mots soient
dans la recherche.

Les résultats exacts sont toujours prioritaires sur les résultats sémantiques.

---

## 7. Système de notifications

### 7.1 Types de notifications

**Notifications d'action requise (urgentes) :**
- Document en attente de validation (assigné à moi)
- Deadline de validation dépassée
- Délégation reçue

**Notifications d'information :**
- Document approuvé / rejeté (pour l'auteur)
- Document publié (pour les membres de la liste de distribution)
- Commentaire ajouté sur un document que je suis
- Partage reçu

**Notifications système :**
- Backup échoué (admin uniquement)
- Seuil d'alerte infrastructure dépassé (admin uniquement)

### 7.2 Canaux de notification

Chaque notification est envoyée simultanément sur deux canaux :
1. **In-app** : visible dans le panneau cloche en haut à droite
2. **Email** : envoyé à l'adresse de l'utilisateur

L'utilisateur peut désactiver l'un ou l'autre canal dans ses préférences.
Certaines notifications critiques (deadline dépassée, backup échoué)
ne peuvent pas être désactivées.

### 7.3 Lecture des notifications

Une notification se marque "lue" automatiquement au clic dessus.
Le bouton "Tout marquer comme lu" vide le compteur d'un coup.
Les notifications lues restent consultables 30 jours dans l'historique.

### 7.4 Recommandations (panneau "À faire")

Distinctes des notifications, les recommandations sont des suggestions proactives :
- "Vous n'avez pas créé votre rapport journalier BIPAGA aujourd'hui"
- "3 documents en attente de votre validation depuis plus de 3 jours"

Les recommandations peuvent être reportées ("Rappeler dans 4 heures")
ou ignorées ("Ne plus afficher"). Les recommandations critiques
(deadline dépassée) ne peuvent pas être reportées.

---

## 8. Système de workflow (validation)

### 8.1 Principe

Le workflow est le circuit de validation qu'un document doit parcourir
avant d'être considéré comme approuvé. Chaque type de document peut avoir
son propre circuit, configuré par le gestionnaire de templates.

### 8.2 Types de nœuds de validation

**Séquentiel :** Un seul validateur à la fois. Le document ne passe au nœud suivant
que lorsque ce validateur a approuvé.

**Parallèle :** Plusieurs validateurs simultanément. Le document avance
lorsqu'un seuil est atteint (tous, majorité, ou N parmi M).

**Conditionnel :** Le circuit se branche selon la valeur d'un champ du document.
Exemple : si le budget > 10 000 $, passer par le directeur financier.

**Notification :** Envoie une information sans bloquer le circuit.
Utilisé pour informer des parties prenantes sans requérir leur validation.

### 8.3 Flux d'une validation standard

1. L'auteur soumet le document : statut passe à "En révision"
2. Le premier validateur reçoit une notification
3. Il ouvre le document en lecture seule
4. Il peut ajouter des commentaires inline sur le texte
5. Il approuve ou rejette avec un commentaire général optionnel
   - Si rejet : motif obligatoire, le document retourne à l'auteur
6. Si tous les nœuds sont approuvés : statut passe à "Approuvé"
7. L'auteur choisit manuellement de "Publier" le document
8. La publication déclenche la distribution automatique

### 8.4 Comportement au rejet

Quand un validateur rejette un document :
- Le document retourne à l'état "Brouillon"
- L'auteur est notifié avec le motif du rejet
- Le circuit se réinitialise depuis le nœud de rejet configuré
  (peut retourner au début ou à un nœud intermédiaire)
- L'auteur corrige et peut resoumettre

### 8.5 Deadlines et relances

Chaque nœud de validation peut avoir une deadline (ex: 3 jours).
Si la deadline est dépassée :
- Le validateur reçoit une relance automatique chaque jour
- Une recommandation critique apparaît dans son panneau IA
- L'admin voit l'alerte dans le tableau de bord des workflows

La deadline ne bloque pas techniquement la validation —
elle sert à alerter et mesurer les délais.

### 8.6 Annulation d'un workflow

L'auteur peut annuler le circuit de validation tant que le premier nœud
n'a pas encore été validé. Au-delà, seul un admin tenant peut forcer
l'annulation, avec traçage dans l'historique.

---

## 9. Champs personnalisés (Custom Fields)

### 9.1 Principe

Chaque type d'objet (document, asset, tiers, équipement...) peut être enrichi
de champs additionnels définis par les administrateurs, sans intervention technique.

### 9.2 Types de champs disponibles

- Texte court (une ligne)
- Texte long (plusieurs lignes)
- Nombre entier ou décimal (avec unité optionnelle)
- Date / Date+heure
- Choix simple (liste déroulante)
- Choix multiple
- Booléen (oui/non)
- Référence vers un autre objet OpsFlux (ex: un contact)
- Formule calculée (ex: rendement = production / capacité × 100)

### 9.3 Configuration

L'admin configure les champs depuis Settings > Modules > {Module} > Champs.
Pour chaque champ : clé unique, libellé (multilingue), type, obligatoire ou non,
groupe d'affichage, ordre.

La clé est immuable après création. Modifier le libellé ou le type est possible.
Supprimer un champ masque les données existantes (soft delete) — elles sont
conservées mais non affichées.

### 9.4 Affichage

Les champs personnalisés s'affichent dans la section "Informations complémentaires"
de chaque fiche, après les champs standards. Pas de séparation visuelle forte —
l'ensemble forme une liste cohérente de propriétés.

---

## 10. Relations entre objets

### 10.1 Principe

N'importe quel objet OpsFlux peut être lié à n'importe quel autre.
Ces relations sont bidirectionnelles : visibles depuis les deux objets concernés.

### 10.2 Exemples de relations

- Un document lié à une plateforme (asset)
- Un équipement lié à un document de spécification
- Un tiers lié à un document de contrat
- Un PID lié à un projet
- Un asset lié à plusieurs tags DCS

### 10.3 Création d'une relation

Depuis la fiche d'un objet → onglet correspondant (ex: "Documents liés")
→ bouton "Lier un document" → sélecteur universel → la relation apparaît
immédiatement dans les deux fiches.

### 10.4 Suppression d'une relation

Cliquer l'icône de suppression sur le lien → confirmation → relation retirée
des deux côtés. Les objets eux-mêmes ne sont pas supprimés.

---

## 11. Partage de liens (Share Links)

### 11.1 Principe

Un utilisateur peut partager un objet OpsFlux avec une personne externe
(sans compte OpsFlux) via un lien sécurisé.

### 11.2 Niveaux d'accès

- **Lecture seule :** Le destinataire consulte l'objet sans pouvoir modifier.
- **Remplir un formulaire :** Le destinataire complète un formulaire lié à l'objet.
- **Téléchargement :** Le destinataire peut télécharger le PDF du document.

### 11.3 Sécurité du lien

Le lien contient un token signé. En plus du lien, le destinataire doit confirmer
son email (magic link) : il reçoit un email avec un bouton de validation.
Ce n'est qu'après cette confirmation qu'il accède au contenu.

Si l'expéditeur définit une liste de destinataires autorisés, seules ces personnes
peuvent confirmer leur accès. N'importe qui ayant le lien mais non dans la liste
verra un message "Accès non autorisé".

### 11.4 Expiration et révocation

Chaque lien a une date d'expiration (par défaut 30 jours). Après cette date,
le lien ne fonctionne plus. L'expéditeur peut révoquer un lien avant son expiration.
Tous les accès au lien sont loggés (date, heure, email du destinataire).

---

## 12. Stockage et gestion des fichiers

### 12.1 Ce qui est stocké

- Pièces jointes des documents (PDF, images, Word, Excel)
- Fichiers importés (CSV, DXF, SVG)
- Exports générés (PDF, DOCX)
- Logo et assets de l'interface

### 12.2 Limites

Chaque fichier uploadé est limité à 50 Mo (configurable par l'admin).
Un quota global par tenant peut être configuré.

### 12.3 Prévisualisation

Les images (JPG, PNG, SVG) sont prévisualisées directement dans l'interface.
Les PDF sont prévisualisés dans un lecteur intégré.
Les autres formats (Word, Excel) téléchargent le fichier directement.

---

## 13. Audit et traçabilité

### 13.1 Ce qui est tracé

Toutes les actions significatives sont enregistrées :
- Connexions et déconnexions
- Créations, modifications, suppressions d'objets
- Transitions de workflow (avec acteur et commentaire)
- Accès aux liens partagés
- Changements de rôle et de permissions
- Actions de l'IA (avec l'utilisateur qui a déclenché l'action)

### 13.2 Accès à l'audit log

- **Tenant admin :** voit l'audit de son tenant (filtrable par utilisateur, action, date)
- **Super admin :** voit l'audit de tous les tenants
- Exportable en CSV pour archivage ou conformité

### 13.3 Rétention

Les logs d'audit sont conservés indéfiniment. Aucune purge automatique.
Le super admin est alerté si le volume des logs dépasse des seuils définis.

---

## 14. Internationalisation

### 14.1 Langues supportées

Français (FR) et Anglais (EN) sont les deux langues de base.
D'autres langues peuvent être activées par tenant (arabe, etc.).

### 14.2 Ce qui est traduit

- L'interface complète (libellés, boutons, messages d'erreur)
- Les emails de notification
- Les libellés des champs personnalisés (définis en plusieurs langues par l'admin)
- Les libellés des types d'assets

### 14.3 Ce qui n'est pas traduit

- Le contenu des documents (créés dans la langue choisie par l'auteur)
- Les numéros et codes techniques
- Les noms de projets et BU

### 14.4 Choix de la langue

Chaque utilisateur choisit sa langue dans ses préférences.
Si aucune préférence, la langue par défaut du tenant s'applique.

---

## 15. Mode hors ligne (PWA)

### 15.1 Ce qui fonctionne sans connexion

- **Lecture des documents récents :** Les 20 derniers documents consultés
  sont disponibles en lecture même sans internet.
- **Modification d'un document :** L'utilisateur peut continuer à écrire.
  Les modifications sont sauvegardées localement et synchronisées à la reconnexion.
- **Navigation dans l'arborescence :** La structure des projets reste navigable.
- **Création d'un document :** Possible hors ligne, avec synchronisation différée.
- **Dashboards :** Affichent les données figées au dernier chargement.

### 15.2 Indicateurs visuels

Une icône et un texte discrets signalent le mode hors ligne.
Un message "Synchronisation en cours..." apparaît à la reconnexion.
Si un conflit est détecté lors de la synchronisation, un message guide l'utilisateur.

### 15.3 Ce qui ne fonctionne pas hors ligne

Les actions qui nécessitent une réponse du serveur en temps réel :
soumettre un document au workflow, valider, exporter un PDF,
accéder aux données en temps réel d'un connecteur.

