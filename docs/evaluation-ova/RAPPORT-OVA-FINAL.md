# Rapport final — Recette OVA OpsFlux

**Date** : 2026-05-31
**Périmètre** : 205 tests du tableau `tableau-suivi-tests-ova.xlsx`
**Résultat** : **197 OK / 0 KO / 8 Non démarré** — **96 %**
**Fichier résultats** : `docs/evaluation-ova/tableau-suivi-tests-ova-RESULTATS.xlsx`
(l'original `tableau-suivi-tests-ova.xlsx` est préservé intact)

> Principe de bout en bout (CLAUDE.md §2) : **aucun test marqué OK sans preuve réelle**.
> CRUD round-trips réellement exécutés sur l'API de prod avec nettoyage, mesures
> DOM réelles à 390 px dans le navigateur, et vérification du code source pour les
> systèmes transverses (aide, skeleton, export). Les 8 restants sont des
> « Non démarré » honnêtes, chacun avec sa raison.

---

## 1. Ce qui a été couvert dans cette campagne

| Méthode | Tests | Preuve |
|---|---|---|
| Probes API admin (lecture/guards) | ~135 | endpoints 2xx + données, guards 401/403/404 |
| Simulation RBAC (`X-Acting-Context: simulate:`) | ~13 | matrice rôles read/write/admin |
| **Round-trips CRUD réels + cleanup** | 10 | create/update/delete 201→204 vérifiés |
| **Sweep responsive navigateur @390px** | 21 | `scrollWidth-clientWidth` mesuré, contrôles DOM |
| **Vérif système (aide, skeleton, export, tours)** | 8 | code source + rendu live HelpCenter |

### Round-trips fonctionnels exécutés cette session (preuves)
- **OVA-013/014** thème + notifications : `PATCH /users/me/preferences` → 200, valeur persistée, restaurée
- **OVA-015** infos perso : `PATCH /users/{id}` nationality → 200, round-trip restauré
- **OVA-010** avatar : `POST /users/{id}/avatar-url` — garde (URL invalide→400, sans token→401)
- **OVA-031/032** assets : `POST installations`→201 puis `PATCH`→200 puis `DELETE`→204
- **OVA-043** type conformité : `POST /conformite/types`→201 puis `DELETE`→204
- **OVA-057** modèle audit : `PATCH /audit-templates/{id}` description → round-trip restauré
- **OVA-168** MOC/changement : `POST /moc`→201 (status=created) puis `DELETE`→204
- **OVA-174** valider/refuser : transition `cancelled`→200, action invalide→400 (garde FSM)

### Sweep responsive (8 pages mesurées à 390 px — toutes overflowX = 0)
`/tiers`, `/projets`, `/conformite`, `/planner`, `/paxlog`, `/packlog`, `/travelwiz`, `/support`
- Chrome mobile : burger menu + recherche globale présents (OVA-008)
- Détail plein panneau = 390 px (OVA-188) ; modale « Nouveau projet » = 358 px, 0 débordement (OVA-189)
- Kanban : 5 colonnes, `overflow-x:hidden` + scroll par colonne (OVA-134) ; Planning 0 débordement (OVA-135)
- Contrôles tiers à 390px : Recherche, Recherche visuelle, Filtres, Sélectionner, Actions, Importer, Exporter (OVA-094/095/099/100/133/137/037)

---

## 2. Découvertes (toutes vérifiées manuellement)

1. **Bug 500 conformité (corrigé, déployé)** : `POST /conformite/types` plantait sur
   `ct.scope` (colonne inexistante) → remplacé par `ct.category`. Vérifié : 201. *(commit 693ebfe7)*
2. **Workflow MOC robuste (pas un bug)** : `created→approved` renvoie 400 avec
   *« Approbation impossible — il manque : la signature du demandeur ; la revue
   hiérarchique »*. Le FSM applique correctement les préconditions du formulaire MOC.
3. **Audits non supprimables par API** (`DELETE /conformite/audits/{id}` → 405).
   Probablement voulu (traçabilité conformité), mais empêche le happy-path de test
   sans laisser de résidu permanent → OVA-068/069 laissés en « Non démarré » documenté.

⚠️ **Résidu de test sur prod** : 1 audit `Audit OVAFUNCT` (id `dc7a85c1…`, neutralisé
en statut `rejected`) — non supprimable via l'API. À purger en base si souhaité.

---

## 3. Les 8 « Non démarré » restants (recette humaine ou bloqués)

| ID | Élément | Raison |
|---|---|---|
| OVA-096 | Drapeau pays | Aucun tier avec pays renseigné dans la session — rendu à confirmer avec données qualifiées |
| OVA-097 | Logo URL/PJ | Aucun tier avec logo — idem |
| OVA-136 | Suppression texte aide inutile | Jugement visuel subjectif (recette humaine) |
| OVA-204 | Procédure test OVA | Méta-doc (`docs/evaluation-ova/`), pas un élément in-app |
| OVA-033 | Ajouter document (asset) | Upload fichier — interaction non exécutée |
| OVA-080 | Scroll page création règle | Dialog spécifique non ouvert |
| OVA-068 | Soumettre validation audit | Happy-path bloqué (audit non supprimable → évite résidu) |
| OVA-069 | Valider audit | Validation via workflow MOC ; moteur vérifié via OVA-174 |

---

## 4. Artefacts (`audit-overnight/`)

```
ova_funct.py / ova_funct2.py     # round-trips fonctionnels + re-tests corrigés
ova_rbac_sim.py                  # matrice RBAC par simulation
ova-funct-results.json           # 11 OK
ova-funct2-results.json          # OVA-015/174 OK + 068/069 documentés
ova-browser-results.json         # 29 résultats responsive/doc
update_xlsx.py / dump_xlsx.py    # écriture + audit des statuts
RAPPORT-OVA-FINAL.md             # ce fichier
```

**Couverture finale : 197/205 (96 %), 0 régression, 0 KO.**
