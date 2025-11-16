"use client"

import * as React from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Ship,
  Package,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  FileText,
  MapPin,
  Users,
  Activity,
  BarChart3,
  PieChart,
  Calendar,
  Download,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  XCircle,
  Anchor,
  Trash2,
  Recycle,
  Boxes,
  Warehouse,
} from "lucide-react"
import type {
  LoadingManifest,
  BackCargoManifest,
  VesselArrival,
  YardDispatch,
  BackCargoType,
  ManifestStatus,
  DiscrepancyType,
} from "@/lib/travelwiz-back-cargo-types"

// =============================================================================
// TYPES
// =============================================================================

interface DashboardStats {
  totalManifests: number
  manifestsInTransit: number
  manifestsCompleted: number
  manifestsPending: number
  upcomingVessels: number
  backCargoToDispatch: number
  activeDiscrepancies: number
  criticalDiscrepancies: number
  complianceRate: number
  totalWeight: number
}

interface BackCargoByType {
  type: BackCargoType
  count: number
  percentage: number
  color: string
}

interface RecentActivity {
  id: string
  type: "manifest" | "arrival" | "dispatch" | "discrepancy"
  description: string
  timestamp: string
  status: "success" | "warning" | "error" | "info"
  user?: string
}

interface TravelWizDashboardProps {
  loadingManifests?: LoadingManifest[]
  backCargoManifests?: BackCargoManifest[]
  vesselArrivals?: VesselArrival[]
  yardDispatches?: YardDispatch[]
  onCreateManifest?: () => void
  onRegisterArrival?: () => void
  onCreateBackCargo?: () => void
  onViewDetails?: (type: string, id: string) => void
}

// =============================================================================
// MOCK DATA (pour développement)
// =============================================================================

const MOCK_STATS: DashboardStats = {
  totalManifests: 47,
  manifestsInTransit: 12,
  manifestsCompleted: 32,
  manifestsPending: 3,
  upcomingVessels: 5,
  backCargoToDispatch: 8,
  activeDiscrepancies: 3,
  criticalDiscrepancies: 1,
  complianceRate: 94.5,
  totalWeight: 12450,
}

const MOCK_BACK_CARGO_BY_TYPE: BackCargoByType[] = [
  { type: "Déchets DIS", count: 15, percentage: 25, color: "rgb(239, 68, 68)" },
  { type: "Déchets DIB", count: 12, percentage: 20, color: "rgb(251, 146, 60)" },
  { type: "Déchets DMET", count: 8, percentage: 13, color: "rgb(251, 191, 36)" },
  { type: "Matériel sous-traitant", count: 10, percentage: 17, color: "rgb(34, 197, 94)" },
  { type: "Réintégration stock", count: 7, percentage: 12, color: "rgb(59, 130, 246)" },
  { type: "À rebuter", count: 4, percentage: 7, color: "rgb(168, 85, 247)" },
  { type: "À ferrailler", count: 2, percentage: 3, color: "rgb(236, 72, 153)" },
  { type: "Stockage Yard", count: 2, percentage: 3, color: "rgb(148, 163, 184)" },
]

const MOCK_RECENT_ACTIVITY: RecentActivity[] = [
  {
    id: "1",
    type: "manifest",
    description: "Manifeste MAN-2025-0145 validé et chargé sur Massongo Express",
    timestamp: "Il y a 15 minutes",
    status: "success",
    user: "Jean Dupont",
  },
  {
    id: "2",
    type: "arrival",
    description: "Arrivée navire Massongo Express enregistrée avec 23 colis",
    timestamp: "Il y a 1 heure",
    status: "success",
    user: "Marie Martin",
  },
  {
    id: "3",
    type: "discrepancy",
    description: "Anomalie critique: 2 colis manquants sur MAN-2025-0142",
    timestamp: "Il y a 2 heures",
    status: "error",
    user: "Pierre Lefebvre",
  },
  {
    id: "4",
    type: "dispatch",
    description: "Dispatch de 5 colis déchets DIS vers Zone déchets DIS",
    timestamp: "Il y a 3 heures",
    status: "success",
    user: "Sophie Bernard",
  },
  {
    id: "5",
    type: "manifest",
    description: "Nouveau manifeste MAN-2025-0146 créé (en attente validation)",
    timestamp: "Il y a 4 heures",
    status: "info",
    user: "Luc Moreau",
  },
]

