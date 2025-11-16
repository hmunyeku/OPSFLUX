"use client";

/**
 * Dashboard Settings Dialog
 * Dialogue de configuration complète d'un dashboard avec onglets
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2, Info } from "lucide-react";
import * as Icons from "lucide-react";
import {
  DashboardCreate,
  DashboardUpdate,
  DashboardPublic,
  MenuParentEnum,
  RefreshIntervalEnum,
} from "@/types/dashboard-system";
import { MenuParentSelector } from "./menu-parent-selector";
import { IconPicker } from "./icon-picker";
import { getMenuLabel } from "@/lib/opsflux-menus";
import { toast } from "@/hooks/use-toast";

// Schéma de validation
const dashboardSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(200, "Le nom est trop long"),
  description: z.string().optional(),
  version: z.string().optional(),
  menu_parent: z.nativeEnum(MenuParentEnum),
  menu_label: z.string().min(1, "Le libellé du menu est requis").max(100),
  menu_icon: z.string().optional(),
  menu_order: z.number().int().min(0).max(9999).optional(),
  show_in_sidebar: z.boolean().optional(),
  is_home_page: z.boolean().optional(),
  is_public: z.boolean().optional(),
  required_roles: z.array(z.string()).optional(),
  required_permissions: z.array(z.string()).optional(),
  inherit_from_parent: z.boolean().optional(),
  allow_anonymous: z.boolean().optional(),
  auto_refresh: z.boolean().optional(),
  refresh_interval: z.nativeEnum(RefreshIntervalEnum).optional(),
  enable_filters: z.boolean().optional(),
  enable_export: z.boolean().optional(),
  enable_fullscreen: z.boolean().optional(),
  theme: z.string().optional(),
  custom_css: z.string().optional(),
  is_template: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

type DashboardFormValues = z.infer<typeof dashboardSchema>;

interface DashboardSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dashboard?: DashboardPublic;
  onSave: (data: DashboardCreate | DashboardUpdate) => Promise<void>;
}

export function DashboardSettingsDialog({
  open,
  onOpenChange,
  dashboard,
  onSave,
}: DashboardSettingsDialogProps) {
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  const isEditing = !!dashboard;

  // Valeurs par défaut
  const defaultValues: Partial<DashboardFormValues> = dashboard
    ? {
        name: dashboard.name,
        description: dashboard.description || "",
        version: dashboard.version || "1.0",
        menu_parent: dashboard.menu_parent,
        menu_label: dashboard.menu_label,
        menu_icon: dashboard.menu_icon || "LayoutDashboard",
        menu_order: dashboard.menu_order || 10,
        show_in_sidebar: dashboard.show_in_sidebar ?? true,
        is_home_page: dashboard.is_home_page ?? false,
        is_public: dashboard.is_public ?? false,
        required_roles: dashboard.required_roles || [],
        required_permissions: dashboard.required_permissions || [],
        inherit_from_parent: dashboard.inherit_from_parent ?? true,
        allow_anonymous: dashboard.allow_anonymous ?? false,
        auto_refresh: dashboard.auto_refresh ?? false,
        refresh_interval: dashboard.refresh_interval || RefreshIntervalEnum.MANUAL,
        enable_filters: dashboard.enable_filters ?? true,
        enable_export: dashboard.enable_export ?? true,
        enable_fullscreen: dashboard.enable_fullscreen ?? true,
        theme: dashboard.theme || "",
        custom_css: dashboard.custom_css || "",
        is_template: dashboard.is_template ?? false,
        tags: dashboard.tags || [],
      }
    : {
        name: "",
        description: "",
        version: "1.0",
        menu_parent: MenuParentEnum.PILOTAGE,
        menu_label: "",
        menu_icon: "LayoutDashboard",
        menu_order: 10,
        show_in_sidebar: true,
        is_home_page: false,
        is_public: false,
        required_roles: [],
        required_permissions: [],
        inherit_from_parent: true,
        allow_anonymous: false,
        auto_refresh: false,
        refresh_interval: RefreshIntervalEnum.MANUAL,
        enable_filters: true,
        enable_export: true,
        enable_fullscreen: true,
        theme: "",
        custom_css: "",
        is_template: false,
        tags: [],
      };

  const form = useForm<DashboardFormValues>({
    resolver: zodResolver(dashboardSchema),
    defaultValues,
  });

  const handleSubmit = async (data: DashboardFormValues) => {
    try {
      setSaving(true);
      await onSave(data as DashboardCreate | DashboardUpdate);
      toast({
        title: isEditing ? "Dashboard mis à jour" : "Dashboard créé",
        description: `Le dashboard "${data.name}" a été ${isEditing ? "mis à jour" : "créé"} avec succès.`,
      });
      onOpenChange(false);
      form.reset();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Une erreur est survenue",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleHomePageToggle = (checked: boolean) => {
    if (checked) {
      // Avertir que ce dashboard deviendra la page d'accueil
      toast({
        title: "Page d'accueil",
        description: "Ce dashboard sera défini comme page d'accueil pour votre profil.",
      });
    }
    form.setValue("is_home_page", checked);
  };

  const watchedMenuParent = form.watch("menu_parent");
  const watchedMenuLabel = form.watch("menu_label");
  const watchedMenuIcon = form.watch("menu_icon");
  const watchedIsHomePage = form.watch("is_home_page");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Éditer le dashboard" : "Créer un dashboard"}
          </DialogTitle>
          <DialogDescription>
            Configurez les paramètres de votre dashboard personnalisé
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="general">Général</TabsTrigger>
                <TabsTrigger value="navigation">Navigation</TabsTrigger>
                <TabsTrigger value="permissions">Permissions</TabsTrigger>
                <TabsTrigger value="options">Options</TabsTrigger>
              </TabsList>

              {/* Onglet Général */}
              <TabsContent value="general" className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom du dashboard *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Production Quotidienne" {...field} />
                      </FormControl>
                      <FormDescription>
                        Nom interne du dashboard (non visible dans le menu)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Décrivez l'objectif de ce dashboard..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Description optionnelle pour aider les utilisateurs
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Version</FormLabel>
                      <FormControl>
                        <Input placeholder="1.0" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </TabsContent>

              {/* Onglet Navigation */}
              <TabsContent value="navigation" className="space-y-4">
                <FormField
                  control={form.control}
                  name="menu_parent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Menu parent *</FormLabel>
                      <FormControl>
                        <MenuParentSelector
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        Sélectionnez le module OpsFlux où ce dashboard sera affiché
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="menu_label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Libellé dans le menu *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Vue Production" {...field} />
                      </FormControl>
                      <FormDescription>
                        Nom affiché dans le menu latéral
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="menu_icon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Icône du menu</FormLabel>
                      <FormControl>
                        <IconPicker
                          value={field.value}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormDescription>
                        Choisissez une icône Lucide React pour votre dashboard
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="menu_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ordre d'affichage</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={9999}
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormDescription>
                        Plus le nombre est petit, plus le dashboard apparaît en haut (0-9999)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="show_in_sidebar"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Afficher dans la sidebar
                        </FormLabel>
                        <FormDescription>
                          Le dashboard sera visible dans le menu latéral
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_home_page"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Définir comme page d'accueil
                        </FormLabel>
                        <FormDescription>
                          Ce dashboard s'affichera au démarrage d'OpsFlux
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={handleHomePageToggle}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {/* Aperçu de la navigation */}
                <Card className="p-4 bg-muted/50">
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Info className="h-4 w-4" />
                    Aperçu dans le menu
                  </h4>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      {getMenuLabel(watchedMenuParent)}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {watchedMenuIcon && (
                        (() => {
                          const IconComponent = Icons[watchedMenuIcon as keyof typeof Icons] as React.ComponentType<{ className?: string }>;
                          return IconComponent ? <IconComponent className="h-4 w-4" /> : null;
                        })()
                      )}
                      <span className="font-medium">{watchedMenuLabel || "Libellé du menu"}</span>
                      {watchedIsHomePage && (
                        <Badge variant="secondary" className="text-xs">
                          Page d'accueil
                        </Badge>
                      )}
                    </div>
                  </div>
                </Card>
              </TabsContent>

              {/* Onglet Permissions */}
              <TabsContent value="permissions" className="space-y-4">
                <FormField
                  control={form.control}
                  name="is_public"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Dashboard public</FormLabel>
                        <FormDescription>
                          Accessible à tous les utilisateurs de l'organisation
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="inherit_from_parent"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Hériter des permissions du menu parent
                        </FormLabel>
                        <FormDescription>
                          Les permissions du menu parent s'appliqueront automatiquement
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="allow_anonymous"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Autoriser l'accès anonyme
                        </FormLabel>
                        <FormDescription>
                          Les utilisateurs non connectés peuvent voir ce dashboard
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="rounded-lg border p-4 space-y-2">
                  <h4 className="text-sm font-medium">
                    Rôles et permissions requis
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Cette fonctionnalité sera disponible dans une prochaine version pour
                    définir des rôles et permissions spécifiques pour ce dashboard.
                  </p>
                </div>
              </TabsContent>

              {/* Onglet Options */}
              <TabsContent value="options" className="space-y-4">
                <FormField
                  control={form.control}
                  name="auto_refresh"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Rafraîchissement automatique
                        </FormLabel>
                        <FormDescription>
                          Actualiser automatiquement les données du dashboard
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="enable_filters"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Activer les filtres</FormLabel>
                        <FormDescription>
                          Permettre aux utilisateurs de filtrer les données
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="enable_export"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Activer l'export</FormLabel>
                        <FormDescription>
                          Permettre l'export des données (PDF, Excel, etc.)
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="enable_fullscreen"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Activer le mode plein écran
                        </FormLabel>
                        <FormDescription>
                          Afficher le dashboard en plein écran
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_template"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Enregistrer comme template
                        </FormLabel>
                        <FormDescription>
                          Ce dashboard pourra être réutilisé comme modèle
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isEditing ? "Mettre à jour" : "Créer"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
