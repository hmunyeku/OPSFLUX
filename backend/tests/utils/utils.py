import random
import re
import string

from fastapi.testclient import TestClient

from app.core.config import settings


def random_lower_string() -> str:
    """
    Génère un mot de passe aléatoire conforme à la politique de sécurité:
    - Au moins 1 majuscule
    - Au moins 1 chiffre
    - Au moins 1 caractère spécial
    - Longueur minimale: 12 caractères
    - Pas de séquences simples (123, abc, etc.)
    - Pas de répétitions excessives
    """
    max_attempts = 100
    for _ in range(max_attempts):
        # Utiliser des caractères très variés pour éviter les séquences
        password_chars = [
            random.choice("QWRTPSDFGHJKLZXCVBNM"),  # Majuscules (éviter séquences)
            random.choice("13579"),                    # Chiffres impairs
            random.choice("!@#$%&*"),                  # Caractères spéciaux
            random.choice("24680"),                    # Chiffres pairs
            random.choice("qwrtpsdfghjklzxcvbnm"),  # Minuscules (éviter séquences)
        ]

        # Compléter avec des caractères très variés
        remaining_length = 27  # 32 total - 5 déjà ajoutés
        # Utiliser seulement des caractères qui ne forment pas de séquences
        safe_chars = "QWRTPSDFGHJKLZXCVBNM" + "qwrtpsdfghjklzxcvbnm" + "13579!@#$%&*2468"
        password_chars.extend(random.choices(safe_chars, k=remaining_length))

        # Mélanger
        random.shuffle(password_chars)
        password = "".join(password_chars)

        # Vérifier qu'il n'y a pas de séquences interdites
        if not re.search(r"(012|123|234|345|456|567|678|789|abc|bcd|cde)", password.lower()):
            # Vérifier pas de répétitions excessives
            if not re.search(r"(.)\1{3,}", password):
                return password

    # Si après 100 tentatives on n'a pas trouvé, retourner un mot de passe "manuel"
    return "Qw3!Rt5@Yp7#Ui9$Sd2%Fg4&Hj6*Kl8"


def random_email() -> str:
    """Génère une adresse email valide aléatoire."""
    # Utiliser uniquement des lettres minuscules pour l'email
    local_part = "".join(random.choices(string.ascii_lowercase, k=10))
    domain = "".join(random.choices(string.ascii_lowercase, k=8))
    return f"{local_part}@{domain}.com"


def get_superuser_token_headers(client: TestClient) -> dict[str, str]:
    login_data = {
        "username": settings.FIRST_SUPERUSER,
        "password": settings.FIRST_SUPERUSER_PASSWORD,
    }
    r = client.post(f"{settings.API_V1_STR}/login/access-token", data=login_data)
    tokens = r.json()
    a_token = tokens["access_token"]
    headers = {"Authorization": f"Bearer {a_token}"}
    return headers
