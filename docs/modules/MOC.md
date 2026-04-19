# MOC — Management of Change

Module OpsFlux reproduisant le **Formulaire MOC Perenco** (rev. 06, octobre
2025) tel qu'il est aujourd'hui captué dans Daxium. Parité fonctionnelle
complète — 6 onglets du Daxium, 8 signatures électroniques, renvoi +
motif à chaque étape, export PDF.

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
| GET | `/api/v1/moc` | Liste paginée (filtres : status, site, platform, priority, initiator, search) |
| POST | `/api/v1/moc` | Créer un MOC (tous les champs Daxium) |
| GET | `/api/v1/moc/{id}` | Détail avec history + validations |
| PATCH | `/api/v1/moc/{id}` | Update (limite rôle+status) |
| DELETE | `/api/v1/moc/{id}` | Soft delete |
| POST | `/api/v1/moc/{id}/transition` | FSM transition |
| POST | `/api/v1/moc/{id}/validations` | Upsert d'une ligne validation (comment, approved, signature, return) |
| POST | `/api/v1/moc/{id}/validations/invite` | Inviter un user comme validateur ad-hoc |
| POST | `/api/v1/moc/{id}/execution-accord` | Accord/refus D.O ou D.G (+ signature + return) |
| POST | `/api/v1/moc/{id}/production-validation` | Validation production (Daxium tab 3) |
| POST | `/api/v1/moc/{id}/return` | Renvoi + motif (stage: site_chief / production / do / dg / validator) |
| POST | `/api/v1/moc/{id}/signature` | Enregistrer une signature (slot: initiator / site_chief / production / director / process_engineer / do / dg) |
| GET | `/api/v1/moc/{id}/pdf` | Export PDF du formulaire |
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

- `moc.read` — voir la liste & le détail.
- `moc.create` — créer.
- `moc.update` — modifier, signer un slot, valider production, renvoyer.
- `moc.delete` — archiver.
- `moc.transition` — déclencher une transition FSM.
- `moc.validate` — upsert d'une ligne de validation.
- `moc.manage` — catalogue de types, invitation, site_assignments, édition forcée.
- `moc.{role}.{action}` — permissions fines par étape (cf. FSM).

## Signatures électroniques

Le composant `<SignaturePad>` (canvas, multi-touch + souris + stylet)
retourne une data URL base64 PNG. Stockées inline :
- **7 slots fixes** sur la fiche MOC : initiator, site_chief, production,
  director, process_engineer, do, dg.
- **1 slot par ligne de validation** (HSE, Lead, Production Mgr, Gaz Mgr,
  Maintenance, Métier, invités).

Ce ne sont pas des signatures cryptographiques autoritaires —
elles reproduisent la signature papier pour complétude du PDF.

## Tests

Le script `scripts/smoke_moc.sh` exerce chaque endpoint via curl :

```bash
TOKEN="$(your-login-flow)" ENTITY_ID="your-entity-uuid" \
  ./scripts/smoke_moc.sh https://api.opsflux.io
```

Il vérifie : list, types CRUD, create avec tous les nouveaux champs,
signature slot, production-validation, upsert validation avec signature,
return stage=site_chief, export PDF (Content-Type application/pdf).
