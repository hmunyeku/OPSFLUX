# Système de Gestion d'Emails OpsFlux

## Vue d'ensemble

Système centralisé complet pour gérer tous les emails envoyés par l'application OpsFlux.

## Fonctionnalités

### 1. Configuration SMTP
- Configuration complète du serveur SMTP
- Support TLS/SSL
- Test de connexion en temps réel
- Sauvegarde des paramètres

### 2. Gestion des Templates
- Création, édition et suppression de templates
- Éditeur HTML avec aperçu en temps réel
- Support des variables dynamiques
- Catégorisation des templates
- Statistiques d'utilisation

### 3. Variables Dynamiques
Variables disponibles dans tous les templates:
- `{{user_name}}` - Nom complet de l'utilisateur
- `{{user_email}}` - Email de l'utilisateur
- `{{user_first_name}}` - Prénom
- `{{user_last_name}}` - Nom de famille
- `{{company_name}}` - Nom de l'entreprise
- `{{reset_link}}` - Lien de réinitialisation de mot de passe
- `{{confirmation_link}}` - Lien de confirmation
- `{{task_title}}` - Titre de la tâche
- `{{task_description}}` - Description de la tâche
- `{{project_name}}` - Nom du projet
- `{{due_date}}` - Date d'échéance
- `{{notification_message}}` - Message de notification
- `{{current_year}}` - Année actuelle
- `{{current_date}}` - Date actuelle
- `{{support_email}}` - Email support

### 4. Aperçu en Temps Réel
- Preview desktop et mobile
- Remplacement des variables en temps réel
- Test d'envoi avant déploiement

### 5. Système de Test
- Envoi d'emails de test à n'importe quelle adresse
- Personnalisation des variables pour les tests
- Validation avant mise en production

### 6. Logs d'Envoi
- Historique complet des emails envoyés
- Statuts: Envoyé, En attente, Échec
- Filtrage par statut et recherche
- Visualisation des détails d'envoi

### 7. Statistiques
- Emails envoyés aujourd'hui
- Taux de succès global
- Emails en attente
- Nombre d'échecs
- Statistiques hebdomadaires et mensuelles

## Structure des Fichiers

```
components/settings/email/
├── email-content.tsx              # Composant principal
├── email-template-editor.tsx      # Éditeur de templates
└── README.md                      # Cette documentation

lib/
└── email-api.ts                   # API client pour les emails
```

## Utilisation

### Créer un Nouveau Template

1. Aller sur `/settings/email`
2. Onglet "Templates"
3. Cliquer sur "Nouveau Template"
4. Remplir les informations:
   - **Code unique**: Identifiant technique (ex: `welcome_email`)
   - **Nom**: Nom descriptif (ex: "Bienvenue Utilisateur")
   - **Sujet**: Sujet de l'email (peut contenir des variables)
   - **Corps HTML**: Contenu HTML de l'email
   - **Corps Texte** (optionnel): Version texte brut
5. Utiliser les variables disponibles dans la sidebar
6. Prévisualiser le rendu
7. Tester l'envoi
8. Sauvegarder

### Utiliser un Template dans le Code

```typescript
import { EmailApi } from "@/lib/email-api"

// Envoyer un email avec un template
await EmailApi.sendEmail({
  template_code: "welcome_email",
  to_email: "user@example.com",
  to_name: "John Doe",
  variables: {
    user_name: "John Doe",
    user_first_name: "John",
    company_name: "OpsFlux",
  },
})
```

### Tester un Template

1. Ouvrir le template dans l'éditeur
2. Aller sur l'onglet "Tester"
3. Entrer une adresse email de test
4. Personnaliser les variables (optionnel)
5. Cliquer sur "Envoyer l'Email de Test"

### Configurer SMTP

1. Aller sur `/settings/email`
2. Onglet "Configuration SMTP"
3. Remplir les paramètres:
   - Serveur SMTP (ex: smtp.gmail.com)
   - Port (ex: 587 pour TLS, 465 pour SSL)
   - Nom d'utilisateur
   - Mot de passe
   - Email expéditeur
   - Nom expéditeur
4. Activer TLS/SSL selon votre configuration
5. Tester la connexion
6. Enregistrer

## API Backend Requise

Le système frontend attend les endpoints suivants côté backend:

### Templates
- `GET /api/v1/email/templates` - Liste des templates
- `GET /api/v1/email/templates/{id}` - Détails d'un template
- `GET /api/v1/email/templates/by-code/{code}` - Template par code
- `POST /api/v1/email/templates` - Créer un template
- `PATCH /api/v1/email/templates/{id}` - Mettre à jour un template
- `DELETE /api/v1/email/templates/{id}` - Supprimer un template
- `POST /api/v1/email/templates/{id}/preview` - Prévisualiser avec variables

### Envoi
- `POST /api/v1/email/send` - Envoyer un email
- `POST /api/v1/email/test` - Envoyer un email de test

### Logs
- `GET /api/v1/email/logs` - Logs d'envoi
- `GET /api/v1/email/logs/{id}` - Détails d'un log

### Stats & Config
- `GET /api/v1/email/stats` - Statistiques
- `GET /api/v1/email/smtp/settings` - Configuration SMTP
- `POST /api/v1/email/smtp/settings` - Mettre à jour SMTP
- `POST /api/v1/email/smtp/test` - Tester connexion SMTP
- `GET /api/v1/email/variables` - Variables disponibles

## Templates Recommandés

### 1. Bienvenue Utilisateur
```html
<h1>Bienvenue sur {{company_name}}</h1>
<p>Bonjour {{user_first_name}},</p>
<p>Nous sommes ravis de vous accueillir sur notre plateforme.</p>
```

### 2. Réinitialisation Mot de Passe
```html
<h1>Réinitialisation de votre mot de passe</h1>
<p>Bonjour {{user_name}},</p>
<p>Cliquez sur le lien ci-dessous pour réinitialiser votre mot de passe:</p>
<a href="{{reset_link}}">Réinitialiser mon mot de passe</a>
```

### 3. Notification de Tâche
```html
<h1>Nouvelle tâche assignée</h1>
<p>Bonjour {{user_first_name}},</p>
<p>Une nouvelle tâche vous a été assignée:</p>
<p><strong>{{task_title}}</strong></p>
<p>{{task_description}}</p>
<p>Date d'échéance: {{due_date}}</p>
```

## Bonnes Pratiques

1. **Codes Uniques**: Utilisez des codes descriptifs et en snake_case (ex: `password_reset`, `task_notification`)
2. **Variables**: Toujours tester avec des valeurs réalistes
3. **Version Texte**: Toujours fournir une version texte brut pour la compatibilité
4. **Test**: Tester tous les nouveaux templates avant production
5. **Catégories**: Utilisez des catégories pour organiser (ex: "Authentication", "Notifications", "Reports")
6. **Responsive**: Le HTML doit être responsive pour mobile
7. **Sécurité**: Ne jamais inclure de données sensibles dans les templates

## Dépannage

### Les emails ne sont pas envoyés
- Vérifier la configuration SMTP
- Tester la connexion SMTP
- Vérifier les logs d'erreur dans l'onglet Logs

### Les variables ne sont pas remplacées
- Vérifier la syntaxe: `{{variable}}` (espaces optionnels)
- S'assurer que la variable existe dans la liste
- Vérifier que les variables sont passées lors de l'envoi

### Preview ne fonctionne pas
- Vérifier que le HTML est valide
- S'assurer que les variables de test sont définies

## Support

Pour toute question ou problème, contacter l'équipe technique.
