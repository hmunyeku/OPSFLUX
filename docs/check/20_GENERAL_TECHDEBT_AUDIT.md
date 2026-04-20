# Audit dette technique — OpsFlux 2026-04-20

Passage général sur les finitions manquantes après la refonte MOC + AssistantPanel. Sert de backlog d'hygiène pour les prochaines sessions.

## Code-lecture
- ✅ Conforme
- 🟡 Partiel / à surveiller
- ❌ À corriger

---

## 1. Internationalisation

### 1.1 Web — `apps/main/src/locales/en/common.json`

| Indicateur | Valeur |
|---|---|
| Entrées totales | 4 176 |
| Entrées contenant des caractères accentués français | **470** |
| **Taux de fuite FR→EN** | **11,3 %** |

❌ Environ 1 clé sur 9 n'est pas traduite — les utilisateurs anglophones voient encore du français. Exemples :
- `"entite_acces": "Entité & Accès"`
- `"min_8_caracteres": "Min. 8 caractères"`
- `"vide_mot_de_passe_temporaire_auto_genere": "Vide = mot de passe temporaire auto-généré."`
- `"rechercher_une_nationalite": "Rechercher une nationalité..."`
- `"selectionner_un_poste": "Sélectionner un poste..."`

**Cause racine probable :** copie-coller du `fr/common.json` au moment de l'ajout de l'EN sans traduire le nouvel ajout. À refaire en mode batch : extraire les 470 lignes, faire traduire, réintégrer.

**Action proposée** — créer `scripts/i18n/find-french-in-en.mjs` qui sort la liste brute + un PR qui traduit tout d'un coup.

### 1.2 Mobile — `apps/mobile/src/locales/en.ts`

❌ 78 entrées contiennent encore du français. Exemples :
```ts
loginSubtitle: 'Accédez à votre espace OpsFlux',   // en.ts
logoutConfirm: 'Do you want to sign out?',          // OK
mfaSubtitle: 'Saisissez le code à 6 chiffres...'    // FR dans en.ts
```

### 1.3 Placeholders FR hardcodés dans le JSX

🟡 **177 occurrences** `placeholder="…"` avec du FR en dur, réparties sur 50 fichiers — non traduisibles, non skinnables. Top 5 des fichiers :

| Fichier | Occurrences |
|---|---|
| `pages/projets/panels/ProjectDetailPanel.tsx` | 18 |
| `pages/packlog/PackLogCreatePanels.tsx` | 15 |
| `pages/papyrus/PapyrusCorePage.tsx` | 14 |
| `pages/asset-registry/CreatePanels.tsx` | 12 |
| `pages/users/UsersPage.tsx` | 9 |

### 1.4 Chaînes mobiles hors MOC

🟡 Alert/toast/placeholder hardcodés en français dans :
- `LoginScreen.tsx` (2)
- `ScanAdsScreen.tsx` (5)
- `ScanCargoScreen.tsx` (3)
- `SmartScanScreen.tsx` (4)
- `CargoReceptionScreen.tsx` (1)
- `CargoDetailScreen.tsx` (1)
- `FieldLookup.tsx` / `FieldMultiLookup.tsx` (1 chacun)

---

## 2. Marqueurs `TODO / FIXME / XXX / HACK`

### Backend (`app/`)
✅ Très propre. Les 6 hits sont des faux positifs :
- `support.py:883` — nom de feature (`TICKET TODOS`)
- `support.py:954,997` — code d'erreur `TODO_NOT_FOUND`
- `mcp_gateway.py:803` — OAuth callback example (`?code=XXX`)
- `kmz_import.py:188` — fallback pays `"XXX"`

### Frontend web
✅ 0 vrai TODO (le seul hit est un placeholder `sms-xxXXXX-1`).

### Frontend mobile
✅ 0 TODO.

**Verdict** : pas de dette `TODO:` significative dans le code métier.

---

## 3. Stubs / implémentations manquantes

### ✅ Abstracts légitimes
- `app/services/modules/import_service.py` — 5 abstractmethods (interface ImportSchema)
- `app/services/connectors/weather_connector.py` — 2 abstractmethods (interface météo)

