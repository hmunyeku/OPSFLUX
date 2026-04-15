/**
 * Expo config plugin — durcit les permissions Android.
 *
 * expo-image-picker et expo-file-system déclarent WRITE/READ
 * EXTERNAL_STORAGE dans leur manifest. Ces permissions sont ignorées
 * à partir d'Android 13 (API 33) — Google remplace ça par des Photo
 * Picker et scoped storage — mais leur simple présence dans le
 * manifest déclenche des warnings Play Console ("your app requests
 * permissions no longer needed on new versions of Android").
 *
 * Ce plugin scope les deux permissions à `android:maxSdkVersion="32"`
 * pour qu'elles soient honorées sur Android 6-12 (où l'app en a
 * toujours besoin) mais que Play Console voit bien qu'on ne les
 * demande pas sur les versions récentes.
 *
 * Note : SYSTEM_ALERT_WINDOW est traité via
 * `android.blockedPermissions` dans app.config.ts — Expo supporte
 * ça nativement.
 */

const { withAndroidManifest } = require("@expo/config-plugins");

const LEGACY_STORAGE_PERMS = [
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
];

module.exports = function withPermissionHardening(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const perms = manifest["uses-permission"] ?? [];
    for (const perm of perms) {
      const name = perm.$?.["android:name"];
      if (LEGACY_STORAGE_PERMS.includes(name)) {
        perm.$["android:maxSdkVersion"] = "32";
      }
    }
    return cfg;
  });
};
