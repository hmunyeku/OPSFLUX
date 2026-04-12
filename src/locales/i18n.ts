/**
 * i18n configuration — French/English with device language auto-detection.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import fr from "./fr";
import en from "./en";

const deviceLang = Localization.getLocales()[0]?.languageCode ?? "fr";

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: deviceLang.startsWith("fr") ? "fr" : "en",
  fallbackLng: "fr",
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
