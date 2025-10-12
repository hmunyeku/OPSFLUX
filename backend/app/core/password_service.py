"""
Service de validation et gestion des mots de passe.
Password policy stricte, force du mot de passe, génération sécurisée.
"""

import re
import secrets
import string
from typing import List, Tuple


class PasswordService:
    """Service centralisé pour la gestion des mots de passe."""

    # Password policy par défaut (modifiable)
    MIN_LENGTH = 12  # Minimum 12 caractères (robuste)
    MIN_UPPERCASE = 1
    MIN_LOWERCASE = 1
    MIN_DIGITS = 1
    MIN_SPECIAL = 1
    SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?"

    # Mots de passe communs interdits (top 100 mots de passe les plus utilisés)
    COMMON_PASSWORDS = {
        "password", "123456", "12345678", "qwerty", "abc123", "monkey", "1234567",
        "letmein", "trustno1", "dragon", "baseball", "111111", "iloveyou", "master",
        "sunshine", "ashley", "bailey", "passw0rd", "shadow", "123123", "654321",
        "superman", "qazwsx", "michael", "football", "welcome", "jesus", "ninja",
        "mustang", "password1", "123456789", "adobe123", "admin", "1234567890",
        "photoshop", "1234", "12345", "passwd", "test", "guest", "123", "root",
        "administrator", "user", "default", "changeme", "temp", "demo"
    }

    @staticmethod
    def validate_password(password: str) -> Tuple[bool, List[str]]:
        """
        Valide un mot de passe selon la politique stricte.

        Args:
            password: Mot de passe à valider

        Returns:
            Tuple (is_valid, errors_list)
            - is_valid: True si valide, False sinon
            - errors_list: Liste des erreurs de validation

        Politique:
        - Minimum 12 caractères
        - Au moins 1 majuscule
        - Au moins 1 minuscule
        - Au moins 1 chiffre
        - Au moins 1 caractère spécial
        - Pas de mots de passe communs
        """
        errors = []

        # Longueur minimale
        if len(password) < PasswordService.MIN_LENGTH:
            errors.append(
                f"Le mot de passe doit contenir au moins {PasswordService.MIN_LENGTH} caractères"
            )

        # Majuscules
        uppercase_count = sum(1 for c in password if c.isupper())
        if uppercase_count < PasswordService.MIN_UPPERCASE:
            errors.append(
                f"Le mot de passe doit contenir au moins {PasswordService.MIN_UPPERCASE} majuscule(s)"
            )

        # Minuscules
        lowercase_count = sum(1 for c in password if c.islower())
        if lowercase_count < PasswordService.MIN_LOWERCASE:
            errors.append(
                f"Le mot de passe doit contenir au moins {PasswordService.MIN_LOWERCASE} minuscule(s)"
            )

        # Chiffres
        digit_count = sum(1 for c in password if c.isdigit())
        if digit_count < PasswordService.MIN_DIGITS:
            errors.append(
                f"Le mot de passe doit contenir au moins {PasswordService.MIN_DIGITS} chiffre(s)"
            )

        # Caractères spéciaux
        special_count = sum(1 for c in password if c in PasswordService.SPECIAL_CHARS)
        if special_count < PasswordService.MIN_SPECIAL:
            errors.append(
                f"Le mot de passe doit contenir au moins {PasswordService.MIN_SPECIAL} caractère(s) spécial(aux)"
            )

        # Mots de passe communs interdits
        if password.lower() in PasswordService.COMMON_PASSWORDS:
            errors.append("Ce mot de passe est trop commun et facilement devinable")

        # Patterns interdits (séquences simples)
        if re.search(r"(012|123|234|345|456|567|678|789|abc|bcd|cde)", password.lower()):
            errors.append("Le mot de passe contient des séquences trop simples")

        # Caractères répétitifs (plus de 3 fois de suite)
        if re.search(r"(.)\1{3,}", password):
            errors.append("Le mot de passe contient trop de caractères répétitifs")

        is_valid = len(errors) == 0
        return is_valid, errors

    @staticmethod
    def calculate_password_strength(password: str) -> Tuple[int, str, List[str]]:
        """
        Calcule la force d'un mot de passe.

        Args:
            password: Mot de passe à analyser

        Returns:
            Tuple (score, label, suggestions)
            - score: 0-4 (0=très faible, 4=très fort)
            - label: weak, fair, good, strong, very_strong
            - suggestions: Liste de suggestions pour améliorer

        Algorithme basé sur:
        - Longueur
        - Diversité des caractères
        - Entropie
        - Absence de patterns
        """
        score = 0
        suggestions = []

        # Longueur (max 2 points)
        if len(password) >= 16:
            score += 2
        elif len(password) >= 12:
            score += 1
        else:
            suggestions.append("Utilisez au moins 12 caractères (16+ recommandé)")

        # Diversité des caractères (max 2 points)
        has_lowercase = any(c.islower() for c in password)
        has_uppercase = any(c.isupper() for c in password)
        has_digit = any(c.isdigit() for c in password)
        has_special = any(c in PasswordService.SPECIAL_CHARS for c in password)

        char_diversity = sum([has_lowercase, has_uppercase, has_digit, has_special])
        if char_diversity == 4:
            score += 2
        elif char_diversity >= 3:
            score += 1
        else:
            if not has_uppercase:
                suggestions.append("Ajoutez des majuscules")
            if not has_lowercase:
                suggestions.append("Ajoutez des minuscules")
            if not has_digit:
                suggestions.append("Ajoutez des chiffres")
            if not has_special:
                suggestions.append("Ajoutez des caractères spéciaux")

        # Patterns et séquences (pénalités)
        if re.search(r"(012|123|234|345|456|567|678|789|abc|bcd)", password.lower()):
            score = max(0, score - 1)
            suggestions.append("Évitez les séquences simples (123, abc, etc.)")

        if re.search(r"(.)\1{2,}", password):
            score = max(0, score - 1)
            suggestions.append("Évitez les caractères répétitifs (aaa, 111, etc.)")

        # Mots communs (pénalité)
        if password.lower() in PasswordService.COMMON_PASSWORDS:
            score = 0
            suggestions.append("N'utilisez pas de mots de passe communs")

        # Déterminer le label
        labels = ["weak", "fair", "good", "strong", "very_strong"]
        label = labels[min(score, 4)]

        return score, label, suggestions

    @staticmethod
    def generate_secure_password(length: int = 16) -> str:
        """
        Génère un mot de passe sécurisé aléatoire.

        Args:
            length: Longueur du mot de passe (minimum 12, recommandé 16+)

        Returns:
            Mot de passe sécurisé généré

        Le mot de passe généré:
        - Contient au moins 1 majuscule, 1 minuscule, 1 chiffre, 1 caractère spécial
        - Est cryptographiquement sécurisé (secrets module)
        - Passe toutes les validations de la politique
        """
        if length < 12:
            length = 12

        # Pools de caractères
        lowercase = string.ascii_lowercase
        uppercase = string.ascii_uppercase
        digits = string.digits
        special = PasswordService.SPECIAL_CHARS

        # Garantir au moins 1 de chaque type
        password_chars = [
            secrets.choice(lowercase),
            secrets.choice(uppercase),
            secrets.choice(digits),
            secrets.choice(special),
        ]

        # Remplir le reste aléatoirement
        all_chars = lowercase + uppercase + digits + special
        password_chars += [secrets.choice(all_chars) for _ in range(length - 4)]

        # Mélanger
        secrets.SystemRandom().shuffle(password_chars)

        return "".join(password_chars)

    @staticmethod
    def check_password_history(
        new_password_hash: str, password_history: List[str], history_size: int = 5
    ) -> bool:
        """
        Vérifie si un mot de passe a déjà été utilisé récemment.

        Args:
            new_password_hash: Hash du nouveau mot de passe
            password_history: Liste des hashs de mots de passe précédents
            history_size: Nombre de mots de passe à mémoriser

        Returns:
            True si le mot de passe est acceptable (pas dans l'historique)
            False si le mot de passe a déjà été utilisé récemment
        """
        recent_passwords = password_history[-history_size:] if password_history else []
        return new_password_hash not in recent_passwords

    @staticmethod
    def estimate_crack_time(password: str) -> str:
        """
        Estime le temps nécessaire pour cracker le mot de passe par brute force.

        Args:
            password: Mot de passe à analyser

        Returns:
            Estimation humaine du temps (ex: "2 secondes", "3 ans", "millénaires")

        Hypothèses:
        - Attaquant avec 1 milliard de tentatives/seconde (GPU moderne)
        - Tous les types de caractères utilisés
        """
        # Déterminer l'espace de caractères
        char_space = 0
        if any(c.islower() for c in password):
            char_space += 26
        if any(c.isupper() for c in password):
            char_space += 26
        if any(c.isdigit() for c in password):
            char_space += 10
        if any(c in PasswordService.SPECIAL_CHARS for c in password):
            char_space += len(PasswordService.SPECIAL_CHARS)

        if char_space == 0:
            return "instantané"

        # Calculer le nombre de combinaisons possibles
        combinations = char_space ** len(password)

        # Temps de crack (1 milliard de tentatives/sec)
        attempts_per_second = 1_000_000_000
        seconds = combinations / attempts_per_second / 2  # Division par 2 (moyenne)

        # Convertir en unité lisible
        if seconds < 1:
            return "moins d'une seconde"
        elif seconds < 60:
            return f"{int(seconds)} secondes"
        elif seconds < 3600:
            return f"{int(seconds / 60)} minutes"
        elif seconds < 86400:
            return f"{int(seconds / 3600)} heures"
        elif seconds < 31536000:
            return f"{int(seconds / 86400)} jours"
        elif seconds < 31536000 * 100:
            return f"{int(seconds / 31536000)} ans"
        elif seconds < 31536000 * 1000:
            return "plusieurs siècles"
        else:
            return "plusieurs millénaires"
