"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Bell, Mail, MessageSquare, Smartphone, Settings2 } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface NotificationChannel {
  id: string
  name: string
  type: "email" | "sms" | "push" | "in-app"
  enabled: boolean
  icon: any
}

interface NotificationRule {
  id: string
  event: string
  module: string
  channels: string[]
  recipients: string
  enabled: boolean
}

const mockChannels: NotificationChannel[] = [
  { id: "1", name: "Email", type: "email", enabled: true, icon: Mail },
  { id: "2", name: "SMS", type: "sms", enabled: false, icon: MessageSquare },
  { id: "3", name: "Push", type: "push", enabled: true, icon: Smartphone },
  { id: "4", name: "In-App", type: "in-app", enabled: true, icon: Bell },
]

const mockRules: NotificationRule[] = [
  {
    id: "1",
    event: "Nouvelle tâche assignée",
    module: "Projects",
    channels: ["email", "in-app"],
    recipients: "Assigné",
    enabled: true,
  },
  {
    id: "2",
    event: "Demande de séjour en attente",
    module: "POBVue",
    channels: ["email", "push"],
    recipients: "Validateurs",
    enabled: true,
  },
  {
    id: "3",
    event: "Document nécessite approbation",
    module: "Rédacteur",
    channels: ["email", "in-app"],
    recipients: "Approbateurs",
    enabled: true,
  },
  {
    id: "4",
    event: "Réservation confirmée",
    module: "TravelWiz",
    channels: ["email", "sms"],
    recipients: "Demandeur",
    enabled: true,
  },
  {
    id: "5",
    event: "Projet en retard",
    module: "Projects",
    channels: ["email", "push", "in-app"],
    recipients: "Chef de projet",
    enabled: true,
  },
]

export function NotificationsContent() {
  const [channels, setChannels] = useState(mockChannels)
  const [rules, setRules] = useState(mockRules)

  const toggleChannel = (id: string) => {
    setChannels(channels.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)))
  }

  const toggleRule = (id: string) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Notifications</h1>
          <p className="text-[11px] text-muted-foreground">Configurez les canaux et règles de notification</p>
        </div>
        <Button size="sm" className="h-7 text-[11px]">
          <Settings2 className="h-3 w-3 mr-1" />
          Nouvelle règle
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="channels" className="flex-1">
        <TabsList className="h-7">
          <TabsTrigger value="channels" className="text-[11px] h-6">
            Canaux
          </TabsTrigger>
          <TabsTrigger value="rules" className="text-[11px] h-6">
            Règles
          </TabsTrigger>
          <TabsTrigger value="templates" className="text-[11px] h-6">
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {channels.map((channel) => {
              const Icon = channel.icon
              return (
                <Card key={channel.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-8 w-8 rounded flex items-center justify-center ${
                          channel.enabled ? "bg-primary/10" : "bg-muted"
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${channel.enabled ? "text-primary" : "text-muted-foreground"}`} />
                      </div>
                      <div>
                        <p className="text-[11px] font-medium">{channel.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{channel.type}</p>
                      </div>
                    </div>
                    <Switch checked={channel.enabled} onCheckedChange={() => toggleChannel(channel.id)} />
                  </div>
                </Card>
              )
            })}
          </div>

          <Card className="p-3">
            <h3 className="text-[11px] font-medium mb-2">Configuration Email</h3>
            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Serveur SMTP</span>
                <span className="font-medium">smtp.opsflux.com</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Port</span>
                <span className="font-medium">587</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Expéditeur</span>
                <span className="font-medium">notifications@opsflux.com</span>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="mt-2">
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-1.5 text-[10px] font-medium">Événement</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Module</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Canaux</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Destinataires</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Statut</th>
                    <th className="text-left p-1.5 text-[10px] font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="p-1.5">
                        <span className="text-[11px]">{rule.event}</span>
                      </td>
                      <td className="p-1.5">
                        <Badge variant="outline" className="text-[9px] h-4 px-1">
                          {rule.module}
                        </Badge>
                      </td>
                      <td className="p-1.5">
                        <div className="flex gap-1">
                          {rule.channels.map((channel) => {
                            const channelData = channels.find((c) => c.type === channel)
                            if (!channelData) return null
                            const Icon = channelData.icon
                            return (
                              <div
                                key={channel}
                                className="h-5 w-5 rounded bg-muted flex items-center justify-center"
                                title={channelData.name}
                              >
                                <Icon className="h-3 w-3" />
                              </div>
                            )
                          })}
                        </div>
                      </td>
                      <td className="p-1.5">
                        <span className="text-[11px]">{rule.recipients}</span>
                      </td>
                      <td className="p-1.5">
                        <Switch checked={rule.enabled} onCheckedChange={() => toggleRule(rule.id)} />
                      </td>
                      <td className="p-1.5">
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]">
                          Modifier
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="mt-2">
          <Card className="p-3">
            <p className="text-[11px] text-muted-foreground text-center py-8">Templates de notification à venir</p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
