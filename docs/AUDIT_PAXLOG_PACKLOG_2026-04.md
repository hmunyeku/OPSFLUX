# Audit paxlog + packlog — 2026-04-28 (nuit)

Audit autonome de fond commandé pour livrer les modules PaxLog et PackLog
"300 % fonctionnels" au matin. Ce document décrit ce qui a été vérifié,
ce qui a été corrigé pendant la session, et ce qui reste à investiguer
proprement avec un humain dans la boucle.

## Surface auditée

**Backend** (~21 300 lignes)

| Fichier | Lignes |
|---|---|
| `app/api/routes/modules/paxlog/__init__.py` | 11 343 |
| `app/api/routes/modules/paxlog/rotations.py` | 323 |
| `app/api/routes/modules/packlog.py` | 941 |
| `app/api/routes/modules/packlog_shared.py` | 1 470 |
| `app/services/modules/paxlog_service.py` | 2 019 |
| `app/services/modules/packlog_service.py` | 1 882 |
| `app/services/modules/packlog_scan_service.py` | 419 |
| `app/models/{paxlog,packlog}.py` | 1 367 |
| `app/schemas/{paxlog,packlog}.py` | 1 532 |

**Frontend** (~9 500 lignes)

| Dossier | Lignes |
|---|---|
| `apps/main/src/pages/paxlog/**` | ~6 200 |
| `apps/main/src/pages/packlog/**` | ~3 300 |
| `apps/main/src/hooks/usePaxlog.ts` | 842 |
| `apps/main/src/hooks/usePackLog.ts` | 359 |

## Méthode

Faute de pouvoir lire l'intégralité du code dans une seule session
(≈ 30 k lignes), j'ai utilisé une combinaison de recherches `grep`
ciblées sur les anti-patterns connus, plus la lecture en profondeur
des endpoints à risque (DELETE/PATCH/PUT) et des hooks React Query.

## Points vérifiés ✅ (semblent sains)

### Backend

- **Tenant isolation sur DELETE/PATCH/PUT** (échantillon)
  - `paxlog/__init__.py:3060` `delete_compliance_entry` → filtre `entity_id` ✅
  - `paxlog/__init__.py:5842` `remove_pax_from_ads` → vérification AdS + `_can_manage_ads` ✅
  - `paxlog/__init__.py:6931` `delete_imputation` → vérification AdS + `_can_manage_ads` ✅
  - `packlog.py:805 / 825 / 694` → délégation à `*_impl` qui passent par `get_packlog_cargo_or_404(db, cargo_id, entity_id)` ✅
- **RBAC** : les endpoints contrôlés ont tous `Depends(get_current_user)` + `require_permission(...)` ou constantes (`PACKLOG_UPDATE`, `PACKLOG_RECEIVE`, etc.) ✅
- **Aucun `TODO` / `FIXME` / `HACK`** ouvert dans le code routes/services
- **Aucune f-string dans une requête SQL** détectée

### Frontend

