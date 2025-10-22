/**
 * Hook pour utiliser les fonctionnalités IA
 */

import { useState } from "react"
import { auth } from "@/lib/auth"

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

interface AIStatus {
  available: boolean
  default_provider: string | null
  providers: {
    openai: boolean
    anthropic: boolean
  }
}

export function useAI() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchAI<T>(endpoint: string, body: any): Promise<T | null> {
    setLoading(true)
    setError(null)

    try {
      const token = auth.getToken()
      const response = await fetch(`${API_BASE}/api/v1/ai/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || "AI service error")
      }

      return await response.json()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }

  async function getStatus(): Promise<AIStatus | null> {
    setLoading(true)
    setError(null)

    try {
      const token = auth.getToken()
      const response = await fetch(`${API_BASE}/api/v1/ai/status`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })

      if (!response.ok) {
        throw new Error("Failed to get AI status")
      }

      return await response.json()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }

  async function chat(
    messages: ChatMessage[],
    options?: {
      provider?: "openai" | "anthropic"
      model?: string
      temperature?: number
      max_tokens?: number
    }
  ): Promise<string | null> {
    const result = await fetchAI<{ message: string }>("chat", {
      messages,
      stream: false,
      ...options,
    })

    return result?.message || null
  }

  async function generateText(
    prompt: string,
    context?: string,
    options?: {
      provider?: "openai" | "anthropic"
      temperature?: number
      max_tokens?: number
    }
  ): Promise<string | null> {
    const result = await fetchAI<{ text: string }>("generate", {
      prompt,
      context,
      ...options,
    })

    return result?.text || null
  }

  async function suggestCompletion(
    text: string,
    fieldType:
      | "email_subject"
      | "task_description"
      | "task_title"
      | "comment"
      | "general" = "general",
    maxSuggestions: number = 3
  ): Promise<string[]> {
    const result = await fetchAI<{ suggestions: string[] }>(
      "suggest-completion",
      {
        text,
        field_type: fieldType,
        max_suggestions: maxSuggestions,
      }
    )

    return result?.suggestions || []
  }

  async function analyzeSentiment(text: string): Promise<{
    sentiment: "positive" | "negative" | "neutral"
    score: number
    explanation: string
  } | null> {
    return fetchAI("analyze-sentiment", { text })
  }

  async function summarize(
    text: string,
    maxLength: number = 100
  ): Promise<string | null> {
    const result = await fetchAI<{ summary: string }>("summarize", {
      text,
      max_length: maxLength,
    })

    return result?.summary || null
  }

  async function translate(
    text: string,
    targetLanguage: string
  ): Promise<string | null> {
    const result = await fetchAI<{ translation: string }>("translate", {
      text,
      target_language: targetLanguage,
    })

    return result?.translation || null
  }

  return {
    loading,
    error,
    getStatus,
    chat,
    generateText,
    suggestCompletion,
    analyzeSentiment,
    summarize,
    translate,
  }
}
