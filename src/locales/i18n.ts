/**
 * i18n configuration — FR/EN/ES/PT with device language auto-detection.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as Localization from "expo-localization";
import fr from "./fr";
import en from "./en";
import es from "./es";
import pt from "./pt";

const deviceLang = Localization.getLocales()[0]?.languageCode ?? "fr";

function resolveLanguage(code: string): string {
  if (code.startsWith("fr")) return "fr";
  if (code.startsWith("es")) return "es";
  if (code.startsWith("pt")) return "pt";
  if (code.startsWith("en")) return "en";
  return "fr"; // default
}

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    es: { translation: es },
    pt: { translation: pt },
  },
  lng: resolveLanguage(deviceLang),
  fallbackLng: "fr",
  interpolation: {
    escapeValue: false,
  },
});

export const AVAILABLE_LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
];

export default i18n;
