#!/usr/bin/env python3
"""
Script de test pour la generation de cles API.
Teste la generation, le hash, et le format des cles.

Usage:
    uv run python test_api_key_generation.py
"""

import hashlib
import secrets


def generate_api_key() -> tuple[str, str, str]:
    """
    Generate API key with format: ofs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

    Returns:
        tuple[str, str, str]: (full_key, key_hash, key_prefix)
    """
    # Generer 32 caracteres aleatoires securises
    random_part = secrets.token_urlsafe(32)[:32]

    # Prefixe pour identifier les cles OpsFlux
    prefix = "ofs_"
    full_key = f"{prefix}{random_part}"

    # Hash pour stockage securise (SHA256)
    key_hash = hashlib.sha256(full_key.encode()).hexdigest()

    # Prefixe pour affichage (ex: "ofs_abc12345...")
    key_prefix = f"{prefix}{random_part[:8]}..."

    return full_key, key_hash, key_prefix


def test_api_key_generation():
    """Test la generation de cles API"""
    print("Test de generation de cles API\n" + "=" * 50)

    # Generer 3 cles pour tester
    for i in range(3):
        full_key, key_hash, key_prefix = generate_api_key()

        print(f"\nCle #{i + 1}:")
        print(f"  Full Key:    {full_key}")
        print(f"  Key Hash:    {key_hash}")
        print(f"  Key Prefix:  {key_prefix}")

        # Validations
        assert full_key.startswith("ofs_"), "La cle doit commencer par 'ofs_'"
        assert len(full_key) == 36, f"La cle doit faire 36 caracteres (ofs_ + 32), trouve: {len(full_key)}"
        assert len(key_hash) == 64, f"Le hash SHA256 doit faire 64 caracteres, trouve: {len(key_hash)}"
        assert key_prefix.endswith("..."), "Le prefixe doit se terminer par '...'"

        # Verifier que le hash est reproductible
        rehash = hashlib.sha256(full_key.encode()).hexdigest()
        assert rehash == key_hash, "Le hash doit etre reproductible"

        print("  ✓ Format valide")
        print("  ✓ Hash reproductible")

    print("\n" + "=" * 50)
    print("Tous les tests passes avec succes!")


if __name__ == "__main__":
    test_api_key_generation()