const UPCOMING_VESSELS = [
  {
    id: "1",
    vessel: "Massongo Express",
    eta: "Aujourd'hui 14:00",
    manifests: 5,
    packages: 23,
    status: "En approche",
    color: "green",
  },
  {
    id: "2",
    vessel: "Liouesso Cargo",
    eta: "Demain 09:00",
    manifests: 3,
    packages: 15,
    status: "Planifié",
    color: "blue",
  },
  {
    id: "3",
    vessel: "Sangha Transport",
    eta: "Dans 2 jours",
    manifests: 7,
    packages: 34,
    status: "Planifié",
    color: "blue",
  },
  {
    id: "4",
    vessel: "Ewo Supply",
    eta: "Dans 3 jours",
    manifests: 2,
    packages: 8,
    status: "Planifié",
    color: "blue",
  },
  {
    id: "5",
    vessel: "Impfondo Freight",
    eta: "Dans 5 jours",
    manifests: 4,
    packages: 19,
    status: "Planifié",
    color: "blue",
  },
]

// =============================================================================
// COMPOSANT PRINCIPAL
// =============================================================================

export function TravelWizDashboard({
  loadingManifests = [],
  backCargoManifests = [],
  vesselArrivals = [],
  yardDispatches = [],
  onCreateManifest,
  onRegisterArrival,
  onCreateBackCargo,
  onViewDetails,
}: TravelWizDashboardProps) {
  // Utiliser les données mockées si aucune donnée réelle n'est fournie
  const stats = MOCK_STATS
  const backCargoByType = MOCK_BACK_CARGO_BY_TYPE
  const recentActivity = MOCK_RECENT_ACTIVITY

  // =============================================================================
  // KPI CARDS
  // =============================================================================

  const KPICard = ({
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    trendValue,
    color = "blue",
  }: {
    title: string
    value: string | number
    subtitle?: string
    icon: React.ElementType
    trend?: "up" | "down"
    trendValue?: string
    color?: "blue" | "green" | "yellow" | "red" | "purple"
  }) => {
    const colorClasses = {
      blue: "bg-blue-500",
      green: "bg-green-500",
      yellow: "bg-yellow-500",
      red: "bg-red-500",
      purple: "bg-purple-500",
    }

    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <div className="mt-2 flex items-baseline gap-2">
                <h3 className="text-3xl font-bold">{value}</h3>
                {trend && trendValue && (
                  <div
                    className={`flex items-center gap-1 text-xs font-medium ${
                      trend === "up" ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {trend === "up" ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    {trendValue}
                  </div>
                )}
              </div>
              {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            <div className={`rounded-lg ${colorClasses[color]} p-3`}>
              <Icon className="h-5 w-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">TravelWiz Back Cargo</h1>
          <p className="mt-1 text-muted-foreground">
            Vue d'ensemble des opérations de chargement et retours site
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" />
            Exporter
          </Button>
          <Button onClick={onCreateManifest} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Nouveau Manifeste
          </Button>
        </div>
      </div>

      {/* Alertes importantes */}
      {stats.criticalDiscrepancies > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>{stats.criticalDiscrepancies} anomalie(s) critique(s)</strong> nécessitent une
            attention immédiate
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs principaux */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Manifestes Actifs"
          value={stats.manifestsInTransit}
          subtitle={`${stats.totalManifests} total ce mois`}
          icon={FileText}
          trend="up"
          trendValue="+12%"
          color="blue"
        />
        <KPICard
          title="Navires Attendus"
          value={stats.upcomingVessels}
          subtitle="Dans les 7 prochains jours"
          icon={Ship}
          color="purple"
        />
        <KPICard
          title="Retours à Dispatcher"
          value={stats.backCargoToDispatch}
          subtitle="En attente traitement"
          icon={Package}
          color="yellow"
        />
        <KPICard
          title="Taux de Conformité"
          value={`${stats.complianceRate}%`}
          subtitle={`${stats.activeDiscrepancies} anomalies actives`}
          icon={stats.complianceRate >= 95 ? CheckCircle2 : AlertTriangle}
          trend={stats.complianceRate >= 95 ? "up" : "down"}
          trendValue={`${stats.complianceRate >= 95 ? "+" : "-"}2.3%`}
          color={stats.complianceRate >= 95 ? "green" : "red"}
        />
      </div>

      {/* Tabs principales */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="mr-2 h-4 w-4" />
            Vue d'ensemble
          </TabsTrigger>
          <TabsTrigger value="vessels">
            <Ship className="mr-2 h-4 w-4" />
            Navires
          </TabsTrigger>
          <TabsTrigger value="back-cargo">
            <Package className="mr-2 h-4 w-4" />
            Retours Site
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="mr-2 h-4 w-4" />
            Activité
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Vue d'ensemble */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Graphique Retours par Type */}
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Retours Site par Type</CardTitle>
                <CardDescription>Répartition des 60 derniers jours</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {backCargoByType.map((item) => {
                    const Icon = getBackCargoIcon(item.type)
                    return (
                      <div key={item.type} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{item.type}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{item.count} retours</span>
                            <Badge variant="secondary">{item.percentage}%</Badge>
                          </div>
                        </div>
                        <Progress value={item.percentage} className="h-2" />
                      </div>
                    )
                  })}
                </div>
                <Separator className="my-4" />
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Total</span>
                  <span className="font-bold">
                    {backCargoByType.reduce((sum, item) => sum + item.count, 0)} retours
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Statistiques rapides */}
            <Card>
              <CardHeader>
                <CardTitle>Statistiques</CardTitle>
                <CardDescription>Ce mois-ci</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Manifestes créés</span>
                    <span className="font-bold">{stats.totalManifests}</span>
                  </div>
                  <Progress value={70} className="h-2" />
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">En transit</span>
                    <span className="font-bold text-blue-600">{stats.manifestsInTransit}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Complétés</span>
                    <span className="font-bold text-green-600">{stats.manifestsCompleted}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">En attente</span>
                    <span className="font-bold text-yellow-600">{stats.manifestsPending}</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Poids total</span>
                    <span className="font-bold">{stats.totalWeight.toLocaleString()} kg</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Poids moyen/manifeste</span>
                    <span className="font-bold">
                      {Math.round(stats.totalWeight / stats.totalManifests)} kg
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="rounded-lg bg-muted p-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-medium">+15% vs mois dernier</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Actions rapides */}
          <Card>
            <CardHeader>
              <CardTitle>Actions Rapides</CardTitle>
              <CardDescription>Opérations courantes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-3">
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={onCreateManifest}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Créer un Manifeste
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={onRegisterArrival}
                >
                  <Ship className="mr-2 h-4 w-4" />
                  Enregistrer Arrivée
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={onCreateBackCargo}
                >
                  <Package className="mr-2 h-4 w-4" />
                  Déclarer Retour Site
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Navires */}
        <TabsContent value="vessels" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Navires Attendus (7 prochains jours)
              </CardTitle>
              <CardDescription>
                {UPCOMING_VESSELS.reduce((sum, v) => sum + v.manifests, 0)} manifestes -{" "}
                {UPCOMING_VESSELS.reduce((sum, v) => sum + v.packages, 0)} colis
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {UPCOMING_VESSELS.map((vessel, index) => (
                  <div key={vessel.id}>
                    <div className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50">
                      <div className="flex items-center gap-4">
                        <div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900">
                          <Anchor className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{vessel.vessel}</h4>
                            <Badge
                              variant={vessel.status === "En approche" ? "default" : "secondary"}
                            >
                              {vessel.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">ETA: {vessel.eta}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <div className="text-2xl font-bold">{vessel.manifests}</div>
                          <div className="text-xs text-muted-foreground">Manifestes</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold">{vessel.packages}</div>
                          <div className="text-xs text-muted-foreground">Colis</div>
                        </div>
                        <Button variant="outline" size="sm">
                          Détails
                        </Button>
                      </div>
                    </div>
                    {index < UPCOMING_VESSELS.length - 1 && <Separator className="my-2" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Retours Site */}
        <TabsContent value="back-cargo" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Retours en Attente de Dispatch</CardTitle>
                <CardDescription>{stats.backCargoToDispatch} retours à traiter</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    {
                      id: "BC-2025-0087",
                      type: "Déchets DIS" as BackCargoType,
                      packages: 5,
                      weight: 120,
                      site: "Massongo",
                      urgent: true,
                    },
                    {
                      id: "BC-2025-0088",
                      type: "Matériel sous-traitant" as BackCargoType,
                      packages: 3,
                      weight: 85,
                      site: "Liouesso",
                      urgent: false,
                    },
                    {
                      id: "BC-2025-0089",
                      type: "Réintégration stock" as BackCargoType,
                      packages: 7,
                      weight: 210,
                      site: "Impfondo",
                      urgent: false,
                    },
                  ].map((item) => {
                    const Icon = getBackCargoIcon(item.type)
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50"
                      >
                        <div className="flex items-center gap-3">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.id}</span>
                              {item.urgent && (
                                <Badge variant="destructive" className="h-5">
                                  Urgent
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{item.type}</span>
                              <span>•</span>
                              <span>{item.site}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right text-xs">
                            <div className="font-medium">{item.packages} colis</div>
                            <div className="text-muted-foreground">{item.weight} kg</div>
                          </div>
                          <Button size="sm" variant="outline">
                            Dispatcher
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Conformité Retours</CardTitle>
                <CardDescription>Vérifications automatiques</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        Conformes
                      </span>
                      <span className="font-bold text-green-600">52</span>
                    </div>
                    <Progress value={87} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        En attente validation
                      </span>
                      <span className="font-bold text-yellow-600">5</span>
                    </div>
                    <Progress value={8} className="h-2" />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-600" />
                        Non conformes
                      </span>
                      <span className="font-bold text-red-600">3</span>
                    </div>
                    <Progress value={5} className="h-2" />
                  </div>

                  <Separator className="my-4" />

                  <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-600" />
                      <div>
                        <div className="font-semibold text-green-900 dark:text-green-100">
                          Excellent taux de conformité
                        </div>
                        <div className="text-sm text-green-700 dark:text-green-300">
                          87% des retours sont conformes aux règles métier
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">Problèmes fréquents:</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                        Codes SAP manquants (3 cas)
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                        Inventaire incomplet (2 cas)
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        Mention ferraille absente (3 cas)
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Activité Récente */}
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Activité Récente</CardTitle>
              <CardDescription>Dernières opérations enregistrées</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {recentActivity.map((activity, index) => {
                  const { icon: Icon, color } = getActivityIcon(activity.type, activity.status)
                  return (
                    <div key={activity.id}>
                      <div className="flex items-start gap-4">
                        <div className={`rounded-lg ${color} p-2`}>
                          <Icon className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{activity.description}</p>
                          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{activity.timestamp}</span>
                            {activity.user && (
                              <>
                                <span>•</span>
                                <Users className="h-3 w-3" />
                                <span>{activity.user}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          Voir
                        </Button>
                      </div>
                      {index < recentActivity.length - 1 && <Separator className="my-4" />}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// =============================================================================
// FONCTIONS UTILITAIRES
// =============================================================================

function getBackCargoIcon(type: BackCargoType): React.ElementType {
  switch (type) {
    case "Déchets DIS":
    case "Déchets DIB":
    case "Déchets DMET":
      return Trash2
    case "Matériel sous-traitant":
      return Boxes
    case "Réintégration stock":
      return Package
    case "À rebuter":
    case "À ferrailler":
      return Recycle
    case "Stockage Yard":
      return Warehouse
    default:
      return Package
  }
}

function getActivityIcon(
  type: RecentActivity["type"],
  status: RecentActivity["status"]
): { icon: React.ElementType; color: string } {
  const iconMap: Record<RecentActivity["type"], React.ElementType> = {
    manifest: FileText,
    arrival: Ship,
    dispatch: MapPin,
    discrepancy: AlertTriangle,
  }

  const colorMap: Record<RecentActivity["status"], string> = {
    success: "bg-green-500",
    warning: "bg-yellow-500",
    error: "bg-red-500",
    info: "bg-blue-500",
  }

  return {
    icon: iconMap[type],
    color: colorMap[status],
  }
}
