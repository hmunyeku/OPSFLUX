# Scripts d'installation du module Third Parties

Ce dossier contient les scripts nécessaires pour installer et configurer le module Third Parties dans OpsFlux.

## Installation complète

Pour installer complètement le module (recommandé) :

```bash
docker exec -it perenco-opsflux-gwxapr-backend-1 python modules/third-parties/backend/scripts/register_third_parties_module.py
```

Ce script effectue automatiquement :
- ✅ Création des tables de la base de données
- ✅ Enregistrement des permissions
- ✅ Enregistrement des widgets
- ✅ Création des entrées de menu

## Installation partielle

### 1. Permissions uniquement

```bash
docker exec -it perenco-opsflux-gwxapr-backend-1 python modules/third-parties/backend/scripts/register_third_parties_permissions.py
```

### 2. Widgets uniquement

```bash
docker exec -it perenco-opsflux-gwxapr-backend-1 python backend/scripts/register_module_widgets.py third-parties
```

### 3. Tables uniquement

```bash
docker exec -it perenco-opsflux-gwxapr-backend-1 python backend/scripts/create_company_tables.py
```

## Permissions créées

Le module Third Parties crée les permissions suivantes :

### Companies (Entreprises)
- `companies.read` - Voir les entreprises
- `companies.create` - Créer des entreprises
- `companies.update` - Modifier des entreprises
- `companies.delete` - Supprimer des entreprises

### Contacts
- `contacts.read` - Voir les contacts
- `contacts.create` - Créer des contacts
- `contacts.update` - Modifier des contacts
- `contacts.delete` - Supprimer des contacts

### Invitations
- `contacts.invite` - Inviter des contacts
- `contacts.manage_invitations` - Gérer les invitations
- `contacts.grant_admin` - Donner les droits admin

### Administration
- `third_parties.admin` - Administration complète du module

## Menu créé

Le script crée une entrée de menu "Tiers" avec 3 sous-menus :
- Entreprises (`/third-parties/companies`)
- Contacts (`/third-parties/contacts`)
- Invitations (`/third-parties/invitations`)

## Widgets créés

8 widgets sont enregistrés :
1. **Aperçu Statistiques Tiers** - Vue d'ensemble des stats
2. **Entreprises par Type** - Graphique pie chart
3. **Entreprises par Statut** - Graphique donut
4. **Entreprises Récentes** - Liste des dernières entreprises
5. **Contacts Récents** - Liste des derniers contacts
6. **Invitations en Attente** - Invitations non validées
7. **Évolution des Contacts** - Graphique temporel
8. **Top Entreprises** - Classement par nombre de contacts

## Vérification

Après installation, vérifier que :
1. Les tables existent dans la DB : `company`, `contact`, `contact_invitation`
2. Les permissions apparaissent dans `/users/permissions`
3. Le menu "Tiers" apparaît dans la sidebar
4. Les widgets sont disponibles lors de la création de dashboards
