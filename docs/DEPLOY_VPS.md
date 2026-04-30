# Déployer OpsFlux sur un VPS — guide complet

Guide pas-à-pas pour mettre OpsFlux en production sur un VPS générique
(Hostinger, OVH, Hetzner, DigitalOcean, AWS Lightsail, Scaleway, …)
avec **Docker Compose + Traefik**.

Trois chemins selon ton préféré :

- **Vanilla Docker Compose** (le plus de contrôle, le plus simple à
  comprendre) — c'est le chemin principal de ce guide, §3 à §13.
- **Avec un control plane** (Dokploy, Coolify, EasyPanel, Caprover,
  Portainer, …) — §14 montre comment mapper le compose sur chaque
  plateforme. Le compose lui-même est identique.
- **PaaS géré** (Render, Railway, Fly.io, …) — pas couvert ici car
  chacun a ses spécificités ; suivre leur doc native pour ingérer
  un compose.

> **Pré-requis lecteur** : familiarité Linux, DNS, Docker, Let's Encrypt.

Pour une vue d'ensemble de l'architecture, voir [`STACK.md`](STACK.md).

---

## Table des matières

1. [Pré-requis VPS](#1-pré-requis-vps)
2. [DNS — enregistrements à créer](#2-dns--enregistrements-à-créer)
3. [Préparer le serveur](#3-préparer-le-serveur)
4. [Installer Docker + Compose](#4-installer-docker--compose)
5. [Cloner le repo](#5-cloner-le-repo)
6. [Configurer `.env`](#6-configurer-env)
7. [Mettre en place Traefik](#7-mettre-en-place-traefik)
8. [Premier boot — build + migrations + seed](#8-premier-boot--build--migrations--seed)
9. [Vérification post-déploiement](#9-vérification-post-déploiement)
10. [Connexion initiale + sécurisation](#10-connexion-initiale--sécurisation)
11. [Sauvegardes](#11-sauvegardes)
12. [Mises à jour](#12-mises-à-jour)
13. [Recovery — situations classiques](#13-recovery--situations-classiques)
14. [Déployer avec un control plane (Dokploy / Coolify / EasyPanel / Caprover / Portainer / …)](#14-déployer-avec-un-control-plane-dokploy--coolify--easypanel--caprover--portainer--)
15. [Annexes](#15-annexes)

---

## 1. Pré-requis VPS

### Dimensionnement minimal

| Profil          | RAM   | vCPU | Disque | Notes |
|-----------------|-------|------|--------|-------|
| **Demo / staging** | 4 Go  | 2    | 40 Go  | DB + 1 worker uvicorn |
| **Prod < 50 users** | 8 Go  | 4    | 80 Go  | 4 workers, sauvegardes locales |
| **Prod 50-500 users** | 16 Go | 6    | 160 Go | + agent-worker, S3 storage externe recommandé |

### OS

- **Ubuntu 24.04 LTS** ou **Debian 12** — ce guide utilise Ubuntu.
- Architecture `x86_64` (les images Docker `pgvector/pgvector:pg16` et
  `jgraph/drawio:29.6.7` ne sont **pas testées** sur ARM64).

### Comptes & accès

- Accès root SSH (ou utilisateur `sudo`)
- Un nom de domaine que vous contrôlez (les enregistrements DNS sont
  pointés sur l'IPv4 du VPS)
- Ports `80` et `443` ouverts sur le firewall (`ufw allow 80,443/tcp`)
- Un compte SMTP transactionnel (Mailu auto-hébergé, SendGrid, OVH,
  Postmark, …) pour l'envoi des notifications

---

## 2. DNS — enregistrements à créer

Remplacez `opsflux.io` par votre domaine. **Tous** ces enregistrements
sont nécessaires pour que les certificats Let's Encrypt s'émettent.

| Type | Hôte                | Valeur          | Service couvert |
|------|---------------------|-----------------|-----------------|
| A    | `app.opsflux.io`    | `<IP du VPS>`   | Frontend SPA |
| A    | `api.opsflux.io`    | `<IP du VPS>`   | Backend FastAPI |
| A    | `mcp.opsflux.io`    | `<IP du VPS>`   | MCP Gateway (alias backend) |
| A    | `ext.opsflux.io`    | `<IP du VPS>`   | Portail externe paxlog |
| A    | `drawio.opsflux.io` | `<IP du VPS>`   | Éditeur Draw.io |
| A    | `db.opsflux.io`     | `<IP du VPS>`   | pgAdmin (réservé superadmin) |
| A    | `www.opsflux.io`    | `<IP du VPS>`   | Site marketing (vitrine) |
| A    | `opsflux.io` (apex) | `<IP du VPS>`   | Redirige → www. |

> **TTL conseillé** : 300 (5 min) pendant la mise en place, puis 3600.

> **CAA recommandé** (optionnel, durcissement) :
> `0 issue "letsencrypt.org"` — empêche n'importe quelle autre CA
> d'émettre un certificat pour votre domaine.

Vérifier que tout est propagé avant de continuer :
```bash
for sub in app api mcp ext drawio db www; do
  echo -n "$sub.opsflux.io → "
  dig +short A "$sub.opsflux.io" | head -1
done
dig +short A opsflux.io
```

Toutes les lignes doivent retourner l'IP du VPS.

### 2.1 — Tester sans acheter de domaine (sslip.io / nip.io)

Pour une instance de **test ou démo**, vous pouvez sauter l'étape DNS
en utilisant un service "magic DNS" qui résout n'importe quel
sous-domaine vers une IP encodée dans le nom :

```
DOMAIN=72-60-188-156.sslip.io     # remplace par <IP-de-ton-VPS> avec - au lieu de .
```

Toutes les routes Traefik deviennent automatiquement résolvables :
`app.72-60-188-156.sslip.io`, `api.72-60-188-156.sslip.io`, etc.

> **Limites** :
> - Certains FAI résidentiels ou pare-feu d'entreprise **bloquent**
>   sslip.io / nip.io (réponse `403 Web Filter Violation`). Tester
>   d'abord depuis le VPS lui-même : `curl -ks https://app.<DOMAIN>`
>   doit retourner du HTML.
> - Let's Encrypt accepte sslip.io mais l'usage est partagé par
>   beaucoup de monde — risque de hit le rate-limit "5 certs/semaine
>   par domaine de second niveau". Préférer un vrai domaine pour la prod.
> - Pas adapté à un usage end-user — utilisateurs externes peuvent
>   être bloqués par leur DNS/proxy.

---

## 3. Préparer le serveur

```bash
# Connexion
ssh root@<ip-vps>

# Mise à jour
apt update && apt upgrade -y

# Outils de base
apt install -y curl git ca-certificates ufw fail2ban htop

# Hostname (optionnel mais propre dans les logs)
hostnamectl set-hostname opsflux-prod

# Fuseau horaire (cohérence avec les timestamps DB)
timedatectl set-timezone Europe/Paris   # ou Africa/Douala, etc.

# Firewall
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw --force enable

# fail2ban (optionnel mais recommandé)
systemctl enable --now fail2ban
```

### Créer un utilisateur non-root pour Docker (recommandé)

```bash
adduser opsflux
usermod -aG sudo opsflux
mkdir -p /home/opsflux/.ssh
cp ~/.ssh/authorized_keys /home/opsflux/.ssh/
chown -R opsflux:opsflux /home/opsflux/.ssh
chmod 700 /home/opsflux/.ssh
chmod 600 /home/opsflux/.ssh/authorized_keys
```

Désactiver le SSH root après vérification que `ssh opsflux@<ip>` marche :
```bash
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
systemctl reload ssh
```

---

## 4. Installer Docker + Compose

### Docker Engine (version officielle, pas snap)

```bash
# Désinstaller toute ancienne version
apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null

# Repo officiel Docker
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Permettre à `opsflux` d'utiliser docker sans sudo
usermod -aG docker opsflux

# Vérification
docker --version
docker compose version
```

> Note : sur Ubuntu 24.04 le plugin `docker compose` (V2) **remplace**
> `docker-compose` (V1, déprécié). On utilise `docker compose <cmd>`,
> pas `docker-compose <cmd>`.

---

## 5. Cloner le repo

```bash
su - opsflux                  # ou se déconnecter/reconnecter en opsflux
cd /opt
sudo mkdir opsflux && sudo chown opsflux:opsflux opsflux
cd opsflux

git clone https://github.com/hmunyeku/OPSFLUX.git .
git checkout main
```

> **Repo privé ?** Utiliser un *deploy key* GitHub :
> `ssh-keygen -t ed25519 -f ~/.ssh/opsflux_deploy -N ""` puis ajouter
> la clé publique dans GitHub → Settings → Deploy Keys.

---

## 6. Configurer `.env`

```bash
cd /opt/opsflux
cp .env.example .env
```

Éditer `.env` (cf. [`../.env.example`](../.env.example) pour la
référence canonique de chaque variable). Variables **critiques** à
modifier avant tout `docker compose up` :

### 6.1 — Secrets aléatoires (obligatoires)

```bash
# Générer en une commande, copier-coller dans .env
echo "SECRET_KEY=$(openssl rand -hex 32)"
echo "JWT_SECRET_KEY=$(openssl rand -hex 32)"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "ENCRYPTION_KEY=$(python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
echo "OPSFLUX_INTERNAL_TOKEN=$(openssl rand -hex 32)"
```

> Si Python n'est pas installé hors Docker :
> `docker run --rm python:3.12-slim sh -c "pip install -q cryptography && python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"`

### 6.2 — Domaines

Toutes les Traefik labels du `docker-compose.yml` utilisent la variable
`DOMAIN`. Elle templater toutes les URLs `app.<DOMAIN>`, `api.<DOMAIN>`,
etc.

```ini
DOMAIN=opsflux.io        # remplace par TON domaine
APP_URL=https://app.opsflux.io
API_URL=https://api.opsflux.io
WEB_URL=https://www.opsflux.io
API_BASE_URL=https://api.opsflux.io
FRONTEND_URL=https://app.opsflux.io
ALLOWED_HOSTS=api.opsflux.io,app.opsflux.io,db.opsflux.io,mcp.opsflux.io,ext.opsflux.io
ALLOWED_ORIGINS=https://app.opsflux.io,https://ext.opsflux.io,https://api.opsflux.io
ENVIRONMENT=production
```

### 6.3 — Base de données

`DATABASE_URL` doit pointer vers le service `db` du compose et utiliser
**le même mot de passe** que `POSTGRES_PASSWORD` :

```ini
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<le hex généré au 6.1>
POSTGRES_DB=opsflux
DATABASE_URL=postgresql+asyncpg://postgres:<le-meme-hex>@db:5432/opsflux
```

### 6.4 — SMTP (obligatoire pour invitations / reset mdp)

Exemple SendGrid :
```ini
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USERNAME=apikey
SMTP_PASSWORD=<la clé API SendGrid>
SMTP_FROM_ADDRESS=noreply@opsflux.io
SMTP_FROM_NAME=OpsFlux
SMTP_USE_TLS=true
```

Exemple Mailu auto-hébergé :
```ini
SMTP_HOST=mail.opsflux.io
SMTP_PORT=465
SMTP_USERNAME=admin@opsflux.io
SMTP_PASSWORD=<password de la mailbox>
SMTP_USE_TLS=true
```

### 6.5 — Premier admin

```ini
FIRST_SUPERUSER=admin@opsflux.io
FIRST_SUPERUSER_PASSWORD=<un mot de passe robuste — sera à changer au 1er login>
FIRST_ENTITY_CODE=ACME
FIRST_ENTITY_NAME=ACME Corporation
FIRST_ENTITY_COUNTRY=FR
FIRST_ENTITY_TIMEZONE=Europe/Paris
FIRST_ENTITY_CURRENCY=EUR
```

### 6.6 — Optionnels

- **`SENTRY_DSN`** : créer un projet sur sentry.io → coller le DSN.
- **`ANTHROPIC_API_KEY`** : nécessaire pour l'agent IA support /
  TravelWiz NLP. Sans, ces features sont désactivées (pas d'erreur).
- **`STORAGE_BACKEND=s3`** + clés S3 : si vous voulez décharger les
  uploads vers un bucket externe (recommandé en prod).

---

## 7. Mettre en place Traefik

Le `docker-compose.yml` **n'embarque pas Traefik** — il l'attend sur
un réseau Docker externe partagé. Le nom de ce réseau est paramétrable
via `TRAEFIK_NETWORK` dans `.env` ; le défaut `dokploy-network`
correspond à ce qu'install Dokploy. Pour les autres plateformes, voir
le tableau §14.

Si tu n'utilises **pas** de control plane qui fournit Traefik (Dokploy /
Coolify / EasyPanel / Caprover / …), il faut le monter à la main :
deux options ci-dessous.

### 7.1 — Option A : Traefik standalone (recommandé hors control plane)

Créer un compose Traefik dédié. On nomme le réseau partagé `proxy`
ici ; tu peux choisir n'importe quel nom — il faudra juste le mettre
dans le `.env` OpsFlux via `TRAEFIK_NETWORK=<ce-nom>`.

```bash
mkdir -p /opt/traefik && cd /opt/traefik
mkdir letsencrypt dynamic
touch letsencrypt/acme.json && chmod 600 letsencrypt/acme.json
```

`/opt/traefik/docker-compose.yml` :

```yaml
services:
  traefik:
    image: traefik:v3.1
    container_name: traefik
    restart: unless-stopped
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--providers.docker.network=proxy"
      - "--providers.file.directory=/etc/traefik/dynamic"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@opsflux.io"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--log.level=INFO"
      - "--accesslog=true"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
      - ./dynamic:/etc/traefik/dynamic:ro
    networks:
      - proxy

networks:
  proxy:
    external: true
```

`/opt/traefik/dynamic/redirect.yml` (le `docker-compose.yml` d'OpsFlux
utilise `redirect-to-https@file`) :

```yaml
http:
  middlewares:
    redirect-to-https:
      redirectScheme:
        scheme: https
        permanent: true
```

Créer le réseau partagé puis démarrer Traefik :

```bash
docker network create proxy
cd /opt/traefik && docker compose up -d
docker logs -f traefik   # vérifier "Configuration loaded"
```

Et dans le `.env` OpsFlux :

```ini
TRAEFIK_NETWORK=proxy
```

### 7.2 — Option B : nginx-proxy + acme-companion

Si vous préférez nginx, vous devrez réécrire les labels Docker du
`docker-compose.yml` en utilisant les variables `VIRTUAL_HOST` /
`LETSENCRYPT_HOST`. **Non couvert ici** — Traefik est le chemin le mieux
testé.

### 7.3 — Sécuriser pgAdmin (recommandé)

Le sous-domaine `db.<DOMAIN>` expose pgAdmin avec authentification
basique. **À restreindre par IP** en prod. Ajouter dans
`/opt/traefik/dynamic/redirect.yml` :

```yaml
http:
  middlewares:
    redirect-to-https:
      redirectScheme:
        scheme: https
        permanent: true
    pgadmin-allowlist:
      ipAllowList:
        sourceRange:
          - "<votre-ip-bureau>/32"
          - "<vpn>/24"
```

Puis dans `docker-compose.yml` (service `pgadmin`), ajouter :
```yaml
- "traefik.http.routers.${STACK_NAME:-opsflux}-pgadmin-websecure.middlewares=pgadmin-allowlist@file"
```

### 7.4 — Certificat SSL wildcard

Par défaut le `docker-compose.yml` demande **un cert par sous-domaine**
via le resolver ACME `letsencrypt` (HTTP-01). Concrètement = 7
challenges LE successifs au premier deploy ; si l'un foire, rate-limit
garanti. Avec un wildcard `*.<DOMAIN>`, on tombe à un seul cert pour
tout.

**Décision en 30 secondes** :

| Ta situation | Le bon scénario |
|---|---|
| Tu n'as rien et tu ne veux pas toucher au DNS | Laisse les défauts (HTTP-01 par sous-domaine, mode actuel de la prod). |
| Tu as un compte Cloudflare / OVH / Route53 / DigitalOcean / etc. | **Scénario A** : Let's Encrypt DNS-01. Gratuit. Cert renouvelé tout seul. |
| Tu as déjà un `.crt` + `.key` wildcard (Sectigo, RapidSSL, etc.) | **Scénario B** : upload sur le serveur Traefik. |
| Tu déploies en intranet/LAN, pas d'Internet sortant | **Scénario C** : skip TLS (cert auto-signé Traefik). |

**Pré-requis commun aux scénarios A et B** : tu dois pouvoir **éditer
la config Traefik elle-même** — pas seulement le compose OpsFlux.
Selon ton hébergement :

- **Traefik standalone (§7.1)** → tu édites
  `/opt/traefik/docker-compose.yml` + `/opt/traefik/dynamic/*.yml`.
  Plein contrôle.
- **Dokploy** → UI → `Settings` → `Server` → `Traefik`. Permet
  d'ajouter des `--certificatesresolvers.*` au command et de monter des
  fichiers dans `/etc/dokploy/traefik/dynamic/`. `docker restart traefik`
  après modif.
- **Coolify** → UI → `Server` → `Proxy` → onglet `Traefik` (ou
  `Dynamic Configurations`). Coolify expose la config statique +
  `/data/coolify/proxy/dynamic/`.
- **EasyPanel** → UI → `Settings` → `Traefik`. Volumes Traefik dans
  `/etc/easypanel/traefik/`.
- **Caprover** → fichier `/captain/data/config-override/` côté serveur,
  ou via la CLI Caprover. Caprover repackage Traefik dans une stack
  Swarm — moins flexible, parfois plus simple de coller un Traefik à
  côté en standalone (§7.1) et de le brancher dans le réseau Caprover.
- **Portainer + Traefik** → édite directement le compose Traefik que
  tu as déployé toi-même. Comme §7.1.
- **PaaS géré** (Render, Railway, Fly.io, …) → ils gèrent leur propre
  TLS de bout en bout, les scénarios ci-dessous ne s'appliquent pas.
  Suivre leur doc native ; ils servent souvent un wildcard sur leur
  propre domaine, et un cert dédié si tu rattaches un domaine custom.

Le `docker-compose.yml` OpsFlux expose une variable **`CERT_RESOLVER`**
(défaut : `letsencrypt`) qui suffit à basculer entre les modes.

#### Scénario A — Wildcard Let's Encrypt DNS-01 (gratuit)

Supporté tant que ton DNS provider est dans la
[liste lego](https://go-acme.github.io/lego/dns/) (Cloudflare, OVH,
Route53, DigitalOcean, Gandi, Hetzner, …). Pour Hostinger (non
supporté nativement par lego), déléguer la zone à Cloudflare gratuit.

**Côté Traefik** (une seule fois) — ajouter au `command:` du conteneur
Traefik :

```yaml
- "--certificatesresolvers.letsencrypt-dns.acme.email=admin@opsflux.io"
- "--certificatesresolvers.letsencrypt-dns.acme.storage=/letsencrypt/acme.json"
- "--certificatesresolvers.letsencrypt-dns.acme.dnschallenge=true"
- "--certificatesresolvers.letsencrypt-dns.acme.dnschallenge.provider=cloudflare"
```

Puis injecter les creds DNS provider au runtime :

```yaml
environment:
  CF_API_EMAIL: admin@opsflux.io
  CF_DNS_API_TOKEN: ${CF_DNS_API_TOKEN}   # token Cloudflare scope Zone.Read+Edit sur opsflux.io
```

> **Variantes par provider** :
> - OVH : `OVH_ENDPOINT`, `OVH_APPLICATION_KEY`, `OVH_APPLICATION_SECRET`, `OVH_CONSUMER_KEY`
> - AWS Route53 : `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
> - DigitalOcean : `DO_AUTH_TOKEN`
> - Gandi : `GANDI_API_KEY`

Restart Traefik :
```bash
cd /opt/traefik && docker compose up -d
```

**Côté OpsFlux** — une seule ligne dans `.env` :

```ini
CERT_RESOLVER=letsencrypt-dns
```

Redeploy le compose OpsFlux. Au premier coup, Traefik fait **un seul
ordre ACME DNS-01** vers LE → reçoit `*.opsflux.io` → le sert pour
tous les sous-domaines. Renouvellement auto avant expiration, sans
intervention.

#### Scénario B — Wildcard commercial (CA externe)

Tu as déjà acheté `wildcard.opsflux.io.crt` + sa `.key`.

**Côté Traefik** (une seule fois) :

1. Déposer les fichiers :

   ```bash
   mkdir -p /opt/traefik/certs
   cp wildcard.opsflux.io.crt /opt/traefik/certs/
   cp wildcard.opsflux.io.key /opt/traefik/certs/
   chmod 600 /opt/traefik/certs/*.key
   ```

2. Monter `certs/` dans le compose Traefik (ajouter au `volumes:` du
   conteneur Traefik) :

   ```yaml
   - ./certs:/certs:ro
   ```

3. Déclarer le cert dans la config dynamique —
   `/opt/traefik/dynamic/wildcard.yml` :

   ```yaml
   tls:
     # Cert listé → Traefik l'associe à tous ses SAN (ici *.opsflux.io).
     # Tout router servant un Host matching récupère ce cert via SNI
     # sans qu'on touche aux labels OpsFlux.
     certificates:
       - certFile: /certs/wildcard.opsflux.io.crt
         keyFile:  /certs/wildcard.opsflux.io.key
     # En plus, on en fait le cert par défaut → pour tout SNI imprévu
     # (un sous-domaine non listé dans Traefik), Traefik renvoie le
     # wildcard plutôt que son cert auto-signé.
     stores:
       default:
         defaultCertificate:
           certFile: /certs/wildcard.opsflux.io.crt
           keyFile:  /certs/wildcard.opsflux.io.key
   ```

4. Restart Traefik et vérifier dans les logs que la config est chargée :
   ```bash
   cd /opt/traefik && docker compose up -d
   docker logs traefik 2>&1 | grep -i "loading.*configuration"
   ```

**Côté OpsFlux — rien à changer.** C'est une subtilité importante de
Traefik : quand il résout le cert pour un Host donné, il regarde
**d'abord** le file provider. Si un cert matche déjà le SNI, il
l'utilise et **skip silencieusement** le challenge ACME demandé par le
label `certresolver=letsencrypt`. Donc le default `CERT_RESOLVER=letsencrypt`
reste OK : Traefik servira ton wildcard, et les labels `certresolver`
deviennent un no-op silencieux.

> Si tu veux **explicitement** désactiver tout l'ACME (par sécurité,
> pour être sûr qu'aucune requête ne parte vers Let's Encrypt), mets
> `CERT_RESOLVER=none` dans `.env`. Traefik logue un warning au boot
> (`certificates resolver "none" not found`) puis sert le wildcard du
> file provider exactement pareil.

#### Scénario C — Pas de TLS auto (intranet, dev LAN)

```ini
CERT_RESOLVER=none
```

→ Traefik ne contacte jamais Let's Encrypt et sert son cert auto-signé
sur tous les Hosts. Warning navigateur (cert non reconnu) mais HTTPS
fonctionnel pour un usage VPN/intranet ou dev en LAN.

#### Vérifier que le wildcard est bien servi

```bash
# Affiche le cert servi pour app.opsflux.io
openssl s_client -connect app.opsflux.io:443 -servername app.opsflux.io \
  </dev/null 2>/dev/null \
  | openssl x509 -noout -text \
  | grep -E "(Issuer|DNS:)"
```

**Sortie attendue (scénarios A et B)** :
```
Issuer: C = US, O = Let's Encrypt, CN = R3        # ou ton CA commercial
DNS:*.opsflux.io
```

**Si tu vois `DNS:app.opsflux.io`** au lieu de `DNS:*.opsflux.io`, c'est
que Traefik continue à tirer un cert HTTP-01 par sous-domaine. Causes
fréquentes :

1. Config dynamique Traefik pas chargée — vérifier que le file provider
   pointe vers le bon dossier :
   ```bash
   docker exec traefik cat /etc/traefik/traefik.yml 2>/dev/null | grep -A2 file
   docker logs traefik 2>&1 | grep -i "directory.*not"
   ```
2. Le `.crt` est introuvable dans le conteneur Traefik :
   ```bash
   docker exec traefik ls -la /certs/
   ```
3. Cert et clé ne matchent pas (mauvaise paire) :
   ```bash
   openssl x509 -noout -modulus -in wildcard.crt | openssl md5
   openssl rsa  -noout -modulus -in wildcard.key | openssl md5
   # Les deux hash doivent être identiques
   ```
4. Pour le scénario A : challenge DNS-01 a échoué — chercher
   `acme: error` dans `docker logs traefik`. Souvent un token DNS qui
   n'a pas les permissions write sur la zone.

---

## 8. Premier boot — build + migrations + seed

```bash
cd /opt/opsflux

# Build des images (long — 5 à 15 min selon le VPS)
docker compose build

# Démarrer DB + Redis d'abord, vérifier qu'ils sont healthy
docker compose up -d db redis
docker compose ps                # status doit dire "healthy"

# Démarrer le backend (alembic upgrade + seed_i18n + uvicorn)
docker compose up -d backend
docker compose logs -f backend   # suivre — Ctrl-C pour quitter le suivi
```

Au premier boot, vous devez voir :
```
INFO  [alembic.runtime.migration] Running upgrade <0> -> 001_initial...
... (~150 migrations)
[mobile/fr] 360 messages
[app/fr] 5029 messages
✓ Seeded 10807 (key, lang) pairs across 4 languages.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Puis démarrer le reste :
```bash
docker compose up -d frontend ext-paxlog drawio pgadmin vitrine
```

---

## 9. Vérification post-déploiement

```bash
# Tous les conteneurs UP
docker compose ps

# Endpoints HTTP
for url in https://app.opsflux.io https://api.opsflux.io/api/health \
           https://drawio.opsflux.io https://ext.opsflux.io \
           https://db.opsflux.io https://www.opsflux.io ; do
  printf '%-40s ' "$url"
  curl -s -o /dev/null -w "HTTP %{http_code}\n" --max-time 10 "$url"
done
```

Attendu :
- `app.opsflux.io` → **200**
- `api.opsflux.io/api/health` → **200**
- `drawio.opsflux.io` → **200**
- `ext.opsflux.io` → **200** ou **400** (selon présence du token)
- `db.opsflux.io` → **200** (login pgAdmin)
- `www.opsflux.io` → **200**

Si **000** sur tous : Traefik n'écoute pas sur 443 → vérifier
`docker logs traefik` et que le réseau partagé existe :
`docker network ls | grep "${TRAEFIK_NETWORK:-dokploy-network}"`.

Si **404** sur `app.` ou `api.` : le label Traefik n'est pas appliqué
au conteneur → `docker inspect <container> | grep traefik` doit lister
les labels.

Si **TLS error** ou cert invalide : ACME n'a pas pu valider, voir les
logs Traefik. Causes fréquentes :
- DNS pas encore propagé
- Port 80 non ouvert (le challenge HTTP-01 passe par 80)
- Rate-limit Let's Encrypt (5 certs/semaine/domaine en prod)

---

## 10. Connexion initiale + sécurisation

### 10.1 — Premier login

Naviguer sur `https://app.opsflux.io` :
- Email : `FIRST_SUPERUSER` (cf. `.env`)
- Mot de passe : `FIRST_SUPERUSER_PASSWORD`

**Changer le mot de passe immédiatement** (Profil → Sécurité).
Ce mot de passe est resté en clair dans `.env` — il doit être considéré
comme exposé.

### 10.2 — Activer la MFA

Profil → Sécurité → MFA → Activer TOTP. Scanner le QR code dans
Authy/Google Authenticator/1Password.

### 10.3 — Créer les premiers utilisateurs

Module `Tiers` → `Utilisateurs internes` → invitation par email
(nécessite SMTP configuré).

### 10.4 — Verrouiller `.env`

```bash
chmod 600 /opt/opsflux/.env
chown opsflux:opsflux /opt/opsflux/.env
```

---

## 11. Sauvegardes

Trois choses à sauvegarder, par ordre de criticité :

### 11.1 — DB (CRITIQUE)

```bash
# Dump quotidien (à mettre en cron)
docker compose -f /opt/opsflux/docker-compose.yml exec -T db \
  pg_dump -U postgres -Fc opsflux > /backup/opsflux-$(date +%F).dump

# Restore
docker compose exec -T db pg_restore -U postgres -d opsflux -c < backup.dump
```

Cron `/etc/cron.d/opsflux-backup` :
```cron
0 3 * * * opsflux cd /opt/opsflux && docker compose exec -T db pg_dump -U postgres -Fc opsflux > /backup/opsflux-$(date +\%F).dump && find /backup -name 'opsflux-*.dump' -mtime +14 -delete
```

### 11.2 — Volume `uploads_data` (CRITIQUE)

```bash
docker run --rm \
  -v opsflux_uploads_data:/data:ro \
  -v /backup:/backup \
  alpine tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
```

> **Mieux** : passer `STORAGE_BACKEND=s3` et déléguer la durabilité à
> votre fournisseur S3.

### 11.3 — `.env` (CRITIQUE — sans, pas de restore possible)

```bash
gpg -c /opt/opsflux/.env       # demande une passphrase
mv /opt/opsflux/.env.gpg /backup/
```

### 11.4 — Off-site

`rsync` ou `restic` ou `borg` vers une destination distincte du VPS.
Tester un restore au moins une fois par trimestre.

---

## 12. Mises à jour

### 12.1 — Mise à jour standard

```bash
cd /opt/opsflux
git pull origin main
docker compose build backend frontend
docker compose up -d backend frontend
docker compose logs -f backend | head -100   # vérifier alembic + boot
```

> **Migrations DB** : `alembic upgrade head` tourne automatiquement au
> démarrage du backend. Si elle échoue, le conteneur boucle en
> redémarrage — voir [§13](#13-recovery--situations-classiques).

### 12.2 — Mise à jour avec breaking change

Lire le `CHANGELOG.md` du repo (à venir) avant. Si la release introduit
une migration destructive (DROP COLUMN, …) :

```bash
# 1. Backup AVANT
docker compose exec -T db pg_dump -U postgres -Fc opsflux > /backup/pre-upgrade.dump

# 2. Pull + build
git pull origin main && docker compose build

# 3. Stop tout sauf db
docker compose stop backend frontend ext-paxlog

# 4. Restart backend (applique les migrations)
docker compose up -d backend
docker compose logs -f backend

# 5. Si OK : restart le reste
docker compose up -d frontend ext-paxlog
```

### 12.3 — Rollback

```bash
git checkout <commit-sha-précédent>
docker compose build backend frontend
docker compose up -d backend frontend
```

> ⚠ **Si la migration vers la nouvelle version a déjà tourné**, le
> rollback du code peut laisser la DB en avance. Voir §13.

---

## 13. Recovery — situations classiques

### 13.1 — Backend en boucle de restart

```bash
docker compose ps                                # repère "Restarting"
docker compose logs --tail 80 backend
```

Cas fréquents :

#### a) `Can't locate revision identified by 'XXX'`
La DB pointe sur une migration qui n'existe plus dans le code (revert
de migration). Solution :

```bash
# Voir l'état actuel
docker compose exec db psql -U postgres -d opsflux -c \
  "SELECT version_num FROM alembic_version;"

# Lister les migrations connues du code
docker compose exec backend alembic history | head -20

# Stamper la DB sur la dernière révision présente dans le code (CARE!)
docker compose exec backend alembic stamp <revision-id-existante>

# Si la migration manquante avait fait un DROP COLUMN, recréer la
# colonne à la main pour matcher le modèle SQLAlchemy reverté.
```

#### b) `connection refused` vers `db:5432`
La DB n'est pas encore healthy. Vérifier `docker compose ps` —
attendre le `(healthy)`.

#### c) `password authentication failed`
`POSTGRES_PASSWORD` dans `.env` ne matche pas ce qui est dans le
volume `pg_data`. Si vous avez **changé** le mot de passe après le
premier boot, le volume garde l'ancien. Deux options :
- Reset le mot de passe via `psql` :
  `ALTER USER postgres WITH PASSWORD '<nouveau>';`
- Ou détruire le volume (**perte de données** !) :
  `docker compose down -v`

### 13.2 — Traefik exited / certificats illisibles

```bash
docker logs traefik | tail -50
docker start traefik   # si juste arrêté
```

Si `failed to set up container networking: network XXX not found` :
le réseau Docker a disparu (typique après un redémarrage du démon).
Recréer :

```bash
docker network create "${TRAEFIK_NETWORK:-dokploy-network}"
docker start traefik
docker compose -f /opt/opsflux/docker-compose.yml up -d
```

### 13.3 — Rate-limit Let's Encrypt

`429 :: urn:ietf:params:acme:error:rateLimited` dans les logs Traefik.
Vous avez fait > 5 demandes/semaine pour le même domaine. Solution :
attendre 7 jours OU utiliser le staging Let's Encrypt en attendant
(`--certificatesresolvers.letsencrypt.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory`).

### 13.4 — Disque plein

```bash
docker system df               # voir ce qui prend de la place
docker image prune -a          # nettoie les vieilles images
docker volume ls               # repérer les volumes orphelins
docker volume prune            # CAREFUL — vérifier d'abord
```

### 13.5 — Migration alembic qui plante sur DB fresh

Si le backend boucle avec un message du genre :
```
sqlalchemy.exc.ProgrammingError: column "X" does not exist
[SQL: ALTER TABLE ... RENAME X TO Y]
```

C'est qu'une migration de "fix" assume un état d'une DB plus ancienne
qui n'existe pas sur une fresh DB. Cas vu en pratique :
`135_moc_fix_soft_delete` qui renommait `archived_at` → `deleted_at`,
mais 134 a depuis été corrigé pour créer `deleted_at` directement →
fresh DB n'a jamais eu `archived_at`. Fix appliqué dans le commit
`b86bd0f1` — vérifié sur fresh DB le 2026-04-30 : la chaîne 0 → 159
passe maintenant proprement.

**Fix générique** : rendre la migration idempotente avec une vérif
d'existence dans `information_schema.columns` :

```python
def _column_exists(table: str, column: str) -> bool:
    bind = op.get_bind()
    return bool(bind.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c"
    ), {"t": table, "c": column}).first())

def upgrade() -> None:
    if _column_exists("mocs", "archived_at"):
        op.alter_column("mocs", "archived_at", new_column_name="deleted_at")
    # else: déjà bon
```

> **Sympôme caché** : APScheduler peut sembler tourner correctement dans
> les logs (`travelwiz_pickup_reminders: 0 reminders sent`) après que
> uvicorn ait fini par démarrer entre deux retries. Toujours regarder
> `docker logs <backend> 2>&1 | grep -E "FAILED|ERROR.*alembic"` AVANT
> de conclure que tout va bien.

### 13.6 — Récupérer des logs anciens

Logs JSON de chaque conteneur dans `/var/lib/docker/containers/<id>/<id>-json.log`.
Configurer la rotation dans `/etc/docker/daemon.json` :

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "5" }
}
```

Puis `systemctl restart docker`.

---

## 14. Déployer avec un control plane (Dokploy / Coolify / EasyPanel / Caprover / Portainer / …)

Le compose OpsFlux ne dépend de rien de spécifique à un orchestrateur :
il consomme un fichier `docker-compose.yml` standard. Tout control plane
qui sait avaler ça peut le déployer. Ce qu'il te faut :

1. **Une instance Traefik (v2 ou v3)** déjà en place — la plupart des
   control planes en fournissent une nativement.
2. **Un réseau Docker partagé** entre Traefik et OpsFlux. Par défaut le
   compose attend `dokploy-network` ; surcharger via la variable
   `TRAEFIK_NETWORK` dans `.env` selon ta plateforme :

   | Plateforme | `TRAEFIK_NETWORK=` |
   |---|---|
   | **Dokploy** | `dokploy-network` (défaut) |
   | **Coolify** | `coolify` |
   | **Caprover** | `captain-overlay-network` |
   | **EasyPanel** | `easypanel` |
   | **Portainer** + Traefik | dépend de comment tu as nommé le network Traefik |
   | **Traefik standalone (§7.1)** | `proxy` (ou ce que tu as mis dans le compose Traefik) |
   | **Vanilla docker compose, pas de Traefik** | tu dois en monter un d'abord — voir §7.1 |

3. **Un cert resolver ACME** nommé `letsencrypt` côté Traefik (la plupart
   des control planes le configurent par défaut). Si tu utilises un
   nom différent ou un wildcard, voir §7.4.

4. **Définir le `.env`** avec au minimum `POSTGRES_PASSWORD`, `SECRET_KEY`,
   `JWT_SECRET_KEY`, `ENCRYPTION_KEY`, `DOMAIN` (cf. §6).

### 14.0 — Recettes par plateforme (vue d'ensemble)

#### Dokploy

```
Project → New Compose
  Source         = GitHub (this repo)
  Branch         = main
  Compose path   = ./docker-compose.yml
  Auto-deploy    = on
  Environment    = paste your full .env content
→ Deploy
```
Réseau : `dokploy-network` est créé automatiquement à l'install Dokploy.
Traefik est inclus, ACME `letsencrypt` (HTTP-01) configuré par défaut.

#### Coolify

```
+ New Resource → Docker Compose
  Source     = Public/Private Repository (this repo)
  Branch     = main
  Build Pack = Docker Compose
  Compose    = docker-compose.yml
  Network    = coolify (default), or create your own
  Env Vars   = paste .env, set TRAEFIK_NETWORK=coolify
→ Deploy
```

#### EasyPanel

```
Create Service → Compose
  Source = Git → this repo
  Compose path = docker-compose.yml
  Env: TRAEFIK_NETWORK=easypanel + .env content
→ Deploy
```

#### Caprover

Pas idéal pour un compose multi-services comme celui-ci — Caprover
préfère un service par "app". Mais possible via "One Click Apps" custom :

```
Apps → Add → One Click App → Custom YAML
Paste docker-compose.yml content
Set TRAEFIK_NETWORK=captain-overlay-network
```

#### Portainer

```
Stacks → Add stack
  Build method = Repository
  Compose path = docker-compose.yml
  Env vars     = paste .env, set TRAEFIK_NETWORK=<ton-network-traefik>
→ Deploy the stack
```
Tu dois avoir provisionné Traefik à part (Portainer ne l'embarque pas).

#### Vanilla `docker compose` (pas de control plane)

Voir §3 à §13 ci-dessus — c'est le chemin recommandé pour le contrôle
total. `TRAEFIK_NETWORK=proxy` (ou le nom que tu as choisi en §7.1).

### 14.1 — Triggers via API Dokploy

```bash
# Trigger deploy
curl -X POST "$API_DOKPLOY_URL/compose.deploy" \
  -H "x-api-key: $API_DOKPLOY" \
  -H "Content-Type: application/json" \
  -d "{\"composeId\":\"$DOKPLOY_COMPOSE_ID\"}"

# Status (retourne le compose complet — extraire .composeStatus)
curl "$API_DOKPLOY_URL/compose.one?composeId=$DOKPLOY_COMPOSE_ID" \
  -H "x-api-key: $API_DOKPLOY"
# composeStatus: idle | running | done | error
```

### 14.2 — Créer un compose programmatiquement (instance de test)

Workflow complet en 4 appels API. Utile pour scripter une instance
de staging/test sans passer par l'UI Dokploy :

```bash
TOKEN=$API_DOKPLOY
# 1. Créer le compose vide dans un environnement existant
COMPOSE_ID=$(curl -sX POST "$API_DOKPLOY_URL/compose.create" \
  -H "x-api-key: $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"OPSFLUX-TEST","environmentId":"<env-id-existant>"}' \
  | grep -oE '"composeId":"[^"]+"' | cut -d'"' -f4)

# 2. Configurer la source GitHub
curl -sX POST "$API_DOKPLOY_URL/compose.update" \
  -H "x-api-key: $TOKEN" -H "Content-Type: application/json" \
  -d "{
    \"composeId\":\"$COMPOSE_ID\",
    \"sourceType\":\"github\",
    \"githubId\":\"<github-credential-id>\",
    \"repository\":\"OPSFLUX\",
    \"owner\":\"hmunyeku\",
    \"branch\":\"main\",
    \"composePath\":\"./docker-compose.yml\",
    \"composeType\":\"docker-compose\",
    \"autoDeploy\":false
  }"

# 3. Pousser le .env (un seul gros string)
ENV_CONTENT=$(cat .env)
node -e "console.log(JSON.stringify({composeId:'$COMPOSE_ID',env:require('fs').readFileSync('.env','utf8')}))" \
  | curl -sX POST "$API_DOKPLOY_URL/compose.saveEnvironment" \
    -H "x-api-key: $TOKEN" -H "Content-Type: application/json" --data-binary @-

# 4. Déployer
curl -sX POST "$API_DOKPLOY_URL/compose.deploy" \
  -H "x-api-key: $TOKEN" -H "Content-Type: application/json" \
  -d "{\"composeId\":\"$COMPOSE_ID\"}"

# Pour tear-down :
curl -sX POST "$API_DOKPLOY_URL/compose.stop"   -H "x-api-key: $TOKEN" -d "{\"composeId\":\"$COMPOSE_ID\"}"
curl -sX POST "$API_DOKPLOY_URL/compose.delete" -H "x-api-key: $TOKEN" -d "{\"composeId\":\"$COMPOSE_ID\"}"
# `delete` ne supprime PAS les volumes Docker — nettoyer manuellement :
ssh root@<vps> "docker volume rm \$(docker volume ls -q | grep <appName-prefix>)"
```

> **`composeStatus=done` ≠ application healthy.** Dokploy considère le
> deploy "fini" dès que `docker compose up` rend la main, sans attendre
> que les conteneurs deviennent healthy. Toujours vérifier après un
> deploy : `docker ps --filter name=<appName>` puis tail des logs.

### 14.3 — Conflit Traefik si vous déployez plusieurs instances OpsFlux

⚠️ **Quand deux compose projects OpsFlux partagent la même Traefik**
(prod + staging sur le même VPS Dokploy/Coolify/EasyPanel/Caprover/…,
ou n'importe quel setup multi-instance derrière un Traefik commun),
ils peuvent se battre pour les mêmes noms de routers Traefik. Avant
le fix `STACK_NAME`, le compose hardcodait des noms comme
`opsflux-app-web`, `opsflux-api-web`, `pgadmin-web`, `vitrine`, etc.
Deux compose les déclaraient en parallèle → Traefik refuse :

```
ERR Router defined multiple times with different configurations
ERR Could not define the service name for the router: too many services
    routerName=opsflux-app-web
```

**Symptômes (avant le fix `STACK_NAME`, observés le 2026-04-30 avec
deux compose `OPSFLUX` + `OPSFLUX-TEST` sur le même Traefik Dokploy)** :

| Service | Comportement de la 2e instance |
|---|---|
| Frontend (`app.<DOMAIN>`) | ⚠ HTTP 200 — nginx statique sert le SPA quel que soit le Host header, donc même si Traefik route vers le mauvais conteneur, l'utilisateur final voit du contenu cohérent. **Faux positif dangereux**. |
| Backend (`api.<DOMAIN>`) | ❌ HTTP 404 — Traefik route vers le backend prod, qui rejette le Host inconnu |
| Drawio (`drawio.<DOMAIN>`) | ❌ HTTP 404 — pareil |
| pgAdmin (`db.<DOMAIN>`) | ❌ Routage non-déterministe → DB potentiellement écrasée si on se connecte au mauvais |
| Spam Traefik | ~200 lignes ERR/min dans les logs |

**Après application de la solution #1 (`STACK_NAME=opsflux-test3`)**,
même setup, deux compose côte à côte sur le même Traefik :

| Service | 2e instance |
|---|---|
| `app.<test-DOMAIN>` | ✅ 200 |
| `api.<test-DOMAIN>/api/health` | ✅ 200 |
| `drawio.<test-DOMAIN>` | ✅ 200 |
| `ext.<test-DOMAIN>` | ✅ 200 |
| Conflits Traefik OpsFlux | 0 |
| Prod inchangée | ✅ tous endpoints 200 |

**Solutions** :

1. **Variable `STACK_NAME` (recommandé, intégré depuis le commit
   suivant)** — le `docker-compose.yml` template désormais tous les
   noms de routers/services/middlewares Traefik avec
   `${STACK_NAME:-opsflux}-*`. Pour faire cohabiter plusieurs
   instances :

   ```ini
   # .env de l'instance prod
   STACK_NAME=opsflux        # défaut, rétro-compatible
   DOMAIN=opsflux.io

   # .env de l'instance staging (sur le même Traefik)
   STACK_NAME=opsflux-staging
   DOMAIN=staging.opsflux.io
   ```

   Tous les noms de routers deviennent `opsflux-staging-api-web`,
   `opsflux-staging-app-web`, etc. → zéro collision côté Traefik. Les
   `Host()` rules continuent à isoler le routage par domaine.

2. **Une seule instance par Traefik** — toujours valable si vous
   préférez l'isolation hard. Utiliser un VPS dédié (option A §7.1)
   pour le staging.
3. **Isoler Dokploy** — créer un projet Dokploy séparé avec son propre
   Traefik (Dokploy v0.21+ supporte plusieurs Traefik via le champ
   `serverId`). Pertinent si on veut aussi isoler les certs ACME.

### 14.4 — Pièges spécifiques par plateforme

#### Dokploy

- **Ne JAMAIS lancer `docker run` en parallèle** d'un compose Dokploy
  pour le même service : Dokploy le supprime au prochain deploy.
  `scripts/deploy-vps.sh` documente ce piège historique.
- Le redéploiement Dokploy supprime parfois le réseau Docker
  `dokploy-network` et Traefik s'arrête avec
  `failed to set up container networking`. Si vos endpoints retournent
  HTTP 000 après un deploy, vérifier : `docker ps | grep traefik` —
  restart manuellement avec `docker network create dokploy-network && docker start traefik`.
- `compose.delete` ne supprime PAS les volumes Docker associés. Faire
  un `docker volume ls | grep <appName>` puis `docker volume rm` à la
  main si vous voulez vraiment nettoyer.

#### Coolify

- Coolify renomme le réseau interne par projet (`coolify-<uuid>`). Le
  réseau **partagé** avec Traefik s'appelle `coolify` par défaut. Bien
  mettre `TRAEFIK_NETWORK=coolify` sinon les conteneurs OpsFlux
  démarrent mais Traefik ne les voit pas.
- Coolify v4 supporte les compose multi-services mais peut être tatillon
  sur les `depends_on: condition: service_healthy`. Si un service
  reste en `Pending`, vérifier dans la timeline Coolify quel
  conteneur attend une healthcheck qui ne vient pas.

#### EasyPanel / Caprover / Portainer

- Pas de spécificités majeures, mais ces plateformes proxy souvent les
  logs Traefik via leur propre stdout — utiliser leur UI pour les voir
  plutôt que `docker logs traefik` direct.
- Caprover en mode Swarm peut nécessiter un `mode: replicated` explicite
  sur certains services. Ce compose ne le déclare pas (Caprover utilise
  son défaut, ce qui marche pour 99% des cas).

---

## 15. Annexes

### 15.1 — Compose dev local (sans Traefik)

`docker-compose.dev.yml` est fourni à la racine du repo. Il expose les
ports en local (`localhost:8000`, `localhost:5173`) sans HTTPS, et
utilise `mailhog` pour intercepter les emails.

```bash
docker compose -f docker-compose.dev.yml up
# Backend : http://localhost:8000/docs
# Frontend : http://localhost:5173
# Mailhog : http://localhost:8025
```

### 15.2 — Agent worker pool (optionnel)

Pour activer l'agent IA support (auto-fix de tickets), déployer
`agent-worker/docker-compose.yml` comme un **second projet compose** :

```bash
cd /opt/opsflux/agent-worker
# Créer un .env avec les MÊMES POSTGRES_*, ENCRYPTION_KEY,
# OPSFLUX_INTERNAL_TOKEN que dans le .env principal
docker compose up -d
```

Voir [`../agent-worker/README.md`](../agent-worker/README.md) pour le détail.

### 15.3 — Restauration complète depuis backup

```bash
# 1. Préparer le serveur (étapes 3 + 4)
# 2. Cloner le repo (étape 5)
# 3. Restaurer .env
gpg -d /backup/.env.gpg > /opt/opsflux/.env
chmod 600 /opt/opsflux/.env

# 4. Démarrer DB seul
docker compose up -d db
sleep 10

# 5. Restaurer le dump
cat /backup/opsflux-2026-04-30.dump | \
  docker compose exec -T db pg_restore -U postgres -d opsflux -c --if-exists

# 6. Restaurer les uploads
docker run --rm \
  -v opsflux_uploads_data:/data \
  -v /backup:/backup \
  alpine tar xzf /backup/uploads-2026-04-30.tar.gz -C /data

# 7. Démarrer le reste
docker compose up -d
```

### 15.4 — Variables d'environnement — référence complète

Voir [`../.env.example`](../.env.example).

### 15.5 — Voir aussi

- [`STACK.md`](STACK.md) — architecture & schéma logique
- [`../CLAUDE.md`](../CLAUDE.md) — conventions code
- [`adr/`](adr/) — décisions d'architecture
- [`check/00_PROJECT.md`](check/00_PROJECT.md) — cahier des charges fonctionnel

---

## En cas de blocage

1. Lire les logs : `docker compose logs --tail 100 <service>`
2. Vérifier l'état complet : `docker compose ps && docker network ls`
3. Tester la connectivité interne : `docker compose exec backend curl -fsS http://db:5432` (doit échouer en HTTP mais prouver le DNS)
4. Ouvrir une issue GitHub avec les logs anonymisés (sans `.env`).
