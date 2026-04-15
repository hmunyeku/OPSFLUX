import { ExpoConfig } from "expo/config";

const IS_PROD = process.env.APP_ENV === "production";
const IS_PREVIEW = process.env.APP_ENV === "staging";

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
  scheme: "opsflux",
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
    // FCM config — required for push notifications (even when using the
    // Expo push service, which proxies to FCM under the hood). Without
    // this the `com.google.gms.google-services` Gradle plugin is never
    // applied and the APK ships with an empty resources.arsc (no
    // `google_app_id`, `gcm_defaultSenderId`, etc.), breaking every
    // push delivery on Android.
    //
    // The env-var override lets EAS inject the file from a secret of
    // type "file" (see `eas env:create --name GOOGLE_SERVICES_JSON`).
    // Local dev falls back to the gitignored file sitting alongside
    // app.config.ts.
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
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
  ],
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "62fd6975-31ef-4526-a5cf-c6e82f3f2d09",
    },
  },
};

export default config;
