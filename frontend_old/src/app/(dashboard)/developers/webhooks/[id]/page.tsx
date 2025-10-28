"use client"

import { ReactNode } from "react"
import { format } from "date-fns"
import { Bolt, CalendarCheck, LinkIcon } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { useTranslation } from "@/hooks/use-translation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { webhookListSchema } from "../data/schema"
import { getWebhookData } from "../data/webhook-data"
import { WebhookDetailActions } from "./components/webhook-detail-actions"
import { WebhookLogsTable } from "./components/webhook-logs-table"
import { WebhookStatusIcon } from "./components/webhook-status-icon"

interface Props {
  params: Promise<{ id: string }>
}

function WebhookDetailContent({ id }: { id: string }) {
  const { t } = useTranslation("core.developers")
  const tCommon = useTranslation("core.common").t

  const webhookData = getWebhookData()
  const webhookList = webhookListSchema.parse(webhookData)
  const webhook = webhookList.find((user) => user.id === id)

  if (!webhook) {
    redirect(`/developers/webhooks`)
    return null
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">{tCommon("breadcrumb.home")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/developers/overview">{t("breadcrumb.developers", "Développeurs")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/developers/webhooks">{t("webhooks.breadcrumb", "Breadcrumb")}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{id}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">{t("webhooks.detail.title", "Title")}</h2>
          <WebhookDetailActions data={webhook} />
        </div>
        <div className="flex flex-col items-stretch sm:flex-row sm:items-start">
          <Specs label={tCommon("field.status")}>
            <WebhookStatusIcon status={webhook.status === "enabled"} />
            <span className="capitalize">{webhook.status}</span>
          </Specs>

          <Specs label={tCommon("field.type")}>
            <Bolt size={16} />
            <span className="capitalize">{webhook.authType}</span>
          </Specs>

          <Specs label={tCommon("field.created_at")}>
            <CalendarCheck size={16} />
            <span>{format(webhook.createdAt, "dd MMM, yyyy h:mma")}</span>
          </Specs>

          <Specs label="URL">
            <LinkIcon size={16} />
            <span className="text-sky-700 dark:text-sky-400">
              {webhook.url}
            </span>
          </Specs>
        </div>
      </div>

      <WebhookLogsTable data={webhook.logs} />
    </div>
  )
}

export default async function WebhookDetailPage({ params }: Props) {
  const id = (await params).id
  return <WebhookDetailContent id={id} />
}

function Specs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-border border-b py-2 sm:border-r sm:border-b-0 sm:px-4 sm:py-0 sm:last:border-none">
      <span className="text-muted-foreground text-xs font-bold tracking-tight uppercase">
        {label}
      </span>
      <div className="mt-1 flex items-start gap-2 text-sm font-medium [&>*:first-child]:flex-none">
        {children}
      </div>
    </div>
  )
}
