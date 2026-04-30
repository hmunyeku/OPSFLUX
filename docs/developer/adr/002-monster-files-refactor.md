# ADR 002: Refactor Strategy for "Monster" Page Files

- **Status**: Proposed
- **Date**: 2026-04-18
- **Deciders**: TBD
- **Tags**: frontend, refactor, maintainability, tech-debt

## Context

Five page files in the frontend have grown beyond any reasonable size and are now actively hurting productivity:

| File                  | Lines |
| --------------------- | ----- |
| `PaxLogPage.tsx`      | 6101  |
| `PlannerPage.tsx`     | 5374  |
| `ProjetsPage.tsx`     | 4615  |
| `TravelWizPage.tsx`   | 3959  |
| `ConformitePage.tsx`  | 3290  |

Together they represent ~23,000 lines concentrated in five files. Symptoms:

- **Unmaintainable** — navigating them in an editor is painful; IDE features (go-to-definition, rename) become sluggish or misleading.
- **Slow to compile** — incremental rebuilds on these files dominate HMR latency.
- **Risky to refactor** — the blast radius of any change is enormous, since everything is in one module-level closure and state is shared implicitly.
- **Review cost** — PRs touching these files are hard to review; reviewers miss regressions.
- **Merge conflicts** — concurrent work on different tabs of the same page produces near-guaranteed conflicts.

Some detail panels have already been extracted (a partial precedent exists for `ProjetsPage`), confirming the approach is viable.

## Decision

**To be decided** — proposed strategy below.

Split each monster page along its natural internal seams:

1. **Split by tab** — every tab content block becomes its own file, colocated under the page's folder. Example:
   ```
   src/pages/ProjetsPage/
     ProjetsPage.tsx            // thin orchestrator: routing, tab state, shared context
     tabs/
       Dashboard.tsx
       Projets.tsx
       Kanban.tsx
       Gantt.tsx
     panels/
       TaskDetailPanel.tsx
       ProjectDetailPanel.tsx
     hooks/
       useProjetsState.ts
   ```
2. **Extract detail panels / drawers / modals** — already started for some panels; generalize to every page.
3. **Keep the main page as a thin router/orchestrator** — owns tab state, shared data fetching, and layout; delegates rendering to children.
4. **Lift shared state into hooks** — when multiple tabs need the same data, extract a `use<Page>State` hook rather than prop-drilling.

## Consequences

### Positive
- Dramatic reduction in per-file line count; each file fits in a single editor screen mentally.
- Faster HMR and type-checking on the touched file.
- Fewer merge conflicts (teammates can work on different tabs in parallel).
- Easier code review: PRs naturally scope to one tab or one panel.
- Makes future rewrites (e.g. a new tab) a drop-in, not a surgery.

### Negative
- Short-term churn and risk during migration; bugs are possible if shared state is missed.
- More files to navigate (mitigated by consistent folder structure).
- Import paths get slightly deeper.

## Implementation Plan

### Phase 1 — Audit & Plan (1-2 days total)
For each of the five files, produce a short plan document listing:
- Tab boundaries and current line ranges
- Detail panels / modals to extract
- Shared state that must be lifted
- Target folder structure
- Risk areas (e.g. tightly coupled refs, global side-effects)

### Phase 2 — Migrate, one file at a time (1-2 days per file)
- Create the folder structure
- Move tab content file-by-file, keeping behavior identical (no functional changes during split)
- Lift shared state into a `use<Page>State` hook
- Commit each tab extraction separately for easy review and revert
- Recommended order (lowest risk first): `ConformitePage` → `TravelWizPage` → `ProjetsPage` → `PlannerPage` → `PaxLogPage`

### Phase 3 — Verify in production after each file
- Deploy the refactor for one page before starting the next
- Monitor for regressions for ~48h (Sentry, user reports)
- Only then move to the next monster file

**Total estimated effort**: 8-12 working days spread over 4-6 weeks to allow for production soak time between pages. No new features should land in a file being refactored until Phase 3 is complete for that page.
