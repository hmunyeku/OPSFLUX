# Module Third Parties Management

Module professionnel pour la gestion complète des tiers (entreprises, contacts, invitations).

## 📋 Vue d'ensemble

Ce module permet de gérer de manière professionnelle :

- **Entreprises/Tiers** : Clients, fournisseurs, partenaires, sous-traitants
- **Contacts** : Employés et personnes de contact des entreprises tierces
- **Invitations sécurisées** : Système d'invitation avec vérification 2FA pour que les contacts complètent leur profil
- **Conversion en administrateur** : Possibilité pour un contact de devenir administrateur du système

## ✨ Fonctionnalités

### Gestion des Entreprises

- CRUD complet avec soft delete
- Types d'entreprise : Client, Fournisseur, Partenaire, Sous-traitant
- Statuts : Actif, Inactif, Prospect, Archivé
- Informations complètes : coordonnées, adresse, SIRET/SIREN, TVA
- Métadonnées flexibles (secteur, effectif, CA)
- Recherche avancée et filtres
- Tags personnalisables
- Statistiques et KPIs

### Gestion des Contacts

- Contacts associés aux entreprises
- Informations professionnelles complètes
- Rôles : CEO, Manager, Employé, etc.
- Contact principal par entreprise
- Liaison optionnelle avec compte utilisateur
- Statuts : Actif, Inactif, Invité, Archivé

### Système d'Invitation

- Génération de liens sécurisés avec token unique
- Expiration paramétrable (par défaut 7 jours)
- **Vérification 2FA obligatoire** lors de l'acceptation
- Possibilité d'accorder droits administrateur
- Permissions initiales personnalisables
- Traçabilité complète (IP, user agent, dates)
- Révocation possible
- Notifications automatiques

## 🔐 Permissions

| Permission | Description |
|------------|-------------|
| `companies.read` | Consulter les entreprises |
| `companies.create` | Créer des entreprises |
| `companies.update` | Modifier des entreprises |
| `companies.delete` | Supprimer des entreprises |
| `contacts.read` | Consulter les contacts |
| `contacts.create` | Créer des contacts |
| `contacts.update` | Modifier des contacts |
| `contacts.delete` | Supprimer des contacts |
| `contacts.invite` | Créer et envoyer des invitations |
| `contacts.manage_invitations` | Gérer les invitations |
| `contacts.grant_admin` | Accorder droits administrateur |

## 🎯 Cas d'usage

### 1. Ajouter un client

```
1. Créer l'entreprise cliente
2. Ajouter les contacts (commercial, technique, admin)
3. Marquer le contact principal
4. Optionnel : Inviter le contact principal à s'inscrire
```

### 2. Inviter un contact externe

```
1. Créer le contact dans l'entreprise
2. Générer une invitation sécurisée
3. Le contact reçoit un email avec le lien
4. Il complète son profil et configure 2FA
5. Optionnel : Il devient administrateur si autorisé
```

### 3. Convertir un contact en administrateur

```
1. Contact accepte l'invitation
2. Configure son 2FA
3. Si "can_be_admin" = true, un compte utilisateur est créé
4. Permissions initiales sont appliquées
5. Notification aux super-utilisateurs
```

## 🔄 Hooks disponibles

- `company.created` : Nouvelle entreprise créée
- `company.updated` : Entreprise modifiée
- `contact.created` : Nouveau contact créé
- `contact.updated` : Contact modifié
- `contact.invitation.created` : Invitation envoyée (→ email automatique)
- `contact.invitation.accepted` : Invitation acceptée
- `contact.admin_granted` : Contact devient administrateur (→ alerte)

## 🚀 Installation

Le module s'installe via le système de modules d'OpsFlux :

```bash
# Via l'interface admin
Settings → Modules → Available Modules → Third Parties → Install

# Ou via API
POST /api/v1/modules/install
{
  "code": "third_parties"
}
```

L'installation créera automatiquement :
- Les tables de base de données
- Les permissions
- Les items de menu
- Les hooks
- Les paramètres

## 📊 Base de données

### Tables créées

- `company` : Entreprises tierces
- `contact` : Contacts/employés
- `contact_invitation` : Invitations sécurisées

### Relations

```
Company (1) ----< (N) Contact
Contact (1) ----< (N) ContactInvitation
Contact (0,1) ----< (1) User (si administrateur)
```

## 🎨 Frontend (À implémenter)

Les pages frontend seront créées dans :
- `/third-parties/companies` : Liste et gestion des entreprises
- `/third-parties/companies/[id]` : Détails d'une entreprise
- `/third-parties/contacts` : Liste et gestion des contacts
- `/third-parties/contacts/[id]` : Détails d'un contact
- `/third-parties/invitations` : Gestion des invitations
- `/accept-invitation/[token]` : Acceptation d'invitation (page publique)

## ⚙️ Configuration

### Paramètres globaux

- `third_parties.invitation.default_expiry_days` : Durée de validité des invitations (défaut: 7 jours)
- `third_parties.invitation.require_2fa` : Exiger 2FA (défaut: true)
- `third_parties.contact.allow_admin_conversion` : Autoriser conversion admin (défaut: true)
- `third_parties.company.auto_create_primary_contact` : Auto-créer contact principal (défaut: false)

### Préférences utilisateur

- `third_parties.notification.email.company_created` : Email nouvelles entreprises
- `third_parties.notification.email.contact_invited` : Email nouvelles invitations
- `third_parties.display.default_company_type` : Type par défaut (défaut: client)

## 🔒 Sécurité

- Soft delete sur toutes les entités
- Audit trail complet (created_by, updated_by, deleted_by)
- Tokens d'invitation uniques et expirables
- Vérification 2FA obligatoire
- Traçabilité des acceptations (IP, user agent)
- Notifications pour actions sensibles
- Permissions granulaires

## 📝 API Endpoints

### Entreprises

- `GET /api/v1/third-parties/companies` : Liste des entreprises
- `POST /api/v1/third-parties/companies` : Créer entreprise
- `GET /api/v1/third-parties/companies/{id}` : Détails entreprise
- `PATCH /api/v1/third-parties/companies/{id}` : Modifier entreprise
- `DELETE /api/v1/third-parties/companies/{id}` : Supprimer entreprise
- `GET /api/v1/third-parties/companies/stats/summary` : Statistiques

### Contacts

- `GET /api/v1/third-parties/contacts` : Liste des contacts
- `POST /api/v1/third-parties/contacts` : Créer contact
- `GET /api/v1/third-parties/contacts/{id}` : Détails contact
- `PATCH /api/v1/third-parties/contacts/{id}` : Modifier contact
- `DELETE /api/v1/third-parties/contacts/{id}` : Supprimer contact

### Invitations

- `POST /api/v1/third-parties/invitations` : Créer invitation
- `GET /api/v1/third-parties/invitations` : Liste invitations
- `POST /api/v1/third-parties/invitations/{token}/accept` : Accepter invitation
- `POST /api/v1/third-parties/invitations/{token}/verify-2fa` : Vérifier 2FA
- `DELETE /api/v1/third-parties/invitations/{id}/revoke` : Révoquer invitation

## 📦 Version

**Version actuelle** : 1.0.0

## 👥 Auteur

OpsFlux Team - modules@opsflux.io

## 📄 Licence

Proprietary - OpsFlux

## 🤝 Support

Pour toute question ou problème :
- Documentation : https://docs.opsflux.io/modules/third-parties
- Support : support@opsflux.io
