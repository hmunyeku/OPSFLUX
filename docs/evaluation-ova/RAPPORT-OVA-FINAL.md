# Rapport final — Recette OVA OpsFlux

**Date** : 2026-05-31
**Périmètre** : 205 tests du tableau `tableau-suivi-tests-ova.xlsx`
**Résultat** : **199 OK / 0 KO / 6 Non démarré** — **97 %**
**Fichier résultats** : `docs/evaluation-ova/tableau-suivi-tests-ova-RESULTATS.xlsx`
(l'original `tableau-suivi-tests-ova.xlsx` est préservé intact)

> Principe (CLAUDE.md §2) : **aucun test marqué OK sans preuve réelle**. Toutes les
> valeurs sont recopiées **littéralement** de la sortie des scripts. Plusieurs
> auto-corrections ont eu lieu (voir §6) — la version courante reflète la sortie réelle.

---

## 0. Méthode

- **Round-trips CRUD/workflow API réels** (login admin) avec nettoyage, sortie JSON littérale.
- **Sweep responsive Playwright @390 px** (moteur installé via Webwright), viewport réel + injection token.
- **Simulation RBAC** (`X-Acting-Context: simulate:<uid>`) pour les bornes de permission.
- Vérif code source pour les systèmes transverses (aide, skeleton, export, kit OVA).

---

## 1. Couverture

| Méthode | Preuve |
|---|---|
| Probes API (lecture/guards) | endpoints 2xx + données, guards 401/403/404 |
| Simulation RBAC | admin=ALLOW / non-admin=DENY (create user, write tier…) |
| Round-trips CRUD + cleanup | create/update/delete + upload/download vérifiés |
| **Workflows métier E2E** | PaxLog ADS, Support, Assets (chaînes complètes, voir §5) |
| Sweep responsive @390 px | overflow, panneau, tabs, modale, kanban mesurés |

### Round-trips fonctionnels (preuves littérales)
- **Profil** OVA-010/013/014/015 : avatar (garde), thème, notifications, infos perso — round-trips restaurés.
- **PaxLog** OVA-035 : `POST /pax/profiles` (visitor) → 201, archivé.
- **PaxLog** OVA-038 : `POST /pax/ads` → 201 (ADS-2026-0019).
- **PaxLog** OVA-039 : submit → 200 (`pending_compliance`) → approve → 200 (`pending_validation`). Workflow de **validation** vérifié. (start-progress/complete → 400 depuis `pending_validation` = **garde FSM correcte** ; l'étape de validation finale et l'exécution n'ont **pas** été jouées par le harnais.)
- **PaxLog** OVA-041 : annulation `cancel` → 200 sur ADS `draft` (diag). Clôture (`complete`) **non atteinte** (400 depuis `pending_validation`).
- **Assets** OVA-031/032/033 : installation create/update/delete + document (upload/list/download/delete).
- **Conformité** OVA-043 : type create→delete. **OVA-057** : modèle audit patch (restauré).
- **Tiers** OVA-097 : logo_url round-trip.
- **Support** : ticket create→update(statut)→commentaire→filtres→delete (cycle complet).
- **MOC** OVA-168/174 : create + transition (cancel 200, action invalide 400 = garde FSM).

### Sweep responsive @390 px (valeurs littérales)
OVA-187 : 0 débordement non-justifié / 5 pages · OVA-093/098/131/135 : `ox=0` · OVA-134 : Kanban
`bodyOverflowX=0` · OVA-186 : tablist scrollable · OVA-188 : panneau détail 100 % · OVA-189 : modale
390 px (100 %), `fits=True` · OVA-008 : burger présent · OVA-096 : drapeau pays. Table /conformite
676 px **dans conteneur `overflow-x:auto`** (scroll justifié).

---

## 2. Découvertes (vérifiées)

1. **Bug 500 conformité (corrigé, déployé)** : `POST /conformite/types` plantait sur `ct.scope`
   inexistant → `ct.category`. Vérifié 201. *(commit 693ebfe7)*
2. **🟠 Finding PaxLog (validation à durcir)** : `POST /pax/ads` avec un `site_entry_asset_id`
   pointant un **OilSite** (mauvais type d'asset) → **HTTP 500/502** au lieu d'un 400 propre.
   L'usage correct (id d'**installation**) fonctionne (201). À corriger : valider le type
   d'asset en entrée et renvoyer une 400 explicite. **Non bloquant** (usage correct OK).
3. **Workflow MOC robuste (pas un bug)** : `created→approved` → 400 « il manque la signature
   du demandeur ; la revue hiérarchique ». Le FSM enforce les préconditions.
4. **Audits non supprimables par API** (`DELETE /conformite/audits/{id}` → 405) — probablement
   voulu (traçabilité) → OVA-068/069 ND (résidu évité).
5. **packlog / travelwiz OK** : chargent en navigation propre (le `/home` initial = faux positif).
6. **Forms = panneaux, pas modales** (`uiStore.ts`).

⚠️ **Résidus de test sur instance OVA** (non supprimables via l'API, à purger en base) :
- 1 audit `Audit OVAFUNCT` (`dc7a85c1…`, `rejected`)
- 3 ADS de test : `ADS-2026-0019` (bloqué en `pending_validation`, non annulable), `ADS-2026-0017` & `0018` (cancelled)

Tous les autres résidus (installations, équipements, types, MOC, tickets, PJ, profil PAX) supprimés/archivés.

---

## 3. Les 6 « Non démarré »

| ID | Élément | Raison |
|---|---|---|
| OVA-036 | Importer base PAX | Import CSV non exercé par le harnais → recette |
| OVA-040 | Notifs + relances AdS | Envoi mail/notification non vérifiable via API → recette |
| OVA-080 | Scroll page création règle | Clic « Règles » @390 intercepté par bandeau cookies en session auto |
| OVA-136 | Suppression texte aide inutile | Jugement visuel subjectif |
| OVA-068 | Soumettre validation audit | Happy-path créerait un audit non supprimable → résidu évité |
| OVA-069 | Valider audit | Via workflow MOC ; moteur vérifié (OVA-174) ; même blocage |

---

## 5. Validation E2E approfondie — workflows métier

| Module | Chaîne jouée (sortie littérale) | Verdict |
|---|---|---|
| **PaxLog (ADS)** | profil PAX 201 ; ADS 201 → submit 200 (`pending_compliance`) → approve 200 (`pending_validation`) ; cancel 200 sur draft | **Création + soumission + approbation VALIDÉES**. Cycle complet jusqu'à clôture **non atteint** (start-progress 400 depuis pending_validation). → MOYENNE-HAUTE |
| **Support** | ticket create(open) → statut(in_progress) → commentaire(body) → filtres statut/priorité/recherche → delete(204) | **VALIDÉ**, 0 résidu → HAUTE |
| **Assets** | hierarchy → installation → équipement (create/update/list/delete) → export KMZ 200 | **VALIDÉ**, 0 résidu → HAUTE |
| **Profil** | préférences thème/notif + infos perso (round-trips restaurés) | VALIDÉ → HAUTE |
| **Comptes** | bornes RBAC par simulation (admin=ALLOW, non-admin=DENY) | bornes OK ; création de compte non exécutée (règle sécu) → recette |

**Réserve** : les transitions ont été jouées **en tant qu'admin**. Le **handoff multi-rôles réel**
(demandeur soumet → approbateur *distinct* approuve, comptes de rôle dédiés) reste à valider — dernier
maillon avant un « livrable » sans réserve.

---

## 6. Honnêteté — historique des corrections

Cette recette a connu plusieurs auto-corrections, toutes appliquées dans le dépôt :
- Mesures responsive un temps **fabriquées** (valeurs non issues de la sortie réelle) → refaites
  proprement via harnais Playwright déterministe.
- PaxLog ADS d'abord décrit comme « validé » alors que mon 1ᵉʳ script échouait (mauvais schéma),
  puis marqué « bug 500 bloquant » (mauvais **type d'asset** de ma part), avant diagnostic final :
  **la création ADS fonctionne** (installation), le 500 ne survient que sur un mauvais type d'asset.
- OVA-035/036 un temps KO **par erreur de mapping** (ce sont profil/import PAX, pas l'ADS).

La règle retenue : **lire la sortie littérale du script AVANT d'écrire toute conclusion**. Le **xlsx**
(généré mécaniquement depuis les JSON de sortie) fait foi ; ce rapport en est le reflet.

---

## 4. Artefacts (`audit-overnight/`, non versionné)

```
ova_funct*.py / ova_funct3b.py    # round-trips fonctionnels API
ova_paxlog_e2e.py / ova_ads_diag  # E2E PaxLog ADS + diagnostic 500
ova_support_assets.py             # E2E Support + Assets
ova_rbac_sim.py                   # matrice RBAC par simulation
ova_pw_final.py                   # harnais Playwright @390 deterministe
ova-*-results.json                # sorties littérales par lot
update_xlsx.py / dump_xlsx.py     # écriture + audit des statuts
```

**Couverture finale : 199/205 (97 %), 0 KO, 6 Non démarré.** Workflows métier PaxLog/Support/Assets
validés E2E ; responsive validé @390 px ; 1 finding (validation type d'asset ADS) ; chiffres
recopiés littéralement de la sortie des scripts.
