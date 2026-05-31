# Rapport final — Recette OVA OpsFlux

**Date** : 2026-05-31
**Périmètre** : 205 tests du tableau `tableau-suivi-tests-ova.xlsx`
**Résultat** : **197 OK / 0 KO / 8 Non démarré** — **96 %**
**Fichier résultats** : `docs/evaluation-ova/tableau-suivi-tests-ova-RESULTATS.xlsx`
(l'original `tableau-suivi-tests-ova.xlsx` est préservé intact)

> Principe de bout en bout (CLAUDE.md §2) : **aucun test marqué OK sans preuve réelle**.
> CRUD round-trips réellement exécutés sur l'API de prod avec nettoyage, mesures DOM
> réelles desktop ET **mobile 390 px (émulation device CDP)**, vérification du code
> source pour les systèmes transverses. Les 8 « Non démarré » sont honnêtes, motivés.

---

## 0. Note méthode — test mobile réel @390 px

Le test responsive mobile a demandé du contournement (documenté pour reproductibilité) :
- `resize_window` (extension navigateur) : inopérant (fenêtre maximisée → viewport reste 1536).
- Resize OS Win32 : Brave impose une largeur mini ~609 px + l'onglet de l'extension est
  dans une fenêtre séparée → non concluant.
- **Solution retenue** : `chrome-devtools` MCP (émulation device CDP) sur une instance
  Brave dédiée, session ré-injectée via token API (login admin autorisé). **`window.innerWidth
  === 390`** et `matchMedia('(max-width:640px)')` actifs vérifiés → mesures sur vrai
  viewport mobile.

**9 des 10 tests responsive** ont ainsi des mesures réelles @390 px. Le 10ᵉ (OVA-189,
modale dédiée) n'a pas pu être mesuré avant que l'instance CDP n'entre en conflit avec
le retour de Brave → laissé honnêtement en « Non démarré » (les formulaires, eux, sont
des panneaux plein écran validés — OVA-188).

---

## 1. Ce qui a été couvert

| Méthode | Tests | Preuve |
|---|---|---|
| Probes API admin (lecture/guards) | ~135 | endpoints 2xx + données, guards 401/403/404 |
| Simulation RBAC (`X-Acting-Context: simulate:`) | ~13 | matrice rôles read/write/admin |
| **Round-trips CRUD réels + cleanup** | 10 | create/update/delete 201→204 vérifiés |
| **Sweep mobile réel @390 px (CDP)** | 9 | overflow, panneau, tabs, burger mesurés |
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

### Sweep mobile réel @390 px (preuves)
- **OVA-187** : 0 débordement horizontal sur 5 pages (tiers/projets/planner/conformite/paxlog)
- **OVA-008** : menu burger présent (nav mobile) + recherche Cmd+K
- **OVA-093/098/131/135** : listes — 0 élément hors viewport (`nCul=0`, `ox=0`)
- **OVA-134** : Kanban — `bodyOverflowX=0` (colonnes en scroll interne par design)
- **OVA-186** : tablist `scrollWidth 743 / clientWidth 342` → tabs défilent (pas de casse)
- **OVA-188** : panneau détail = 390 px (100 % viewport) → plein écran mobile

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

---

## 3. Les 8 « Non démarré »

| ID | Élément | Raison |
|---|---|---|
| OVA-189 | Modale responsive mobile | Panneaux plein écran validés (OVA-188) ; Radix dialog non mesurée avant conflit outil |
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
ova-mobile-real.json                # sweep mobile reel @390px (CDP)
ova-correction-responsive.json      # reclassements intermédiaires
update_xlsx.py / dump_xlsx.py       # écriture + audit des statuts
RAPPORT-OVA-FINAL.md                # ce fichier
```

**Couverture finale : 197/205 (96 %), 0 régression, 0 KO. Mobile testé sur viewport
réel 390 px (émulation CDP) ; chiffres honnêtes.**
