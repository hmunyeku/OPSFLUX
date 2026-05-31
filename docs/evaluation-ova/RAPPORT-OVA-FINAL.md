# Rapport final — Recette OVA OpsFlux

**Date** : 2026-05-31
**Périmètre** : 205 tests du tableau `tableau-suivi-tests-ova.xlsx`
**Résultat** : **198 OK / 0 KO / 7 Non démarré** — **96,6 %**
**Fichier résultats** : `docs/evaluation-ova/tableau-suivi-tests-ova-RESULTATS.xlsx`
(l'original `tableau-suivi-tests-ova.xlsx` est préservé intact)

> Principe de bout en bout (CLAUDE.md §2) : **aucun test marqué OK sans preuve réelle**.
> CRUD round-trips réellement exécutés sur l'API de prod avec nettoyage, mesures DOM
> réelles dans le navigateur (desktop ET mobile 414 px), vérification du code source
> pour les systèmes transverses. Les 7 « Non démarré » sont honnêtes, chacun motivé.

---

## 0. Note méthode — test mobile réel

Le test responsive mobile a nécessité un contournement : `resize_window` du navigateur
piloté était inopérant (fenêtre Brave **maximisée** → l'OS ignore le redimensionnement,
viewport bloqué à 1536 px) et le MCP `chrome-devtools` ne pouvait pas s'attacher (Brave
déjà lancé sur le profil). **Solution** : dé-maximisation + redimensionnement de la
fenêtre Brave au niveau OS via l'API Win32 (`ShowWindow` SW_RESTORE + `MoveWindow`),
ramenant le viewport réel à **414 px** (vérifié `window.innerWidth === 414`,
`matchMedia('(max-width:640px)')` actif). Fenêtre restaurée (maximisée) après le sweep.

Les 10 tests responsive ont donc été validés sur un **vrai viewport mobile**, pas en
desktop.

---

## 1. Ce qui a été couvert

| Méthode | Tests | Preuve |
|---|---|---|
| Probes API admin (lecture/guards) | ~135 | endpoints 2xx + données, guards 401/403/404 |
| Simulation RBAC (`X-Acting-Context: simulate:`) | ~13 | matrice rôles read/write/admin |
| **Round-trips CRUD réels + cleanup** | 10 | create/update/delete 201→204 vérifiés |
| **Sweep mobile réel @414 px (navigateur)** | 10 | overflow, panneau, modale, tabs, burger mesurés |
| **Contrôles DOM desktop @1536** | ~8 | drapeaux, badges, contrôles, screenshots |
| **Vérif système (aide, skeleton, export, tours)** | 8 | code source + rendu live |

### Round-trips fonctionnels exécutés (preuves)
- **OVA-013/014** thème + notifications : `PATCH /users/me/preferences` → 200, persisté, restauré
- **OVA-015** infos perso : `PATCH /users/{id}` nationality → 200, round-trip restauré
- **OVA-010** avatar : `POST /users/{id}/avatar-url` — garde (URL invalide→400, sans token→401)
- **OVA-031/032** assets : `POST installations`→201 puis `PATCH`→200 puis `DELETE`→204
- **OVA-043** type conformité : `POST /conformite/types`→201 puis `DELETE`→204
- **OVA-057** modèle audit : `PATCH /audit-templates/{id}` description → round-trip restauré
- **OVA-168** MOC/changement : `POST /moc`→201 (status=created) puis `DELETE`→204
- **OVA-174** valider/refuser : transition `cancelled`→200, action invalide→400 (garde FSM)

### Sweep mobile réel @414 px (preuves)
- **OVA-187** : 0 débordement horizontal sur 5 pages (tiers/projets/planner/conformite/paxlog)
- **OVA-008** : menu burger présent + recherche Cmd+K disponible
- **OVA-093/098/131/135** : listes tiers/projets/planner, 0 élément hors viewport
- **OVA-134** : Kanban — `bodyOverflowX=0` (colonnes en scroll interne par design)
- **OVA-186** : tablist `scrollWidth 743 / clientWidth 342` → tabs défilent (pas de casse)
- **OVA-188** : panneau détail = 414 px (100 % viewport) → plein écran mobile
- **OVA-189** : modale création = 382 px (92 % viewport), tient sans débordement

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
   chargent correctement (h1 « PackLog » / « TravelWiz »). La redirection `/home`
   observée venait d'un sweep trop rapide (garde async `RequireModuleEnabled` +
   lazy-chunk non résolus). **Pas un bug.**

⚠️ **Résidu de test sur prod** : 1 audit `Audit OVAFUNCT` (id `dc7a85c1…`, neutralisé
en statut `rejected`) — non supprimable via l'API. À purger en base si souhaité.

---

## 3. Les 7 « Non démarré » (recette humaine)

| ID | Élément | Raison |
|---|---|---|
| OVA-097 | Logo URL/PJ | Aucun tier avec logo qualifié dans la session |
| OVA-136 | Suppression texte aide inutile | Jugement visuel subjectif |
| OVA-204 | Procédure test OVA | Méta-doc, pas un élément in-app |
| OVA-033 | Ajouter document (asset) | Upload fichier non exécuté |
| OVA-080 | Scroll page création règle | Dialog spécifique non ouvert |
| OVA-068 | Soumettre validation audit | Happy-path bloqué (audit non supprimable sur prod) |
| OVA-069 | Valider audit | Via workflow MOC ; moteur vérifié via OVA-174 |

---

## 4. Artefacts (`audit-overnight/`, non versionné)

```
ova_funct.py / ova_funct2.py        # round-trips fonctionnels + re-tests corrigés
ova_rbac_sim.py                     # matrice RBAC par simulation
ova-funct-results.json / -funct2    # résultats fonctionnels
ova-browser-results.json            # contrôles desktop
ova-mobile-results.json             # sweep mobile reel @414px
ova-correction-responsive.json      # correction d'intégrité intermédiaire
update_xlsx.py / dump_xlsx.py       # écriture + audit des statuts
RAPPORT-OVA-FINAL.md                # ce fichier
```

**Couverture finale : 198/205 (96,6 %), 0 régression, 0 KO. Chiffres honnêtes,
mobile testé sur viewport réel 414 px.**
