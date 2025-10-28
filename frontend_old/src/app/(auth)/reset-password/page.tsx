import Link from "next/link"
import { Card } from "@/components/ui/card"
import { ResetPasswordForm } from "./components/reset-password-form"

export default function ResetPasswordPage() {
  return (
    <Card className="p-6">
      <div className="mb-2 flex flex-col space-y-2 text-left">
        <h1 className="text-md font-semibold tracking-tight">
          Réinitialiser le mot de passe
        </h1>
        <p className="text-muted-foreground text-sm">
          Entrez votre nouveau mot de passe ci-dessous.
        </p>
      </div>
      <ResetPasswordForm />
      <p className="text-muted-foreground mt-4 px-8 text-center text-sm">
        Vous vous souvenez de votre mot de passe ?{" "}
        <Link
          href="/login"
          className="hover:text-primary underline underline-offset-4"
        >
          Se connecter
        </Link>
        .
      </p>
    </Card>
  )
}
