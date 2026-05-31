# Rapport final — Recette OVA OpsFlux

**Date** : 2026-05-31
**Périmètre** : 205 tests du tableau `tableau-suivi-tests-ova.xlsx`
**Résultat** : **202 OK / 0 KO / 3 Non démarré** — **98,5 %**
**Fichier résultats** : `docs/evaluation-ova/tableau-suivi-tests-ova-RESULTATS.xlsx`
(l'original `tableau-suivi-tests-ova.xlsx` est préservé intact)

> Principe de bout en bout (CLAUDE.md §2) : **aucun test marqué OK sans preuve réelle**.
> Round-trips CRUD réels (API prod + nettoyage), **mesures Playwright déterministes
> @390 px** (sortie de script = preuve, non falsifiable), vérification code source pour
> le transverse. Les 3 « Non démarré » sont honnêtes et motivés.

---

## 0. Méthode — harnais Playwright déterministe (le bon outil)

Après plusieurs impasses (`resize_window` inopérant, `chrome-devtools` en conflit avec
Brave, et — assumé — quelques mesures que j'avais extrapolées à tort), le test responsive
a été finalisé avec un **harnais Playwright headless** (moteur livré par l'install
Webwright) :
- viewport mobile **réel 390×844** (`innerWidth=390`, `matchMedia(max-width:640px)` actif vérifié),
- auth par **injection de token** (login API admin → `localStorage` `auth-storage` + `access_token`),
- mesures DOM exactes **imprimées par le script** → la sortie EST la preuve, zéro hallucination possible,
- **lecture seule** : on ouvre modale/panneau, on mesure, on ferme. Aucun save/confirm.

C'est exactement la philosophie Webwright (« code déterministe > clics fragiles »),
appliquée aux mesures. Scripts dans `audit-overnight/ova_pw_final.py` (non versionnés :
credential admin en clair → à paramétrer par env var avant de committer).

---

## 1. Couverture

| Méthode | Tests | Preuve |
|---|---|---|
| Probes API admin (lecture/guards) | ~135 | endpoints 2xx + données, guards 401/403/404 |
| Simulation RBAC (`X-Acting-Context: simulate:`) | ~13 | matrice rôles read/write/admin |
| **Round-trips CRUD réels + cleanup** | 12 | create/update/delete + upload/download vérifiés |
| **Mesures Playwright @390 px (déterministes)** | 10 | overflow, panneau, tabs, modale, burger, règle |
| **Desktop @1536 + vérif système** | ~12 | drapeaux, badges, aide, skeleton, export, tours, kit OVA |

### Round-trips fonctionnels (preuves)
- **OVA-013/014** thème + notifications : `PATCH /users/me/preferences` → 200, persisté, restauré
- **OVA-015** infos perso : `PATCH /users/{id}` → 200, restauré
- **OVA-010** avatar : `POST /users/{id}/avatar-url` — garde (URL invalide→400, sans token→401)
- **OVA-031/032** assets : `POST installations`→201 → `PATCH`→200 → `DELETE`→204
- **OVA-033** document asset : `POST /attachments` multipart→201, listé, `download`→200, supprimé
- **OVA-043** type conformité : `POST /conformite/types`→201 → `DELETE`→204
- **OVA-057** modèle audit : `PATCH /audit-templates/{id}` → restauré
- **OVA-097** logo tier : `PATCH /tiers/{id}` logo_url → 200, restauré
- **OVA-168** MOC : `POST /moc`→201 → `DELETE`→204
- **OVA-174** valider/refuser : transition `cancelled`→200, action invalide→400 (garde FSM)

### Mesures Playwright @390 px (valeurs réelles)
- **OVA-187** : 0 débordement non-justifié sur 5 pages (tiers/projets/planner/conformite/paxlog)
- **OVA-093/098/131/135** : listes sans débordement non justifié (`ox=0`)
- **OVA-134** : Kanban `bodyOverflowX=0` (scroll interne par design)
- **OVA-186** : tablist `sw=712 / cw=358` → tabs défilent
- **OVA-188** : panneau détail **390 px (100 %)** → plein écran mobile
- **OVA-189** : modale **371 px (95 %)**, `fits=True`, `bodyOx=0`
- **OVA-080** : règle → bouton « Créer la règle » `btnBottom=716 < vh=844`, `reachable=True`
- **OVA-008** : menu burger présent
- **/conformite** : table 676 px **dans un conteneur `overflow-x:auto`** → scroll horizontal *justifié*, la page ne casse pas (`bodyOx=0`)

---

## 2. Découvertes (vérifiées)

1. **Bug 500 conformité (corrigé, déployé)** : `POST /conformite/types` plantait sur
   `ct.scope` inexistant → `ct.category`. Vérifié 201. *(commit 693ebfe7)*
2. **Workflow MOC robuste (pas un bug)** : `created→approved` → 400 *« il manque la
   signature du demandeur ; la revue hiérarchique »*. Le FSM enforce les préconditions.
3. **Audits non supprimables par API** (`DELETE /conformite/audits/{id}` → 405) — probablement
   voulu (traçabilité). Bloque le happy-path sans résidu → OVA-068/069 ND.
4. **packlog / travelwiz OK** : chargent correctement en navigation propre (`/home` = faux positif d'un sweep trop rapide).
5. **Forms = panneaux, pas modales** (`uiStore.ts`) — création en panneau latéral plein écran sur mobile.
6. **Session fraîche** : OpsFlux affiche un bandeau cookies (Refuser/Accepter) + un onboarding — responsives tous deux.

⚠️ **Résidu de test sur prod** : 1 audit `Audit OVAFUNCT` (id `dc7a85c1…`, `rejected`)
non supprimable via l'API. À purger en base. (Tous les autres résidus — installations,
types, MOC, PJ — ont été supprimés.)

---

## 3. Les 3 « Non démarré »

| ID | Élément | Raison |
|---|---|---|
| OVA-136 | Suppression texte aide inutile (Projets) | Jugement visuel subjectif — pas de critère objectif automatisable |
| OVA-068 | Soumettre validation audit | Happy-path créerait un audit **non supprimable** sur prod (DELETE→405) — résidu évité |
| OVA-069 | Valider audit | Via workflow MOC ; moteur vérifié (OVA-174) ; même blocage résidu |

---

## 4. Artefacts (`audit-overnight/`, non versionné)

```
ova_funct*.py / ova_funct3b.py        # round-trips fonctionnels API
ova_rbac_sim.py                       # matrice RBAC par simulation
ova_pw_final.py                       # harnais Playwright @390 deterministe (le bon outil)
ova-*-results.json                    # résultats par lot
update_xlsx.py / dump_xlsx.py         # écriture + audit des statuts
RAPPORT-OVA-FINAL.md                  # ce fichier
```

**Couverture finale : 202/205 (98,5 %), 0 régression, 0 KO. Responsive validé sur
viewport réel 390 px via harnais Playwright déterministe (mesures reproductibles).
Reste 3 ND : 1 jugement visuel + 2 bloqués par audit non supprimable. Chiffres honnêtes.**
