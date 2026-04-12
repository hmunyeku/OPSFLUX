import { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "OpsFlux Mobile",
  slug: "opsflux-mobile",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  scheme: "opsflux",
  splash: {
    backgroundColor: "#1e3a5f",
    resizeMode: "contain",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.opsflux.mobile",
    infoPlist: {
      NSCameraUsageDescription:
        "OpsFlux a besoin de la caméra pour scanner les QR codes des ADS et colis.",
      NSLocationWhenInUseUsageDescription:
        "OpsFlux utilise votre position pour le suivi en temps réel des voyages.",
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "OpsFlux utilise votre position en arrière-plan pour le suivi des voyages.",
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: "#1e3a5f",
    },
    package: "com.opsflux.mobile",
    permissions: ["CAMERA", "ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"],
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
      },
    ],
  ],
};

export default config;
