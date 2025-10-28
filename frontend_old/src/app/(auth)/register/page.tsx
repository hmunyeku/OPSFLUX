import Link from "next/link"
import { Card } from "@/components/ui/card"
import { RegisterForm } from "./components/register-form"

export default function RegisterPage() {
  return (
    <Card className="p-6">
      <div className="mb-2 flex flex-col space-y-2 text-left">
        <h1 className="text-lg font-semibold tracking-tight">
          Créer un compte
        </h1>
        <p className="text-muted-foreground text-sm">
          Entrez votre email et mot de passe pour créer un compte.
        </p>
      </div>
      <RegisterForm />
      <p className="text-muted-foreground mt-4 px-8 text-center text-sm">
        Vous avez déjà un compte ?{" "}
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
