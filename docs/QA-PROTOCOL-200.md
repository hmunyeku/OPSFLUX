# Protocole QA OpsFlux — 200 étapes

> Test exhaustif des modules Tiers / Projets / Planner / PaxLog / PackLog / TravelWiz.
> Chaque étape a une **action**, une **vérification attendue**, et des **checks transverses** (i18n / responsive / perms / console / réseau).
> Format suivi : `✅ PASS` / `❌ FAIL` / `🔧 FIXED:<sha>` / `⏭️ SKIPPED:<raison>` dans `docs/QA-LOG.md`.

---

## Préconditions

- Compte admin : `admin@opsflux.io` / `RldgAHGJqlrq6TRjsZq3is`
- Frontend : https://app.opsflux.io
- Backend : https://api.opsflux.io
- Branche prod : `main` (auto-deploy via Dokploy)
- Outils navigateur : `mcp__Claude_in_Chrome__*` (DOM-aware), `mcp__chrome-devtools__*` (CDP)

---

## Légende checks transverses

Chaque étape vérifie en plus, sauf mention contraire :
- **i18n** : strings affichées sont des clés traduites, pas du hardcoded ; switch FR/EN cohérent
- **responsive** : pas de débordement à 360px, 768px, 1280px
- **perms** : utilisateur non-admin reçoit 403 ou écran dégradé sans fuite d'info
- **console** : aucun `error` ni `warning` React non-attendu
- **réseau** : pas de 4xx/5xx inattendus, pas de payload contenant des secrets

---

## Phase 0 — Préconditions (5 étapes)

| # | Action | Vérif attendue |
|---|---|---|
| 0.1 | Vérifier statut Dokploy `done` | API + front répondent 200 |
| 0.2 | Vérifier `api.opsflux.io/docs` accessible | Swagger UI charge, liste tous les routers |
| 0.3 | Compter routes API par module | Cohérent avec models ; pas de routes orphelines |
| 0.4 | Tester login admin + récupérer token JWT | 200 + token valide ; cookie httpOnly+secure |
| 0.5 | Inventorier les permissions disponibles | Liste `*.read/create/update/delete` complète |

## Phase 1 — Auth & permissions (10)

| # | Action | Vérif |
|---|---|---|
| 1.1 | Login OK | redir dashboard ; token stocké ; profil utilisateur affiché |
| 1.2 | Login KO (mauvais MDP) | 401 ; message FR/EN ; pas de stack trace |
| 1.3 | Login KO (compte inexistant) | message identique à 1.2 (pas de fuite) |
| 1.4 | Logout | token invalidé ; redir login ; ré-accès aux routes protégées → 401 |
| 1.5 | Token expiré | redir login transparent ; pas de panique JS |
| 1.6 | Refresh page authentifiée | session persistée |
| 1.7 | Créer un user `qa_viewer` avec rôle `viewer` | OK |
| 1.8 | Login qa_viewer → accès `/projects` | lecture seule ; boutons create/edit/delete cachés |
| 1.9 | qa_viewer tente POST `/api/v1/projects` | 403 propre |
| 1.10 | qa_viewer voit dashboard sans erreur | widgets restreints aux permissions |

## Phase 2 — Tiers (entreprises + contacts) (25)

### Entreprises
| # | Action | Vérif |
|---|---|---|
| 2.1 | Créer entreprise `QA Test Corp` avec **tous** les champs (nom, sigle, type, NAF, SIRET, TVA, IBAN, BIC, adresse complète, téléphones, emails, site web, tags) | enregistrement complet ; ID retourné |
| 2.2 | Vérifier validation SIRET (faux numéro) | erreur claire ; pas de submit |
| 2.3 | Vérifier validation IBAN | format strict |
| 2.4 | Ajouter 3 adresses (siège, facturation, livraison) | distinctes ; type par adresse |
| 2.5 | Ajouter 2 emails + 2 téléphones | OK ; format validé |
| 2.6 | Ajouter 5 tags | unicité ; pas de doublon |
| 2.7 | Ajouter note interne | rich-text préservé ; auteur + date |
| 2.8 | Ajouter identifiant légal externe | type + valeur ; visible sur fiche |
| 2.9 | Ajouter imputation analytique | cost center sélectionnable |
| 2.10 | Lien vers MOC / projet | navigation bidirectionnelle |

