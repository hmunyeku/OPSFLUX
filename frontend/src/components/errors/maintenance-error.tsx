"use client"

import { IconServerOff, IconRefresh, IconClock } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function MaintenanceError() {
  const handleRefresh = () => {
    window.location.reload()
  }

  return (
    <div className="flex h-svh items-center justify-center p-6 bg-gradient-to-br from-background via-background to-muted/20">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-orange-500/10 ring-8 ring-orange-500/5">
            <IconServerOff className="h-10 w-10 text-orange-500" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">503</CardTitle>
          <CardDescription className="text-base mt-2">
            Site en maintenance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-6">
          <div className="rounded-lg bg-muted/50 p-4 border">
            <p className="text-sm text-muted-foreground text-center">
              Le site n'est pas disponible pour le moment. Nous serons de retour en ligne sous peu.
            </p>
          </div>
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-950">
            <p className="text-sm text-orange-800 dark:text-orange-200 text-center flex items-center justify-center gap-2">
              <IconClock className="h-4 w-4" />
              Maintenance en cours...
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center px-6 pb-6">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleRefresh}
          >
            <IconRefresh className="mr-2 h-4 w-4" />
            Actualiser la page
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