### ❌ Stubs réels
- `app/services/connectors/user_sync_service.py:81`
  ```python
  @classmethod
  def from_settings(cls, settings: dict[str, str]) -> "UserSyncProvider":
      """Factory: build provider from settings dict."""
      raise NotImplementedError
  ```
  → À implémenter si la fonctionnalité sync users (LDAP/Azure AD) est dans le scope pilote Perenco. Sinon documenter `USER_SYNC_ENABLED = false` par défaut.

---

## 4. Modules marqués « deprecated / legacy »

🟡 48 occurrences sur 27 fichiers — à auditer pour savoir si on peut supprimer :

- `App.tsx` — routes legacy (`/projects`, `/report-editor`, `/assets-legacy`, `/comptes`, `/entities`, `/cargo`, `/transport`) → redirections. OK de garder tant que des bookmarks externes pointent dessus.
- `types/api.ts` — 9 occurrences : probablement des champs en transition. À vérifier au cas par cas.
- `components/shared/ConditionBuilder.tsx` — 8 : à investiguer.
- `pages/tiers/TiersPage.tsx` — 1 : à investiguer.
- `services/*` — marqueurs sur plusieurs services (`planner`, `assets`, `paxlog`, `papyrusCore`) — souvent des méthodes conservées pour compat avec des intégrations externes.

**Action proposée** : faire une passe ciblée `grep -n "@deprecated" apps/main/src` et décider module par module : soit retirer (breaking change documenté), soit marquer d'un bandeau de suppression à échéance dans le JSDoc.

---

## 5. Dette UX repérée de visu

### 5.1 AssistantPanel — post-refonte
- ✅ Responsive mobile OK (commit `1299b5c7`).
- 🟡 `panelMode === 'compact'` — en mode compact, la hauteur fixée à 420 px coupe le chat long. À transformer en `resize: vertical`.
- 🟡 Plus de visite guidée depuis le login — aujourd'hui la seule visite « welcome » se lance manuellement depuis l'onglet Visites. **Devrait être auto-déclenchée** au premier login (cf. AUP §7.2 formation).

### 5.2 Tour / Onboarding
- 🟡 Seules 4 visites définies (`welcome`, `projets-basics`, `paxlog-basics`, `users-rbac`). Les modules MOC / Planner / TravelWiz / PackLog / Papyrus / Conformité / Assets n'en ont aucune.
- 🟡 Pas de notion de « visites obligatoires » (AUP §7.2 formation annuelle) — pas de traçabilité d'acceptation côté DB.

### 5.3 Support / Tickets
- ✅ Refonte OK (commit `1299b5c7`).
- 🟡 Le champ description du ticket est un simple `<textarea>` alors que le reste du produit utilise Tiptap. À uniformiser.
- 🟡 Pas de masquage auto des secrets dans la description/fichiers (cf. rapport AUP §4.6).

---

## 6. Points de qualité transverses

### 6.1 Fichiers très volumineux (> 1500 lignes)

Ces fichiers méritent d'être découpés — ils sont lents à charger, difficiles à reviewer, risque de collisions Git :

| Fichier | Lignes |
|---|---|
| `apps/main/src/components/layout/AssistantPanel.tsx` | ~1770 (post-refonte, était 1661 avant) |
| `apps/main/src/pages/moc/panels/MOCDetailPanel.tsx` | ~1870 |
| `apps/main/src/components/layout/HelpSystem.tsx` | ~1370 |

**Action proposée** :
- `AssistantPanel.tsx` → extraire `TourSpotlight`, `TicketTab`, `ChatTab`, `HelpTab`, `ToursTab`, `AlertsTab` dans `apps/main/src/components/layout/assistant/`.
- `MOCDetailPanel.tsx` → extraire `MOCStepper`, `SignatureSlot`, `DirectorAccordBlock`, `ValidationRow`, `FlagRow` dans `apps/main/src/pages/moc/panels/detail/`.
- `HelpSystem.tsx` → déplacer la constante `HELP_CONTENT` dans `apps/main/src/content/help/<module>.ts`.

