# 30 Route Permission Matrix

Date: 2026-04-03

## 1. Objet

Cartographier les familles de routes et les permissions attendues.

## 2. PaxLog

- lecture AdS: `paxlog.ads.read`
- création AdS: `paxlog.ads.create`
- mise à jour AdS: `paxlog.ads.update`
- validation AdS: permission de validation dédiée ou combinaison métier
- lecture AVM: `paxlog.avm.read`
- création AVM: `paxlog.avm.create`
- mise à jour AVM: `paxlog.avm.update`

## 3. Planner

- lecture activité: `planner.activity.read`
- écriture activité: `planner.activity.update` / `create`
- lecture conflits: `planner.conflict.read`
- arbitrage capacité: permission dédiée

## 4. TravelWiz

- lecture voyage: `travelwiz.voyage.read`
- écriture voyage: `travelwiz.voyage.update`
- lecture manifeste: `travelwiz.manifest.read`
- écriture manifeste: `travelwiz.manifest.update`
- lecture cargo: `travelwiz.cargo.read`
- écriture cargo: `travelwiz.cargo.update`

## 5. Dashboard

- lecture dashboard: `dashboard.read`
- personnalisation: `dashboard.customize`
- administration: `dashboard.admin`

## 6. Workflow

- lire définitions: `workflow.definition.read`
- créer définition: `workflow.definition.create`
- modifier définition: `workflow.definition.update`
- exécuter transition: dépend du workflow + permission métier

## 7. Polymorphes

- routes polymorphes héritent du parent, pas de permission autonome isolée