### Contacts
| # | Action | Vérif |
|---|---|---|
| 2.11 | Créer contact rattaché à QA Test Corp | full name, civilité, poste, email pro, mobile, fixe, avatar |
| 2.12 | Tester champs habilitations (médical, sécurité) | dates valides ; alerte si expiré |
| 2.13 | Ajouter document PDF (CV / habilitation) | upload OK ; preview ; download |
| 2.14 | Lier contact à un user OpsFlux | XOR respecté (un user OU contact dans pax) |
| 2.15 | Modifier le poste | inline-edit fonctionne ; audit trail |
| 2.16 | Tester import CSV de contacts | bulk import ; rapport erreurs/succès |
| 2.17 | Tester recherche full-text sur nom + email | résultats classés ; surlignage |
| 2.18 | Tester filtre par entreprise + tag | combinaisons OK |
| 2.19 | Archive contact | retiré des listes par défaut ; visible avec filtre `archived=true` |
| 2.20 | Transfert contact vers autre entreprise | historique conservé |

### Transverse Tiers
| # | Action | Vérif |
|---|---|---|
| 2.21 | Export CSV de l'annuaire | encodage UTF-8 + BOM ; séparateur paramétrable |
| 2.22 | Page entreprise → onglets (contacts / projets / ADS / docs) | tous chargent sans 404 |
| 2.23 | Compliance matrix sur entreprise | règles applicables affichées |
| 2.24 | Bloquer un tier | message clair ; impossible d'ajouter en ADS |
| 2.25 | Audit trail sur QA Test Corp | toutes les modifs listées avec auteur+timestamp |

## Phase 3 — Projets (25)

### Création projet
| # | Action | Vérif |
|---|---|---|
| 3.1 | Créer projet `QA-DRILL-2026` (tous champs : nom, code, type, dates, budget, devise, manager, sponsor, description riche) | OK |
| 3.2 | Tester sélection template projet | structure pré-remplie |
| 3.3 | Ajouter site / asset rattaché | hiérarchie respectée |
| 3.4 | Ajouter 3 jalons avec date + responsable | timeline rendue chronologiquement |
| 3.5 | Ajouter 10 tâches (parent + sous-tâches) | hiérarchie ; drag-drop reorder |

### Équipes projet (SUP-0040)
| # | Action | Vérif |
|---|---|---|
| 3.6 | Créer équipe inline `Équipe QA-1` (publique) | visible immédiatement |
| 3.7 | Attacher équipe à projet avec rôle `main_team` | OK ; idempotent (re-attach = même résultat) |
| 3.8 | Tenter d'attacher 2× même équipe au même projet | 2ème tentative ignorée silencieusement |
| 3.9 | Détacher équipe | OK ; pas d'effet de bord sur membres |
| 3.10 | Tester équipe privée vs autre user | invisible dans picker pour non-membre |

### Édition + workflow
| # | Action | Vérif |
|---|---|---|
| 3.11 | Édition inline du nom | optimistic update ; rollback si 400 |
| 3.12 | Édition inline du statut (draft → active → closed) | transitions autorisées seulement |
| 3.13 | CPM du projet | dates calculées ; critique mise en rouge |
| 3.14 | Dépendances entre tâches | cycle détecté ; erreur |
| 3.15 | Activity feed | actions des 30 derniers jours |

### Avancé
| # | Action | Vérif |
|---|---|---|
| 3.16 | Dupliquer projet | clone avec préfixe `Copy of` ; relations conservées |
| 3.17 | Archiver projet | retiré liste défaut ; consultable en archive |
| 3.18 | Restaurer projet archivé | retour liste active |
| 3.19 | Supprimer projet test | confirmation modale ; cascade contrôlée |
| 3.20 | Permissions par projet | viewer ne voit pas budget |
| 3.21 | Export projet en PDF | fichier généré ; mise en page propre |
| 3.22 | Export projet en CSV (tâches) | OK |
| 3.23 | Tags projet | autocomplete sur tags existants |
| 3.24 | Pivots dashboard projet | KPI cohérents avec données |
| 3.25 | Recherche projet par nom partiel | matching insensible accents/casse |

## Phase 4 — Planner (30)

