# Rapport final — Recette OVA OpsFlux

**Date** : 2026-05-31
**Périmètre** : 205 tests du tableau `tableau-suivi-tests-ova.xlsx`
**Résultat** : **201 OK / 0 KO / 4 Non démarré** — **98 %**
**Fichier résultats** : `docs/evaluation-ova/tableau-suivi-tests-ova-RESULTATS.xlsx`
(l'original `tableau-suivi-tests-ova.xlsx` est préservé intact)

> Principe de bout en bout (CLAUDE.md §2) : **aucun test marqué OK sans preuve réelle**.
> CRUD round-trips réellement exécutés sur l'API de prod avec nettoyage, mesures DOM
> réelles desktop ET **mobile 390 px (émulation device CDP)**, vérification du code
> source pour les systèmes transverses. Les 4 « Non démarré » sont honnêtes, motivés.

---

## 0. Note méthode — test mobile réel @390 px

`resize_window` (extension) était inopérant (fenêtre maximisée → viewport figé à 1536) et
le resize OS Win32 ne touchait pas la bonne fenêtre. **Solution retenue** : `chrome-devtools`
MCP (émulation device CDP) sur instance Brave dédiée, session ré-injectée via token API
(login admin autorisé). **`window.innerWidth === 390`** + `matchMedia('(max-width:640px)')`
actifs vérifiés → mesures sur vrai viewport mobile (9/10 responsive).

---

## 1. Ce qui a été couvert

| Méthode | Tests | Preuve |
|---|---|---|
| Probes API admin (lecture/guards) | ~135 | endpoints 2xx + données, guards 401/403/404 |
| Simulation RBAC (`X-Acting-Context: simulate:`) | ~13 | matrice rôles read/write/admin |
| **Round-trips CRUD réels + cleanup** | 12 | create/update/delete + upload/download vérifiés |
| **Sweep mobile réel @390 px (CDP)** | 9 | overflow, panneau, tabs, burger mesurés |
| **Contrôles DOM desktop @1536** | ~10 | drapeaux, badges, contrôles, dialog scroll, screenshots |
| **Vérif système (aide, skeleton, export, tours, kit OVA)** | 9 | code source + rendu live + docs |

### Round-trips fonctionnels exécutés (preuves)
- **OVA-013/014** thème + notifications : `PATCH /users/me/preferences` → 200, persisté, restauré
- **OVA-015** infos perso : `PATCH /users/{id}` → 200, round-trip restauré
- **OVA-010** avatar : `POST /users/{id}/avatar-url` — garde (URL invalide→400, sans token→401)
- **OVA-031/032** assets : `POST installations`→201 → `PATCH`→200 → `DELETE`→204
- **OVA-033** document asset : `POST /attachments` (multipart)→201, listé, `download`→200, supprimé
- **OVA-043** type conformité : `POST /conformite/types`→201 → `DELETE`→204
- **OVA-057** modèle audit : `PATCH /audit-templates/{id}` → round-trip restauré
- **OVA-097** logo tier : `PATCH /tiers/{id}` logo_url → 200, persisté, restauré
- **OVA-168** MOC : `POST /moc`→201 → `DELETE`→204
- **OVA-174** valider/refuser : transition `cancelled`→200, action invalide→400 (garde FSM)

### Sweep mobile réel @390 px (preuves)
- **OVA-187** : 0 débordement horizontal sur 5 pages (tiers/projets/planner/conformite/paxlog)
- **OVA-008** : menu burger présent + recherche Cmd+K
- **OVA-093/098/131/135** : listes — 0 élément hors viewport (`nCul=0`, `ox=0`)
- **OVA-134** : Kanban — `bodyOverflowX=0` (colonnes en scroll interne par design)
- **OVA-186** : tablist `scrollWidth 743 / clientWidth 342` → tabs défilent
- **OVA-188** : panneau détail = 390 px (100 % viewport) → plein écran mobile

### Desktop / système
- **OVA-080** : dialog création règle — bouton « Créer la règle » à btnBottom=640 < vh=730, accessible (pas de cut-off)
- **OVA-096** : drapeau pays affiché (liste + fiche)
- **OVA-204** : kit OVA complet et accessible (docs/evaluation-ova/ : 8 guides + README + suivi xlsx)

---

## 2. Découvertes (toutes vérifiées manuellement)

1. **Bug 500 conformité (corrigé, déployé)** : `POST /conformite/types` plantait sur
   `ct.scope` (colonne inexistante) → `ct.category`. Vérifié 201. *(commit 693ebfe7)*
2. **Workflow MOC robuste (pas un bug)** : `created→approved` renvoie 400
   *« Approbation impossible — il manque : la signature du demandeur ; la revue
   hiérarchique »*. Le FSM applique correctement les préconditions du formulaire MOC.
3. **Audits non supprimables par API** (`DELETE /conformite/audits/{id}` → 405) —
   probablement voulu (traçabilité). Empêche le happy-path sans résidu → OVA-068/069 ND.
4. **packlog / travelwiz — FAUX positif levé** : en navigation propre les deux modules
   chargent (h1 « PackLog » / « TravelWiz »). Le `/home` venait d'un sweep trop rapide.
5. **Forms = panneaux, pas modales** (`uiStore.ts` : « forms never use modals ») — la
   création passe par un panneau latéral plein écran sur mobile, pas une Radix dialog.

⚠️ **Résidu de test sur prod** : 1 audit `Audit OVAFUNCT` (id `dc7a85c1…`, neutralisé
en statut `rejected`) — non supprimable via l'API. À purger en base si souhaité.
(Tous les autres résidus de test — installations, types, MOC, PJ — ont été supprimés.)

---

## 3. Les 4 « Non démarré »

| ID | Élément | Raison |
|---|---|---|
| OVA-189 | Modale responsive mobile | Panneaux plein écran validés (OVA-188) + dialog accessible desktop (OVA-080) ; Radix dialog @390px non mesurée (chrome-devtools tombé quand Brave est revenu) |
| OVA-136 | Suppression texte aide inutile | Jugement visuel subjectif — pas de critère objectif automatisable |
| OVA-068 | Soumettre validation audit | Happy-path créerait un audit **non supprimable** sur prod (DELETE→405) — résidu évité |
| OVA-069 | Valider audit | Via workflow MOC ; moteur vérifié (OVA-174) ; même blocage résidu |

---

## 4. Artefacts (`audit-overnight/`, non versionné)

```
ova_funct.py / ova_funct2.py / ova_funct3b.py   # round-trips fonctionnels
ova_rbac_sim.py                                  # matrice RBAC par simulation
ova-funct*-results.json / ova-mobile-real.json   # résultats (fonctionnel, mobile CDP)
ova-browser-results.json / ova-final2.json       # desktop + doc
update_xlsx.py / dump_xlsx.py / show_tests.py    # écriture + audit des statuts
RAPPORT-OVA-FINAL.md                             # ce fichier
```

**Couverture finale : 201/205 (98 %), 0 régression, 0 KO. Mobile testé sur viewport
réel 390 px (CDP) ; tous les résidus de test supprimés sauf 1 audit (flaggé). Chiffres honnêtes.**
