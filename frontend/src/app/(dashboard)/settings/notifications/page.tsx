"use client"

import { useTranslation } from "@/hooks/use-translation"
import ContentSection from "../components/content-section"
import { NotificationsForm } from "./notifications-form"

export default function SettingsNotificationsPage() {
  const { t } = useTranslation("core.settings")

  return (
    <ContentSection
      title={t("notifications.title")}
      desc={t("notifications.description")}
    >
      <NotificationsForm />
    </ContentSection>
  )
}
