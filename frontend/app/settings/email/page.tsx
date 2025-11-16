export default function EmailPage() {
  return (
    <div className="flex-1 space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Système Email</h2>
      </div>
      <EmailContent />
    </div>
  )
}

import { EmailContent } from "@/components/settings/email-content"
