"use client"

import { useState, useEffect } from "react"
import { Frown } from "lucide-react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { AddWebhook } from "./components/add-webhook"
import { columns } from "./components/webhooks-columns"
import { WebhooksTable } from "./components/webhooks-table"
import { getWebhooks, type Webhook as WebhookAPI } from "./data/webhooks-api"
import { useToast } from "@/hooks/use-toast"
import type { Webhook } from "./data/schema"

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const loadWebhooks = async () => {
    setLoading(true)
    try {
      const data = await getWebhooks()
      // Map backend data to frontend schema
      const mappedWebhooks: Webhook[] = data.map((webhook: WebhookAPI) => ({
        id: webhook.id,
        url: webhook.url,
        name: webhook.name,
        description: webhook.description,
        authType: webhook.authType as "none" | "application" | "platform",
        status: webhook.status as "enabled" | "disabled",
        events: (webhook.events || []) as ("user.created" | "order.placed" | "payment.failed" | "user.deleted")[],
        createdAt: new Date(webhook.created_at),
        updatedAt: new Date(webhook.updated_at),
        logs: [], // Logs will be loaded separately when viewing details
      }))
      setWebhooks(mappedWebhooks)
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de charger les webhooks",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadWebhooks()
  }, [])

  return (
    <div className="flex w-full flex-1 flex-col gap-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Accueil</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Développeurs</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Webhooks</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold">Webhooks</h2>
          <p className="text-muted-foreground text-sm">
            Configurez, intégrez et surveillez vos webhooks.
          </p>
        </div>
        <AddWebhook onWebhookAdded={loadWebhooks} />
      </div>

      <div className="h-full flex-1">
        {loading ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">Chargement...</div>
        ) : webhooks.length > 0 ? (
          <WebhooksTable data={webhooks} columns={columns} onWebhookUpdated={loadWebhooks} />
        ) : (
          <div className="border-border mt-6 flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-10">
            <Frown className="size-32" />
            <h2 className="text-lg font-semibold">Aucun webhook</h2>
            <p className="text-muted-foreground text-center">
              Commencez par créer un webhook pour{" "}
              <br className="hidden sm:block" /> intégrer et automatiser vos workflows.
            </p>
            <AddWebhook onWebhookAdded={loadWebhooks} />
          </div>
        )}
      </div>
    </div>
  )
}
