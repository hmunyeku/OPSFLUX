import { Metadata } from "next"
import EmailTemplatesClient from "./components/email-templates-client"

export const metadata: Metadata = {
  title: "Emailing",
  description: "Gérer les templates d'email réutilisables",
}

export default function EmailingPage() {
  return <EmailTemplatesClient />
}