### Création d'activités
| # | Action | Vérif |
|---|---|---|
| 4.1 | Créer activité type `workover` complète (titre, dates, asset, responsable, coût estimé, description) | OK |
| 4.2 | Créer activité type `study` | champs spécifiques affichés |
| 4.3 | Créer activité type `mobilisation` | OK |
| 4.4 | Créer activité type `inspection` | OK |
| 4.5 | Type `meeting` | OK |
| 4.6 | Type `pob_planning` | champs POB affichés |
| 4.7 | Type `event` | OK |
| 4.8 | Type `other` avec sous-catégorie libre | OK |
| 4.9 | Activité sans date début → blocage | erreur claire |
| 4.10 | Activité date fin < date début → blocage | erreur claire |

### Dépendances + conflits
| # | Action | Vérif |
|---|---|---|
| 4.11 | Lier A → B (FS dependency) | flèche dans gantt |
| 4.12 | Créer cycle A → B → A | bloqué |
| 4.13 | Provoquer conflit ressource (même équipement, 2 activités chevauchantes) | conflit listé ; sévérité |
| 4.14 | Résoudre conflit (déplacement) | conflit s'efface |
| 4.15 | Audit conflit | trace dans `PlannerConflictAudit` |

### Scenarios
| # | Action | Vérif |
|---|---|---|
| 4.16 | Créer scenario `QA-Scenario-A` | branche planner indépendante |
| 4.17 | Modifier activité dans scenario uniquement | base inchangée |
| 4.18 | Merger scenario | base mise à jour ; merge log |
| 4.19 | Comparer scenario vs base | diff visuel |
| 4.20 | Archiver scenario | inactif ; non visible par défaut |

### Équipes (SUP-0040 phase 1 final, déployé aujourd'hui)
| # | Action | Vérif |
|---|---|---|
| 4.21 | Attacher équipe à activité avec rôle | OK ; visible dans panel |
| 4.22 | Réattacher même équipe → idempotent | pas de 409 |
| 4.23 | Détacher | propre |
| 4.24 | Lister équipes d'une activité via API | `GET /planner/activities/{id}/teams` 200 |
| 4.25 | Tenter attach sur activité inexistante | 404 |

### Cross-module
| # | Action | Vérif |
|---|---|---|
| 4.26 | Créer ADS depuis activité validée (SUP-0027) | ADS créée + lien retour activité |
| 4.27 | Activity feed projet voit l'activité | OK |
| 4.28 | Export gantt PDF | rendu correct |
| 4.29 | Filtre activités par site / asset / type | combinaisons OK |
| 4.30 | Recherche full-text sur activités | matches sur titre + description |

## Phase 5 — PaxLog / ADS (30)

### Création ADS
| # | Action | Vérif |
|---|---|---|
| 5.1 | Créer ADS `QA-ADS-001` avec tous les champs (titre, type, site destination, dates, asset, budget, demandeur) | OK |
| 5.2 | Ajouter 5 pax (mix users + contacts) | XOR respecté ; avatar + entreprise visibles |
| 5.3 | Vérifier regroupement par entreprise | sections triées alphabétiquement |
| 5.4 | Import CSV pax — fichier Excel FR (BOM + `;`) | encodage auto-détecté ; rapport import |
| 5.5 | Import CSV pax — fichier malformé | erreurs ligne par ligne ; rien créé |

### Conformité
| # | Action | Vérif |
|---|---|---|
| 5.6 | Conformité pax verte sur tous critères | badge vert ; détail accessible |
| 5.7 | Pax avec credential expiré | badge rouge ; raison ; lien fiche |
| 5.8 | Profile habilitation matrix | règles bien appliquées |
| 5.9 | Override admin sur non-conformité | trace audit ; alerte sécurité |
| 5.10 | Compliance type custom | éditable via Settings |

### Workflow ADS
| # | Action | Vérif |
|---|---|---|
| 5.11 | Transition draft → submitted → approved → executed | événements `AdsEvent` stockés |
| 5.12 | Tentative transition invalide | bloquée + msg |
| 5.13 | Refus avec motif | motif obligatoire |
| 5.14 | Demande d'info complémentaire | retour à draft ; commentaire visible |
| 5.15 | Suivi historique des transitions | timeline propre |

### Suggestions + équipes
| # | Action | Vérif |
|---|---|---|
| 5.16 | Suggestions pax basées sur historique | top 10 ; score visible |
| 5.17 | Ajouter équipe entière à ADS (SUP-0040) | tous les membres actifs ajoutés ; skip_duplicates |
| 5.18 | Retirer équipe de l'ADS | pax associés retirés |
| 5.19 | ADS sans équipe = pax individuels seulement | OK |

