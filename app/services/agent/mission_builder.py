"""Generate the MISSION.md briefing given to the agent container.

The file is rendered server-side from the ticket + agent configuration,
stored on the `SupportAgentRun.mission_md_content` column, then written
into the worktree by the worker daemon at container launch time.

Kept readable and declarative — anyone can inspect `mission_md_content`
on a failed run to understand what the agent was told.
"""
from __future__ import annotations

from typing import Any

from app.models.agent import SupportAgentConfig, SupportAgentRun
from app.models.support import SupportTicket


_DEFAULT_FORBIDDEN_PATHS = [
    "**/migrations/**",
    "**/auth/**",
    "**/rbac/**",
    "**/permissions/**",
    "**/cost_centers/**",
    "**/imputations/**",
    "**/secrets/**",
    ".env*",
    "**/deploy-prod.yml",
    "**/production/**",
]


def build_mission_md(
    *,
    ticket: SupportTicket,
    run: SupportAgentRun,
    config: SupportAgentConfig | None,
    github_repo: dict[str, Any],
    recent_comments: list[dict[str, Any]] | None = None,
    retry_ci_context: dict[str, Any] | None = None,
    attachments_manifest: list[dict[str, Any]] | None = None,
) -> str:
    """Assemble the MISSION.md for this run.

    Arguments:
        ticket: canonical `SupportTicket` row.
        run: persisted `SupportAgentRun` row (reads `deployment_mode`,
            `autonomy_mode`, budgets from the runner config).
        config: per-entity `SupportAgentConfig` — forbidden paths and
            `max_lines_modified_per_run` come from here.
        github_repo: `{"owner": str, "name": str, "default_branch": str}`
            extracted from the GitHub connector config.
        recent_comments: optional last N ticket comments to give the
            agent more context.
    """
    forbidden = (
        config.forbidden_path_patterns if config and config.forbidden_path_patterns
        else _DEFAULT_FORBIDDEN_PATHS
    )
    max_lines = config.max_lines_modified_per_run if config else 500

    comments_md = ""
    if recent_comments:
        comments_md = "\n\n### Commentaires récents\n"
        for c in recent_comments[-5:]:
            author = c.get("author_name") or c.get("author_id", "?")
            comments_md += f"\n- **@{author}** — {c.get('body', '')[:500]}"

    # Attachments section — the worker daemon pre-downloads each file
    # into /workspace/.attachments/<filename> before launching the
    # container, so the agent can read/view them directly.
    attachments_md = ""
    if attachments_manifest:
        lines = ["\n\n### Pièces jointes\n"]
        lines.append(
            "Les fichiers ci-dessous ont été copiés dans "
            "`/workspace/.attachments/` — utilise le tool Read ou View "
            "pour les inspecter (utile pour les captures d'écran de bugs "
            "visuels).\n"
        )
        for a in attachments_manifest:
            fname = a.get("filename", "?")
            orig = a.get("original_name") or fname
            ctype = a.get("content_type", "")
            size_kb = (a.get("size_bytes") or 0) // 1024
            source = a.get("source", "ticket")
            desc = a.get("description") or ""
            desc_suffix = f" — _{desc}_" if desc else ""
            lines.append(
                f"- `/workspace/.attachments/{fname}` "
                f"(**{orig}**, {ctype}, {size_kb} KB, source: {source})"
                f"{desc_suffix}"
            )
        attachments_md = "\n".join(lines)

    forbidden_md = "\n".join(f"  - `{p}`" for p in forbidden)

    default_branch = github_repo.get("default_branch") or "main"
    branch_name = f"agent-fix/ticket-{ticket.reference}"

    # If this is a CI-fix retry, continue on the same branch and focus
    # narrowly on making the failing checks green. Override the default
    # "create a new branch" instructions further down.
    retry_section = ""
    retry_branch_override = None
    if retry_ci_context:
        parent_run_id = retry_ci_context.get("parent_run_id", "?")
        parent_branch = retry_ci_context.get("parent_branch")
        parent_pr = retry_ci_context.get("parent_pr_number")
        failed_checks = retry_ci_context.get("failed_checks") or []
        logs_excerpt = retry_ci_context.get("logs_excerpt") or ""
        if parent_branch:
            retry_branch_override = parent_branch
        checks_md = "\n".join(
            f"  - **{c.get('name', '?')}** ({c.get('conclusion', '?')}) — {c.get('details_url', '')}"
            for c in failed_checks[:10]
        )
        retry_section = f"""

## ⚠ MODE: CI FIX (retry run)

Ce run est un retry du run précédent `{parent_run_id}` dont la PR a
produit des checks CI en **échec**. Tu dois :

1. **Checkout** la branche existante `{parent_branch}` (ne PAS en
   créer une nouvelle).
2. **Analyser** les logs d'échec ci-dessous, identifier la cause de
   chaque check rouge.
3. **Corriger** en modifiant le minimum de lignes supplémentaires.
4. **Commit + push** sur la même branche — la PR #{parent_pr} sera
   mise à jour automatiquement, pas besoin d'en créer une nouvelle.

### Checks en échec
{checks_md or "  _(détail indisponible)_"}

### Extrait des logs (tronqué)

```
{logs_excerpt[:4000]}
```

Concentre-toi UNIQUEMENT sur faire passer ces checks. N'ajoute pas
de nouvelles fonctionnalités. Si tu ne peux pas corriger en moins
de {max_lines} lignes supplémentaires, termine proprement avec
`status: "partial"` et `failure_reason: "CI_FIX_REQUIRES_HUMAN"`.
"""

    return f"""# Mission : Résolution du ticket OPSFLUX {ticket.reference}

Tu es un agent de maintenance logicielle autonome. Ta mission est de
diagnostiquer puis corriger le bug signalé dans le ticket ci-dessous en
produisant une Pull Request GitHub sur le dépôt
`{github_repo.get("owner")}/{github_repo.get("name")}`.

## Métadonnées du run

- Run ID : `{run.id}`
- Mode d'autonomie : `{run.autonomy_mode}`
- Mode de déploiement prévu : `{run.deployment_mode}`
- Branche de départ : `{retry_branch_override or default_branch}`
- Branche à {"continuer" if retry_branch_override else "créer"} : `{retry_branch_override or branch_name}`{retry_section}

## Ticket

### Référence / Titre
**{ticket.reference}** — {ticket.title}

### Type / Priorité
- Type : `{ticket.ticket_type}`
- Priorité : `{ticket.priority}`

### Description
{ticket.description or "_(pas de description fournie)_"}

{comments_md}
{attachments_md}

## Contraintes impératives

### Scope
- Tu travailles dans `/workspace`, worktree git isolé.
- Tu DOIS créer la branche `{branch_name}` depuis `{default_branch}`.
- Maximum **{max_lines} lignes modifiées** au total sur la PR.
- Pas de refactoring massif. Concentre-toi strictement sur le bug.
- Pas de modifications cosmétiques non liées.

### Fichiers INTERDITS à la modification
Sous aucun prétexte tu ne dois toucher aux chemins suivants :
{forbidden_md}

### Sécurité
- Si tu détectes une vulnérabilité → écris `SECURITY_ISSUE_DETECTED`
  dans `/workspace/REPORT.json` et ARRÊTE immédiatement.
- Ne jamais exposer de secret (token, clé, mot de passe) dans les logs,
  les commits ou la description de PR.

### Accès réseau
Tu n'as accès qu'à : `api.github.com`, `api.anthropic.com` /
`api.openai.com`, et les registres de paquets standards (npm, pypi).

## Phases à exécuter

1. **Reproduction** — Écris un test qui échoue, prouvant le bug.
2. **Diagnostic** — Identifie la cause racine, écris ton analyse dans
   `/workspace/DIAGNOSIS.md`.
3. **Correction** — Applique la modification minimale nécessaire. Le
   test de reproduction passe. Les tests existants passent toujours.
   Linter et type-checker passent.
4. **Pull Request** — Commit conventionnel, push, crée la PR **en draft**
   avec `gh pr create --draft --base {default_branch}`.

## Livrable OBLIGATOIRE à la fin

Tu DOIS écrire `/workspace/REPORT.json` avec exactement ce schéma :

```json
{{
  "status": "success" | "partial" | "failed",
  "failure_reason": null | "UNABLE_TO_REPRODUCE" | "FIX_BREAKS_EXISTING_TESTS" | "SECURITY_ISSUE_DETECTED" | "OUT_OF_SCOPE" | "BUDGET_EXCEEDED" | "OTHER",
  "phases_completed": ["reproduction", "diagnosis", "fix", "pr_created"],
  "root_cause": "…",
  "files_modified": [{{"path": "…", "lines_added": N, "lines_removed": N, "purpose": "…"}}],
  "tests_added": [{{"path": "…", "name": "…"}}],
  "pr": {{"number": N, "url": "…", "branch": "{branch_name}", "commit_sha": "…"}},
  "metrics": {{"total_tokens_used": N, "wall_time_seconds": N, "iterations_required": N}},
  "reasoning_summary": "2-3 phrases",
  "warnings": [],
  "next_steps_recommended": []
}}
```

Si `status != "success"`, `pr` et `files_modified` peuvent être vides
mais `failure_reason` DOIT être renseigné.

## Règles de sortie stricte

- JAMAIS `rm -rf`, `sudo`, `curl` vers une URL externe non-autorisée
- JAMAIS modifier hors de `/workspace`
- JAMAIS committer de secrets
- Si tu atteins 80% du budget tokens → termine proprement la phase en
  cours, écris le REPORT.json avec `status: "partial"`, ARRÊTE

Agent-Run-Trailer : `Agent-Run: {run.id}` (à inclure dans le message de commit)
"""
