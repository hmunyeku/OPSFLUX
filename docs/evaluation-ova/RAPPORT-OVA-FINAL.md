# Rapport final — Recette OVA OpsFlux

**Date** : 2026-05-31
**Périmètre** : 205 tests du tableau `tableau-suivi-tests-ova.xlsx`
**Résultat** : **201 OK / 0 KO / 4 Non démarré** — **98 %**
**Fichier résultats** : `docs/evaluation-ova/tableau-suivi-tests-ova-RESULTATS.xlsx`
(l'original `tableau-suivi-tests-ova.xlsx` est préservé intact)

> Principe de bout en bout (CLAUDE.md §2) : **aucun test marqué OK sans preuve réelle**.
> Toutes les valeurs ci-dessous sont recopiées **littéralement** de la sortie des
> scripts (round-trips API + harnais Playwright). Les 4 « Non démarré » sont honnêtes.

---

## 0. Méthode — harnais Playwright déterministe

Le test responsive a été finalisé avec un **harnais Playwright headless** (moteur livré
par l'install Webwright) :
- viewport mobile **réel 390×844** (`innerWidth=390` vérifié),
- auth par **injection de token** (login API admin → `localStorage` `auth-storage` + `access_token`),
- mesures DOM exactes **imprimées par le script** → la sortie EST la preuve,
- **lecture seule** : ouvrir, mesurer, fermer. Aucun save/confirm.

Scripts dans `audit-overnight/ova_pw_final.py` (non versionnés : credential admin en clair).

---

## 1. Couverture

| Méthode | Tests | Preuve |
|---|---|---|
| Probes API admin (lecture/guards) | ~135 | endpoints 2xx + données, guards 401/403/404 |
| Simulation RBAC (`X-Acting-Context: simulate:`) | ~13 | matrice rôles read/write/admin |
| **Round-trips CRUD réels + cleanup** | 12 | create/update/delete + upload/download vérifiés |
| **Mesures Playwright @390 px (déterministes)** | 8 | overflow 5 pages, kanban, modale |
| **Mesures @390 px (chrome-devtools CDP)** | 2 | panneau détail, tabs (run antérieur) |
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

### Mesures Playwright @390 px (valeurs LITTÉRALES de la sortie)
- **OVA-187** : `ox=0`, `nUnjustified=0` sur 5 pages (tiers/projets/planner/conformite/paxlog)
- **OVA-093/098/131/135** : listes sans débordement non justifié (`ox=0`)
- **OVA-134** : Kanban `bodyOverflowX=0`
- **OVA-189** : modale **390 px (100 %)**, `fits=True`, `bodyOx=0`
- **/projets** : table 887 px **justifiée** (conteneur `overflow-x:auto`) ; **/conformite** : table 676 px **justifiée**
- **OVA-188** (panneau détail 390 px = 100 %) et **OVA-186** (tablist 743/342, scrollable) : validés au **run chrome-devtools** antérieur (non re-mesurés par ce run Playwright — la ligne tier n'a pas été cliquée).

---

## 2. Découvertes (vérifiées)

1. **Bug 500 conformité (corrigé, déployé)** : `POST /conformite/types` plantait sur
   `ct.scope` inexistant → `ct.category`. Vérifié 201. *(commit 693ebfe7)*
2. **Workflow MOC robuste (pas un bug)** : `created→approved` → 400 *« il manque la
   signature du demandeur ; la revue hiérarchique »*. Le FSM enforce les préconditions.
3. **Audits non supprimables par API** (`DELETE /conformite/audits/{id}` → 405) — probablement
   voulu (traçabilité). Bloque le happy-path sans résidu → OVA-068/069 ND.
4. **packlog / travelwiz OK** : chargent en navigation propre (`/home` = faux positif).
5. **Forms = panneaux, pas modales** (`uiStore.ts`) — création en panneau latéral.
6. **Session fraîche** : OpsFlux affiche bandeau cookies (Refuser/Accepter) + onboarding.

⚠️ **Résidu de test sur prod** : 1 audit `Audit OVAFUNCT` (id `dc7a85c1…`, `rejected`)
non supprimable via l'API. À purger en base. (Tous les autres résidus supprimés.)

---

## 3. Les 4 « Non démarré »

| ID | Élément | Raison |
|---|---|---|
| OVA-080 | Scroll page création règle | Le clic « Règles » @390 échoue en session automatisée (bandeau cookies/onboarding intercepte) — `nav=False`. Mesure du bouton non aboutie → recette manuelle |
| OVA-136 | Suppression texte aide inutile (Projets) | Jugement visuel subjectif — pas de critère objectif |
| OVA-068 | Soumettre validation audit | Happy-path créerait un audit **non supprimable** sur prod (DELETE→405) — résidu évité |
| OVA-069 | Valider audit | Via workflow MOC ; moteur vérifié (OVA-174) ; même blocage résidu |

---

## 4. Artefacts (`audit-overnight/`, non versionné)

```
ova_funct*.py / ova_funct3b.py        # round-trips fonctionnels API
ova_rbac_sim.py                       # matrice RBAC par simulation
ova_pw_final.py                       # harnais Playwright @390 deterministe
ova-*-results.json                    # résultats par lot (sortie littérale)
update_xlsx.py / dump_xlsx.py         # écriture + audit des statuts
RAPPORT-OVA-FINAL.md                  # ce fichier
```

**Couverture finale : 201/205 (98 %), 0 régression, 0 KO. Responsive validé sur
viewport réel 390 px (Playwright déterministe + CDP). Reste 4 ND : OVA-080 (clic bloqué
par overlay en auto), OVA-136 (visuel), OVA-068/069 (audit non supprimable). Chiffres
recopiés littéralement de la sortie des scripts.**