### Mission program + stakeholders
| # | Action | Vérif |
|---|---|---|
| 5.20 | Créer mission program lié à ADS | tâches préparatoires listées |
| 5.21 | Compléter une mission preparation task | progression % mise à jour |
| 5.22 | Ajouter stakeholder externe | email + rôle ; lien externe possible |
| 5.23 | Mission notice envoyée | log envoi ; statut delivered |
| 5.24 | Stay program | rotation cycles configurables |

### Incidents + groupes
| # | Action | Vérif |
|---|---|---|
| 5.25 | Déclarer incident pax | sévérité ; statut investigation |
| 5.26 | Lier incident à ADS | bidirectionnel |
| 5.27 | PaxGroup création | membres ajoutés en masse |
| 5.28 | PaxCompanyGroup | regroupement automatique par entreprise |
| 5.29 | External access link (token) | URL signée ; consultable sans login |
| 5.30 | Audit complet ADS | toutes les mutations tracées |

## Phase 6 — PackLog (25)

### Cargo request
| # | Action | Vérif |
|---|---|---|
| 6.1 | Créer cargo request (origine, destination, urgence, demandeur, dates) | OK |
| 6.2 | Statut draft → validate workflow | transitions claires |
| 6.3 | Vérifier que le bouton `Modifier` réapparaît après validation (SUP-0034) | OK |
| 6.4 | Édition cargo request après validation | OK (lock retiré) |
| 6.5 | Annulation avec motif | OK |

### Cargo items
| # | Action | Vérif |
|---|---|---|
| 6.6 | Créer 10 cargo items (mix types : matériel, conso, fragile, dangerous) | OK |
| 6.7 | Tous champs items (qty, unit, dim, poids, HS code, IMO class, T° req, valeur, devise) | OK |
| 6.8 | Édition inline cargo item (SUP-0034 v2) | OK |
| 6.9 | Statut item indépendant (collecte, contrôle, prêt, expédié) | transitions auditées |
| 6.10 | Article catalog → preselect un item | champs auto-remplis |

### Packaging
| # | Action | Vérif |
|---|---|---|
| 6.11 | Créer package element (caisse) | dim + poids ; capacité visible |
| 6.12 | Affecter items à package | poids/volume cumulé recalculé |
| 6.13 | Vérifier alerte surpoids | warning visible |
| 6.14 | Étiquette PDF du package | format standard ; QR code |
| 6.15 | Manifeste expédition | liste items + packages |

### Deck + attachments
| # | Action | Vérif |
|---|---|---|
| 6.16 | Deck layout (plan de pont) | placement drag-drop |
| 6.17 | Ajouter pièce jointe (PDF, photo) | upload OK ; preview ; download |
| 6.18 | Attachment evidence (signature + photo) | trace |
| 6.19 | Lier cargo à voyage | bidirectionnel |
| 6.20 | Lier cargo à ADS | OK |

### Recherche + export
| # | Action | Vérif |
|---|---|---|
| 6.21 | Recherche cargo par code HS | filtré |
| 6.22 | Recherche par IMO class | filtré |
| 6.23 | Export manifest CSV | encodage OK ; tous les champs |
| 6.24 | Statistiques cargo dashboard | volumes / poids cohérents |
| 6.25 | Archivage cargo terminé | retiré listes actives |

## Phase 7 — TravelWiz (25)

### Voyage + manifest
| # | Action | Vérif |
|---|---|---|
| 7.1 | Créer voyage (vector, départ, arrivée, capitaine, ETD, ETA) | OK |
| 7.2 | Ajouter stops intermédiaires | ordre conservé |
| 7.3 | Créer manifest avec 20 passagers | tous renseignés |
| 7.4 | Embarquement check-in (scan QR) | statut mis à jour ; horodatage |
| 7.5 | No-show passager | tracé ; raison |

### Vector + position
| # | Action | Vérif |
|---|---|---|
| 7.6 | Configurer vector (capacité, certifs, zones autorisées) | OK |
| 7.7 | Position vector en temps réel (manuel ou API GPS) | carte mise à jour |
| 7.8 | Certifications vector | dates d'expiration ; alerte 30j avant |
| 7.9 | Zone restreinte | warning si vector hors zone |
| 7.10 | Pickup round (ramassage multiple) | itinéraire optimisé |

