# OpsFlux Mobile

Application mobile React Native (Expo) pour les opérations terrain OpsFlux.

## Architecture

```
┌─────────────────────────┐
│   Backend (FastAPI)      │
│                         │
│  GET /api/v1/mobile/    │
│    bootstrap ──────────── 1 appel = user + permissions + forms + portals
│    form-definitions      │
│    portal-config         │
│    sync-manifest         │
│                         │
│  form_engine.py ─────── Auto-génère les forms depuis Pydantic
│  form_definitions.py ── Enrichissements UI (labels, lookups, steps)
└───────────┬─────────────┘
            │ JSON
┌───────────▼─────────────┐
│   Mobile App             │
│                         │
│  DynamicForm ──────────── Interprète le JSON → formulaire natif
│  15 field types          │
│  6 portails par rôle     │
│  Offline-first           │
│  GPS tracking            │
└─────────────────────────┘
```

**Principe clé** : L'app mobile est un **core dynamique** (inspiré d'Epicollect5). Les formulaires sont décrits par le serveur en JSON et rendus dynamiquement. Aucune mise à jour de l'app n'est nécessaire quand un formulaire change.

## Fonctionnalités

### Portails par rôle
| Portail | Rôle | Fonctions |
|---------|------|-----------|
| **Capitaine** | travelwiz.boarding.manage | Manifeste pax+cargo, journal de bord, scan ADS |
| **Chauffeur** | travelwiz.boarding.manage | Mode ramassage Yango-style, itinéraire GPS, marquage pax |
| **Logisticien** | packlog.cargo.read | Scanner colis, expéditions, réceptions |
| **Resp. Site** | paxlog.ads.approve | Validation ADS, conformité, POB |
| **Demandeur** | tout utilisateur | Créer ADS/expédition/mission, suivi |

### 15 types de champs dynamiques
`text` `textarea` `number` `select` `multi_select` `date` `toggle` `lookup` `photo` `barcode` `signature` `location` `repeater` `tags` `group`

### Autres features
- **Auth** : JWT + MFA + SecureStore persistence
- **Offline-first** : Cache lecture 30min + queue mutations + auto-sync
- **GPS Tracking** : Balise foreground + background (type Traccar)
- **Carte Flotte** : react-native-maps, markers AIS/GPS/manual
- **Notifications** : WebSocket in-app + Push natifs
- **Recherche** : Globale multi-type (ADS, colis, missions, voyages)
- **i18n** : FR/EN, détection auto de la langue
- **Dark Mode** : System/Light/Dark
- **Responsive** : Phone + Tablette

## Setup

### Prérequis
- Node.js 22+
- Expo CLI : `npm install -g expo-cli`
- EAS CLI : `npm install -g eas-cli`
- iOS : Xcode 15+ (pour simulateur)
- Android : Android Studio (pour émulateur)

### Installation
```bash
cd apps/mobile
npm install
```

### Configuration
```bash
cp .env.example .env
# Renseigner EXPO_PUBLIC_API_URL avec l'URL de votre serveur OpsFlux
```

### Lancement
```bash
# Dev avec Expo Go
npm start

# iOS simulateur
npm run ios

# Android émulateur
npm run android
```

### Tests
```bash
npm test                # Run tests
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
npm run typecheck       # TypeScript check
npm run lint            # ESLint
```

## Build & Déploiement

### EAS Build (recommandé)
```bash
# Preview (distribution interne, TestFlight / APK)
eas build --profile preview --platform all

# Production
eas build --profile production --platform all

# Submit aux stores
eas submit --platform ios
eas submit --platform android
```

### Configuration EAS
1. Créer un compte sur [expo.dev](https://expo.dev)
2. `eas login`
3. `eas build:configure`
4. Remplir `eas.json` avec vos identifiants Apple/Google

## Structure du projet

```
apps/mobile/
├── App.tsx                          # Entry point
├── app.config.ts                    # Expo config (dev/preview/prod)
├── eas.json                         # EAS Build profiles
├── jest.config.js                   # Test config
├── __tests__/                       # Tests unitaires
├── assets/                          # Icons, splash
├── src/
│   ├── components/
│   │   ├── DynamicForm.tsx          # Moteur de formulaires
│   │   ├── FleetMap.tsx             # Carte flotte temps réel
│   │   ├── QrScanner.tsx            # Scanner QR/barcode
│   │   ├── ErrorBoundary.tsx        # Crash handler
│   │   ├── EmptyState.tsx           # État vide
│   │   ├── DashboardCard.tsx        # Card stat avec API live
│   │   ├── StatusBadge.tsx          # Badge de statut
│   │   └── fields/                  # 15 composants de champ
│   ├── hooks/
│   │   ├── useFormEngine.ts         # State machine formulaire
│   │   ├── useBootstrap.ts          # Init en 1 appel API
│   │   ├── useFormRegistry.ts       # Cache form definitions
│   │   └── useResponsive.ts         # Phone/tablet adaptation
│   ├── navigation/
│   │   └── AppNavigator.tsx         # 5 tabs + stacks + permission gate
│   ├── screens/                     # 15 écrans
│   ├── services/                    # 15 services
│   ├── stores/                      # 3 stores Zustand
│   ├── locales/                     # FR + EN (200+ clés)
│   ├── types/                       # TypeScript types
│   └── utils/                       # Colors, dark theme
└── backend/                         # Backend form engine (référence)
```

## Ajouter un nouveau formulaire

**Côté serveur uniquement** — aucune modification de l'app mobile :

```python
# Dans app/services/mobile/form_definitions.py

def get_my_new_form():
    return generate_form_definition(
        MyPydanticSchema,           # Source de vérité
        form_id="my_form",
        title="Mon formulaire",
        submit_endpoint="/api/v1/my-endpoint",
        steps=[...],                # Étapes du wizard
        enrichments={               # Labels FR, lookups, conditions
            "field_name": {
                "label": "Libellé en français",
                "type": "lookup",
                "lookup_source": { ... },
                "visible_when": { "field": "other", "op": "eq", "value": "x" },
            },
        },
    )
```

Le form engine lit automatiquement les types, validations et contraintes depuis le schéma Pydantic. Les enrichissements ajoutent l'UI (labels, lookups, conditions, steps).

## Ajouter un nouveau portail

```python
build_portal_config(
    portal_id="my_portal",
    title="Mon Portail",
    permissions=["module.permission.required"],
    actions=[
        {"id": "action1", "type": "form", "title": "...", "form_id": "my_form"},
        {"id": "action2", "type": "scan", "title": "...", "screen": "ScanAds"},
        {"id": "action3", "type": "list", "title": "...", "screen": "CargoList"},
    ],
)
```

## Licence

Propriétaire — OpsFlux.
