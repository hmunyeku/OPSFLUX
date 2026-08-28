"""
Test de régression pour SUP-0064 : ProjectPicker dropdown clipping

Ce test documente le fix du bug où le dropdown du ProjectPicker était
invisible ou tronqué dans les panels dynamiques à cause du clipping par
le container parent (overflow).

Bug: Le dropdown utilisait position absolute sans createPortal, donc était
     clippé par les containers parents ayant overflow: hidden/auto
Fix: Utilisation de createPortal pour rendre le dropdown dans le DOM racine

Ce test vérifie que le code du ProjectPicker utilise createPortal comme
les autres pickers (AssetPicker, MapPicker, EntityPickerBase).
"""
import re
from pathlib import Path


def test_project_picker_uses_create_portal():
    """
    Vérifie que le dropdown du ProjectPicker utilise createPortal
    pour éviter le clipping par les containers parents.

    Régression: SUP-0064
    """
    project_picker_path = Path(__file__).parent.parent / 'apps' / 'main' / 'src' / 'components' / 'shared' / 'ProjectPicker.tsx'

    assert project_picker_path.exists(), f"ProjectPicker.tsx not found at {project_picker_path}"

    content = project_picker_path.read_text()

    # Vérifier l'import de createPortal depuis react-dom
    assert "createPortal" in content, "createPortal must be imported from react-dom"
    assert re.search(r"import.*\{[^}]*createPortal[^}]*\}.*from\s+['\"]react-dom['\"]", content), \
        "createPortal must be imported from 'react-dom'"

    # Vérifier que createPortal est utilisé pour le dropdown
    # Pattern: createPortal( ... dropdown content ... )
    assert "createPortal(" in content, "createPortal must be used to render the dropdown"

    # Vérifier que le dropdown utilise 'fixed' positioning (requis avec createPortal)
    # et non 'absolute' seul
    dropdown_section = re.search(r'createPortal\([^)]*<div[^>]*className="[^"]*fixed[^"]*"', content, re.DOTALL)
    assert dropdown_section, \
        "Dropdown rendered via createPortal must use 'fixed' positioning, not 'absolute'"


def test_project_picker_button_has_ref():
    """
    Vérifie que le trigger button du ProjectPicker a un ref
    pour calculer la position du dropdown.

    Requis pour createPortal avec fixed positioning.
    """
    project_picker_path = Path(__file__).parent.parent / 'apps' / 'main' / 'src' / 'components' / 'shared' / 'ProjectPicker.tsx'

    assert project_picker_path.exists(), f"ProjectPicker.tsx not found at {project_picker_path}"

    content = project_picker_path.read_text()

    # Vérifier qu'il y a un useRef pour le button
    assert re.search(r'const\s+buttonRef\s*=\s*useRef', content), \
        "buttonRef useRef must be defined to track button position"

    # Vérifier que le button utilise le ref
    assert re.search(r'<button[^>]*ref=\{buttonRef\}', content), \
        "Trigger button must use buttonRef to enable position calculation"


def test_project_picker_calculates_dropdown_position():
    """
    Vérifie que le ProjectPicker calcule la position du dropdown
    avec getBoundingClientRect() comme AssetPicker.
    """
    project_picker_path = Path(__file__).parent.parent / 'apps' / 'main' / 'src' / 'components' / 'shared' / 'ProjectPicker.tsx'

    assert project_picker_path.exists(), f"ProjectPicker.tsx not found at {project_picker_path}"

    content = project_picker_path.read_text()

    # Vérifier l'utilisation de getBoundingClientRect
    assert "getBoundingClientRect" in content, \
        "ProjectPicker must calculate dropdown position using getBoundingClientRect()"

    # Vérifier qu'il y a un state pour dropdownPosition
    assert re.search(r'dropdownPosition', content), \
        "ProjectPicker must track dropdown position in state"
