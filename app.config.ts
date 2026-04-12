import { ExpoConfig } from "expo/config";

const IS_PROD = process.env.APP_ENV === "production";
const IS_PREVIEW = process.env.APP_ENV === "staging";

const config: ExpoConfig = {
  name: IS_PROD ? "OpsFlux" : IS_PREVIEW ? "OpsFlux (Preview)" : "OpsFlux (Dev)",
  slug: "opsflux-mobile",
  version: "1.0.0",
  runtimeVersion: {
    policy: "appVersion",
  },
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
      UIBackgroundModes: ["location", "fetch", "remote-notification"],
    },
    config: {
      usesNonExemptEncryption: false,
    },
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
    permissions: [
      "CAMERA",
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "VIBRATE",
      "RECEIVE_BOOT_COMPLETED",
    ],
  },
  plugins: [
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
  ],
  extra: {
    eas: {
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? "",
    },
  },
};

export default config;
