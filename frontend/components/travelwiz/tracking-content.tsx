"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Plane,
  Ship,
  Truck,
  MapPin,
  Clock,
  Package,
  AlertTriangle,
  CheckCircle2,
  Pause,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Ruler,
  Weight,
  Building2,
  User,
  Phone,
  Mail,
  Calendar,
  ImageIcon,
  Wrench,
} from "lucide-react"

// Mock tracking data for a package
const trackingData = {
  trackingNumber: "TW-2024-001234",
  status: "in_transit",
  currentLocation: "Port de Pointe-Noire",
  estimatedDelivery: "2024-01-25T14:00:00",

  package: {
    description: "Industrial Pump Equipment",
    photos: ["/industrial-pump.png", "/cargo-package.jpg"],
    dimensions: {
      length: 2.5,
      width: 1.8,
      height: 2.2,
      unit: "m",
    },
    weight: {
      value: 850,
      unit: "kg",
    },
    dangerClass: "Non-Dangerous",
    liftingType: "Crane Lift - 4 Point",
    liftingSchema: "/lifting-diagram.jpg",
  },

  route: {
    origin: {
      location: "Port Autonome de Pointe-Noire",
      address: "Avenue du Port, Pointe-Noire, Congo",
      contact: {
        name: "Jean Mbemba",
        phone: "+242 06 123 4567",
        email: "j.mbemba@port-pnr.cg",
      },
      date: "2024-01-20T08:00:00",
    },
    destination: {
      location: "Site Moho Nord - Base Vie",
      address: "Offshore Platform, Moho Nord Field",
      contact: {
        name: "Pierre Okemba",
        phone: "+242 06 987 6543",
        email: "p.okemba@moho.com",
      },
      estimatedDate: "2024-01-25T14:00:00",
    },
    transportMeans: [
      { type: "truck", name: "Camion Grue MAN TGX", from: "Port PNR", to: "Aéroport PNR" },
      { type: "helicopter", name: "Hélicoptère AS365 N3+", from: "Aéroport PNR", to: "Moho Nord" },
    ],
  },

  timeline: [
    {
      id: 1,
      status: "completed",
      title: "Colis enregistré",
      location: "Port Autonome de Pointe-Noire",
      timestamp: "2024-01-20T08:00:00",
      description: "Le colis a été enregistré et préparé pour l'expédition",
    },
    {
      id: 2,
      status: "completed",
      title: "Inspection douanière",
      location: "Port Autonome de Pointe-Noire",
      timestamp: "2024-01-20T10:30:00",
      description: "Inspection douanière complétée avec succès",
    },
    {
      id: 3,
      status: "completed",
      title: "Chargement sur camion",
      location: "Port Autonome de Pointe-Noire",
      timestamp: "2024-01-20T14:00:00",
      description: "Chargement sur camion grue MAN TGX",
    },
    {
      id: 4,
      status: "completed",
      title: "En transit - Route",
      location: "En route vers Aéroport PNR",
      timestamp: "2024-01-20T15:30:00",
      description: "Transport routier en cours",
    },
    {
      id: 5,
      status: "current",
      title: "Arrivée à l'aéroport",
      location: "Aéroport de Pointe-Noire",
      timestamp: "2024-01-21T09:00:00",
      description: "En attente de chargement héliporté",
    },
    {
      id: 6,
      status: "pending",
      title: "Chargement héliporté",
      location: "Aéroport de Pointe-Noire",
      timestamp: "2024-01-25T10:00:00",
      description: "Chargement prévu sur AS365 N3+",
    },
    {
      id: 7,
      status: "pending",
      title: "Vol vers Moho Nord",
      location: "En vol",
      timestamp: "2024-01-25T12:00:00",
      description: "Vol héliporté vers la plateforme",
    },
    {
      id: 8,
      status: "pending",
      title: "Livraison",
      location: "Site Moho Nord - Base Vie",
      timestamp: "2024-01-25T14:00:00",
      description: "Livraison finale au destinataire",
    },
  ],

  events: [
    {
      id: 1,
      type: "delay",
      title: "Retard météo",
      description: "Vol héliporté reporté de 3 jours en raison de conditions météorologiques défavorables",
      timestamp: "2024-01-22T08:00:00",
      severity: "warning",
    },
    {
      id: 2,
      type: "standby",
      title: "En attente",
      description: "Colis en attente à l'aéroport - Fenêtre météo favorable attendue le 25/01",
      timestamp: "2024-01-22T10:00:00",
      severity: "info",
    },
  ],
}

