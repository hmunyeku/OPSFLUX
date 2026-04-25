# Bugs trouvés - E2E Construction Maison Dupont

> Date: 2026-04-25
> Scénario: Construction maison individuelle 150m² (chantier complet)
> Méthode: curl J2E + navigateur, module par module

| # | Sévérité | Module | Endpoint/Page | Description | Repro | Fix |
|---|----------|--------|---------------|-------------|-------|-----|
| 1 | low | API | api.opsflux.io | `/openapi.json` et `/docs` désactivés en prod (normal sécurité) | curl https://api.opsflux.io/openapi.json | Aucun (intentionnel) |
| 2 | medium | Routing | /projects | URL `/projects` (anglais) retourne 404; seul `/projets` (FR) fonctionne | naviguer https://app.opsflux.io/projects | Ajouter redirect `/projects` → `/projets` ou supporter les 2 langues |
| 3 | high | Tiers/Dashboard | /tiers | Widget "Vue d'ensemble Tiers" affiche 0 alors que 4 entreprises existent (donut "Entreprises par type" affiche bien 4 Total) | Aller sur /tiers, observer KPI vs donut | Vérifier la query SQL du widget vue-ensemble (probablement filtre incorrect ou cache stale) |
| 4 | high | Tiers/Dashboard | /tiers | Widget "Tiers récents" affiche "Aucune donnée disponible" malgré 4 entreprises existantes | Aller sur /tiers, scroll widget récents | Endpoint `/dashboard/widgets/...` ou query order_by created_at probablement cassé |
| 5 | low | Tiers/Form | Nouvelle entreprise | Placeholders téléphone "+243 ..." (RDC) au lieu de "+33" (France) sur app FR. Idem fax. | Cliquer Nouvelle entreprise sur /tiers | Soit détecter locale, soit utiliser format générique sans préfixe pays |
| 6 | medium | Tiers/UX | Création tier | Pas de polymorphic reopen après création — retour direct à la liste sans ouvrir le détail (incohérent avec spec SmartForm) | Créer une entreprise puis observer comportement | Adopter pattern openDynamicPanel({type:'detail',module:'tiers',id:created.id}) après mutateAsync |
| 7 | medium | Tiers/UX | Création tier | Pas de SmartFormToolbar (Simple/Avancé/Assistant) — formulaire monolithique non aligné avec standard SmartForm | Cliquer Nouvelle entreprise | Wrapper avec SmartFormProvider + SmartFormSection level=essential/advanced |
| 8 | medium | Tiers/Defaults | Détail tier | Fuseau horaire par défaut "Africa/Kinshasa" (RDC) au lieu de "Europe/Paris" pour entité FR | Créer + ouvrir détail | Fixer default tz selon locale entité |
| 9 | low | i18n | Détail tier | Onglet "Conformite" (sans accent) au lieu de "Conformité" | Détail tier → onglets | Corriger la traduction FR (probablement clé manquante → fallback anglais affiché) |
| 10 | high | Conformité/Dashboard | /conformite | KPI "Conformité"=0 alors que "Records par statut"=2. Pattern récurrent (cf #3) | Aller sur /conformite | Auditer toutes les widgets KPI sur les modules — query/agg cassée |
| 11 | low | Conformité/UI | /conformite | Card "Nouvel enregistre..." tronqué (label coupé) | Voir tableau de bord conformité | Augmenter largeur card ou réduire texte du label |
| 12 | medium | Conformité/Matrice | /conformite?tab=matrice | Headers colonnes affichent "—11" sous CERTIFICATION (placeholder cassé au lieu de stats valides/manquants) | /conformite onglet Matrice | Fixer template densité — devrait afficher "X/Y valides" |
| 13 | medium | Projets/i18n | Création projet | Statuts en anglais "Draft/Planned/Active/On hold/Completed/Cancelled" sur app FR | Cliquer Nouveau projet | Traduire les enums status côté SmartForm |
| 14 | medium | Projets/UX | Création projet | "Site/installation" obligatoire — bloque création projet sans site (irréaliste pour projet civil) | Tenter création sans site | Rendre optionnel ou ajouter type "Standalone/Civil" |
| 15 | high | Projets/Refer. | Sélecteur site | Aucun site type "Chantier civil/Construction" — uniquement Oil&Gas (FIXED_PLATFORM, LIVING_QUARTERS, CPF) | Ouvrir dropdown Site sur Nouveau projet | Ajouter types de site génériques + entité de démo civile |
| 16 | medium | Projets/i18n | Sélecteur site | Types affichés en SCREAMING_SNAKE_CASE anglais (FIXED_PLATFORM) | Ouvrir dropdown Site | i18n FR + lowercase humanlike |
| 17 | medium | Projets/i18n | Détail projet | Statut "Draft" en anglais sur fiche | Ouvrir détail projet | i18n |
| 18 | medium | Projets/i18n | Détail projet | Priorité "Medium" en anglais sur fiche | Idem | i18n |
| 19 | low | Projets/i18n | Détail projet | Météo "Sunny" en anglais (devrait être "Ensoleillé" — déjà OK sur dashboard mais pas ici) | Idem | i18n incohérent |
| 20 | critical | Projets/Currency | Détail projet | Budget affiché "285000 XAF" (Franc CFA Afrique Centrale) au lieu d'EUR. Locale entité = AC | Créer projet → budget | Changer devise par défaut entité ou récupérer depuis settings entité |
| 21 | low | Projets/i18n | Détail projet → Tâches | Typo "0 a faire" — manque accent (à) | Voir onglet Tâches | Corriger string FR |
| 22 | medium | Planner/i18n | /planner | Types activités en anglais (project/integrity/workover/event/inspection) sur donut | /planner dashboard | i18n labels enum activity types |
| 23 | high | Papyrus | /papyrus | Numéro document affiché brut "{ENTITY}-{DOCTYPE}-0002" (placeholders non résolus) | Voir documents récents | Résoudre les placeholders côté backend ou format display |
| 24 | medium | Workflows | /workflow | Widget "Par workflow" affiche "Aucune donnée" malgré 9 instances actives | /workflow dashboard | Endpoint widget cassé ou query mal scoped |

## Récap par sévérité

**Critical (1)** : #20 (devise XAF par défaut au lieu d'EUR)

**High (5)** : #3 #4 #10 (KPI/widgets retournant 0 ou vides malgré données réelles), #15 (aucun site civil), #23 (placeholders bruts dans numéros doc)

**Medium (12)** : #2 (404 /projects), #6 #7 (pas de SmartForm/polymorphic reopen sur Tiers), #8 (tz Africa/Kinshasa), #12 #13 #14 #16 #17 #18 #22 #24 (i18n + routing + widgets)

**Low (5)** : #1 #5 #9 #11 #19 #21 (placeholders/typos/troncatures)

## Fix appliqués cette session

- ✅ #21 — Typo "0 a faire" → "à faire" (+ "terminees" → "terminées", "revue" → "en revue") dans `apps/main/src/pages/projets/ProjetsPage.tsx:2326`

## Recommandations priorisées pour la suite

1. **Devise par défaut** (#20) : ajouter colonne `default_currency` à Entity et la passer au front via `/me/entity` ; les schemas backend devraient la lire depuis l'entité courante au lieu du literal "XAF". Migration alembic + seed_service pour mettre EUR/USD selon locale.

2. **KPI widgets cassés** (#3 #4 #10 #24) : auditer les endpoints `/dashboard/widgets/...` — pattern récurrent. Probablement un changement de schéma owner_type/entity_id qui n'a pas été propagé aux widgets dashboard.

3. **i18n statuts/priorités/types** (#13 #16 #17 #18 #22) : auditer tous les `<Select>` qui affichent un enum brut sans passer par un mapping `*_LABELS` traduit.

4. **SmartForm Tiers** (#6 #7) : appliquer le même pattern que Projets (SmartFormProvider + simple/avancé/assistant + polymorphic reopen).

5. **Defaults locale** (#5 #8) : détecter la locale de l'entité et adapter tz + format téléphone.

6. **Routes français/anglais** (#2) : ajouter alias router pour /projects→/projets etc.
