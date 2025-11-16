"use client"

import * as React from "react"
import { Bot, Send, Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import Link from "next/link"

export function AIDrawer() {
  const [messages, setMessages] = React.useState<Array<{ role: "user" | "assistant"; content: string }>>([
    { role: "assistant", content: "Bonjour! Comment puis-je vous aider?" },
  ])
  const [input, setInput] = React.useState("")

  const handleSend = () => {
    if (!input.trim()) return

    setMessages((prev) => [...prev, { role: "user", content: input }])
    setInput("")

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Réponse de l'assistant IA...",
        },
      ])
    }, 1000)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Assistant IA</h2>
        </div>
        <Button variant="ghost" size="icon" asChild>
          <Link href="/ai">
            <Maximize2 className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          {messages.map((message, index) => (
            <div key={index} className={`flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "assistant" && (
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary text-primary-foreground flex-shrink-0">
                  <Bot className="h-3 w-3" />
                </div>
              )}
              <div
                className={`rounded-lg p-2 max-w-[80%] text-sm ${
                  message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="flex gap-2 p-4 border-t">
        <Textarea
          placeholder="Votre question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          className="min-h-[40px] resize-none text-sm"
        />
        <Button onClick={handleSend} size="icon" className="h-[40px] w-[40px]">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
