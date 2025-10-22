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
  const { t } = useTranslation("core.profile")
  const searchParams = useSearchParams()
  const tab = searchParams.get("tab", "Tab") || "profile"

  return (
    <ContentSection title={t("title", "Profil")} desc={t("description", "Gérez les paramètres de votre profil")} className="w-full lg:max-w-full">
      <Tabs defaultValue={tab} className="w-full">
        <TabsList className="w-full h-auto flex-col sm:flex-row sm:grid sm:grid-cols-4 p-1">
          <TabsTrigger value="profile" className="w-full justify-start sm:justify-center text-sm">
            {t("tabs.profile", "Profil")}
          </TabsTrigger>
          <TabsTrigger value="preferences" className="w-full justify-start sm:justify-center text-sm">
            {t("tabs.preferences", "Préférences")}
          </TabsTrigger>
          <TabsTrigger value="informations" className="w-full justify-start sm:justify-center text-sm">
            {t("tabs.informations", "Informations")}
          </TabsTrigger>
          <TabsTrigger value="api" className="w-full justify-start sm:justify-center text-sm">
            {t("tabs.api", "API")}
          </TabsTrigger>
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