export function TrackingContent() {
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState(0)

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case "current":
        return <Clock className="h-4 w-4 text-blue-600 animate-pulse" />
      case "pending":
        return <Clock className="h-4 w-4 text-muted-foreground" />
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />
    }
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case "delay":
        return <AlertTriangle className="h-4 w-4 text-orange-600" />
      case "standby":
        return <Pause className="h-4 w-4 text-blue-600" />
      case "unload":
        return <Package className="h-4 w-4 text-purple-600" />
      case "reload":
        return <RefreshCw className="h-4 w-4 text-green-600" />
      default:
        return <AlertTriangle className="h-4 w-4" />
    }
  }

  const getTransportIcon = (type: string) => {
    switch (type) {
      case "truck":
        return <Truck className="h-5 w-5" />
      case "helicopter":
        return <Plane className="h-5 w-5" />
      case "boat":
        return <Ship className="h-5 w-5" />
      default:
        return <Package className="h-5 w-5" />
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Header with tracking number and status */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-bold leading-none">{trackingData.trackingNumber}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{trackingData.package.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="bg-blue-500/10 text-blue-600 text-[10px] h-6">
            <MapPin className="mr-1 h-3 w-3" />
            {trackingData.currentLocation}
          </Badge>
          <Badge variant="outline" className="bg-green-500/10 text-green-600 text-[10px] h-6">
            Livraison prévue: {new Date(trackingData.estimatedDelivery).toLocaleDateString("fr-FR")}
          </Badge>
        </div>
      </div>

      {/* Main content - Split layout */}
      <div className="grid flex-1 gap-3 overflow-hidden lg:grid-cols-2">
        {/* Left side - Map */}
        <Card className={`flex flex-col overflow-hidden transition-all ${leftCollapsed ? "lg:w-12" : ""}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3">
            {!leftCollapsed && <CardTitle className="text-xs font-medium">Carte du trajet</CardTitle>}
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setLeftCollapsed(!leftCollapsed)}>
              {leftCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            </Button>
          </CardHeader>
          {!leftCollapsed && (
            <CardContent className="flex-1 p-0">
              <div className="relative h-full w-full bg-muted/20 p-4">
                {/* SVG Map with route */}
                <svg className="h-full w-full" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet">
                  {/* Background */}
                  <rect width="800" height="600" fill="hsl(var(--muted) / 0.1)" />

                  {/* Route path */}
                  <path
                    d="M 150 450 Q 250 400 350 350 Q 450 300 550 250 Q 600 220 650 200"
                    stroke="hsl(var(--primary))"
                    strokeWidth="3"
                    fill="none"
                    strokeDasharray="10,5"
                    opacity="0.5"
                  />

                  {/* Origin point */}
                  <circle cx="150" cy="450" r="12" fill="hsl(var(--primary))" />
                  <text x="150" y="480" textAnchor="middle" fontSize="14" fill="hsl(var(--foreground))">
                    Port PNR
                  </text>

                  {/* Intermediate point (Airport) */}
                  <circle cx="350" cy="350" r="10" fill="hsl(var(--primary))" opacity="0.7" />
                  <text x="350" y="380" textAnchor="middle" fontSize="14" fill="hsl(var(--foreground))">
                    Aéroport PNR
                  </text>

                  {/* Current position (animated) */}
                  <circle cx="350" cy="350" r="20" fill="hsl(var(--primary))" opacity="0.3">
                    <animate attributeName="r" values="20;30;20" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <circle cx="350" cy="350" r="8" fill="hsl(var(--primary))" />

                  {/* Destination point */}
                  <circle cx="650" cy="200" r="12" fill="hsl(var(--muted-foreground))" opacity="0.5" />
                  <text x="650" y="230" textAnchor="middle" fontSize="14" fill="hsl(var(--foreground))">
                    Moho Nord
                  </text>

                  {/* Transport icons along route */}
                  <g transform="translate(240, 400)">
                    <rect
                      x="-20"
                      y="-15"
                      width="40"
                      height="30"
                      rx="4"
                      fill="hsl(var(--background))"
                      stroke="hsl(var(--border))"
                      strokeWidth="2"
                    />
                    <circle cx="0" cy="0" r="12" fill="hsl(var(--primary))" opacity="0.2" />
                    <path
                      d="M-8,-4 L-8,4 L8,4 L8,-4 Z M-6,-6 L-6,-8 L6,-8 L6,-6 Z"
                      fill="hsl(var(--primary))"
                      transform="scale(0.8)"
                    />
                  </g>

                  <g transform="translate(500, 280)">
                    <rect
                      x="-20"
                      y="-15"
                      width="40"
                      height="30"
                      rx="4"
                      fill="hsl(var(--background))"
                      stroke="hsl(var(--border))"
                      strokeWidth="2"
                    />
                    <circle cx="0" cy="0" r="12" fill="hsl(var(--primary))" opacity="0.2" />
                    <path
                      d="M-8,0 L0,-8 L8,0 L0,6 Z M-4,2 L-4,8 L4,8 L4,2 Z"
                      fill="hsl(var(--primary))"
                      transform="scale(0.7)"
                    />
                  </g>
                </svg>

                {/* Legend */}
                <div className="absolute bottom-4 left-4 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur">
                  <div className="flex flex-col gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-primary" />
                      <span>Position actuelle</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-0.5 w-6 border-t-2 border-dashed border-primary opacity-50" />
                      <span>Trajet prévu</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Right side - Timeline and Events */}
        <Card className={`flex flex-col overflow-hidden transition-all ${rightCollapsed ? "lg:w-12" : ""}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-3 pt-3">
            {!rightCollapsed && <CardTitle className="text-xs font-medium">Suivi détaillé</CardTitle>}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setRightCollapsed(!rightCollapsed)}
            >
              {rightCollapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </Button>
          </CardHeader>
          {!rightCollapsed && (
            <CardContent className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
              {/* Timeline - Top half */}
              <div className="flex flex-1 flex-col gap-2 overflow-hidden">
                <h3 className="text-sm font-semibold">Timeline des événements</h3>
                <ScrollArea className="flex-1">
                  <div className="space-y-4 pr-4">
                    {trackingData.timeline.map((event, index) => (
                      <div key={event.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 bg-background">
                            {getStatusIcon(event.status)}
                          </div>
                          {index < trackingData.timeline.length - 1 && (
                            <div
                              className={`w-0.5 flex-1 ${event.status === "completed" ? "bg-green-600" : "bg-border"}`}
                              style={{ minHeight: "40px" }}
                            />
                          )}
                        </div>
                        <div className="flex-1 pb-4">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-sm">{event.title}</p>
                              <p className="text-xs text-muted-foreground">{event.location}</p>
                              <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                            </div>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(event.timestamp).toLocaleString("fr-FR", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <Separator />

              {/* Events/Issues - Bottom half */}
              <div className="flex flex-1 flex-col gap-2 overflow-hidden">
                <h3 className="text-sm font-semibold">Événements & Incidents</h3>
                <ScrollArea className="flex-1">
                  <div className="space-y-2 pr-4">
                    {trackingData.events.map((event) => (
                      <Card key={event.id} className="p-3">
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-0.5 rounded-full p-2 ${
                              event.severity === "warning"
                                ? "bg-orange-500/10"
                                : event.severity === "error"
                                  ? "bg-red-500/10"
                                  : "bg-blue-500/10"
                            }`}
                          >
                            {getEventIcon(event.type)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium text-sm">{event.title}</p>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {new Date(event.timestamp).toLocaleString("fr-FR", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                          </div>
                        </div>
                      </Card>
                    ))}
                    {trackingData.events.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <CheckCircle2 className="h-12 w-12 text-green-600 mb-2" />
                        <p className="text-sm font-medium">Aucun incident</p>
                        <p className="text-xs text-muted-foreground">Le transport se déroule normalement</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Package Details Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Détails du colis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Photos */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Photos
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
                <img
                  src={trackingData.package.photos[selectedPhoto] || "/placeholder.svg"}
                  alt="Package photo"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                {trackingData.package.photos.map((photo, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedPhoto(index)}
                    className={`relative aspect-video overflow-hidden rounded-lg border bg-muted transition-all hover:border-primary ${
                      selectedPhoto === index ? "border-primary ring-2 ring-primary" : ""
                    }`}
                  >
                    <img
                      src={photo || "/placeholder.svg"}
                      alt={`Package photo ${index + 1}`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Specifications */}
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Ruler className="h-4 w-4" />
                Dimensions
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Longueur:</span>
                  <span className="font-medium">
                    {trackingData.package.dimensions.length} {trackingData.package.dimensions.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Largeur:</span>
                  <span className="font-medium">
                    {trackingData.package.dimensions.width} {trackingData.package.dimensions.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hauteur:</span>
                  <span className="font-medium">
                    {trackingData.package.dimensions.height} {trackingData.package.dimensions.unit}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Weight className="h-4 w-4" />
                Poids & Danger
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Poids:</span>
                  <span className="font-medium">
                    {trackingData.package.weight.value} {trackingData.package.weight.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Classe:</span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-600">
                    {trackingData.package.dangerClass}
                  </Badge>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Wrench className="h-4 w-4" />
                Type de levage
              </h3>
              <div className="space-y-2 text-sm">
                <p className="font-medium">{trackingData.package.liftingType}</p>
                {trackingData.package.liftingSchema && (
                  <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
                    <img
                      src={trackingData.package.liftingSchema || "/placeholder.svg"}
                      alt="Lifting diagram"
                      className="h-full w-full object-contain p-2"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Origin and Destination */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-green-600" />
                Origine
              </h3>
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">{trackingData.route.origin.location}</p>
                    <p className="text-xs text-muted-foreground">{trackingData.route.origin.address}</p>
                  </div>
                </div>
                <Separator />
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span>{trackingData.route.origin.contact.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span>{trackingData.route.origin.contact.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <span>{trackingData.route.origin.contact.email}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>
                    {new Date(trackingData.route.origin.date).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-red-600" />
                Destination
              </h3>
              <div className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="font-medium">{trackingData.route.destination.location}</p>
                    <p className="text-xs text-muted-foreground">{trackingData.route.destination.address}</p>
                  </div>
                </div>
                <Separator />
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span>{trackingData.route.destination.contact.name}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span>{trackingData.route.destination.contact.phone}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <span>{trackingData.route.destination.contact.email}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  <span>
                    Prévu:{" "}
                    {new Date(trackingData.route.destination.estimatedDate).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Transport Means */}
          <div>
            <h3 className="text-sm font-semibold mb-3">Moyens de transport</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {trackingData.route.transportMeans.map((transport, index) => (
                <div key={index} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {getTransportIcon(transport.type)}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-sm">{transport.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {transport.from} → {transport.to}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
