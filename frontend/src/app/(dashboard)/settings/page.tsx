import ContentSection from "./components/content-section"
import GeneralForm from "./components/general-form"

export default function SettingsGeneralPage() {
  return (
    <ContentSection
      title="Général"
      desc="Paramètres et options pour votre application."
      className="w-full lg:max-w-full"
    >
      <GeneralForm />
    </ContentSection>
  )
}
