import { ExpoConfig } from "expo/config";
import * as fs from "fs";
import * as path from "path";

const IS_PROD = process.env.APP_ENV === "production";
const IS_PREVIEW = process.env.APP_ENV === "staging";

/**
 * Résout le chemin de `google-services.json` sans casser le build si
 * absent :
 *   1. Si EAS a injecté le fichier via `eas env:create --type file
 *      --name GOOGLE_SERVICES_JSON`, on utilise ce chemin tel quel.
 *   2. Sinon, on cherche un fichier local `./google-services.json`
 *      (gitignored, présent sur la machine du dev).
 *   3. Si aucune des deux options ne donne un fichier existant, on
 *      retourne `undefined` — Expo/Gradle sautent alors l'application
 *      du plugin `com.google.gms.google-services` au lieu de faire
 *      planter le build. Les push notifs ne seront pas actives sur
 *      cet APK, mais tout le reste fonctionne.
 */
function resolveGoogleServicesFile(): string | undefined {
  const candidate =
    process.env.GOOGLE_SERVICES_JSON ??
    path.resolve(__dirname, "google-services.json");
  try {
    return fs.existsSync(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

const googleServicesFile = resolveGoogleServicesFile();

const config: ExpoConfig = {
  name: IS_PROD ? "OpsFlux" : IS_PREVIEW ? "OpsFlux (Preview)" : "OpsFlux (Dev)",
  slug: "opsflux-mobile",
  version: "1.0.0",
  // New Architecture disabled: react-native-maps@1.18 has known crashes
  // with Fabric/TurboModules on SDK 52. Re-enable when 1.20+ ships.
  newArchEnabled: false,
  orientation: "default",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  // Deep link scheme dérivé du profil pour éviter les collisions
  // quand preview et production sont installées côte à côte (QA).
  // Sinon `opsflux://ads/123` ouvrait au hasard l'un ou l'autre.
  scheme: IS_PROD
    ? "opsflux"
    : IS_PREVIEW
    ? "opsflux-preview"
    : "opsflux-dev",
  splash: {
    image: "./assets/splash.png",
    backgroundColor: "#1e3a5f",
    resizeMode: "contain",
  },
  assetBundlePatterns: ["**/*"],
  ios: {
    supportsTablet: true,
    bundleIdentifier: IS_PROD
      ? "com.opsflux.mobile"
      : IS_PREVIEW
      ? "com.opsflux.mobile.preview"
      : "com.opsflux.mobile.dev",
    infoPlist: {
      NSCameraUsageDescription:
        "OpsFlux a besoin de la caméra pour scanner les QR codes des ADS et colis.",
      NSLocationWhenInUseUsageDescription:
        "OpsFlux utilise votre position pour le suivi en temps réel des voyages.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "OpsFlux utilise votre position en arrière-plan pour le suivi des voyages.",
      NSFaceIDUsageDescription:
        "Utilisez Face ID pour déverrouiller rapidement OpsFlux.",
      UIBackgroundModes: ["location", "fetch", "remote-notification"],
      // ATS explicit: HTTPS only, no arbitrary loads
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSExceptionDomains: {},
      },
    },
    config: {
      usesNonExemptEncryption: false,
    },
  },
  web: {
    bundler: "metro",
    favicon: "./assets/icon.png",
    output: "single",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#1e3a5f",
    },
    package: IS_PROD
      ? "com.opsflux.mobile"
      : IS_PREVIEW
      ? "com.opsflux.mobile.preview"
      : "com.opsflux.mobile.dev",
    // Sécurité : désactive adb backup. Par défaut Android autorise
    // `adb backup` qui dump tout le /data/data/<pkg> — y compris
    // SecureStore chez certains OEM qui n'honorent pas le flag
    // `no_backup` du keystore. En le mettant à false on bloque
    // l'export des tokens JWT sans avoir à compter sur l'exclusion
    // côté SecureStore.
    allowBackup: false,
    // FCM config — requis pour les push notifications Android (même
    // via Expo push service qui proxy vers FCM). Le fichier vient
    // soit du secret EAS `GOOGLE_SERVICES_JSON` (type=file), soit du
    // fichier local gitignored à côté de app.config.ts. S'il est
    // absent des deux sources, on ne déclare rien — le build passe,
    // les push sont simplement désactivés sur cet APK.
    //
    // Voir resolveGoogleServicesFile() en tête de fichier.
    ...(googleServicesFile ? { googleServicesFile } : {}),
    permissions: [
      "CAMERA",
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "VIBRATE",
      "RECEIVE_BOOT_COMPLETED",
      "USE_BIOMETRIC",
      "USE_FINGERPRINT",
    ],
    // Permissions héritées transitivement qu'on ne veut pas shipper :
    // SYSTEM_ALERT_WINDOW n'est utilisée par aucune de nos libs
    // release — seul le manifest debug de React Native la déclare
    // pour le menu dev overlay. Play Console refuse les apps qui
    // demandent cette permission sans justification explicite.
    blockedPermissions: ["android.permission.SYSTEM_ALERT_WINDOW"],
  },
  plugins: [
    [
      "expo-build-properties",
      {
        android: {
          newArchEnabled: false,
          minSdkVersion: 24,
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          // HTTPS only — no HTTP clear-text traffic allowed.
          usesCleartextTraffic: false,
        },
        ios: {
          newArchEnabled: false,
          deploymentTarget: "15.1",
        },
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission:
          "OpsFlux a besoin de la caméra pour scanner les QR codes des ADS et colis.",
      },
    ],
    [
      "expo-location",
      {
        locationAlwaysAndWhenInUsePermission:
          "OpsFlux utilise votre position pour le suivi en temps réel des voyages.",
        locationWhenInUsePermission:
          "OpsFlux utilise votre position pour le suivi en temps réel.",
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    "expo-notifications",
    "expo-secure-store",
    "expo-local-authentication",
    // Injecte res/xml/network_security_config.xml + la référence
    // `android:networkSecurityConfig` dans AndroidManifest. Exige
    // pinning SPKI SHA-256 sur api.opsflux.io + app.opsflux.io et
    // interdit le cleartext (défense en profondeur avec
    // usesCleartextTraffic: false plus haut).
    "./plugins/withNetworkSecurityConfig",
    // Scope READ/WRITE_EXTERNAL_STORAGE à android:maxSdkVersion=32
    // pour éviter les warnings Play Console sur API 33+ où ces
    // permissions sont obsolètes (scoped storage / Photo Picker).
    "./plugins/withPermissionHardening",
    // Limite les ABIs natifs à arm64-v8a + armeabi-v7a (supprime
    // x86/x86_64 émulateurs). ~50% de taille APK en moins.
    "./plugins/withAbiFilters",
  ],
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "62fd6975-31ef-4526-a5cf-c6e82f3f2d09",
    },
  },
};

export default config;
