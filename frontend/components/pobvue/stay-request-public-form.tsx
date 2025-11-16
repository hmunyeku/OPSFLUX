"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Camera, Upload, CalendarIcon, Send } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import type { DateRange } from "react-day-picker"

export function StayRequestPublicForm() {
  const [email, setEmail] = useState("")
  const [isVerified, setIsVerified] = useState(false)
  const [verificationCode, setVerificationCode] = useState("")
  const [dateRange, setDateRange] = useState<DateRange | undefined>()

  const handleSendCode = () => {
    console.log("[v0] Sending verification code to:", email)
    // TODO: Implement email verification
  }

  const handleVerifyCode = () => {
    console.log("[v0] Verifying code:", verificationCode)
    // TODO: Implement code verification
    setIsVerified(true)
  }

  if (!isVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <Card className="w-full max-w-md p-6">
          <div className="space-y-4">
            <div className="text-center">
              <h1 className="text-2xl font-bold">Demande d'Avis de Séjour</h1>
              <p className="text-sm text-muted-foreground mt-2">Vérifiez votre email pour continuer</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre.email@exemple.com"
              />
            </div>
            <Button className="w-full" onClick={handleSendCode}>
              <Send className="h-4 w-4 mr-2" />
              Envoyer le code de vérification
            </Button>

            <div className="space-y-2">
              <Label htmlFor="code">Code de vérification</Label>
              <Input
                id="code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="Entrez le code reçu par email"
              />
            </div>
            <Button className="w-full bg-transparent" onClick={handleVerifyCode} variant="outline">
              Vérifier
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-8 bg-muted/30">
      <div className="max-w-4xl mx-auto">
        <Card className="p-6 md:p-8">
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Nouvel Avis de Séjour</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Remplissez les informations pour créer votre demande de séjour
              </p>
            </div>

            {/* Contact Information */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">Informations Contact</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lastName">Nom *</Label>
                  <Input id="lastName" placeholder="Nom de famille" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firstName">Prénom *</Label>
                  <Input id="firstName" placeholder="Prénom" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Entreprise *</Label>
                  <Input id="company" placeholder="Nom de l'entreprise" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="function">Fonction *</Label>
                  <Input id="function" placeholder="Fonction ou poste" />
                </div>
              </div>
            </Card>

            {/* Date Range */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">Période de Séjour *</h3>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-full justify-start text-left font-normal", !dateRange && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "PPP", { locale: fr })} -{" "}
                          {format(dateRange.to, "PPP", { locale: fr })}
                        </>
                      ) : (
                        format(dateRange.from, "PPP", { locale: fr })
                      )
                    ) : (
                      "Sélectionner les dates"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="range"
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={2}
                    locale={fr}
                  />
                </PopoverContent>
              </Popover>
            </Card>

            {/* Passport Photo */}
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-4">Passeport Sécurité</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Capturez une photo de votre passeport sécurité pour extraire automatiquement les informations
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 bg-transparent">
                  <Camera className="h-4 w-4 mr-2" />
                  Prendre une photo
                </Button>
                <Button variant="outline" className="flex-1 bg-transparent">
                  <Upload className="h-4 w-4 mr-2" />
                  Télécharger
                </Button>
              </div>
            </Card>

            {/* Submit */}
            <div className="flex gap-2">
              <Button className="flex-1">Soumettre la demande</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
