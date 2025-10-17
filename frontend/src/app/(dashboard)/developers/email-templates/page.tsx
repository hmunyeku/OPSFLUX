import { Metadata } from "next"
import EmailTemplatesClient from "./components/email-templates-client"

export const metadata: Metadata = {
  title: "Email Templates",
  description: "Gérer les templates d'email réutilisables",
}

export default function EmailTemplatesPage() {
  return <EmailTemplatesClient />
}
