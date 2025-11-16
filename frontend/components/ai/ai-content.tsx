"use client"

import * as React from "react"
import { Bot, Send, Sparkles, FileText, Code, ImageIcon, MessageSquare, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function AIContent() {
  const [messages, setMessages] = React.useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content: "Bonjour! Je suis votre assistant IA OpsFlux. Comment puis-je vous aider aujourd'hui?",
    },
  ])
  const [input, setInput] = React.useState("")

  const handleSend = () => {
    if (!input.trim()) return

    setMessages((prev) => [...prev, { role: "user", content: input }])
    setInput("")

    // Simulate AI response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Je traite votre demande. Voici une réponse simulée pour démonstration.",
        },
      ])
    }, 1000)
  }

  const quickActions = [
    { icon: FileText, label: "Générer un rapport", description: "Créer un rapport automatique" },
    { icon: Code, label: "Analyser des données", description: "Analyse et insights" },
    { icon: ImageIcon, label: "Créer une visualisation", description: "Graphiques et tableaux" },
    { icon: MessageSquare, label: "Rédiger un email", description: "Email professionnel" },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Assistant IA</h1>
            <p className="text-sm text-muted-foreground">Votre copilote intelligent pour OpsFlux</p>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="h-3 w-3" />
          GPT-4
        </Badge>
      </div>

      <Tabs defaultValue="chat" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b px-6">
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="actions">Actions Rapides</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 flex flex-col m-0 p-6">
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div key={index} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  {message.role === "assistant" && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground flex-shrink-0">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={`rounded-lg p-3 max-w-[80%] ${
                      message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="flex gap-2 mt-4">
            <Textarea
              placeholder="Posez votre question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              className="min-h-[60px] resize-none"
            />
            <Button onClick={handleSend} size="icon" className="h-[60px] w-[60px]">
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="actions" className="flex-1 m-0 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quickActions.map((action, index) => (
              <Card key={index} className="p-4 hover:bg-accent cursor-pointer transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm mb-1">{action.label}</h3>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                  <Zap className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="history" className="flex-1 m-0 p-6">
          <p className="text-sm text-muted-foreground">Historique des conversations à venir...</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
