/**
 * Expo config plugin — limite les ABIs natifs aux plateformes réelles.
 *
 * Par défaut Expo/RN compile les libs natives pour 4 ABIs :
 *   arm64-v8a, armeabi-v7a, x86, x86_64
 *
 * x86 et x86_64 ne servent qu'aux émulateurs. Aucun téléphone réel en
 * 2025 ne tourne sur ces architectures. Les garder double la taille
 * des .so embarqués dans l'APK (~25MB → ~50MB).
 *
 * Ce plugin ajoute un bloc `ndk { abiFilters ... }` dans
 * android/app/build.gradle (section defaultConfig) qui ne retient que
 * les ABIs ARM réels.
 *
 * Effet :
 *  - APK preview : ~50MB → ~25MB
 *  - AAB prod : taille réduite aussi (l'AAB ne contient plus les .so
 *    x86), et Google Play Store continue de servir le bon .so par
 *    device via le split automatique du bundle.
 */

const { withAppBuildGradle } = require("@expo/config-plugins");

const ALLOWED_ABIS = ["arm64-v8a", "armeabi-v7a"];

module.exports = function withAbiFilters(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    // Idempotent — ne ré-injecte pas si déjà présent.
    if (contents.includes("abiFilters")) {
      return cfg;
    }

    const abiList = ALLOWED_ABIS.map((a) => `'${a}'`).join(", ");
    const ndkBlock = `
        ndk {
            // Limité aux ABIs ARM réels — voir plugins/withAbiFilters.js
            abiFilters ${abiList}
        }`;

    // Injecte dans defaultConfig { ... }
    const match = contents.match(/defaultConfig\s*\{/);
    if (!match) {
      throw new Error(
        "[withAbiFilters] defaultConfig block not found in app/build.gradle"
      );
    }
    const insertPos = match.index + match[0].length;
    cfg.modResults.contents =
      contents.slice(0, insertPos) + ndkBlock + contents.slice(insertPos);

    return cfg;
  });
};
