# Rapport final — Recette OVA OpsFlux

**Date** : 2026-05-31
**Périmètre** : 205 tests du tableau `tableau-suivi-tests-ova.xlsx`
**Résultat** : **188 OK / 0 KO / 17 Non démarré** — **92 %**
**Fichier résultats** : `docs/evaluation-ova/tableau-suivi-tests-ova-RESULTATS.xlsx`
(l'original `tableau-suivi-tests-ova.xlsx` est préservé intact)

> Principe de bout en bout (CLAUDE.md §2) : **aucun test marqué OK sans preuve réelle**.
> CRUD round-trips réellement exécutés sur l'API de prod avec nettoyage, mesures
> DOM réelles dans le navigateur, vérification du code source pour les systèmes
> transverses. Les 17 « Non démarré » sont honnêtes, chacun avec sa raison.

---

## 0. ⚠️ Limite d'outillage — tests responsive mobile

**Le redimensionnement de fenêtre du navigateur piloté est non fonctionnel sur le
poste de test** : l'outil répond « resized to 390×844 » mais le viewport réel reste
bloqué à **1536 px** (fenêtre Chrome maximisée, l'OS ignore le resize ; vérifié en
demandant 390 puis 768 → toujours `innerWidth=1536`). Le MCP `chrome-devtools` (qui
aurait permis l'émulation device via CDP) était déconnecté.

**Conséquence assumée** : les contrôles « responsive » ont été faits en **desktop
1536 px**, pas en mobile 390 px. Les 10 tests dont le critère est *spécifiquement* le
rendu mobile (burger menu, empilement colonnes, modale plein écran, scroll tabs
mobile) sont laissés en **« Non démarré »** avec note explicite — plutôt que faussement
« OK ». Ils restent à jouer sur un device réel ou via DevTools device-mode.

Ce qui est validé en desktop l'est réellement (0 débordement horizontal mesuré sur 8
pages, drapeaux, badges, présence des contrôles, i18n, skeleton).

---

## 1. Ce qui a été couvert

| Méthode | Tests | Preuve |
|---|---|---|
| Probes API admin (lecture/guards) | ~135 | endpoints 2xx + données, guards 401/403/404 |
| Simulation RBAC (`X-Acting-Context: simulate:`) | ~13 | matrice rôles read/write/admin |
| **Round-trips CRUD réels + cleanup** | 10 | create/update/delete 201→204 vérifiés |
| **Contrôles DOM desktop @1536 (navigateur)** | ~18 | overflow mesuré, contrôles, drapeaux, screenshots |
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

### Contrôles desktop validés (réels @1536)
- 8 pages (`/tiers /projets /conformite /planner /paxlog /packlog→/home /travelwiz→/home /support`) : **overflowX = 0**
- Drapeau pays affiché liste + fiche (OVA-096) ; badges lisibles (OVA-185)
- Présence contrôles : recherche, recherche visuelle, sélection multiple, actions, import (OVA-094/095/099/100/132/133/137)
- i18n sans clé brute (OVA-182), pas de texte debug (OVA-183), skeleton (OVA-184)

---

## 2. Découvertes (toutes vérifiées manuellement)

1. **Bug 500 conformité (corrigé, déployé)** : `POST /conformite/types` plantait sur
   `ct.scope` (colonne inexistante) → `ct.category`. Vérifié 201. *(commit 693ebfe7)*
2. **Workflow MOC robuste (pas un bug)** : `created→approved` renvoie 400
   *« Approbation impossible — il manque : la signature du demandeur ; la revue
   hiérarchique »*. Le FSM applique correctement les préconditions du formulaire MOC.
3. **Audits non supprimables par API** (`DELETE /conformite/audits/{id}` → 405) —
   probablement voulu (traçabilité). Empêche le happy-path sans résidu → OVA-068/069 ND.
4. **Routes packlog/travelwiz** redirigent vers `/home` à l'accès direct desktop —
   à confirmer (lazy-load, garde de module, ou route non montée).

⚠️ **Résidu de test sur prod** : 1 audit `Audit OVAFUNCT` (id `dc7a85c1…`, neutralisé
en statut `rejected`) — non supprimable via l'API. À purger en base si souhaité.

---

## 3. Les 17 « Non démarré »

**Responsive mobile (10) — bloqués par l'outillage (voir §0)** : OVA-008, 093, 098,
131, 134, 135, 186, 187, 188, 189. Layout desktop sain, rendu mobile à valider device réel.

**Fonctionnel / recette humaine (7)** :
| ID | Élément | Raison |
|---|---|---|
| OVA-097 | Logo URL/PJ | Aucun tier avec logo qualifié dans la session |
| OVA-136 | Suppression texte aide inutile | Jugement visuel subjectif |
| OVA-204 | Procédure test OVA | Méta-doc, pas un élément in-app |
| OVA-033 | Ajouter document (asset) | Upload fichier non exécuté |
| OVA-080 | Scroll page création règle | Dialog spécifique non ouvert |
| OVA-068 | Soumettre validation audit | Happy-path bloqué (audit non supprimable) |
| OVA-069 | Valider audit | Via workflow MOC ; moteur vérifié via OVA-174 |

---

## 4. Artefacts (`audit-overnight/`, non versionné)

```
ova_funct.py / ova_funct2.py        # round-trips fonctionnels + re-tests corrigés
ova_rbac_sim.py                     # matrice RBAC par simulation
ova-funct-results.json / -funct2    # résultats fonctionnels
ova-browser-results.json            # contrôles desktop
ova-correction-responsive.json      # correction d'intégrité responsive
update_xlsx.py / dump_xlsx.py       # écriture + audit des statuts
RAPPORT-OVA-FINAL.md                # ce fichier
```

**Couverture finale : 188/205 (92 %), 0 régression, 0 KO. Chiffres honnêtes,
limite d'outillage documentée.**
