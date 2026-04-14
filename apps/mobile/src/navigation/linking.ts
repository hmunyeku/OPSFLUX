/**
 * Deep linking configuration — maps URLs to screens.
 *
 * Supports:
 *  - opsflux://ads/:id          → ADS detail
 *  - opsflux://cargo/:code      → Cargo tracking
 *  - opsflux://scan/ads         → ADS scanner
 *  - opsflux://scan/cargo       → Cargo scanner
 *  - opsflux://voyage/:id       → Voyage detail
 *  - opsflux://form/:formId     → Dynamic form
 *  - opsflux://captain          → Captain portal
 *  - opsflux://pickup           → Driver pickup
 *  - opsflux://tracking         → Live tracking
 *
 * Also supports universal links via https://app.opsflux.io/...
 */

import { LinkingOptions } from "@react-navigation/native";

export const linking: LinkingOptions<any> = {
  prefixes: ["opsflux://", "https://app.opsflux.io"],

  config: {
    screens: {
      Main: {
        screens: {
          Home: {
            screens: {
              PortalHome: "",
              AdsDetail: "ads/:adsId",
              CargoDetail: "cargo/:trackingCode",
              DynamicForm: "form/:formId",
              AdsList: "ads",
              CargoList: "cargo",
              Search: "search",
              CaptainAuth: "captain",
              DriverPickup: "pickup",
              VoyageDetail: "voyage/:voyageId",
            },
          },
          Scanner: {
            screens: {
              ScanAdsMain: "scan/ads",
              ScanCargoMain: "scan/cargo",
            },
          },
          Tracking: {
            screens: {
              LiveTrackingMain: "tracking",
            },
          },
          Notifications: {
            screens: {
              NotificationsMain: "notifications",
            },
          },
        },
      },
      Login: "login",
    },
  },
};
