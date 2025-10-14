"use client"

import ContentSection from "../components/content-section"
import { SecuritySettingsForm } from "./security-settings-form"

export default function SettingsSecurityPage() {
  return (
    <ContentSection
      title="Paramètres de sécurité"
      desc="Configurez les paramètres de sécurité globaux de l'application"
      className="w-full lg:max-w-full"
    >
      <SecuritySettingsForm />
    </ContentSection>
  )
}
