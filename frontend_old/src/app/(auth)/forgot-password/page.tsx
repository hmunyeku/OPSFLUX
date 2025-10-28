import Link from "next/link"
import { Card } from "@/components/ui/card"
import { ForgotPasswordForm } from "./components/forgot-password-form"

export default function ForgotPasswordPage() {
  return (
    <Card className="p-6">
      <div className="mb-2 flex flex-col space-y-2 text-left">
        <h1 className="text-md font-semibold tracking-tight">
          Mot de passe oublié
        </h1>
        <p className="text-muted-foreground text-sm">
          Entrez votre adresse email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
        </p>
      </div>
      <ForgotPasswordForm />
      <p className="text-muted-foreground mt-4 px-8 text-center text-sm">
        Vous n&apos;avez pas de compte ?{" "}
        <Link
          href="/register"
          className="hover:text-primary underline underline-offset-4"
        >
          S&apos;inscrire
        </Link>
        .
      </p>
    </Card>
  )
}
