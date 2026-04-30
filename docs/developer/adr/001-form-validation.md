# ADR 001: Form Validation Strategy

- **Status**: Proposed
- **Date**: 2026-04-18
- **Deciders**: TBD
- **Tags**: frontend, forms, validation, dx

## Context

The OPSFLUX frontend currently has **zero usage** of `react-hook-form` + `zod`, despite these libraries being a de facto standard in the modern React ecosystem. Every form in the codebase manages its state with local `useState` hooks, and validation is either ad-hoc (inline `if` checks inside submit handlers) or entirely absent. This situation has several implications:

- Validation logic is duplicated across pages and is inconsistent (some forms block submit, others silently accept bad input — see the recent fix for PAX quota = 0).
- Error messages are rendered in different ways across the app (toasts, inline text, nothing at all).
- There is no single source of truth for the shape of a form's data, which complicates refactoring and typing.
- We occasionally reference "RHF + Zod" in discussions and PR reviews as if it were a convention, which is misleading since no form actually uses it.

A decision is needed to align the team on a single path so new forms are written consistently and existing ones can be migrated (or not) on purpose.

## Decision

**To be decided.** Three options are on the table:

- **Option A** — Adopt `react-hook-form` + `zod` progressively for all new forms; migrate existing forms opportunistically when they are touched for other reasons.
- **Option B** — Formally acknowledge that `useState` + inline validation is the project standard. Document the pattern (possibly with a small shared helper) and stop referring to RHF/Zod as a convention.
- **Option C** — A lightweight middle ground: ship an in-house `validateField(value, rules)` helper together with typed form state types (`FormState<T>`, `FormErrors<T>`), without introducing any external library.

## Consequences

- **Option A** — Higher initial learning curve and a new dependency, but best long-term DX, type safety, and consistency. Migration debt will linger for months.
- **Option B** — Zero migration cost and no new deps, at the price of accepting that validation will remain inconsistent and that every form reinvents its own wheel. Documentation must be strict to avoid drift.
- **Option C** — Moderate investment up front (writing and maintaining the helper). Gives consistency without external deps, but risks reinventing a subset of RHF/Zod poorly.

## Implementation Plan

- **If Option A**: add `react-hook-form` and `zod` to `package.json`; write a reference form (e.g. scenario creation); document the pattern in `docs/frontend/forms.md`; add an ESLint rule (or code-review checklist) to require RHF for new forms.
- **If Option B**: write `docs/frontend/forms.md` describing the `useState` pattern with a canonical example; optionally ship a `useFormState<T>` helper in `src/hooks/`; remove references to RHF/Zod in CONTRIBUTING and PR templates.
- **If Option C**: implement `src/lib/validation.ts` exposing `validateField` and `FormState<T>` types; refactor one existing form as the reference implementation; document usage.