### 6.2 Tests

🟡 Pas de tests e2e sur les nouveaux flows (MOC mobile, AssistantPanel refondu, tour system). À planifier :
- `tests/e2e/moc-mobile.spec.ts`
- `tests/e2e/assistant-panel-mobile.spec.ts`
- `tests/unit/tour-spotlight.test.tsx`

### 6.3 Ménage code mort
- `apps/main/src/components/layout/FeedbackWidget.tsx` — supprimé ✅
- `apps/mobile/src/services/moc.ts::MOC_STATUS_LABELS` — toujours exporté mais plus utilisé. Candidat à suppression après vérif.

---

## 7. Plan d'action priorisé

### P0 — nuisances utilisateur directes
1. **Traduire les 470 lignes FR→EN** dans `apps/main/src/locales/en/common.json` (bloquant pour les anglophones)
2. **Traduire les 78 lignes FR** dans `apps/mobile/src/locales/en.ts`
3. **Auto-déclencher `welcome` tour** au premier login (`first_login_at IS NULL`) avec enregistrement dans `completedTours`

### P1 — propreté produit
4. **Faire passer les 177 placeholders FR hardcodés par i18n** (50 fichiers — peut se découper en 5 PR par domaine : projets, packlog, papyrus, asset-registry, autres)
5. **Refactorer les 3 gros fichiers** (AssistantPanel, MOCDetailPanel, HelpSystem) en modules dédiés
6. **Ajouter visites guidées manquantes** pour MOC, Planner, TravelWiz, PackLog, Papyrus, Conformité, Assets (1 visite `*-basics` par module)
7. **Uniformiser la saisie description Tiptap dans TicketTab** (au lieu du `textarea` brut)

### P2 — hygiène long terme
8. **Trier les 48 marqueurs `deprecated`** — supprimer ce qui peut l'être, documenter les dates de retrait pour le reste
9. **Implémenter ou désactiver `UserSyncProvider.from_settings`**
10. **Ajouter tests e2e** sur les flows critiques (MOC mobile, AssistantPanel)
11. **Chasse aux secrets dans tickets** (regex + redaction) — également listé dans le rapport AUP

---

## 8. Métriques de suivi

Pour tracker la dette sur la durée, reporter dans un dashboard manuel (ou à terme widget Dashboard Admin) :

| Indicateur | Valeur 2026-04-20 | Cible Q3 2026 |
|---|---|---|
| % EN traduit sur web | 88,7 % | 100 % |
| % EN traduit sur mobile | ~95 % | 100 % |
| Placeholders FR hardcodés (web) | 177 | 0 |
| Fichiers > 1 500 lignes | 3 | 0 |
| Visites guidées couvrant les modules | 4 / 12 | 12 / 12 |
| Vrais TODO / FIXME en code | 0 | 0 |
| Couverture e2e MOC | 0 % | 80 % |

---

## 9. Ce qui est VRAIMENT FINI (pour info)

✅ MOC (backend + web + mobile + PDF + i18n) — cf. commits `e464ed52`, `31d6b097`
✅ AssistantPanel mobile + tour positioning + unification Ticket UI — cf. commit `1299b5c7`
✅ Rapport AUP gap analysis — cf. commit `43bf4e33`

Ces 3 chantiers-là sont stables, testés visuellement, déployables.

---

## 10. Références

- Rapport AUP : `docs/check/19_AUP_GAP_ANALYSIS.md`
- Docs produit : `docs/check/00_PROJECT.md`, `docs/check/08_ROADMAP.md`
- Points d'entrée code :
  - Locales web : `apps/main/src/locales/{fr,en}/common.json`
  - Locales mobile : `apps/mobile/src/locales/{fr,en}.ts`
  - AssistantPanel : `apps/main/src/components/layout/AssistantPanel.tsx`
  - Tour engine : `apps/main/src/components/layout/AssistantPanel.tsx` (TourSpotlight + ToursTab)
