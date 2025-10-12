# 🏗️ OPSFLUX - ANALYSE FONCTIONNELLE & SÉQUENCES

**Version :** 1.0
**Date :** 08 Octobre 2025
**Objectif :** Documentation complète des processus, séquences et interactions du système

---

## 📋 **TABLE DES MATIÈRES**

1. [Vue d'ensemble du système](#vue-densemble-du-système)
2. [Architecture en couches](#architecture-en-couches)
3. [Séquence de développement](#séquence-de-développement)
4. [Cycle de vie d'un module](#cycle-de-vie-dun-module)
5. [Système de hooks & triggers](#système-de-hooks--triggers)
6. [Système de notifications](#système-de-notifications)
7. [Système d'emails](#système-demails)
8. [Système de permissions (RBAC)](#système-de-permissions-rbac)
9. [Workflow complet : Création d'un incident HSE](#workflow-complet--création-dun-incident-hse)
10. [Diagrammes UML](#diagrammes-uml)

---

## 🎯 **VUE D'ENSEMBLE DU SYSTÈME**

### Philosophie architecturale

OpsFlux est construit selon le principe **"Core-First"** :

1. **CORE = Fondations** : 25 services transversaux réutilisables
2. **MODULES = Métier** : Fonctionnalités spécifiques (HSE, Logistics, etc.)
3. **PLUGINS = Extensions** : Intégrations tierces optionnelles

```
┌─────────────────────────────────────────────────────┐
│                   INTERFACE WEB/MOBILE              │
│            (React + shadcn/ui / React Native)       │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│                   API REST (Django)                 │
│              (Authentification, Routing)            │
└──────────────────┬──────────────────────────────────┘
                   │
      ┌────────────┼────────────┐
      │            │            │
┌─────▼─────┐ ┌───▼────┐ ┌────▼──────┐
│  MODULES  │ │  CORE  │ │  PLUGINS  │
│  MÉTIERS  │ │ SERVICES│ │ (optional)│
└───────────┘ └────────┘ └───────────┘
      │            │            │
      └────────────┼────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│              COUCHE DONNÉES                         │
│  (PostgreSQL + Redis + Celery + File Storage)       │
└─────────────────────────────────────────────────────┘
```

### Flux de données

**1. Requête entrante (Frontend → Backend)**
```
User Action (UI)
    ↓
React Component (onClick, onSubmit)
    ↓
API Call (Axios)
    ↓
Django View (REST Framework)
    ↓
Business Logic (Service Layer)
    ↓
Database Query (ORM)
    ↓
Response (JSON)
    ↓
UI Update (React State)
```

**2. Action asynchrone (Background tasks)**
```
User Action
    ↓
Django View
    ↓
Celery Task (delay())
    ↓
Background Worker
    ↓
Service Layer
    ↓
Database + External APIs
    ↓
Hook Trigger (si configuré)
    ↓
Notifications envoyées
```

---

## 🏛️ **ARCHITECTURE EN COUCHES**

### Couche 1 : Présentation (Frontend)

**Responsabilités :**
- Afficher les données
- Capturer les interactions utilisateur
- Valider les formulaires (première validation)
- Gérer l'état local (Zustand, React Query)
- Optimistic updates (UX rapide)

**Technologies :**
- React 18 + TypeScript
- shadcn/ui + Radix + Tailwind
- React Router v6
- TanStack Query (cache API)
- React Hook Form + Zod

**Ne fait PAS :**
- Logique métier complexe
- Calculs critiques
- Validation finale (le backend re-valide)

---

### Couche 2 : API (Backend)

**Responsabilités :**
- Exposer endpoints REST
- Authentifier/Autoriser requêtes
- Router vers le bon service
- Sérialiser/Désérialiser données
- Retourner erreurs structurées

**Technologies :**
- Django REST Framework
- JWT authentication
- drf-spectacular (OpenAPI)
- Throttling & Rate limiting

**Structure endpoint typique :**
```python
# apps/users/views.py
from rest_framework import viewsets
from .models import User
from .serializers import UserSerializer
from core.permissions import has_permission

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [has_permission('users.manage.all')]

    def create(self, request):
        # 1. Validation serializer
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # 2. Appel service métier
        user = UserService.create_user(
            data=serializer.validated_data,
            created_by=request.user
        )

        # 3. Déclencher hooks si configurés
        HookService.trigger_event('user.created', user)

        # 4. Retour
        return Response(UserSerializer(user).data, status=201)
```

---

### Couche 3 : Services (Business Logic)

**Responsabilités :**
- Implémenter la logique métier
- Orchestrer plusieurs modèles
- Valider règles complexes
- Déclencher événements (hooks)
- Gérer transactions

**Organisation :**
```
backend/
├── core/
│   └── services/
│       ├── notification_service.py    # Service CORE
│       ├── email_service.py           # Service CORE
│       ├── permission_service.py      # Service CORE
│       └── ...
└── apps/
    └── hse/
        └── services/
            └── incident_service.py    # Service MODULE
```

**Exemple service métier :**
```python
# core/services/notification_service.py
class NotificationService:
    @staticmethod
    def send_notification(
        users,
        title,
        message,
        category='system',
        priority=1,
        channels=['in_app']
    ):
        """
        Envoie notification multi-canal

        Séquence:
        1. Valider paramètres
        2. Filtrer users selon préférences
        3. Créer notification en DB
        4. Envoyer via canaux (in_app, email, SMS, push)
        5. Logger action
        """
        # 1. Validation
        if not users:
            raise ValueError("Users list cannot be empty")

        # 2. Filtrer selon préférences user
        filtered_users = NotificationService._filter_by_preferences(
            users, category, priority
        )

        # 3. Créer notification
        notifications = []
        for user in filtered_users:
            notif = Notification.objects.create(
                user=user,
                title=title,
                message=message,
                category=category,
                priority=priority,
                status='pending'
            )
            notifications.append(notif)

        # 4. Envoyer via canaux (asynchrone)
        if 'email' in channels:
            EmailService.send_bulk.delay([n.id for n in notifications])

        if 'sms' in channels:
            SMSService.send_bulk.delay([n.id for n in notifications])

        if 'push' in channels:
            PushService.send_bulk.delay([n.id for n in notifications])

        # 5. Log
        logger.info(f"Sent {len(notifications)} notifications")

        return notifications
```

---

### Couche 4 : Modèles (Data Layer)

**Responsabilités :**
- Définir structure données
- Relations entre entités
- Contraintes base de données
- Méthodes utilitaires simples
- Audit trail automatique

**Tous les modèles héritent de `AbstractBaseModel` :**
```python
# core/models/base.py
class AbstractBaseModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    external_id = models.CharField(max_length=255, unique=True, null=True)

    # Audit trail
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(User, related_name='+', null=True)
    updated_by = models.ForeignKey(User, related_name='+', null=True)

    # Soft delete
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by = models.ForeignKey(User, related_name='+', null=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        # Générer external_id si absent
        if not self.external_id:
            self.external_id = self._generate_external_id()

        super().save(*args, **kwargs)

        # Trigger audit log
        AuditLog.log_change(self, action='created' if self._state.adding else 'updated')
```

---

### Couche 5 : Tâches asynchrones (Celery)

**Responsabilités :**
- Exécuter tâches longues en arrière-plan
- Envoyer emails/SMS
- Générer rapports
- Traiter fichiers volumineux
- Synchroniser données externes
- Nettoyage/maintenance

**Organisation :**
```
backend/
├── core/
│   └── tasks.py           # Tâches CORE
└── apps/
    └── hse/
        └── tasks.py       # Tâches MODULE
```

**Exemple tâche Celery :**
```python
# core/tasks.py
from celery import shared_task
from .services import EmailService

@shared_task(bind=True, max_retries=3)
def send_email_async(self, email_id):
    """
    Envoie email asynchrone avec retry

    Séquence:
    1. Récupérer email depuis DB
    2. Valider statut (pas déjà envoyé)
    3. Préparer contenu (template + variables)
    4. Envoyer via SMTP
    5. Mettre à jour statut
    6. Retry si échec
    """
    try:
        email = EmailQueue.objects.get(id=email_id)

        # Vérifier statut
        if email.status == 'sent':
            logger.warning(f"Email {email_id} already sent")
            return

        # Préparer contenu
        content = EmailService.render_template(
            email.template,
            email.context
        )

        # Envoyer
        EmailService.send_smtp(
            to=email.to_email,
            subject=email.subject,
            html_content=content
        )

        # Mettre à jour
        email.status = 'sent'
        email.sent_at = timezone.now()
        email.save()

        logger.info(f"Email {email_id} sent successfully")

    except Exception as exc:
        # Retry avec exponential backoff
        logger.error(f"Email {email_id} failed: {exc}")
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))
```

---

## 🚀 **SÉQUENCE DE DÉVELOPPEMENT**

### Phase 1 : CORE Services (Priorité 0-1) - 8 semaines

**Objectif :** Créer les fondations réutilisables par tous les modules

**Semaine 1-2 : Authentication & Security**
```
1. JWT Login/Logout
2. 2FA (TOTP + SMS)
3. Session Management
4. Password Policy
5. Password Reset
6. Tests unitaires + intégration
7. Documentation API (Swagger)
```

**Semaine 3-4 : Users, Roles, Permissions, Groups (RBAC)**
```
1. Modèles (User, Role, Permission, Group)
2. Service RoleService (assign, check, cache)
3. Décorateurs (@has_permission, @has_role)
4. API CRUD complète
5. Frontend UI (gestion utilisateurs)
6. Tests
7. Documentation
```

**Semaine 5-6 : Notifications + Translation + Menu**
```
1. NotificationService (multi-canal)
2. Templates notifications
3. Préférences utilisateur
4. TranslationService (i18n)
5. MenuManager (navigation dynamique)
6. Tests
7. Documentation
```

**Semaine 7-8 : Hooks, File Manager, Import/Export**
```
1. HookService (triggers événements)
2. FileManager (upload, storage, scan)
3. ImportExportService (CSV, Excel, JSON)
4. Tests
5. Documentation
```

**Livrable Phase 1 :**
- ✅ 14 services CORE opérationnels
- ✅ API documentée (Swagger)
- ✅ Tests >80% couverture
- ✅ Frontend admin fonctionnel
- ✅ Prêt pour développement modules

---

### Phase 2 : CORE Services (Priorité 2) - 4 semaines

**Semaine 9-10 : Email, Scheduler, Webhooks**
```
1. EmailQueueService (SMTP + templates)
2. SchedulerService (Celery Beat)
3. WebhookManager (envoi/réception)
4. Tests
```

**Semaine 11-12 : Calendar, Audit, API Manager**
```
1. CalendarService (événements, récurrence)
2. AuditTrailService (logs immutables)
3. APIManager (tokens, rate limiting)
4. Tests
```

**Livrable Phase 2 :**
- ✅ 20 services CORE terminés
- ✅ Plateforme robuste et extensible
- ✅ Prêt pour modules métiers complexes

---

### Phase 3 : Premier module métier (HSE Reports) - 3 semaines

**Semaine 13-15 : Module HSE**
```
1. Modèles (Incident, Investigation, Action)
2. Services métiers
3. API REST complète
4. Frontend (formulaires, listes, détails)
5. Workflow approbation (avec hooks)
6. Notifications automatiques
7. Export PDF (rapports)
8. Tests
```

**Livrable Phase 3 :**
- ✅ Module HSE opérationnel
- ✅ Démonstration complète du système
- ✅ Validation architecture CORE + MODULE

---

### Phase 4 : Modules additionnels - Itératif (2-3 semaines/module)

Développer modules suivants dans cet ordre :
1. **Offshore Booking** (réservations vols/navires)
2. **POB Management** (Personnel On Board)
3. **Logistics Tracking** (équipements, cargo)
4. **Permit To Work** (PTW système)
5. **Document Management** (GED)
6. **Asset Management** (équipements)

Chaque module suit le même pattern :
```
Semaine 1:
- Modèles + migrations
- Services métiers
- API REST

Semaine 2:
- Frontend (CRUD complet)
- Intégration CORE services
- Workflows (hooks)

Semaine 3:
- Tests complets
- Documentation
- Déploiement
```

---

## 🔄 **CYCLE DE VIE D'UN MODULE**

### 1. Création d'un module

**Structure dossier module :**
```
backend/apps/hse/
├── __init__.py
├── models.py              # Modèles métier
├── serializers.py         # Sérializers API
├── views.py               # ViewSets REST
├── urls.py                # Routes API
├── services/
│   ├── incident_service.py
│   └── investigation_service.py
├── tasks.py               # Tâches Celery
├── hooks.py               # Hooks configurés
├── permissions.py         # Permissions custom
├── migrations/
├── tests/
└── admin.py
```

**Fichier manifest (module.json) :**
```json
{
  "name": "HSE Reports",
  "code": "hse",
  "version": "1.0.0",
  "description": "Module de gestion des rapports HSE",
  "author": "OpsFlux Team",
  "license": "Proprietary",

  "dependencies": {
    "core_services": [
      "notification",
      "email",
      "file_manager",
      "workflow",
      "audit"
    ],
    "python_packages": [
      "reportlab==4.0.4",
      "pillow==10.0.0"
    ]
  },

  "permissions": [
    {"code": "hse.view.incident", "name": "Voir incidents"},
    {"code": "hse.create.incident", "name": "Créer incident"},
    {"code": "hse.approve.incident", "name": "Approuver incident"}
  ],

  "menu_items": [
    {
      "label": "HSE Reports",
      "icon": "AlertTriangle",
      "route": "/hse/incidents",
      "permission": "hse.view.incident",
      "order": 10
    }
  ],

  "hooks": [
    {
      "event": "incident.created",
      "action": "send_notification",
      "config": {
        "recipients": "role:hse_manager",
        "template": "incident_created"
      }
    },
    {
      "event": "incident.severity.critical",
      "action": "send_email",
      "config": {
        "recipients": "role:admin",
        "template": "critical_incident_alert"
      }
    }
  ],

  "database": {
    "migrations": true,
    "backup_priority": "high"
  }
}
```

---

### 2. Installation d'un module

**Séquence complète :**

```
┌─────────────────────────────────────────────────────┐
│ 1. Upload fichier ZIP module (via UI Admin)        │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 2. Validation module (ModuleManager)               │
│    - Structure fichiers                             │
│    - module.json valide                             │
│    - Pas de code malveillant                        │
│    - Vérification signature (optionnel)             │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 3. Vérification dépendances                        │
│    - Services CORE requis disponibles ?             │
│    - Packages Python installables ?                 │
│    - Conflits avec modules existants ?              │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 4. Installation packages Python                    │
│    pip install -r requirements.txt                  │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 5. Copie fichiers module                           │
│    /tmp/module.zip → backend/apps/hse/              │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 6. Exécution migrations database                   │
│    python manage.py migrate hse                     │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 7. Enregistrement permissions                      │
│    Créer Permission objects dans DB                 │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 8. Enregistrement menu items                       │
│    Créer MenuItem objects dans DB                   │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 9. Enregistrement hooks                            │
│    Créer Hook objects dans DB                       │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 10. Ajout routes API                               │
│     Inclure apps.hse.urls dans urlpatterns         │
│     Reload Django app                               │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 11. Activation module                              │
│     Module.status = 'active'                        │
│     Module.installed_at = now()                     │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ 12. Notification admins                            │
│     "Module HSE Reports installé avec succès"       │
└──────────────────┬──────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────┐
│ ✅ Module opérationnel                              │
│    - API accessible : /api/hse/*                    │
│    - Menu visible (si permissions OK)               │
│    - Hooks actifs                                   │
└─────────────────────────────────────────────────────┘
```

**Code Python (ModuleManager) :**

```python
# core/services/module_service.py
class ModuleManager:
    @staticmethod
    def install_module(zip_file, installed_by):
        """
        Installe un module depuis un fichier ZIP

        Args:
            zip_file: Fichier ZIP upload
            installed_by: User qui installe

        Returns:
            Module instance

        Raises:
            ValidationError: Si validation échoue
        """
        with transaction.atomic():
            # 1. Extract ZIP
            temp_dir = ModuleManager._extract_zip(zip_file)

            # 2. Load manifest
            manifest = ModuleManager._load_manifest(temp_dir)

            # 3. Validate module
            ModuleManager._validate_module(manifest, temp_dir)

            # 4. Check dependencies
            ModuleManager._check_dependencies(manifest)

            # 5. Install Python packages
            ModuleManager._install_packages(manifest['dependencies']['python_packages'])

            # 6. Copy files
            module_path = ModuleManager._copy_files(temp_dir, manifest['code'])

            # 7. Run migrations
            ModuleManager._run_migrations(manifest['code'])

            # 8. Create permissions
            permissions = ModuleManager._create_permissions(manifest['permissions'])

            # 9. Create menu items
            menu_items = ModuleManager._create_menu_items(manifest['menu_items'])

            # 10. Create hooks
            hooks = ModuleManager._create_hooks(manifest['hooks'])

            # 11. Register routes
            ModuleManager._register_routes(manifest['code'])

            # 12. Create Module record
            module = Module.objects.create(
                name=manifest['name'],
                code=manifest['code'],
                version=manifest['version'],
                status='active',
                installed_by=installed_by,
                installed_at=timezone.now(),
                manifest=manifest
            )

            # 13. Notify admins
            NotificationService.send_notification(
                users=User.objects.filter(is_superuser=True),
                title=f"Module {manifest['name']} installé",
                message=f"Le module {manifest['name']} v{manifest['version']} est maintenant actif.",
                category='system'
            )

            return module
```

---

### 3. Utilisation des services CORE par un module

**Exemple : Module HSE utilise NotificationService**

```python
# apps/hse/services/incident_service.py
from core.services import NotificationService, EmailService, HookService

class IncidentService:
    @staticmethod
    def create_incident(data, created_by):
        """
        Crée un incident et déclenche notifications

        Séquence:
        1. Valider données
        2. Créer incident en DB
        3. Déclencher hooks (incident.created)
        4. Notifier managers HSE (via NotificationService)
        5. Si critique, envoyer email urgent (via EmailService)
        6. Logger dans audit trail
        """
        # 1. Validation
        if not data.get('title'):
            raise ValueError("Title is required")

        # 2. Créer incident
        incident = Incident.objects.create(
            title=data['title'],
            description=data['description'],
            severity=data['severity'],
            location=data['location'],
            created_by=created_by,
            status='draft'
        )

        # 3. Déclencher hooks
        HookService.trigger_event('incident.created', {
            'incident_id': incident.id,
            'severity': incident.severity,
            'created_by': created_by.email
        })

        # 4. Notifier managers HSE
        hse_managers = User.objects.filter(
            roles__code='hse_manager'
        )

        NotificationService.send_notification(
            users=hse_managers,
            title=f"Nouvel incident: {incident.title}",
            message=f"Un incident de sévérité {incident.severity} a été créé par {created_by.get_full_name()}.",
            category='incident',
            priority=2 if incident.severity == 'critical' else 1,
            channels=['in_app', 'email']
        )

        # 5. Si critique, email urgent
        if incident.severity == 'critical':
            EmailService.send_email(
                to_emails=[u.email for u in hse_managers],
                subject=f"URGENT: Incident critique #{incident.id}",
                template='critical_incident_alert',
                context={'incident': incident}
            )

        # 6. Log audit
        AuditLog.log_action(
            user=created_by,
            action='create',
            model='Incident',
            object_id=incident.id,
            details={'severity': incident.severity}
        )

        return incident
```

---

## 🎣 **SYSTÈME DE HOOKS & TRIGGERS**

### Architecture Hooks

Les hooks permettent d'exécuter des actions automatiquement lorsqu'un événement se produit.

**Composants :**
1. **Events** : Événements déclenchés par le système
2. **Hooks** : Configurations qui écoutent des events
3. **Actions** : Ce qui est exécuté quand hook matche

```
┌──────────────────────────────────────────────────────┐
│ EVENT DÉCLENCHÉ                                      │
│ (incident.created, user.login, order.paid, etc.)     │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│ HookService.trigger_event('incident.created', ctx)   │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│ RECHERCHE HOOKS ACTIFS pour cet événement            │
│ Hook.objects.filter(event='incident.created',        │
│                     is_active=True)                  │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│ ÉVALUATION CONDITIONS (si configurées)               │
│ Ex: severity == 'critical'                           │
│     location == 'offshore'                           │
└──────────────────┬───────────────────────────────────┘
                   │
            ┌──────┴──────┐
            ▼             ▼
    ┌───────────┐   ┌───────────┐
    │ MATCH ✅  │   │ NO MATCH  │
    └─────┬─────┘   └───────────┘
          │
          ▼
┌──────────────────────────────────────────────────────┐
│ EXÉCUTION ACTIONS                                    │
│ - send_notification                                  │
│ - send_email                                         │
│ - call_webhook                                       │
│ - execute_code                                       │
│ - create_task                                        │
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│ LOGGER EXÉCUTION                                     │
│ HookExecution(hook, success, error_msg, duration)    │
└──────────────────────────────────────────────────────┘
```

### Modèle Hook

```python
# core/models/hooks.py
class Hook(AbstractBaseModel):
    """
    Hook qui écoute un événement et exécute des actions
    """
    name = models.CharField(max_length=255)
    event = models.CharField(max_length=255, db_index=True)
    is_active = models.BooleanField(default=True)

    # Conditions (JSON)
    conditions = models.JSONField(null=True, blank=True)
    # Ex: {"severity": "critical", "location": "offshore"}

    # Actions (JSON)
    actions = models.JSONField()
    # Ex: [
    #   {"type": "send_notification", "config": {...}},
    #   {"type": "send_email", "config": {...}}
    # ]

    # Priorité (ordre exécution)
    priority = models.IntegerField(default=0)

    # Module propriétaire (optionnel)
    module = models.ForeignKey('Module', null=True, on_delete=models.CASCADE)

    class Meta:
        ordering = ['priority', 'created_at']


class HookExecution(AbstractBaseModel):
    """
    Log d'exécution d'un hook
    """
    hook = models.ForeignKey(Hook, on_delete=models.CASCADE)
    event_context = models.JSONField()  # Contexte événement
    success = models.BooleanField()
    error_message = models.TextField(null=True, blank=True)
    duration_ms = models.IntegerField()  # Durée exécution
```

### Service Hook

```python
# core/services/hook_service.py
class HookService:
    @staticmethod
    def trigger_event(event_name, context):
        """
        Déclenche un événement et exécute hooks matchants

        Args:
            event_name: Nom événement (ex: 'incident.created')
            context: Contexte (dict) passé aux actions

        Returns:
            List[HookExecution]
        """
        # Récupérer hooks actifs pour cet événement
        hooks = Hook.objects.filter(
            event=event_name,
            is_active=True
        ).order_by('priority')

        executions = []

        for hook in hooks:
            start_time = time.time()

            try:
                # Vérifier conditions
                if hook.conditions and not HookService._check_conditions(
                    hook.conditions, context
                ):
                    continue

                # Exécuter actions
                for action in hook.actions:
                    HookService._execute_action(action, context)

                # Logger succès
                duration_ms = int((time.time() - start_time) * 1000)
                execution = HookExecution.objects.create(
                    hook=hook,
                    event_context=context,
                    success=True,
                    duration_ms=duration_ms
                )
                executions.append(execution)

            except Exception as e:
                # Logger échec
                duration_ms = int((time.time() - start_time) * 1000)
                execution = HookExecution.objects.create(
                    hook=hook,
                    event_context=context,
                    success=False,
                    error_message=str(e),
                    duration_ms=duration_ms
                )
                executions.append(execution)
                logger.error(f"Hook {hook.id} failed: {e}")

        return executions

    @staticmethod
    def _check_conditions(conditions, context):
        """
        Vérifie si conditions sont satisfaites

        Supporte:
        - Égalité: {"severity": "critical"}
        - Comparaison: {"amount": {">=": 1000}}
        - In: {"status": {"in": ["pending", "approved"]}}
        """
        for key, expected in conditions.items():
            actual = context.get(key)

            # Égalité simple
            if not isinstance(expected, dict):
                if actual != expected:
                    return False

            # Opérateurs
            else:
                if '>=' in expected and actual < expected['>=']:
                    return False
                if '<=' in expected and actual > expected['<=']:
                    return False
                if 'in' in expected and actual not in expected['in']:
                    return False

        return True

    @staticmethod
    def _execute_action(action, context):
        """
        Exécute une action hook
        """
        action_type = action['type']
        config = action['config']

        if action_type == 'send_notification':
            recipients = HookService._resolve_recipients(config['recipients'], context)
            NotificationService.send_notification(
                users=recipients,
                title=config['title'].format(**context),
                message=config['message'].format(**context),
                category=config.get('category', 'system')
            )

        elif action_type == 'send_email':
            recipients = HookService._resolve_recipients(config['recipients'], context)
            EmailService.send_email(
                to_emails=[u.email for u in recipients],
                subject=config['subject'].format(**context),
                template=config['template'],
                context=context
            )

        elif action_type == 'call_webhook':
            WebhookService.send_webhook(
                url=config['url'],
                payload=context,
                headers=config.get('headers', {})
            )

        elif action_type == 'execute_code':
            # Exécuter code Python custom (sandboxed)
            exec_globals = {'context': context, 'services': services}
            exec(config['code'], exec_globals)

        elif action_type == 'create_task':
            # Créer tâche Celery
            task_name = config['task']
            celery_app.send_task(task_name, kwargs=context)
```

### Exemples Hooks configurés

**Hook 1 : Notifier managers si incident critique**
```json
{
  "name": "Alert HSE managers - Critical incident",
  "event": "incident.created",
  "conditions": {
    "severity": "critical"
  },
  "actions": [
    {
      "type": "send_notification",
      "config": {
        "recipients": "role:hse_manager",
        "title": "URGENT: Incident critique #{incident_id}",
        "message": "Un incident critique a été créé: {title}",
        "category": "alert",
        "priority": 3
      }
    },
    {
      "type": "send_email",
      "config": {
        "recipients": "role:admin",
        "subject": "URGENT: Incident critique #{incident_id}",
        "template": "critical_incident_alert"
      }
    }
  ]
}
```

**Hook 2 : Webhook vers système externe**
```json
{
  "name": "Send incident to external QHSE system",
  "event": "incident.submitted",
  "actions": [
    {
      "type": "call_webhook",
      "config": {
        "url": "https://qhse-external.com/api/incidents",
        "headers": {
          "Authorization": "Bearer {EXTERNAL_API_KEY}"
        }
      }
    }
  ]
}
```

**Hook 3 : Créer tâche investigation si incident grave**
```json
{
  "name": "Auto-create investigation for serious incidents",
  "event": "incident.created",
  "conditions": {
    "severity": {"in": ["critical", "major"]}
  },
  "actions": [
    {
      "type": "execute_code",
      "config": {
        "code": "Investigation.objects.create(incident_id=context['incident_id'], assigned_to=context['created_by'])"
      }
    }
  ]
}
```

---

## 🔔 **SYSTÈME DE NOTIFICATIONS**

### Architecture Notifications

```
┌────────────────────────────────────────────────────┐
│ DÉCLENCHEUR                                        │
│ - Action user (create, update, comment)           │
│ - Hook automatique                                 │
│ - Tâche planifiée (reminder)                      │
│ - Événement externe (webhook)                     │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ NotificationService.send_notification()            │
│                                                    │
│ Paramètres:                                        │
│ - users: List[User]                                │
│ - title: str                                       │
│ - message: str                                     │
│ - category: str                                    │
│ - priority: int (0-3)                              │
│ - channels: List[str] ['in_app','email','sms']   │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ FILTRAGE USERS selon préférences                  │
│                                                    │
│ Pour chaque user:                                  │
│ - Vérifier DND mode (22h-8h)                      │
│ - Vérifier priority min (user veut priority >= 2) │
│ - Vérifier canaux actifs (email désactivé?)       │
│ - Vérifier catégories (muted 'system' notifs?)    │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ CRÉATION NOTIFICATION en DB                        │
│                                                    │
│ Notification.objects.create(                       │
│   user=user,                                       │
│   title=title,                                     │
│   message=message,                                 │
│   category=category,                               │
│   priority=priority,                               │
│   read_at=None,                                    │
│   status='pending'                                 │
│ )                                                  │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ ENVOI MULTI-CANAL (asynchrone via Celery)         │
└────────┬──────────┬──────────┬─────────────────────┘
         │          │          │
    ┌────▼────┐ ┌──▼────┐ ┌───▼────┐
    │ IN-APP  │ │ EMAIL │ │  SMS   │
    │         │ │       │ │        │
    │ WebSocket│ │ SMTP  │ │ Twilio │
    │ ou Poll │ │Queue  │ │  API   │
    └─────────┘ └───────┘ └────────┘
         │          │          │
         └──────────┼──────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────┐
│ MISE À JOUR STATUT                                 │
│                                                    │
│ notification.status = 'sent'                       │
│ notification.sent_at = now()                       │
└────────────────────────────────────────────────────┘
```

### Workflow détaillé

**Étape 1 : Création notification in-app**
```python
# 1. Créer en DB
notification = Notification.objects.create(
    user=user,
    title="Nouveau commentaire",
    message="John Doe a commenté votre rapport #142",
    category="comment",
    priority=1,
    data={  # Métadonnées custom
        "report_id": 142,
        "comment_id": 567,
        "commenter": "John Doe"
    }
)

# 2. Envoyer en temps réel (WebSocket ou SSE)
channel_layer = get_channel_layer()
async_to_sync(channel_layer.group_send)(
    f"user_{user.id}",
    {
        "type": "notification.new",
        "notification": NotificationSerializer(notification).data
    }
)

# 3. Update badge counter (Redis)
cache.incr(f"unread_notifications:{user.id}")
```

**Étape 2 : Envoi email (si canal activé)**
```python
# Vérifier préférence user
if 'email' in user.notification_preferences.enabled_channels:
    # Créer email en queue
    email = EmailQueue.objects.create(
        to_email=user.email,
        subject=f"[OpsFlux] {notification.title}",
        template='notification_email',
        context={
            'user': user,
            'notification': notification,
            'action_url': f"{settings.FRONTEND_URL}/notifications/{notification.id}"
        },
        priority='normal',
        status='pending'
    )

    # Envoyer asynchrone (Celery)
    send_email_async.delay(email.id)
```

**Étape 3 : Envoi SMS (si urgent + canal activé)**
```python
if notification.priority >= 3 and 'sms' in user.notification_preferences.enabled_channels:
    # Envoyer via Twilio
    SMSService.send_sms(
        to_phone=user.phone_number,
        message=f"[OpsFlux URGENT] {notification.title[:100]}"
    )
```

**Étape 4 : Push mobile (si app installée)**
```python
if user.mobile_devices.exists():
    for device in user.mobile_devices.all():
        PushNotificationService.send_push(
            device_token=device.fcm_token,
            title=notification.title,
            body=notification.message,
            data={
                "notification_id": str(notification.id),
                "category": notification.category
            }
        )
```

### Préférences utilisateur

**Modèle NotificationPreference :**
```python
class NotificationPreference(AbstractBaseModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE)

    # Canaux actifs
    enabled_channels = models.JSONField(default=list)
    # ['in_app', 'email', 'sms', 'push']

    # Do Not Disturb
    dnd_enabled = models.BooleanField(default=False)
    dnd_start_time = models.TimeField(default=time(22, 0))  # 22:00
    dnd_end_time = models.TimeField(default=time(8, 0))     # 08:00

    # Priority minimum
    min_priority = models.IntegerField(default=0)
    # 0=all, 1=normal+, 2=high+, 3=urgent only

    # Catégories muted
    muted_categories = models.JSONField(default=list)
    # ['system', 'marketing']

    # Digest (résumés groupés)
    digest_enabled = models.BooleanField(default=False)
    digest_frequency = models.CharField(
        max_length=20,
        choices=[('daily', 'Daily'), ('weekly', 'Weekly')],
        default='daily'
    )
```

**Interface UI pour configurer :**
```tsx
// Frontend: NotificationSettings.tsx
<Card>
  <CardHeader>
    <CardTitle>Préférences de notification</CardTitle>
  </CardHeader>
  <CardContent className="space-y-6">
    {/* Canaux */}
    <div>
      <h3 className="font-medium mb-3">Canaux de notification</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Application</Label>
          <Switch checked={channels.includes('in_app')} />
        </div>
        <div className="flex items-center justify-between">
          <Label>Email</Label>
          <Switch checked={channels.includes('email')} />
        </div>
        <div className="flex items-center justify-between">
          <Label>SMS</Label>
          <Switch checked={channels.includes('sms')} />
        </div>
      </div>
    </div>

    {/* DND Mode */}
    <div>
      <h3 className="font-medium mb-3">Ne pas déranger</h3>
      <div className="flex items-center justify-between">
        <Label>Activer (22:00 - 08:00)</Label>
        <Switch checked={dndEnabled} />
      </div>
    </div>

    {/* Priority */}
    <div>
      <h3 className="font-medium mb-3">Priorité minimum</h3>
      <Select value={minPriority}>
        <SelectItem value="0">Toutes</SelectItem>
        <SelectItem value="1">Normales et +</SelectItem>
        <SelectItem value="2">Hautes et +</SelectItem>
        <SelectItem value="3">Urgentes uniquement</SelectItem>
      </Select>
    </div>

    {/* Catégories */}
    <div>
      <h3 className="font-medium mb-3">Catégories désactivées</h3>
      <div className="space-y-2">
        {['system', 'comment', 'mention', 'update'].map(cat => (
          <Checkbox key={cat} label={cat} />
        ))}
      </div>
    </div>
  </CardContent>
</Card>
```

---

## 📧 **SYSTÈME D'EMAILS**

### Architecture Email Queue

```
┌────────────────────────────────────────────────────┐
│ DÉCLENCHEUR                                        │
│ - NotificationService (canal email)                │
│ - PasswordResetService                             │
│ - InvitationService                                │
│ - ReportGenerator (envoi rapport)                  │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ EmailService.send_email()                          │
│                                                    │
│ Paramètres:                                        │
│ - to_emails: List[str]                             │
│ - subject: str                                     │
│ - template: str (nom template)                     │
│ - context: dict (variables template)               │
│ - priority: str ('low','normal','high','urgent')   │
│ - attachments: List[File] (optionnel)              │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ CRÉATION EMAIL EN QUEUE (DB)                       │
│                                                    │
│ EmailQueue.objects.create(                         │
│   to_email=email,                                  │
│   subject=subject,                                 │
│   template=template,                               │
│   context=context,                                 │
│   priority=priority,                               │
│   status='pending',                                │
│   scheduled_at=now() ou date future                │
│ )                                                  │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ DÉCLENCHER TÂCHE CELERY (asynchrone)               │
│                                                    │
│ send_email_async.delay(email_id)                   │
│                                                    │
│ Priority queue:                                    │
│ - urgent: Immédiat                                 │
│ - high: <5 min                                     │
│ - normal: <15 min                                  │
│ - low: <1h                                         │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ WORKER CELERY traite email                         │
│                                                    │
│ 1. Récupérer email depuis DB                       │
│ 2. Vérifier statut (pas déjà envoyé)              │
│ 3. Render template HTML                            │
│ 4. Préparer attachments                            │
│ 5. Envoyer via SMTP                                │
│ 6. Mettre à jour statut                            │
└──────────────────┬─────────────────────────────────┘
                   │
            ┌──────┴──────┐
            ▼             ▼
    ┌───────────┐   ┌───────────┐
    │ SUCCESS ✅│   │ FAILURE ❌│
    └─────┬─────┘   └─────┬─────┘
          │               │
          │               ▼
          │       ┌───────────────┐
          │       │ RETRY (3x max)│
          │       │ Exponential   │
          │       │ backoff       │
          │       └───────┬───────┘
          │               │
          │               ▼
          │       ┌───────────────┐
          │       │ FAILURE FINAL │
          │       │ status='failed│
          │       │ Alert admin   │
          │       └───────────────┘
          │
          ▼
┌────────────────────────────────────────────────────┐
│ UPDATE STATUS                                      │
│                                                    │
│ email.status = 'sent'                              │
│ email.sent_at = now()                              │
│ email.smtp_response = response                     │
└────────────────────────────────────────────────────┘
```

### Templates d'emails

**Structure template :**
```
backend/templates/emails/
├── base.html                    # Template base (header, footer, styles)
├── notification_email.html      # Notification générique
├── password_reset.html          # Reset mot de passe
├── invitation.html              # Invitation utilisateur
├── critical_incident_alert.html # Alerte incident critique
└── weekly_digest.html           # Résumé hebdomadaire
```

**Exemple template (notification_email.html) :**
```html
{% extends "emails/base.html" %}

{% block content %}
<h1 style="color: #3B82F6;">{{ notification.title }}</h1>

<p>Bonjour {{ user.first_name }},</p>

<p>{{ notification.message }}</p>

<div style="margin: 30px 0;">
  <a href="{{ action_url }}" style="
    background-color: #3B82F6;
    color: white;
    padding: 12px 24px;
    text-decoration: none;
    border-radius: 6px;
    display: inline-block;
  ">
    Voir la notification
  </a>
</div>

<p style="color: #64748B; font-size: 14px;">
  Cette notification a été envoyée car vous êtes abonné aux notifications
  de type "{{ notification.category }}".
  <a href="{{ settings_url }}">Gérer vos préférences</a>
</p>
{% endblock %}
```

**Service EmailService :**
```python
# core/services/email_service.py
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from celery import shared_task

class EmailService:
    @staticmethod
    def send_email(
        to_emails,
        subject,
        template,
        context,
        priority='normal',
        attachments=None,
        scheduled_at=None
    ):
        """
        Envoie email(s) via queue asynchrone

        Returns:
            List[EmailQueue]
        """
        emails = []

        for to_email in to_emails:
            email = EmailQueue.objects.create(
                to_email=to_email,
                subject=subject,
                template=template,
                context=context,
                priority=priority,
                status='pending',
                scheduled_at=scheduled_at or timezone.now()
            )

            # Ajouter attachments si fournis
            if attachments:
                for attachment in attachments:
                    EmailAttachment.objects.create(
                        email_queue=email,
                        file=attachment
                    )

            emails.append(email)

            # Déclencher envoi asynchrone
            send_email_async.delay(email.id)

        return emails


@shared_task(bind=True, max_retries=3)
def send_email_async(self, email_id):
    """
    Tâche Celery pour envoyer email
    """
    try:
        email = EmailQueue.objects.get(id=email_id)

        # Vérifier statut
        if email.status == 'sent':
            return

        # Render template HTML
        html_content = render_to_string(
            f'emails/{email.template}.html',
            email.context
        )

        # Préparer email
        msg = EmailMultiAlternatives(
            subject=email.subject,
            body=strip_tags(html_content),  # Fallback texte
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[email.to_email]
        )
        msg.attach_alternative(html_content, "text/html")

        # Ajouter attachments
        for attachment in email.attachments.all():
            msg.attach_file(attachment.file.path)

        # Envoyer
        msg.send()

        # Mettre à jour statut
        email.status = 'sent'
        email.sent_at = timezone.now()
        email.save()

        logger.info(f"Email {email_id} sent successfully")

    except smtplib.SMTPException as exc:
        # Retry avec exponential backoff
        logger.error(f"Email {email_id} failed (SMTP): {exc}")
        email.status = 'failed'
        email.error_message = str(exc)
        email.save()
        raise self.retry(exc=exc, countdown=60 * (2 ** self.request.retries))

    except Exception as exc:
        logger.error(f"Email {email_id} failed: {exc}")
        email.status = 'failed'
        email.error_message = str(exc)
        email.save()
```

---

## 🔐 **SYSTÈME DE PERMISSIONS (RBAC)**

### Architecture RBAC

```
┌────────────────────────────────────────────────────┐
│ USER                                               │
│ - John Doe                                         │
│ - john.doe@company.com                             │
└──────────────────┬─────────────────────────────────┘
                   │
                   │ has many
                   ▼
┌────────────────────────────────────────────────────┐
│ ROLES                                              │
│ - HSE Manager                                      │
│ - Logistics Coordinator                            │
└──────────────────┬─────────────────────────────────┘
                   │
                   │ has many
                   ▼
┌────────────────────────────────────────────────────┐
│ PERMISSIONS                                        │
│ - hse.view.incident                                │
│ - hse.create.incident                              │
│ - hse.approve.incident                             │
│ - logistics.manage.bookings                        │
└────────────────────────────────────────────────────┘
                   │
                   │ applies to
                   ▼
┌────────────────────────────────────────────────────┐
│ RESOURCES                                          │
│ - Incident #142                                    │
│ - Booking #567                                     │
└────────────────────────────────────────────────────┘
```

### Format permissions

```
<app>.<action>.<scope>

Exemples:
- users.view.all          # Voir tous les users
- users.view.own          # Voir uniquement son profil
- users.manage.company    # Gérer users de sa société
- hse.create.incident     # Créer incident
- hse.approve.incident    # Approuver incident
- logistics.view.booking  # Voir réservations
```

### Vérification permissions

**Méthode 1 : Décorateur Python**
```python
from core.decorators import has_permission

@has_permission('hse.approve.incident')
def approve_incident(request, incident_id):
    incident = Incident.objects.get(id=incident_id)
    incident.status = 'approved'
    incident.approved_by = request.user
    incident.save()
    return Response({'status': 'approved'})
```

**Méthode 2 : Dans ViewSet**
```python
from core.permissions import HasPermission

class IncidentViewSet(viewsets.ModelViewSet):
    queryset = Incident.objects.all()
    serializer_class = IncidentSerializer

    def get_permissions(self):
        if self.action == 'create':
            return [HasPermission('hse.create.incident')]
        elif self.action in ['update', 'partial_update']:
            return [HasPermission('hse.edit.incident')]
        elif self.action == 'destroy':
            return [HasPermission('hse.delete.incident')]
        else:
            return [HasPermission('hse.view.incident')]
```

**Méthode 3 : Check programmatique**
```python
from core.services import PermissionService

if PermissionService.user_has_permission(request.user, 'hse.approve.incident'):
    # User peut approuver
    incident.approve()
else:
    raise PermissionDenied("You don't have permission to approve incidents")
```

**Méthode 4 : Frontend (React)**
```tsx
import { usePermissions } from '@/hooks/usePermissions'

function IncidentDetailPage() {
  const { hasPermission } = usePermissions()

  return (
    <div>
      <h1>Incident #142</h1>

      {hasPermission('hse.edit.incident') && (
        <Button onClick={handleEdit}>Modifier</Button>
      )}

      {hasPermission('hse.approve.incident') && (
        <Button onClick={handleApprove}>Approuver</Button>
      )}

      {hasPermission('hse.delete.incident') && (
        <Button variant="destructive" onClick={handleDelete}>
          Supprimer
        </Button>
      )}
    </div>
  )
}
```

### Cache permissions (Performance)

**Problème :** Vérifier permissions en DB à chaque requête = lent

**Solution :** Cache Redis

```python
# core/services/permission_service.py
class PermissionService:
    CACHE_TTL = 3600  # 1 heure

    @staticmethod
    def user_has_permission(user, permission_code):
        """
        Vérifie si user a permission (avec cache)

        Séquence:
        1. Check cache Redis
        2. Si hit, retourner
        3. Si miss, query DB + populate cache
        """
        cache_key = f"permissions:{user.id}"

        # 1. Check cache
        cached_permissions = cache.get(cache_key)
        if cached_permissions is not None:
            return permission_code in cached_permissions

        # 2. Query DB
        user_permissions = set()

        # Permissions directes user
        user_permissions.update(
            user.permissions.values_list('code', flat=True)
        )

        # Permissions via rôles
        for role in user.roles.all():
            user_permissions.update(
                role.permissions.values_list('code', flat=True)
            )

        # Permissions via groupes
        for group in user.groups.all():
            for role in group.roles.all():
                user_permissions.update(
                    role.permissions.values_list('code', flat=True)
                )

        # 3. Populate cache
        cache.set(cache_key, list(user_permissions), PermissionService.CACHE_TTL)

        return permission_code in user_permissions

    @staticmethod
    def invalidate_cache(user):
        """Invalider cache permissions user"""
        cache.delete(f"permissions:{user.id}")
```

---

## 📊 **WORKFLOW COMPLET : CRÉATION D'UN INCIDENT HSE**

Cas d'usage réel qui utilise tous les systèmes CORE.

### Séquence complète (étape par étape)

```
┌────────────────────────────────────────────────────┐
│ 1. USER clique "Créer incident" (Frontend)        │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ 2. VÉRIFICATION PERMISSION                         │
│    hasPermission('hse.create.incident')            │
│    → PermissionService check cache Redis           │
│    → Si pas permission: Afficher erreur            │
│    → Si OK: Afficher formulaire                    │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ 3. USER remplit formulaire                         │
│    - Titre: "Chute personnel offshore"            │
│    - Sévérité: Critical                            │
│    - Localisation: Platform Alpha                  │
│    - Description: ...                              │
│    - Photos: upload 3 images                       │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ 4. VALIDATION FRONTEND (React Hook Form + Zod)    │
│    - Titre min 10 chars                            │
│    - Description requise                           │
│    - Photos max 10MB each                          │
│    → Si erreur: Afficher inline                    │
│    → Si OK: Submit API call                        │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ 5. API CALL (POST /api/hse/incidents/)            │
│    Authorization: Bearer <JWT_TOKEN>               │
│    Body: FormData (JSON + files)                   │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ 6. DJANGO VIEW (IncidentViewSet.create)           │
│    - Authentifier user (JWT)                       │
│    - Vérifier permission (RBAC)                    │
│    - Valider data (Serializer)                     │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ 7. UPLOAD PHOTOS (FileManagerService)             │
│    - Scan antivirus (ClamAV)                       │
│    - Compress images (optimize)                    │
│    - Upload S3 (ou local storage)                  │
│    - Créer Attachment records                      │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ 8. BUSINESS LOGIC (IncidentService.create)        │
│    - Générer incident ID (Sequence)                │
│    - Créer Incident en DB                          │
│    - Associer attachments                          │
│    - Statut initial: 'draft'                       │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ 9. TRIGGER HOOKS (HookService)                    │
│    Event: 'incident.created'                       │
│    Context: {incident_id, severity, created_by}    │
│                                                    │
│    → Hook 1: Notifier HSE Managers                 │
│    → Hook 2: Si critical, email urgent admins      │
│    → Hook 3: Webhook système QHSE externe          │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ 10. NOTIFICATIONS (NotificationService)           │
│     - Récupérer HSE Managers (Role)                │
│     - Filtrer selon préférences                    │
│     - Créer notifications in-app                   │
│     - Envoyer emails (queue Celery)                │
│     - Si critical: Envoyer SMS                     │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ 11. AUDIT LOG (AuditService)                      │
│     - Logger création incident                     │
│     - User: john.doe@company.com                   │
│     - Action: create                               │
│     - Model: Incident                              │
│     - Object ID: incident.id                       │
│     - Details: {severity: 'critical'}              │
│     - IP: 192.168.1.100                            │
│     - Timestamp: 2025-10-08 14:32:15 UTC           │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ 12. RESPONSE API (201 Created)                    │
│     Body: {                                        │
│       "id": "uuid",                                │
│       "title": "Chute personnel offshore",         │
│       "severity": "critical",                      │
│       "status": "draft",                           │
│       "created_at": "2025-10-08T14:32:15Z"         │
│     }                                              │
└──────────────────┬─────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────┐
│ 13. FRONTEND UPDATE (React)                       │
│     - Afficher toast success                       │
│     - Invalider cache TanStack Query               │
│     - Redirect vers /incidents/:id                 │
│     - Afficher détails incident                    │
└────────────────────────────────────────────────────┘


┌────────────────────────────────────────────────────┐
│ 14. BACKGROUND TASKS (Celery Workers)             │
└────────┬──────────┬──────────┬─────────────────────┘
         │          │          │
    ┌────▼────┐ ┌──▼────┐ ┌───▼────┐
    │ Email   │ │ SMS   │ │Webhook │
    │ Queue   │ │ Send  │ │ POST   │
    │ (5 HSE) │ │ (2 ad)│ │external│
    └─────────┘ └───────┘ └────────┘
         │          │          │
         └──────────┼──────────┘
                    │
                    ▼
┌────────────────────────────────────────────────────┐
│ 15. HSE MANAGERS reçoivent notifications          │
│     - Notification in-app (temps réel)             │
│     - Email dans inbox (3 min après)               │
│     - Badge counter UI (+1)                        │
└────────────────────────────────────────────────────┘
```

### Code complet (simplifié)

**Frontend : CreateIncidentForm.tsx**
```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { usePermissions } from '@/hooks/usePermissions'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { incidentApi } from '@/api/incidents'

const incidentSchema = z.object({
  title: z.string().min(10, 'Titre min 10 caractères'),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  location: z.string().min(1, 'Localisation requise'),
  description: z.string().min(20, 'Description min 20 caractères'),
  photos: z.array(z.instanceof(File)).max(5, 'Max 5 photos'),
})

export function CreateIncidentForm() {
  const { hasPermission } = usePermissions()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const form = useForm({
    resolver: zodResolver(incidentSchema),
  })

  const createMutation = useMutation({
    mutationFn: incidentApi.create,
    onSuccess: (data) => {
      toast({ title: 'Incident créé avec succès' })
      queryClient.invalidateQueries(['incidents'])
      router.push(`/incidents/${data.id}`)
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Erreur',
        description: error.message
      })
    },
  })

  // Vérifier permission
  if (!hasPermission('hse.create.incident')) {
    return <Alert>Vous n'avez pas la permission de créer des incidents</Alert>
  }

  const onSubmit = (data) => {
    const formData = new FormData()
    formData.append('title', data.title)
    formData.append('severity', data.severity)
    formData.append('location', data.location)
    formData.append('description', data.description)
    data.photos.forEach(photo => formData.append('photos', photo))

    createMutation.mutate(formData)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Titre *</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="severity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sévérité *</FormLabel>
              <Select onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="low">Faible</SelectItem>
                  <SelectItem value="medium">Moyenne</SelectItem>
                  <SelectItem value="high">Haute</SelectItem>
                  <SelectItem value="critical">Critique</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* ... autres champs ... */}

        <Button type="submit" disabled={createMutation.isLoading}>
          {createMutation.isLoading ? 'Création...' : 'Créer incident'}
        </Button>
      </form>
    </Form>
  )
}
```

**Backend : IncidentService**
```python
# apps/hse/services/incident_service.py
from core.services import (
    FileManagerService,
    NotificationService,
    EmailService,
    HookService,
    AuditService
)

class IncidentService:
    @staticmethod
    def create_incident(data, photos, created_by):
        """
        Crée incident avec workflow complet
        """
        with transaction.atomic():
            # 1. Générer ID unique
            incident_id = SequenceService.get_next('incident')

            # 2. Créer incident
            incident = Incident.objects.create(
                incident_id=incident_id,
                title=data['title'],
                severity=data['severity'],
                location=data['location'],
                description=data['description'],
                status='draft',
                created_by=created_by
            )

            # 3. Upload photos
            if photos:
                for photo in photos:
                    attachment = FileManagerService.upload_file(
                        file=photo,
                        category='incident_photo',
                        uploaded_by=created_by
                    )
                    incident.attachments.add(attachment)

            # 4. Trigger hooks
            HookService.trigger_event('incident.created', {
                'incident_id': str(incident.id),
                'title': incident.title,
                'severity': incident.severity,
                'created_by': created_by.email
            })

            # 5. Notifier HSE Managers
            hse_managers = User.objects.filter(roles__code='hse_manager')
            NotificationService.send_notification(
                users=hse_managers,
                title=f"Nouvel incident: {incident.title}",
                message=f"Incident {incident.incident_id} créé par {created_by.get_full_name()}",
                category='incident',
                priority=3 if incident.severity == 'critical' else 2,
                channels=['in_app', 'email'],
                data={
                    'incident_id': str(incident.id),
                    'action_url': f"/incidents/{incident.id}"
                }
            )

            # 6. Si critique, email urgent admins
            if incident.severity == 'critical':
                admins = User.objects.filter(is_superuser=True)
                EmailService.send_email(
                    to_emails=[u.email for u in admins],
                    subject=f"URGENT: Incident critique #{incident.incident_id}",
                    template='critical_incident_alert',
                    context={'incident': incident},
                    priority='urgent'
                )

            # 7. Audit log
            AuditService.log_action(
                user=created_by,
                action='create',
                model='Incident',
                object_id=incident.id,
                details={
                    'incident_id': incident.incident_id,
                    'severity': incident.severity,
                    'location': incident.location
                }
            )

            return incident
```

---

## 📐 **DIAGRAMMES UML**

### Diagramme de classes (simplifié)

```
┌─────────────────────────────────────────┐
│          AbstractBaseModel              │
│─────────────────────────────────────────│
│ + id: UUID                              │
│ + external_id: str                      │
│ + created_at: datetime                  │
│ + updated_at: datetime                  │
│ + created_by: User                      │
│ + updated_by: User                      │
│ + deleted_at: datetime                  │
│ + deleted_by: User                      │
└──────────────────┬──────────────────────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
┌──────▼─────┐ ┌──▼──────┐ ┌──▼────────┐
│    User    │ │  Role   │ │Permission │
│────────────│ │─────────│ │───────────│
│ email      │ │ name    │ │ code      │
│ first_name │ │ code    │ │ name      │
│ last_name  │ │ desc    │ │ category  │
└──────┬─────┘ └────┬────┘ └─────┬─────┘
       │            │            │
       └────────────┼────────────┘
                    │
              ┌─────▼─────┐
              │UserRole   │
              │(M2M)      │
              └───────────┘

┌─────────────────────────────────────────┐
│              Module                     │
│─────────────────────────────────────────│
│ + name: str                             │
│ + code: str                             │
│ + version: str                          │
│ + status: str                           │
│ + manifest: JSON                        │
│ + installed_at: datetime                │
└──────────────────┬──────────────────────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
┌──────▼─────┐ ┌──▼──────┐ ┌──▼────────┐
│    Hook    │ │MenuItem │ │Permission │
│────────────│ │─────────│ │───────────│
│ event      │ │ label   │ │ code      │
│ conditions │ │ route   │ │ module    │
│ actions    │ │ icon    │ └───────────┘
└────────────┘ └─────────┘

┌─────────────────────────────────────────┐
│          Notification                   │
│─────────────────────────────────────────│
│ + user: User                            │
│ + title: str                            │
│ + message: str                          │
│ + category: str                         │
│ + priority: int                         │
│ + read_at: datetime                     │
│ + status: str                           │
│ + data: JSON                            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│           EmailQueue                    │
│─────────────────────────────────────────│
│ + to_email: str                         │
│ + subject: str                          │
│ + template: str                         │
│ + context: JSON                         │
│ + priority: str                         │
│ + status: str                           │
│ + sent_at: datetime                     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│         Incident (exemple module)       │
│─────────────────────────────────────────│
│ + incident_id: str                      │
│ + title: str                            │
│ + severity: str                         │
│ + location: str                         │
│ + description: text                     │
│ + status: str                           │
│ + assigned_to: User                     │
│ + approved_by: User                     │
└─────────────────────────────────────────┘
```

### Diagramme de séquence : Login avec 2FA

```
User            Frontend        API(Django)      Database      Redis       EmailService
 │                │                │              │             │              │
 │ 1. Enter      │                │              │             │              │
 │ credentials   │                │              │             │              │
 │──────────────>│                │              │             │              │
 │                │ 2. POST        │              │             │              │
 │                │ /auth/login    │              │             │              │
 │                │───────────────>│              │             │              │
 │                │                │ 3. Query     │             │              │
 │                │                │ user by email│             │              │
 │                │                │─────────────>│             │              │
 │                │                │<─────────────│             │              │
 │                │                │ User found   │             │              │
 │                │                │              │             │              │
 │                │                │ 4. Verify    │             │              │
 │                │                │ password     │             │              │
 │                │                │ (bcrypt)     │             │              │
 │                │                │              │             │              │
 │                │                │ 5. Check 2FA │             │              │
 │                │                │ enabled?     │             │              │
 │                │                │──────────────────────────> │              │
 │                │                │<────────────────────────── │              │
 │                │                │ Yes, 2FA enabled           │              │
 │                │                │              │             │              │
 │                │                │ 6. Generate  │             │              │
 │                │                │ session token│             │              │
 │                │                │──────────────────────────> │              │
 │                │                │              │             │              │
 │                │ 7. Return      │              │             │              │
 │                │ {require_2fa}  │              │             │              │
 │                │<───────────────│              │             │              │
 │<───────────────│                │              │             │              │
 │ Show 2FA input│                │              │             │              │
 │                │                │              │             │              │
 │ 8. Enter TOTP │                │              │             │              │
 │ code (123456) │                │              │             │              │
 │──────────────>│                │              │             │              │
 │                │ 9. POST        │              │             │              │
 │                │ /auth/2fa      │              │             │              │
 │                │───────────────>│              │             │              │
 │                │                │ 10. Verify   │             │              │
 │                │                │ TOTP code    │             │              │
 │                │                │ (pyotp)      │             │              │
 │                │                │              │             │              │
 │                │                │ 11. Generate │             │              │
 │                │                │ JWT tokens   │             │              │
 │                │                │              │             │              │
 │                │                │ 12. Create   │             │              │
 │                │                │ UserSession  │             │              │
 │                │                │─────────────>│             │              │
 │                │                │              │             │              │
 │                │                │ 13. Cache    │             │              │
 │                │                │ permissions  │             │              │
 │                │                │──────────────────────────> │              │
 │                │                │              │             │              │
 │                │                │ 14. Send     │             │              │
 │                │                │ login email  │             │              │
 │                │                │──────────────────────────────────────────>│
 │                │                │              │             │              │
 │                │ 15. Return     │              │             │              │
 │                │ {access_token, │              │             │              │
 │                │  refresh_token}│              │             │              │
 │                │<───────────────│              │             │              │
 │<───────────────│                │              │             │              │
 │ Store tokens  │                │              │             │              │
 │ Redirect home │                │              │             │              │
```

---

## 📝 **CONCLUSION**

Ce document décrit l'architecture fonctionnelle complète d'OpsFlux :

**✅ Couverts :**
1. Architecture en couches (Présentation, API, Services, Données, Tasks)
2. Séquence de développement (CORE → Modules)
3. Cycle de vie module (création, installation, utilisation)
4. Système hooks & triggers (événements automatisés)
5. Système notifications (multi-canal, préférences)
6. Système emails (queue, templates, retry)
7. Système permissions RBAC (cache, scopes)
8. Workflow complet incident HSE (exemple réel)
9. Diagrammes UML (classes, séquences)

**🎯 Usage :**
- Comprendre interactions entre composants
- Développer nouveaux modules conformément
- Onboarding nouveaux développeurs
- Documentation architecture pour audits
- Base pour formations utilisateurs

**📚 Documents complémentaires :**
- FUNCTIONAL_REQUIREMENTS.md : Specs fonctionnelles détaillées
- FRONTEND_SPECIFICATIONS.md : Specs UI/UX complètes
- CLAUDE.md : Instructions développement IA
- CORE_SERVICES.md : Détails 25 services CORE

---

**Version :** 1.0
**Dernière mise à jour :** 08 Octobre 2025
**Auteur :** Équipe OpsFlux
