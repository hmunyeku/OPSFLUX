import EmailTemplatesClient from "./components/email-templates-client"
import { PermissionGuard } from "@/components/permission-guard"

export default function EmailingPage() {
  return (
    <PermissionGuard permission="core.email_templates.read">
      <EmailTemplatesClient />
    </PermissionGuard>
  )
}
