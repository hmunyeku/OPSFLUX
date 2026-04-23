# Build Android & iOS — OpsFlux Mobile

Cet app Expo SDK 52 est produit via EAS Build (cloud) ou build local.

## Prérequis communs

```bash
cd apps/mobile
npm install                       # installe les deps
npm install -g eas-cli            # si pas déjà fait
eas login                         # compte Expo avec accès au projet
```

## Android — APK preview ou AAB production

### Build cloud EAS (recommandé, zéro config locale)

```bash
# Preview APK — distribution interne (.apk à installer hors Play Store)
eas build --platform android --profile preview

# Production AAB — pour Play Store
eas build --platform android --profile production
```

Le keystore de prod est configuré — voir `KEYSTORE.md`. EAS stocke le
keystore de façon persistante ; jamais générer un nouveau keystore
sans lire ce doc.

### Build local (nécessite Android SDK + JDK 17)

```bash
eas build --platform android --profile preview --local
```

Le binaire sort dans le dossier courant : `build-<timestamp>.apk`.

## iOS — IPA ad-hoc ou App Store

### Build cloud EAS (recommandé — nécessite compte Apple Developer)

```bash
# Preview IPA — device enregistré dans le team Apple
eas build --platform ios --profile preview

# Production — App Store
eas build --platform ios --profile production
```

Nécessite :
- Compte Apple Developer ($99/an)
- Certificats de signature (EAS peut les créer automatiquement)
- Provisioning profile lié aux devices de test

### Build local iOS

**Non supporté depuis Windows / Linux** — le build iOS nécessite Xcode
donc macOS. Utiliser EAS cloud depuis une autre plateforme.

## Publication Play Store / App Store

Voir `KEYSTORE.md` pour les signatures Android.

Pour une première publication :

```bash
# Android — upload sur Play Console
eas submit --platform android --profile production

# iOS — upload sur App Store Connect
eas submit --platform ios --profile production
```

## OTA Updates (sans rebuild)

Pour pousser du JS/assets sans passer par les stores :

```bash
eas update --channel preview --message "Fix tiers list bug"
eas update --channel production --message "Feature X"
```

Les updates ne passent pas si :
- Changement natif (nouveau plugin, config Android/iOS, permissions)
- Upgrade runtimeVersion

## État actuel du code

- **SDK Expo 52** (récent)
- **New Architecture désactivée** intentionnellement (`react-native-maps@1.18` crash avec Fabric)
- **35 screens**, **23 628 lignes** de code source
- **Offline-first** : queue upload, sync manifest, lookup cache
- Tous les tests Jest passent au dernier commit connu

## Commandes de vérification avant build

```bash
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm test           # jest
```

Si tsc local pète faute de `node_modules`, un simple `npm install`
préalable suffit.
