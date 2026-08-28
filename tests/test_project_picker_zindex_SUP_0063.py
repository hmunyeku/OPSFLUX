"""
Test de régression pour SUP-0063 : z-index du dropdown ProjectPicker

Ce test documente le fix du bug où le dropdown du ProjectPicker était
masqué derrière les panels dynamiques à cause d'un z-index insuffisant.

Bug: Le dropdown utilisait z-50 (~50) alors que les panels utilisent z-index >= 1001
Fix: Changement de z-50 à z-[9999] pour garantir la visibilité au-dessus des panels

Ce test vérifie que le code CSS du ProjectPicker contient le z-index correct.
"""
import re
from pathlib import Path


def test_project_picker_dropdown_has_high_zindex():
    """
    Vérifie que le dropdown du ProjectPicker a un z-index suffisamment élevé
    pour s'afficher au-dessus des panels dynamiques (z-index 1000+).

    Régression: SUP-0063
    """
    project_picker_path = Path(__file__).parent.parent / 'apps' / 'main' / 'src' / 'components' / 'shared' / 'ProjectPicker.tsx'

    assert project_picker_path.exists(), f"ProjectPicker.tsx not found at {project_picker_path}"

    content = project_picker_path.read_text()

    # Chercher le dropdown avec la classe z-[9999] ou un z-index très élevé
    # Pattern: className contient "absolute" et "z-[9999]" (ou z-[valeur >= 9000])
    dropdown_pattern = r'className="[^"]*absolute[^"]*z-\[(\d+)\][^"]*"[^>]*>[^<]*{/\*\s*Dropdown\s*\*/}'

    # Alternative: chercher juste la présence de z-[9999] dans la section du dropdown
    dropdown_section = re.search(r'{/\*\s*Dropdown\s*\*/}.*?<div className="[^"]*absolute[^"]*z-\[(\d+)\]', content, re.DOTALL)

    assert dropdown_section, "Dropdown section not found in ProjectPicker.tsx"

    zindex = int(dropdown_section.group(1))

    # Le z-index doit être supérieur à 1000 (z-index max des panels)
    # et idéalement >= 9999 pour être sûr
    assert zindex >= 1000, f"Dropdown z-index ({zindex}) is too low - must be >= 1000 to appear above dynamic panels"
    assert zindex >= 9999, f"Dropdown z-index ({zindex}) should be >= 9999 for maximum safety (current best practice)"


def test_project_picker_file_structure():
    """
    Test de santé basique : vérifie que le fichier ProjectPicker existe
    et contient les éléments clés.
    """
    project_picker_path = Path(__file__).parent.parent / 'apps' / 'main' / 'src' / 'components' / 'shared' / 'ProjectPicker.tsx'

    assert project_picker_path.exists(), "ProjectPicker.tsx must exist"

    content = project_picker_path.read_text()

    # Vérifications basiques de structure
    assert 'export function ProjectPicker' in content, "ProjectPicker export not found"
    assert 'Dropdown' in content, "Dropdown section not found"
    assert 'absolute' in content, "Dropdown should use absolute positioning"
