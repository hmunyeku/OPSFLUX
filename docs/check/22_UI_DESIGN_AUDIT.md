# Audit UI / Design OpsFlux — grille `frontend-design` — 2026-04-20

Application des critères du skill officiel Anthropic `frontend-design`
(lu depuis `C:/Users/matth/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`).

**Précaution de lecture :** la grille `frontend-design` est pensée pour des interfaces marketing / consumer qui doivent être mémorables. OpsFlux est un ERP opérations pétrolières qui priorise densité d'information et fiabilité. Les recommandations ci-dessous pondèrent les deux.

## 1. Typographie

**SKILL.md :** *"Avoid generic fonts like Arial and Inter; opt instead for distinctive choices"*

| Constat | État |
|---|---|
| Police principale : **Inter** (index.css:142, WidgetCard, etc.) | ⚠️ cliché AI |
| Aucune police display / hero pour les titres | ❌ monotone |
| Fallback stack solide (-apple-system, Segoe UI, …) | ✅ |
| Imports via Google Fonts CSS (Inter 400-800) | ✅ perfs OK |
| PDF / signatures Arial hardcodé | 🟡 acceptable (portabilité PDF) |

**Proposition P2 (optionnelle, mesurée)** :
Pairer Inter (body, conservé pour lisibilité ERP) avec une police display caractéristique pour les **H1/H2 des pages d'accueil et des dashboards** uniquement. Options cohérentes avec l'univers oil&gas / industriel :
- **Space Grotesk** → trop vu (SKILL.md le cite explicitement à éviter)
- **Archivo** → bon compromis industriel / techno
- **JetBrains Mono** pour codes/IDs/numéros (déjà implicite via `font-mono`)
- **Unbounded** pour titres de landing (vitrine uniquement)

**Risque** : réduire la cohérence ERP si mal dosé — cantonner aux dashboards et landing.

## 2. Couleurs & Thème

**SKILL.md :** *"Commit to a cohesive aesthetic. Dominant colors with sharp accents outperform timid, evenly-distributed palettes"*

Palette active (`index.css`) :
- `--primary: 217 73% 46%` = bleu ~`#1E40AF` (light) / `217 73% 62%` = `#4D78E8` (dark)
- Pas d'accent secondaire défini — système 100 % bleu + greys
- Thème dark propre, contrasté

| Constat | État |
|---|---|
| Une couleur primaire, pas d'accent secondaire | 🟡 timide |
| 60 usages de `purple-/violet-/indigo-` sur 29 fichiers | ⚠️ à sampler |
| Dark mode : cohérent | ✅ |
| Couleurs sémantiques (success/warning/danger) | ✅ via Tailwind `emerald/amber/red` |

**Gap :** *pas d'accent secondaire dédié.* En pratique le code retombe sur `purple/violet/indigo` pour marquer des cas spéciaux — 60 hits c'est le signe d'une palette incomplète que chaque dev complète au feeling.

**Proposition P2** : ajouter un `--accent` officiel (p.ex. `24 95% 55%` = ambre vif) pour les badges « premium » / « hotline » / événements — et supprimer les purple locaux. Coût ~1 PR, gain de cohérence visible.

## 3. Motion & micro-interactions

**SKILL.md :** *"Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals"*

| Constat | État |
|---|---|
| 80 `animate-` / `transition-` dans `components/layout` seul | ✅ densité correcte |
| `AssistantPanel` : `slide-in-from-right duration-200` | ✅ bon |
| Pas de staggered reveals au premier login ni sur listes | 🔴 aucun moment « wow » |
| Motion library (`framer-motion` / `motion/react`) absente | 🟡 transitions Tailwind CSS-only |
| Hover states sur les cards dashboard | ✅ présents |

**Proposition P1** : au **1er login**, animer l'arrivée de la sidebar + topbar + dashboard widgets en stagger (~50 ms entre items). Coût faible via `animation-delay` CSS, impact visible immédiatement.

**Proposition P2** : installer `framer-motion` et l'utiliser sur Dashboard et MOCStepper pour une transition plus soyeuse.

## 4. Composition spatiale

**SKILL.md :** *"Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density"*

OpsFlux → **layout Pajamas 5-zones** ultra-classique :
```
┌─────────────────────────────────┐
│           Topbar                │
├────┬────────────────────────────┤
│ SB │ Static panel │ Dynamic     │
│    │              │ panel       │
└────┴──────────────┴─────────────┘
```

