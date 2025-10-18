"use client"

import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTranslation } from "@/hooks/use-translation"
import ContentSection from "../components/content-section"
import { AccountForm } from "./profile-form"
import { PreferencesTab } from "./preferences-tab"
import { InformationsTab } from "./informations-tab"
import { ApiTab } from "./api-tab"

export default function SettingsProfilePage() {
  const { t } = useTranslation("core.settings")
  const searchParams = useSearchParams()
  const tab = searchParams.get("tab") || "profile"

  return (
    <ContentSection title={t("profile.title")} desc={t("profile.description")} className="w-full lg:max-w-full">
      <Tabs defaultValue={tab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">{t("profile.tabs.profile")}</TabsTrigger>
          <TabsTrigger value="preferences">{t("profile.tabs.preferences")}</TabsTrigger>
          <TabsTrigger value="informations">{t("profile.tabs.informations")}</TabsTrigger>
          <TabsTrigger value="api">{t("profile.tabs.api")}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="space-y-4">
          <AccountForm />
        </TabsContent>
        <TabsContent value="preferences" className="space-y-4">
          <PreferencesTab />
        </TabsContent>
        <TabsContent value="informations" className="space-y-4">
          <InformationsTab />
        </TabsContent>
        <TabsContent value="api" className="space-y-4">
          <ApiTab />
        </TabsContent>
      </Tabs>
    </ContentSection>
  )
}
