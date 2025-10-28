"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconLock, IconHome, IconArrowLeft } from "@tabler/icons-react"
import { Button } from "../ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card"

export default function UnauthorizedError() {
  const router = useRouter()

  return (
    <div className="flex h-svh items-center justify-center p-6 bg-gradient-to-br from-background via-background to-muted/20">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10 ring-8 ring-amber-500/5">
            <IconLock className="h-10 w-10 text-amber-500" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">401</CardTitle>
          <CardDescription className="text-base mt-2">
            Accès non autorisé
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-6">
          <div className="rounded-lg bg-muted/50 p-4 border">
            <p className="text-sm text-muted-foreground text-center">
              Veuillez vous connecter avec les identifiants appropriés pour accéder à cette ressource.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2 px-6 pb-6">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.back()}
          >
            <IconArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <Button
            asChild
            className="flex-1"
          >
            <Link href="/">
              <IconHome className="mr-2 h-4 w-4" />
              Accueil
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
