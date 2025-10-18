"use client"

import { useTranslation } from "@/hooks/use-translation"
import ContentSection from "../components/content-section"
import ConnectAppForm from "./components/connect-app-form"

export default function SettingsConnectedAppsPage() {
  const { t } = useTranslation("core.settings")

  return (
    <ContentSection
      title={t("connected_apps.title")}
      desc={t("connected_apps.description")}
    >
      <ConnectAppForm />
    </ContentSection>
  )
}
