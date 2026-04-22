"""Batch-migrate Create panels from FormSection → SmartFormSection.

Generic migration with minimal contextual help (description only, keyed on
auto-derived i18n keys). Run per-file; prints what it did so you can spot-check.

Safe to re-run — detects files already migrated (SmartFormProvider present).
"""

import re
import sys
from pathlib import Path


def migrate(path: Path) -> None:
    src = path.read_text(encoding="utf-8")

    if "SmartFormProvider" in src:
        print(f"SKIP {path.name}: already migrated")
        return

    if "<FormSection" not in src:
        print(f"SKIP {path.name}: no FormSection found")
        return

    # 1. Fix imports — pull FormSection out, inject SmartForm block.
    imp_re = re.compile(
        r"import \{([^}]*)\} from '@/components/layout/DynamicPanel'",
        re.S,
    )
    m = imp_re.search(src)
    if not m:
        print(f"SKIP {path.name}: DynamicPanel import not found")
        return
    imp_content = m.group(1)
    cleaned = [
        it.strip() for it in imp_content.split(",") if it.strip() and "FormSection" not in it
    ]
    new_imports = (
        "import { " + ", ".join(cleaned) + " } from '@/components/layout/DynamicPanel'\n"
        "import {\n"
        "  SmartFormProvider,\n"
        "  SmartFormSection,\n"
        "  SmartFormToolbar,\n"
        "  SmartFormSimpleHint,\n"
        "  SmartFormWizardNav,\n"
        "  SmartFormInlineHelpDrawer,\n"
        "  useSmartForm,\n"
        "} from '@/components/layout/SmartForm'"
    )
    src = src[: m.start()] + new_imports + src[m.end() :]

    # 2. Wrap the exported component function.
    # Pattern: export function <Name>() {  →  export + wrapper + Inner
    comp_re = re.compile(r"export function (\w+)\(\) \{\n")
    mc = comp_re.search(src)
    if not mc:
        print(f"SKIP {path.name}: exported function signature not found")
        return
    name = mc.group(1)
    inner_name = name.replace("Panel", "Inner") if name.endswith("Panel") else f"{name}Inner"
    panel_id = re.sub(r"(?<!^)(?=[A-Z])", "-", name).lower().replace("-panel", "")
    wrapper = (
        f"export function {name}() {{\n"
        f"  return (\n"
        f"    <SmartFormProvider panelId=\"{panel_id}\" defaultMode=\"simple\">\n"
        f"      <{inner_name} />\n"
        f"    </SmartFormProvider>\n"
        f"  )\n"
        f"}}\n\n"
        f"function {inner_name}() {{\n"
        f"  const _ctx = useSmartForm()\n"
    )
    src = src[: mc.start()] + wrapper + src[mc.end() :]

    # 3. Swap each <FormSection title={...}> → SmartFormSection with id from title.
    def repl_open(m: re.Match) -> str:
        attrs = m.group(1) or ""
        # Extract title={...} value
        tm = re.search(r"title=\{([^}]+?)\}", attrs)
        title_expr = tm.group(1) if tm else "'Section'"
        # Derive an id from the title expression — stable hash of the raw source.
        slug_base = re.sub(r"\W+", "_", title_expr).strip("_")[:40]
        slug = slug_base.lower() or f"section_{abs(hash(title_expr)) % 100000}"
        # Preserve collapsible / defaultExpanded attributes if present.
        extras: list[str] = []
        if "collapsible" in attrs:
            extras.append("collapsible")
        dm = re.search(r"defaultExpanded=\{(true|false)\}", attrs)
        if dm:
            extras.append(f"defaultExpanded={{{dm.group(1)}}}")
            # Non-expanded default = assume "advanced/skippable"
            level = "advanced" if dm.group(1) == "false" else "essential"
        else:
            level = "essential"
        skippable = ' skippable' if level == 'advanced' else ''
        extra_str = (" " + " ".join(extras)) if extras else ""
        help_expr = f"{{{{ description: {title_expr} }}}}"
        return (
            f"<SmartFormSection id=\"{slug}\" title={{{title_expr}}} "
            f"level=\"{level}\"{skippable}{extra_str} help={help_expr}>"
        )

    # Match a full <FormSection ...> opener (single-line only; Create panels use single-line).
    src = re.sub(r"<FormSection([^>]*?)>", repl_open, src)
    src = src.replace("</FormSection>", "</SmartFormSection>")

    # 4. Insert toolbar + hint + drawer at the top of PanelContentLayout.
    src = re.sub(
        r"<PanelContentLayout>\s*\n",
        "<PanelContentLayout>\n        <SmartFormToolbar />\n        <SmartFormSimpleHint />\n        <SmartFormInlineHelpDrawer />\n",
        src,
        count=1,
    )

    # 5. Inject wizard nav right before </PanelContentLayout>.
    src = re.sub(
        r"(\s*)</PanelContentLayout>",
        "\\1{_ctx?.mode === 'wizard' && (\n"
        "\\1  <SmartFormWizardNav\n"
        "\\1    onSubmit={() => document.querySelector('form')?.requestSubmit()}\n"
        "\\1    onCancel={() => {}}\n"
        "\\1  />\n"
        "\\1)}\n"
        "\\1</PanelContentLayout>",
        src,
        count=1,
    )

    path.write_text(src, encoding="utf-8", newline="\n")
    n = src.count("<SmartFormSection")
    print(f"OK {path.name} — {n} SmartFormSection block(s)")


if __name__ == "__main__":
    for arg in sys.argv[1:]:
        migrate(Path(arg))
