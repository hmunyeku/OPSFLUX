"""
Service IA pour la génération de contenu et l'assistance
Supporte OpenAI et Anthropic Claude
"""

import os
from typing import AsyncGenerator, Literal
from openai import AsyncOpenAI
import anthropic

AIProvider = Literal["openai", "anthropic"]


class AIService:
    """Service centralisé pour toutes les fonctionnalités IA"""

    def __init__(self):
        self.openai_client = None
        self.anthropic_client = None
        self.default_provider: AIProvider = "openai"

        # Initialiser les clients selon les clés disponibles
        openai_key = os.getenv("OPENAI_API_KEY")
        anthropic_key = os.getenv("ANTHROPIC_API_KEY")

        if openai_key:
            self.openai_client = AsyncOpenAI(api_key=openai_key)
            self.default_provider = "openai"

        if anthropic_key:
            self.anthropic_client = anthropic.AsyncAnthropic(api_key=anthropic_key)
            if not openai_key:
                self.default_provider = "anthropic"

    def is_available(self) -> bool:
        """Vérifie si au moins un provider IA est disponible"""
        return self.openai_client is not None or self.anthropic_client is not None

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        provider: AIProvider | None = None,
        model: str | None = None,
        stream: bool = False,
        temperature: float = 0.7,
        max_tokens: int = 1000,
    ) -> str | AsyncGenerator[str, None]:
        """
        Génère une réponse de chat avec le provider spécifié

        Args:
            messages: Liste de messages [{role: "user"|"assistant", content: "..."}]
            provider: "openai" ou "anthropic", utilise le défaut si None
            model: Modèle spécifique à utiliser
            stream: Si True, retourne un générateur async
            temperature: Contrôle la créativité (0-2)
            max_tokens: Nombre maximum de tokens
        """
        provider = provider or self.default_provider

        if provider == "openai" and self.openai_client:
            return await self._openai_chat(messages, model, stream, temperature, max_tokens)
        elif provider == "anthropic" and self.anthropic_client:
            return await self._anthropic_chat(messages, model, stream, temperature, max_tokens)
        else:
            raise ValueError(f"Provider {provider} not available or not configured")

    async def _openai_chat(
        self,
        messages: list[dict[str, str]],
        model: str | None,
        stream: bool,
        temperature: float,
        max_tokens: int,
    ) -> str | AsyncGenerator[str, None]:
        """Implémentation OpenAI"""
        if not model:
            model = "gpt-4o-mini"  # Modèle par défaut économique

        response = await self.openai_client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=stream,
        )

        if stream:
            async def generate():
                async for chunk in response:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
            return generate()
        else:
            return response.choices[0].message.content

    async def _anthropic_chat(
        self,
        messages: list[dict[str, str]],
        model: str | None,
        stream: bool,
        temperature: float,
        max_tokens: int,
    ) -> str | AsyncGenerator[str, None]:
        """Implémentation Anthropic Claude"""
        if not model:
            model = "claude-3-5-haiku-20241022"  # Modèle par défaut économique

        # Anthropic requiert un format légèrement différent
        system_message = None
        formatted_messages = []

        for msg in messages:
            if msg["role"] == "system":
                system_message = msg["content"]
            else:
                formatted_messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })

        kwargs = {
            "model": model,
            "messages": formatted_messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if system_message:
            kwargs["system"] = system_message

        if stream:
            async def generate():
                async with self.anthropic_client.messages.stream(**kwargs) as stream:
                    async for text in stream.text_stream:
                        yield text
            return generate()
        else:
            response = await self.anthropic_client.messages.create(**kwargs)
            return response.content[0].text

    async def generate_text(
        self,
        prompt: str,
        context: str | None = None,
        provider: AIProvider | None = None,
        **kwargs
    ) -> str:
        """
        Génère du texte basé sur un prompt simple

        Args:
            prompt: Le prompt utilisateur
            context: Contexte système optionnel
            provider: Provider à utiliser
            **kwargs: Arguments additionnels pour chat_completion
        """
        messages = []

        if context:
            messages.append({"role": "system", "content": context})

        messages.append({"role": "user", "content": prompt})

        return await self.chat_completion(messages, provider=provider, **kwargs)

    async def suggest_completion(
        self,
        text: str,
        field_type: str = "general",
        max_suggestions: int = 3,
        **kwargs
    ) -> list[str]:
        """
        Suggère des complétions pour un champ de texte

        Args:
            text: Texte actuel
            field_type: Type de champ (email_subject, task_description, etc.)
            max_suggestions: Nombre de suggestions à retourner
        """
        contexts = {
            "email_subject": "Tu es un assistant qui aide à rédiger des sujets d'email professionnels et clairs.",
            "task_description": "Tu es un assistant qui aide à rédiger des descriptions de tâches claires et actionnables.",
            "task_title": "Tu es un assistant qui aide à rédiger des titres de tâches concis et descriptifs.",
            "comment": "Tu es un assistant qui aide à rédiger des commentaires professionnels et constructifs.",
            "general": "Tu es un assistant qui aide à compléter du texte de manière pertinente.",
        }

        context = contexts.get(field_type, contexts["general"])

        prompt = f"""Basé sur ce texte partiel, suggère {max_suggestions} façons de le compléter.
Texte actuel: "{text}"

Réponds uniquement avec les suggestions, une par ligne, sans numérotation ni ponctuation supplémentaire."""

        response = await self.generate_text(prompt, context, stream=False, **kwargs)

        # Parser les suggestions
        suggestions = [s.strip() for s in response.split("\n") if s.strip()]
        return suggestions[:max_suggestions]

    async def analyze_sentiment(self, text: str) -> dict:
        """
        Analyse le sentiment d'un texte

        Returns:
            {"sentiment": "positive|negative|neutral", "score": 0.0-1.0, "explanation": "..."}
        """
        prompt = f"""Analyse le sentiment de ce texte et réponds en JSON avec ce format exact:
{{"sentiment": "positive|negative|neutral", "score": 0.85, "explanation": "courte explication"}}

Texte: "{text}"

JSON:"""

        response = await self.generate_text(
            prompt,
            context="Tu es un analyseur de sentiment. Réponds uniquement en JSON valide.",
            temperature=0.3,
        )

        # Parser le JSON (basique)
        import json
        try:
            return json.loads(response)
        except:
            return {"sentiment": "neutral", "score": 0.5, "explanation": "Unable to analyze"}

    async def summarize(self, text: str, max_length: int = 100) -> str:
        """
        Résume un texte long

        Args:
            text: Texte à résumer
            max_length: Longueur maximale du résumé en mots
        """
        prompt = f"""Résume ce texte en maximum {max_length} mots, de manière claire et concise:

{text}

Résumé:"""

        return await self.generate_text(
            prompt,
            context="Tu es un assistant qui crée des résumés clairs et concis.",
            temperature=0.5,
        )

    async def translate(self, text: str, target_language: str) -> str:
        """
        Traduit un texte dans la langue cible

        Args:
            text: Texte à traduire
            target_language: Langue cible (ex: "français", "anglais", "espagnol")
        """
        prompt = f"""Traduis ce texte en {target_language}, en gardant le ton et le contexte:

{text}

Traduction:"""

        return await self.generate_text(
            prompt,
            context=f"Tu es un traducteur professionnel vers {target_language}.",
            temperature=0.3,
        )


# Instance globale
ai_service = AIService()
