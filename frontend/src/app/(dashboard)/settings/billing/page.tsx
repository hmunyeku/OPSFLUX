"use client"

import { useTranslation } from "@/hooks/use-translation"
import ContentSection from "../components/content-section"
import BillingForm from "./billing-form"

export default function SettingsBillingPage() {
  const { t } = useTranslation("core.settings")

  return (
    <ContentSection title={t("billing.title")} desc={t("billing.description")}>
      <BillingForm />
    </ContentSection>
  )
}
