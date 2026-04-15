# Android Release Keystore — OpsFlux Mobile

## Pourquoi

Jusqu'au commit `5152069` l'app utilisait le keystore auto-généré par
EAS au premier build preview, avec un Distinguished Name (DN) vide
(`CN=, O=, L=, ...`). Ce n'est **pas acceptable pour la publication
Play Store** — Google identifie chaque app par l'empreinte SHA-256 de
sa clé de signature et cette clé ne peut **jamais être changée** après
la première publication sous peine d'être traité comme une app
différente.

Ce doc trace la génération du vrai keystore de prod.

## Identité de la clé

```
CN=OpsFlux
O=OpsFlux
OU=Mobile
L=Paris
ST=Île-de-France
C=FR

Algorithm : RSA 4096
Validity  : 10000 days (≈ 27 ans — > durée de vie Play Store)
Alias     : opsflux
Store type: PKCS12
```

## Génération (à faire une seule fois)

```bash
cd apps/mobile

keytool -genkeypair -v \
  -keystore opsflux-release.keystore \
  -alias opsflux \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -storetype PKCS12 \
  -dname "CN=OpsFlux, O=OpsFlux, OU=Mobile, L=Paris, ST=Île-de-France, C=FR"
```

Le binaire `keytool` est fourni avec le JDK (OpenJDK 11+ ou 17
conviennent). Sur Windows il est dans `%JAVA_HOME%\bin`.

## Upload vers EAS

```bash
eas credentials
```

Menu : Android → `Keystore: Manage everything needed to build your
project` → `Upload a new keystore` → pointer `opsflux-release.keystore` →
saisir les mots de passe.

EAS s'en servira automatiquement pour les builds `preview` ET
`production`. Toutes les APK/AAB générés seront signés avec cette
clé.

## Stockage

- **Fichier** `opsflux-release.keystore` : **JAMAIS** commité dans git
  (cf `.gitignore`). À conserver dans un coffre-fort d'équipe
  (1Password / Bitwarden / coffre Hostinger) avec les deux mots de
  passe.
- **Backups** : EAS en héberge une copie dans son coffre à lui,
  récupérable via `eas credentials` → `Download`. Mais un backup
  offline reste une bonne pratique (si compte EAS perdu → app
  plus jamais republiable sur ce package name).

## Empreintes à noter

Après génération, note les empreintes :

```bash
keytool -list -v \
  -keystore opsflux-release.keystore \
  -alias opsflux
```

Récupère :
- `SHA-1` : à fournir à Firebase Console (auth Google Sign-In si utilisé)
- `SHA-256` : à fournir à Google Play App Signing + éventuel FCM

## Checklist post-setup

- [ ] keystore généré avec le DN ci-dessus
- [ ] fichier stocké dans le coffre-fort d'équipe
- [ ] keystore uploadé sur EAS (`eas credentials`)
- [ ] SHA-1 + SHA-256 notés
- [ ] SHA-256 ajouté au projet Firebase (Settings → Your apps → Add fingerprint)
- [ ] build de contrôle : `eas build -p android --profile production`
- [ ] vérifier le fingerprint du build :
      `keytool -printcert -jarfile path/to/app.aab`
      → doit matcher le SHA-256 du keystore
