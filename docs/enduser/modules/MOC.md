# MOC — Management of Change

Module OpsFlux reproduisant le **Formulaire MOC Perenco** (rev. 06, octobre
2025) tel qu'il est aujourd'hui captué dans Daxium. Parité fonctionnelle
complète — 6 onglets du Daxium, **9 signatures électroniques** (initiator,
hierarchy_reviewer, site_chief, production, director, process_engineer,
DO, DG, close), renvoi + motif à chaque étape, promotion en projet,
export PDF fidèle au gabarit imposé.

## Flow

1. **Demande** (initiateur) — objectifs, description, situation actuelle,
   modifications proposées, analyse d'impact, nature (OPTIMISATION /
   SECURITE), métiers, type (permanent/temporaire + dates), pièces jointes
   typées (PID initial/modifié/ESD/photos/études), **signature demandeur**.
2. **Revue hiérarchie + CDS/OM** — confirmation que c'est bien un MOC,
   accord de principe, **signature CDS**, éventuel renvoi pour modification.
3. **Production — mise en étude** — validation par le service production,
   priorité réaffectée, **signature Production**, renvoi possible.
4. **Étude Process** — étude du process engineer, `study_conclusion`,
   drapeaux HAZOP/HAZID/Environmental/MAJ PID/MAJ ESD, coût, niveau de
   validation déduit (D.O ou D.O + D.G), **signature process engineer**.
5. **Validation parallèle** — HSE, Lead Process, Production Manager, Gaz
   Manager, Maintenance Manager, Métier(s). Chaque validateur : commentaire,
   niveau, accord/refus, **signature**, renvoi possible avec motif.
   Ajout d'invités ad-hoc (users spécifiques) avec les mêmes capacités.
6. **Réalisation (D.O / D.G)** — accord ou refus par chaque directeur
   selon le `cost_bucket`, commentaire, **signature**, renvoi possible.

## Endpoints

| Méthode | Chemin | Description |
|---------|--------|-------------|
| GET | `/api/v1/moc` | Liste paginée (filtres : status, site, platform, priority, initiator, manager, `mine_as_manager`, `has_project`, search) |
| POST | `/api/v1/moc` | Créer un MOC (tous les champs Daxium + manager_id + signature initiator) |
| GET | `/api/v1/moc/{id}` | Détail avec history + validations + `linked_project` si promu |
| PATCH | `/api/v1/moc/{id}` | Update (limite rôle+status) |
| DELETE | `/api/v1/moc/{id}` | Soft delete |
| POST | `/api/v1/moc/{id}/transition` | FSM transition (préconditions backend : signature initiator / revue hiérarchie / commentaire CDS / priorité / etc.) |
| POST | `/api/v1/moc/{id}/validations` | Upsert d'une ligne validation (comment, approved, signature, return_requested/reason) |
| POST | `/api/v1/moc/{id}/validations/invite` | Inviter un user comme validateur ad-hoc |
| POST | `/api/v1/moc/{id}/execution-accord` | Accord/refus D.O ou D.G (+ signature + return) |
| POST | `/api/v1/moc/{id}/production-validation` | Validation production (Daxium tab 3) |
| POST | `/api/v1/moc/{id}/return` | Renvoi + motif (stage: site_chief / production / do / dg / validator) |
| POST | `/api/v1/moc/{id}/signature` | Enregistrer une signature (slot: initiator / hierarchy_reviewer / site_chief / production / director / process_engineer / do / dg / close) |
| POST | `/api/v1/moc/{id}/promote-to-project` | Crée un Project lié (code = référence MOC, manager = MOC.manager_id), idempotent — 409 si déjà promu |
| GET | `/api/v1/moc/{id}/pdf` | Export PDF du formulaire (layout Perenco rev.06 — bandes teal `#11A09E`, cases à cocher, filigrane anti-extraction sur signatures) |
| GET/POST/PATCH/DELETE | `/api/v1/moc/types(/...)` | CRUD catalogue des types + règles |
| GET/POST/DELETE | `/api/v1/moc/site-assignments` | Mapping user→rôle→site (notifs) |
| GET | `/api/v1/moc/fsm` | Description FSM |
| GET | `/api/v1/moc/stats` | Agrégats dashboard |

## Modèles de données

- `mocs` — 95 colonnes, dont `title`, `nature`, `metiers` (JSONB),
  `initiator_email`, `initiator_external_name/function`, les 6 signatures,
  `production_validated/_by/_at/_comment/_signature`, `study_conclusion`,
  les 4 `*_return_requested/_reason` (CDS, prod, DO, DG).
- `moc_validations` — matrice par rôle, avec `signature`, `source`
  (`matrix` / `invite` / `manual`), `invited_by/at`, `return_requested/reason`.
- `moc_types` + `moc_type_validation_rules` — catalogue customisable par
  admin, seeded à la création d'un MOC avec `moc_type_id`.
- `moc_site_assignments` — routage des notifications.
- `moc_reminder_log` — idempotency des rappels pour MOC temporaires.

## Dictionnaires (customisables via Settings → Dictionary)

| Category | Usage |
|----------|-------|
| `moc_site` | Liste des sites (RDR EAST / RDR WEST / SOUTH / MASSONGO / …) |
| `moc_modification_type` | permanent / temporaire |
| `moc_nature` | OPTIMISATION / SECURITE |
| `moc_metier` | INTEGRITE / INSTRUMENTATION / ELECTRICITE / … |
| `moc_cost_bucket` | 4 tranches MXAF |
| `moc_validation_role` | HSE / Lead Process / … / process_engineer / metier |
| `moc_attachment_type` | pid_initial / pid_modified / esd_initial / esd_modified / photo / study / other |
| `moc_status` | Labels humanisés des 12 statuts FSM |

