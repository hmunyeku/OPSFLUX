import ContentSection from "../components/content-section"
import ConnectAppForm from "./components/connect-app-form"

export default function SettingsConnectedAppsPage() {
  return (
    <ContentSection
      title="Applications connectées"
      desc="Gérez et connectez différentes applications."
    >
      <ConnectAppForm />
    </ContentSection>
  )
}
