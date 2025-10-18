"use client"

import { useTranslation } from "@/hooks/use-translation"
import ContentSection from "../components/content-section"
import PlanDetail from "./plan-detail"

export default function SettingsPlansPage() {
  const { t } = useTranslation("core.settings")

  return (
    <ContentSection
      title={t("plans.title")}
      desc={t("plans.description")}
      className="lg:max-w-3xl"
    >
      <PlanDetail />
    </ContentSection>
  )
}
