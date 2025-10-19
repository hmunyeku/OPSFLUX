"use client"

import { useTranslation } from "@/hooks/use-translation"
import ContentSection from "./components/content-section"
import GeneralForm from "./components/general-form"

export default function SettingsGeneralPage() {
  const { t } = useTranslation("core.settings")

  return (
    <ContentSection
      title={t("general.title", "Title")}
      desc={t("general.description", "Description")}
      className="w-full lg:max-w-full"
    >
      <GeneralForm />
    </ContentSection>
  )
}