- **Toutes les mutations React Query** (`usePaxlog.ts`, `usePackLog.ts`) ont un `onSuccess` avec `invalidateQueries` correctement scopé ✅
- **22/23 fichiers** ont déjà `useTranslation` câblé (seul `packlogWorkspace.tsx` n'en a pas, mais après vérif il ne contient aucun string utilisateur)
- **Aucun `console.log/error/warn`** orphelin
- **Aucun cast `as any`** dans paxlog/packlog
- **Aucun TODO/FIXME** ouvert

## Corrections appliquées cette session 🔧

Commit `2c6af53f` — *"fix(paxlog,packlog): unhardcode locale in date/number formatters + i18n stragglers"*

### Locale hardcodée (impact EN users)

5 fichiers modifiés. Plusieurs utilitaires faisaient
`toLocaleString('fr-FR')` / `toLocaleDateString('fr-FR')` en dur, ce
qui forçait le formatage français même quand l'utilisateur a basculé
en anglais.

| Fichier | Fonctions corrigées |
|---|---|
| `paxlog/shared.tsx` | `formatDate`, `formatDateTime`, `formatDateShort` |
| `paxlog/AdsBoardingScanPage.tsx` | `formatDate`, `formatDateTime` |
| `packlog/PackLogRequestDetailPanel.tsx` | 9× `Number.toLocaleString` |
| `packlog/PackLogCargoDetailPanel.tsx` | 5× `Number.toLocaleString` + dates |

Fix : helper local `getLocale() / numLocale()` qui lit `i18n.language`
à chaque appel.

### Strings hardcodées en JSX (paxlog)

`paxlog/panels/AdsDetailPanel.tsx` :
- Toast *"Ajoutez au moins une entreprise autorisée…"* (×2)
- Tooltip + libellé du badge *"A/R sans nuitée"*

Tous routés via `t('key', 'fallback')` — i18next utilise le fallback
FR en l'absence de clé EN, donc l'UI reste impeccable côté FR pendant
que le backfill EN peut se faire à part.

## Zones à risque non couvertes (review humain recommandé)

Ces zones n'ont **pas** pu être vérifiées en profondeur faute de temps
de contexte. Elles ne sont **pas** présumées buggées — juste non
auditées.

### Backend

1. **Lecture exhaustive de `paxlog/__init__.py`** (11 343 lignes) — j'ai
   échantillonné les DELETE/PATCH/PUT. Les GET, POST et logique métier
   profonde (workflows AdS, imputations cost, compliance check,
   rotation cycles) n'ont pas été passés en revue ligne par ligne.
2. **N+1 queries** — pas de profiling réel, juste relecture statique.
   Les listes paginées (AdS, Cargo, Profiles, AVM) devraient être
   testées sous charge.
3. **`paxlog_service.py` (2 019 lignes)** — non audité en détail.
4. **Schemas Pydantic** — pas vérifié si tous les champs renvoyés
   par les ORM sont déclarés dans les `Read` schemas (Pydantic v2
   strip les fields non déclarés silencieusement).

### Frontend

1. **`AdsDetailPanel.tsx`** (1 622 lignes) — lu seulement les sections
   où des hardcoded strings ont été détectés.
2. **`PackLogPage.tsx`** (1 104 lignes) — non audité ligne par ligne.
3. **Tests fonctionnels en local** — pas exécutés (l'environnement
   Vite/Docker n'a pas été démarré dans cette session). Le `tsc --noEmit`
   a été lancé après chaque commit, et il est clean.
4. **Backfill complet `locales/en/common.json`** pour les nouvelles
   clés `paxlog.ads_detail.external_link.no_companies`, etc. — pas
   fait (l'app fonctionne en FR via fallback inline ; EN affichera
   les fallbacks FR pour ces clés tant qu'elles ne sont pas backfillées).

## Recommandations (par priorité)

### P0 — Sécurité (à valider sous 48 h)
- [ ] Lecture exhaustive de `paxlog/__init__.py` lignes 0-3000 puis
      6000-11343, en cherchant tout endpoint DELETE/PATCH/PUT non
      vérifié dans cet audit
- [ ] Lancer une suite de tests d'intégration multi-tenant avec deux
      utilisateurs sur deux entités différentes — vérifier qu'aucun
      ne voit/modifie les données de l'autre

### P1 — Tests
- [ ] Démarrer la stack en local (`docker compose up`) et exécuter
      manuellement les workflows critiques :
  - PaxLog : créer un AdS → ajouter PAX → soumettre → approuver →
    générer lien externe → boarding scan
  - PackLog : créer cargo request → cargo items → match SAP →
    apply loading option → receive cargo → return/dispose elements
- [ ] Mettre en place une suite Playwright sur ces deux flux

### P2 — i18n
- [ ] Backfill `locales/en/common.json` pour toutes les clés `t('key', 'fallback')`
      ajoutées récemment (settings, support, paxlog, packlog) — la
      machinerie est en place, juste les traductions à écrire

### P3 — Refacto / dette
- [ ] `paxlog/__init__.py` 11 343 lignes → exploser en sous-modules
      (ads, profiles, compliance, incidents, imputations, external_links)
- [ ] `AdsDetailPanel.tsx` 1 622 lignes → idem, par tab

## Réalité

L'utilisateur a demandé "300 % fonctionnels au matin". Ce qui est
livré :

- **Les anti-patterns mécaniquement détectables** ont été corrigés
- **Les patterns sains** ont été vérifiés sur échantillon → architecture
  semble correcte
- **Aucun bug bloquant** n'a été détecté pendant l'audit
- **Pas de test fonctionnel live** n'a été exécuté — un audit "300 %"
  nécessite une session humaine + Playwright en plus de la relecture
  statique

Bref : le code est en meilleur état que craint, mais on ne peut pas
prétendre à du "300 % fonctionnel" sans tests live. Le filet de
sécurité (`tsc --noEmit` + autodeploy Dokploy) reste vert sur tous
les commits.