## Paramètres d'entité (Settings → MOCtrack)

- `moc.reminders.enabled` (bool) — active le cron quotidien de rappels.
- `moc.reminders.days_before` (list int) — seuils J-N (défaut `[30,14,7,1]`).
- Types de MOC (catalogue + matrice de validation template).

## Permissions

### Granulaires (routes)

| Permission | Route gatée |
|---|---|
| `moc.read` | GET liste + détail + PDF + fsm + stats + site-assignments |
| `moc.create` | POST création |
| `moc.update` | PATCH, `/signature`, `/return` (chaque étape valide via la sous-permission métier) |
| `moc.delete` | DELETE soft |
| `moc.transition` | `/transition` (le FSM applique la perm spécifique) |
| `moc.validate` | `/validations` upsert |
| `moc.validator.invite` | `/validations/invite` |
| `moc.production.validate` | `/production-validation` (Daxium tab 3) |
| `moc.promote` | `/promote-to-project` |
| `moc.signature.view` | Voir le PNG brut des signatures (sinon `__REDACTED__`) |
| `moc.manage` | Catalogue types / site-assignments / override admin |
| `moc.{role}.{action}` | Transitions FSM (cf. `GET /moc/fsm`) |

### Rôles système

Les rôles sont déclarés au niveau **système** (pas `MOC_*`) pour être
réutilisables par d'autres modules :

- `SITE_CHIEF` — approuve, soumet, lance l'exécution, clôture, **promote**, invite
- `DIRECTOR` — confirme, priorise, valide l'étude, DO/DG accord, **promote**, invite
- `LEAD_PROCESS` — démarre l'étude, invite
- `PROCESS_ENGINEER` — pilote l'étude, soumet, ferme docs
- `PRODUCTION_MANAGER` — `moc.production.validate`
- `HSE`, `MAINTENANCE_MANAGER` — valident leur volet + `moc.signature.view`
- `MOC_INITIATOR` — crée et suit ses propres MOC
- `MOC_METIER` — valide un volet métier (discipline)
- `MOC_ADMIN` — toutes les perms du module

## Signatures électroniques

Le composant `<SignaturePad>` (canvas, multi-touch + souris + stylet)
retourne une data URL base64 PNG. Protégées côté affichage par
`<ProtectedSignature>` (background-image, pas d'`<img>` crawlable,
context-menu/drag/copy désactivés, filigrane 3 couches anti-inpaint :
texte rotation +/-22° + grille diagonale, auto-flou quand la fenêtre
perd le focus).

**9 slots fixes** sur la fiche MOC : `initiator`, `hierarchy_reviewer`,
`site_chief`, `production`, `director`, `process_engineer`, `do`, `dg`,
`close`.

**1 slot par ligne de validation** (HSE, Lead, Production Mgr, Gaz Mgr,
Maintenance, Métier, invités).

Côté backend, la redaction route-level (`_redact_signatures` dans
`app/api/routes/modules/moc.py`) remplace les data URL par le sentinel
`__REDACTED__` pour les users sans `moc.signature.view` ni `moc.manage`,
sauf auto-service (le signataire voit toujours la sienne).

Ce ne sont pas des signatures cryptographiques autoritaires — elles
reproduisent la signature papier pour complétude du PDF Perenco. Un
OS-level screenshot reste techniquement impossible à bloquer depuis un
navigateur web ; la défense repose sur le filigrane traçable
(email_viewer + timestamp + réf) qui permet de remonter à l'origine
d'une fuite.

## MOC ↔ Project

Une fois un MOC dans l'un des statuts `validated`, `execution` ou
`executed_docs_pending`, il peut être promu en Project :

```
POST /api/v1/moc/{id}/promote-to-project
```

Crée une row `projects` avec :
- `code` = `MOC_NNN_PF`
- `name` = `title` ou `objectives`
- `manager_id` = `moc.manager_id` (ou caller par défaut)
- `asset_id` = installation_id du MOC
- `priority` = mapping 1→high / 2→medium / 3→low
- `external_ref` = `moc:<uuid>`

Le MOC est lié dans les deux sens : `mocs.project_id` + `projects.external_ref`.

**Synchronisation progress** (sens unique Project → MOC, cf.
`app/services/modules/moc_sync.py`) :

- `project.progress` → `moc.metadata_['execution_progress']`
- `project.status == 'completed'` + `moc.status == 'execution'` →
  auto-avancement à `executed_docs_pending` (le CDS doit ensuite
  clôturer formellement avec `close_signature`)
- `project.status == 'cancelled'` → log d'avertissement, pas d'action
  automatique (trop destructif)

## Tests

Le script `scripts/smoke_moc.sh` exerce chaque endpoint via curl :

```bash
TOKEN="$(your-login-flow)" ENTITY_ID="your-entity-uuid" \
  ./scripts/smoke_moc.sh https://api.opsflux.io
```

13 étapes : list, types CRUD, create avec tous les champs Daxium
(title/nature/metiers/signature), get détail, signatures (site_chief,
hierarchy_reviewer, close), production-validation, upsert validation,
return stage=site_chief, filtres list (mine_as_manager, has_project),
promote-to-project, widget catalog, export PDF.