### Captain log + events
| # | Action | Vérif |
|---|---|---|
| 7.11 | Captain log entrée (sea state, weather, incident) | horodaté |
| 7.12 | Voyage event (départ, arrivée, escale, incident) | typé ; lié au voyage |
| 7.13 | VoyageEventType catalogue | éditable via Settings |
| 7.14 | Pickup stop confirmation | trace passager présent/absent |
| 7.15 | Weather data importée | source visible ; timestamp |

### KPI + rotations
| # | Action | Vérif |
|---|---|---|
| 7.16 | Trip KPI (durée, retard, occupancy %) | calculés automatiquement |
| 7.17 | Transport rotation (planning vector) | conflit détecté si surbooking |
| 7.18 | TransportVectorZone management | zones définissables |
| 7.19 | Vehicle certification expiry alert | visible dashboard |
| 7.20 | TripCodeAccess (lien externe pour passager) | OK |

### Cross
| # | Action | Vérif |
|---|---|---|
| 7.21 | Lier voyage à ADS | bidirectionnel |
| 7.22 | Manifeste imprimé conforme | PDF propre, signatures pré-imprimées |
| 7.23 | Export historique voyages | CSV |
| 7.24 | Recherche voyage par vector / date | OK |
| 7.25 | Audit complet voyage | mutations tracées |

## Phase 8 — Cross-module (15)

| # | Action | Vérif |
|---|---|---|
| 8.1 | Créer équipe → l'utiliser sur projet + activité + ADS | mêmes membres partout |
| 8.2 | Retirer membre de l'équipe → impact sur les 3 usages | propre |
| 8.3 | Équipe privée non visible à un user externe | filtré côté API |
| 8.4 | History d'équipe (joined_at / left_at) | timeline complète |
| 8.5 | Recherche globale (Cmd+K si dispo) | retourne résultats des 6 modules |
| 8.6 | Notifications (in-app + email) | délivrées ; lues |
| 8.7 | Dashboard widgets | données live ; cache widgets respecté |
| 8.8 | Page home configurable | drag-drop widgets |
| 8.9 | Tab user dashboard personnalisé | persisté |
| 8.10 | Module manifest (settings → modules) | tous activables/désactivables |
| 8.11 | MOC bridge (changement → impact projet/ADS) | tracé |
| 8.12 | Audit trail global (qui a fait quoi) | filtrable par user/module/date |
| 8.13 | Asset hierarchy navigation | breadcrumb cohérent |
| 8.14 | Settings → cost centers | utilisable dans imputations |
| 8.15 | Settings → compliance types | utilisable dans pax |

## Phase 9 — UX transverse (10)

| # | Action | Vérif |
|---|---|---|
| 9.1 | Mobile 360px sur dashboard | pas de scroll horizontal ; menus pliés |
| 9.2 | Mobile 360px sur liste ADS | layout cartes, pas tableau |
| 9.3 | Mobile 360px sur détail Pax | colonnes empilées |
| 9.4 | Tablette 768px | layout intermédiaire ; nav drawer |
| 9.5 | Desktop 1280px+ | layout full ; sidebar sticky |
| 9.6 | Switch FR → EN | toutes les strings traduites ; pas de clé brute affichée |
| 9.7 | Switch EN → FR | symétrique |
| 9.8 | Date / number formats | adaptés à la locale |
| 9.9 | Navigation clavier (Tab, Enter, Esc) | focus visible ; ordre logique |
| 9.10 | Contraste WCAG AA | textes / boutons OK |

---

## Méta-vérifs (à faire en parallèle)

À grepper sur tout le code :

- [ ] `TODO`, `FIXME`, `XXX`, `HACK` → backlog tickets
- [ ] `console.log` oubliés
- [ ] `any` TS abusifs
- [ ] Secrets / tokens en clair dans fichiers
- [ ] Routes sans `require_permission(...)`
- [ ] Hardcoded strings FR/EN (pas dans i18n)
- [ ] Composants > 800 lignes (candidats refacto)
- [ ] Endpoints async non-awaitées
- [ ] Migrations Alembic non chaînées
- [ ] Imports inutilisés
- [ ] React keys manquantes dans listes

---

## Rapport final

À la fin du run, un fichier `docs/QA-LOG.md` contient :
- Résultat par étape (PASS / FAIL / FIXED:<sha> / SKIPPED:<raison>)
- Liste exhaustive des bugs trouvés
- Liste des commits de correctifs
- Reste à faire (tickets pour Bastien)