| Constat | État |
|---|---|
| Layout prévisible (sidebar + topbar + content + panel) | ⚠️ AI-slop pattern |
| Aucune asymétrie / diagonale | n/a (ERP) |
| Densité contrôlée — texte 10-12 px, paddings 2-3 | ✅ intentionnel |
| Gutter uniforme sur toutes les pages | ✅ cohérent |
| Dashboard widgets : grille classique 12 colonnes | 🟡 pourrait être plus daring |

**Verdict contextuel :** pour un ERP opérationnel, le layout classique est un **choix** (pas une lâcheté). Un user fait 50 tâches/jour dedans, il doit retrouver ses repères. On ne va pas casser la grille.

**Proposition P3** : sur la **landing publique** (`apps/vitrine/`) et la **page login**, lâcher les chevaux (asymétrie, gradient mesh, animation d'arrivée). C'est la vitrine, elle peut se permettre d'être mémorable.

## 5. Backgrounds & détails visuels

**SKILL.md :** *"Create atmosphere and depth rather than defaulting to solid colors. Gradient meshes, noise textures, geometric patterns, dramatic shadows"*

| Constat | État |
|---|---|
| `--background: 100%` (blanc pur light) | 🟡 plat |
| Dark mode : `222 28% 7%` (bleu nuit) | ✅ bon |
| 1 radial-gradient détecté (`AdsBoardingScanPage`) | ✅ joli |
| Pas de noise texture, pas de grain | 🔴 manque d'âme |
| Shadows Tailwind `shadow-sm` / `shadow-lg` classiques | 🟡 OK ERP, plat |
| Pas de dégradés mesh / patterns géométriques | 🔴 |

**Proposition P1 low-risk** : ajouter un **subtle noise overlay** (PNG inline 64×64 répété à 3 % d'opacité) sur le body — donne de la matière sans casser la lisibilité. 1 ligne CSS.

```css
body {
  background-image:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><filter id='n'><feTurbulence baseFrequency='0.9'/></filter><rect width='64' height='64' filter='url(%23n)' opacity='0.03'/></svg>");
}
```

## 6. AI-slop indicators (checklist `frontend-design`)

| Cliché à éviter | OpsFlux |
|---|---|
| Inter ou Roboto | ❌ Inter |
| Purple gradients sur blanc | 🟡 60 usages à auditer |
| Predictable sidebar + topbar | ⚠️ choix assumé pour ERP |
| Space Grotesk | ✅ absent |
| Emojis décoratifs random | ✅ absents |
| Card-heavy dashboard | ⚠️ dashboard widget = cards → classique |
| Lucide icons par défaut | 🟡 utilisé partout — pas un problème, c'est une lib reconnue |

## 7. Plan d'action frontend-design

### P1 — gains rapides, cohérents avec l'ERP
1. **Noise overlay subtil** sur `body` (1 ligne CSS, `index.css`)
2. **Stagger animation** au premier login (sidebar → topbar → content → dashboard widgets, 50 ms delay)
3. **Couleur accent secondaire** officielle (`--accent: 24 95% 55%`) + suppression des `purple-*` locaux

### P2 — polish typographique
4. **Police display** pour H1/H2 des dashboards & pages d'accueil (Archivo ou Unbounded)
5. Installation **`motion/react`** pour transitions riches (Dashboard, MOCStepper, DynamicPanel slide)

### P3 — vitrine / landing
6. Relooking de `apps/vitrine/` avec asymétrie, gradient mesh, animations hero
7. Relooking de la `LoginPage` (dégradé mesh, typographie plus présente)

---

## 8. Ce qui est déjà bon

- ✅ Dark mode complet (vs. beaucoup d'apps qui l'ajoutent en afterthought)
- ✅ Micro-interactions denses (80+ animations)
- ✅ CSS variables pour la couleur (théming propre)
- ✅ Lucide icons cohérents
- ✅ Tailwind pour la densité — réduit le coût de cohérence
- ✅ Composants réutilisables (DataTable, DynamicPanel, DetailFieldGrid)

## 9. Précaution

Le skill `frontend-design` est un **guide pour créer** des interfaces mémorables. OpsFlux est un ERP — la mémorabilité n'est PAS un objectif prioritaire. Les propositions P1-P3 ci-dessus sont **soit neutres** (noise overlay), **soit cantonnées aux zones non-opérationnelles** (vitrine, login), **soit cohérentes avec la densité ERP** (accent color officiel, animations de premier login).

Ne pas tout appliquer — choisir 1 ou 2 items qui font sens pour le positionnement produit auprès de Perenco.
