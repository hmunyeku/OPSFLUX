var ModuleExport = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // module.config.ts
  var module_config_exports = {};
  __export(module_config_exports, {
    default: () => module_config_default
  });

  // pages/Companies/List.tsx
  var import_react = __require("react");
  var import_navigation = __require("next/navigation");
  var import_auth = __require("@/lib/auth");
  var import_button = __require("@/components/ui/button");
  var import_input = __require("@/components/ui/input");
  var import_icons_react = __require("@tabler/icons-react");
  var import_card = __require("@/components/ui/card");
  var import_badge = __require("@/components/ui/badge");
  var import_table = __require("@/components/ui/table");
  var import_select = __require("@/components/ui/select");
  var import_skeleton = __require("@/components/ui/skeleton");
  var import_use_toast = __require("@/hooks/use-toast");

  // api.ts
  var API_URL = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1` : "http://localhost:8000/api/v1";
  async function getCompanies(token, params) {
    const queryParams = new URLSearchParams();
    if (params?.skip) queryParams.append("skip", params.skip.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.search) queryParams.append("search", params.search);
    if (params?.company_type) queryParams.append("company_type", params.company_type);
    if (params?.status) queryParams.append("status", params.status);
    const response = await fetch(
      `${API_URL}/third-parties?${queryParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );
    if (!response.ok) throw new Error("Failed to fetch companies");
    return response.json();
  }
  async function getCompany(token, id) {
    const response = await fetch(`${API_URL}/third-parties/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) throw new Error("Failed to fetch company");
    return response.json();
  }
  async function createCompany(token, data) {
    const response = await fetch(`${API_URL}/third-parties`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to create company");
    }
    return response.json();
  }
  async function updateCompany(token, id, data) {
    const response = await fetch(`${API_URL}/third-parties/${id}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to update company");
    }
    return response.json();
  }
  async function deleteCompany(token, id) {
    const response = await fetch(`${API_URL}/third-parties/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to delete company");
    }
  }
  async function getContacts(token, params) {
    const queryParams = new URLSearchParams();
    if (params?.skip) queryParams.append("skip", params.skip.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.company_id) queryParams.append("company_id", params.company_id);
    if (params?.search) queryParams.append("search", params.search);
    if (params?.status) queryParams.append("status", params.status);
    if (params?.role) queryParams.append("role", params.role);
    const response = await fetch(
      `${API_URL}/third-parties/contacts?${queryParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );
    if (!response.ok) throw new Error("Failed to fetch contacts");
    return response.json();
  }
  async function getContact(token, id) {
    const response = await fetch(`${API_URL}/third-parties/contacts/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) throw new Error("Failed to fetch contact");
    return response.json();
  }
  async function createContact(token, data) {
    const response = await fetch(`${API_URL}/third-parties/contacts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to create contact");
    }
    return response.json();
  }
  async function deleteContact(token, id) {
    const response = await fetch(`${API_URL}/third-parties/contacts/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to delete contact");
    }
  }
  async function getInvitations(token, params) {
    const queryParams = new URLSearchParams();
    if (params?.skip) queryParams.append("skip", params.skip.toString());
    if (params?.limit) queryParams.append("limit", params.limit.toString());
    if (params?.status) queryParams.append("status", params.status);
    if (params?.contact_id) queryParams.append("contact_id", params.contact_id);
    const response = await fetch(
      `${API_URL}/third-parties/invitations?${queryParams.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );
    if (!response.ok) throw new Error("Failed to fetch invitations");
    return response.json();
  }
  async function acceptInvitation(token) {
    const response = await fetch(`${API_URL}/third-parties/invitations/${token}/accept`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to accept invitation");
    }
    return response.json();
  }
  async function verifyInvitation2FA(token) {
    const response = await fetch(`${API_URL}/third-parties/invitations/${token}/verify-2fa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to verify 2FA");
    }
    return response.json();
  }
  async function revokeInvitation(token, id) {
    const response = await fetch(`${API_URL}/third-parties/invitations/${id}/revoke`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to revoke invitation");
    }
    return response.json();
  }

  // pages/Companies/List.tsx
  var import_alert_dialog = __require("@/components/ui/alert-dialog");
  var import_jsx_runtime = __require("react/jsx-runtime");
  function CompaniesList() {
    const router = (0, import_navigation.useRouter)();
    const { toast } = (0, import_use_toast.useToast)();
    const [companies, setCompanies] = (0, import_react.useState)([]);
    const [loading, setLoading] = (0, import_react.useState)(true);
    const [search, setSearch] = (0, import_react.useState)("");
    const [typeFilter, setTypeFilter] = (0, import_react.useState)("all");
    const [statusFilter, setStatusFilter] = (0, import_react.useState)("all");
    const [deleteDialogOpen, setDeleteDialogOpen] = (0, import_react.useState)(false);
    const [companyToDelete, setCompanyToDelete] = (0, import_react.useState)(null);
    (0, import_react.useEffect)(() => {
      loadCompanies();
    }, [typeFilter, statusFilter]);
    const loadCompanies = async () => {
      try {
        const token = import_auth.auth.getToken();
        if (!token) {
          router.push("/login");
          return;
        }
        setLoading(true);
        const params = { limit: 100 };
        if (search) params.search = search;
        if (typeFilter !== "all") params.company_type = typeFilter;
        if (statusFilter !== "all") params.status = statusFilter;
        const response = await getCompanies(token, params);
        setCompanies(response.data || []);
      } catch (error) {
        console.error("Failed to load companies:", error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les entreprises",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    const handleSearch = () => {
      loadCompanies();
    };
    const handleDelete = async () => {
      if (!companyToDelete) return;
      try {
        const token = import_auth.auth.getToken();
        if (!token) return;
        await deleteCompany(token, companyToDelete.id);
        toast({
          title: "Entreprise supprim\xE9e",
          description: `${companyToDelete.name} a \xE9t\xE9 supprim\xE9e`
        });
        setDeleteDialogOpen(false);
        setCompanyToDelete(null);
        loadCompanies();
      } catch (error) {
        console.error("Failed to delete company:", error);
        toast({
          title: "Erreur",
          description: "Impossible de supprimer l'entreprise",
          variant: "destructive"
        });
      }
    };
    const getStatusBadge = (status) => {
      const variants = {
        active: { variant: "default", label: "Actif" },
        inactive: { variant: "secondary", label: "Inactif" },
        prospect: { variant: "outline", label: "Prospect" },
        archived: { variant: "destructive", label: "Archiv\xE9" }
      };
      const config = variants[status.toLowerCase()] || { variant: "secondary", label: status };
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_badge.Badge, { variant: config.variant, children: config.label });
    };
    const getTypeBadge = (type) => {
      const labels = {
        client: "Client",
        supplier: "Fournisseur",
        partner: "Partenaire",
        contractor: "Sous-traitant",
        other: "Autre"
      };
      return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_badge.Badge, { variant: "secondary", children: labels[type.toLowerCase()] || type });
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "container mx-auto px-4 py-6 max-w-7xl", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_icons_react.IconBuilding, { className: "h-8 w-8" }),
            "Entreprises"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-sm text-muted-foreground mt-1", children: "Gestion des entreprises tierces (clients, fournisseurs, partenaires)" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_button.Button, { onClick: () => router.push("/third-parties/companies/new"), children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_icons_react.IconPlus, { className: "h-4 w-4 mr-2" }),
          "Nouvelle entreprise"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_card.Card, { className: "mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_card.CardHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_card.CardTitle, { className: "text-lg", children: "Filtres" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_card.CardContent, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex flex-col sm:flex-row gap-3", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex-1 relative", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_icons_react.IconSearch, { className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              import_input.Input,
              {
                placeholder: "Rechercher une entreprise...",
                value: search,
                onChange: (e) => setSearch(e.target.value),
                onKeyDown: (e) => e.key === "Enter" && handleSearch(),
                className: "pl-9"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_select.Select, { value: typeFilter, onValueChange: setTypeFilter, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectTrigger, { className: "w-full sm:w-[180px]", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectValue, { placeholder: "Type" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_select.SelectContent, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectItem, { value: "all", children: "Tous les types" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectItem, { value: "client", children: "Client" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectItem, { value: "supplier", children: "Fournisseur" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectItem, { value: "partner", children: "Partenaire" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectItem, { value: "contractor", children: "Sous-traitant" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectItem, { value: "other", children: "Autre" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_select.Select, { value: statusFilter, onValueChange: setStatusFilter, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectTrigger, { className: "w-full sm:w-[180px]", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectValue, { placeholder: "Statut" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_select.SelectContent, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectItem, { value: "all", children: "Tous les statuts" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectItem, { value: "active", children: "Actif" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectItem, { value: "inactive", children: "Inactif" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectItem, { value: "prospect", children: "Prospect" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_select.SelectItem, { value: "archived", children: "Archiv\xE9" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_button.Button, { onClick: handleSearch, variant: "secondary", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_icons_react.IconFilter, { className: "h-4 w-4 mr-2" }),
            "Filtrer"
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_card.Card, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_card.CardHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_card.CardTitle, { children: loading ? "Chargement..." : `${companies.length} entreprise${companies.length > 1 ? "s" : ""}` }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_button.Button, { variant: "outline", size: "sm", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_icons_react.IconDownload, { className: "h-4 w-4 mr-2" }),
            "Exporter"
          ] })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_card.CardContent, { children: loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "space-y-3", children: [1, 2, 3, 4, 5].map((i) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_skeleton.Skeleton, { className: "h-16 w-full" }, i)) }) : companies.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-center py-12", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_icons_react.IconBuilding, { className: "h-12 w-12 mx-auto text-muted-foreground mb-4" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-muted-foreground", children: "Aucune entreprise trouv\xE9e" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            import_button.Button,
            {
              variant: "outline",
              className: "mt-4",
              onClick: () => router.push("/third-parties/companies/new"),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_icons_react.IconPlus, { className: "h-4 w-4 mr-2" }),
                "Cr\xE9er la premi\xE8re entreprise"
              ]
            }
          )
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "overflow-x-auto", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_table.Table, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_table.TableRow, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableHead, { children: "Nom" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableHead, { children: "Type" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableHead, { children: "Statut" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableHead, { children: "Email" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableHead, { children: "Pays" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableHead, { className: "text-center", children: "Contacts" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableHead, { className: "text-right", children: "Actions" })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableBody, { children: companies.map((company) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_table.TableRow, { className: "cursor-pointer hover:bg-muted/50", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableCell, { className: "font-medium", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "font-semibold", children: company.name }),
              company.legal_name && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "text-xs text-muted-foreground", children: company.legal_name })
            ] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableCell, { children: getTypeBadge(company.company_type) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableCell, { children: getStatusBadge(company.status) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableCell, { className: "text-sm", children: company.email || "-" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableCell, { className: "text-sm", children: company.country || "-" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableCell, { className: "text-center", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_badge.Badge, { variant: "outline", children: company.contact_count }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_table.TableCell, { className: "text-right", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center justify-end gap-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                import_button.Button,
                {
                  variant: "ghost",
                  size: "icon",
                  className: "h-8 w-8",
                  onClick: () => router.push(`/third-parties/companies/${company.id}`),
                  children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_icons_react.IconEye, { className: "h-4 w-4" })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                import_button.Button,
                {
                  variant: "ghost",
                  size: "icon",
                  className: "h-8 w-8",
                  onClick: () => router.push(`/third-parties/companies/${company.id}/edit`),
                  children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_icons_react.IconEdit, { className: "h-4 w-4" })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                import_button.Button,
                {
                  variant: "ghost",
                  size: "icon",
                  className: "h-8 w-8 text-destructive",
                  onClick: () => {
                    setCompanyToDelete(company);
                    setDeleteDialogOpen(true);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_icons_react.IconTrash, { className: "h-4 w-4" })
                }
              )
            ] }) })
          ] }, company.id)) })
        ] }) }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_alert_dialog.AlertDialog, { open: deleteDialogOpen, onOpenChange: setDeleteDialogOpen, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_alert_dialog.AlertDialogContent, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_alert_dialog.AlertDialogHeader, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_alert_dialog.AlertDialogTitle, { children: "Confirmer la suppression" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_alert_dialog.AlertDialogDescription, { children: [
            "\xCAtes-vous s\xFBr de vouloir supprimer l'entreprise",
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("strong", { children: companyToDelete?.name }),
            " ? Cette action est irr\xE9versible."
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_alert_dialog.AlertDialogFooter, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_alert_dialog.AlertDialogCancel, { children: "Annuler" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_alert_dialog.AlertDialogAction, { onClick: handleDelete, className: "bg-destructive hover:bg-destructive/90", children: "Supprimer" })
        ] })
      ] }) })
    ] });
  }

  // pages/Companies/Details.tsx
  var import_react2 = __require("react");
  var import_navigation2 = __require("next/navigation");
  var import_auth2 = __require("@/lib/auth");
  var import_button2 = __require("@/components/ui/button");
  var import_icons_react2 = __require("@tabler/icons-react");
  var import_card2 = __require("@/components/ui/card");
  var import_badge2 = __require("@/components/ui/badge");
  var import_skeleton2 = __require("@/components/ui/skeleton");
  var import_separator = __require("@/components/ui/separator");
  var import_tabs = __require("@/components/ui/tabs");
  var import_table2 = __require("@/components/ui/table");
  var import_use_toast2 = __require("@/hooks/use-toast");

  // types/index.ts
  var CompanyTypeLabels = {
    ["client" /* CLIENT */]: "Client",
    ["supplier" /* SUPPLIER */]: "Fournisseur",
    ["partner" /* PARTNER */]: "Partenaire",
    ["contractor" /* CONTRACTOR */]: "Sous-traitant",
    ["competitor" /* COMPETITOR */]: "Concurrent",
    ["other" /* OTHER */]: "Autre"
  };
  var CompanyStatusLabels = {
    ["active" /* ACTIVE */]: "Actif",
    ["inactive" /* INACTIVE */]: "Inactif",
    ["prospect" /* PROSPECT */]: "Prospect",
    ["archived" /* ARCHIVED */]: "Archiv\xE9"
  };
  var ContactRoleLabels = {
    ["ceo" /* CEO */]: "Directeur G\xE9n\xE9ral",
    ["manager" /* MANAGER */]: "Manager",
    ["employee" /* EMPLOYEE */]: "Employ\xE9",
    ["consultant" /* CONSULTANT */]: "Consultant",
    ["technical" /* TECHNICAL */]: "Technique",
    ["commercial" /* COMMERCIAL */]: "Commercial",
    ["admin" /* ADMIN */]: "Administratif",
    ["other" /* OTHER */]: "Autre"
  };
  var ContactStatusLabels = {
    ["active" /* ACTIVE */]: "Actif",
    ["inactive" /* INACTIVE */]: "Inactif",
    ["invited" /* INVITED */]: "Invit\xE9",
    ["archived" /* ARCHIVED */]: "Archiv\xE9"
  };
  var InvitationStatusLabels = {
    ["pending" /* PENDING */]: "En attente",
    ["accepted" /* ACCEPTED */]: "Accept\xE9e",
    ["expired" /* EXPIRED */]: "Expir\xE9e",
    ["revoked" /* REVOKED */]: "R\xE9voqu\xE9e"
  };

  // pages/Companies/Details.tsx
  var import_alert_dialog2 = __require("@/components/ui/alert-dialog");
  var import_jsx_runtime2 = __require("react/jsx-runtime");
  function CompanyDetails({ companyId }) {
    const router = (0, import_navigation2.useRouter)();
    const { toast } = (0, import_use_toast2.useToast)();
    const [company, setCompany] = (0, import_react2.useState)(null);
    const [contacts, setContacts] = (0, import_react2.useState)([]);
    const [loading, setLoading] = (0, import_react2.useState)(true);
    const [deleteDialogOpen, setDeleteDialogOpen] = (0, import_react2.useState)(false);
    (0, import_react2.useEffect)(() => {
      if (companyId) {
        loadCompany();
        loadContacts();
      }
    }, [companyId]);
    const loadCompany = async () => {
      try {
        const token = import_auth2.auth.getToken();
        if (!token) {
          router.push("/login");
          return;
        }
        setLoading(true);
        const data = await getCompany(token, companyId);
        setCompany(data);
      } catch (error) {
        console.error("Failed to load company:", error);
        toast({
          title: "Erreur",
          description: "Impossible de charger l'entreprise",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    const loadContacts = async () => {
      try {
        const token = import_auth2.auth.getToken();
        if (!token) return;
        const response = await getContacts(token, { company_id: companyId });
        setContacts(response.data || []);
      } catch (error) {
        console.error("Failed to load contacts:", error);
      }
    };
    const handleDelete = async () => {
      if (!company) return;
      try {
        const token = import_auth2.auth.getToken();
        if (!token) return;
        await deleteCompany(token, company.id);
        toast({
          title: "Entreprise supprim\xE9e",
          description: `${company.name} a \xE9t\xE9 supprim\xE9e`
        });
        router.push("/third-parties/companies");
      } catch (error) {
        console.error("Failed to delete company:", error);
        toast({
          title: "Erreur",
          description: "Impossible de supprimer l'entreprise",
          variant: "destructive"
        });
      }
    };
    if (loading) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "container mx-auto px-4 py-6 max-w-6xl", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_skeleton2.Skeleton, { className: "h-12 w-64 mb-6" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "grid gap-6", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_skeleton2.Skeleton, { className: "h-48 w-full" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_skeleton2.Skeleton, { className: "h-96 w-full" })
        ] })
      ] });
    }
    if (!company) {
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "container mx-auto px-4 py-6 max-w-6xl", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: "Entreprise non trouv\xE9e" }) });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "container mx-auto px-4 py-6 max-w-6xl", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-4 mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          import_button2.Button,
          {
            variant: "ghost",
            size: "icon",
            onClick: () => router.push("/third-parties/companies"),
            children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_icons_react2.IconArrowLeft, { className: "h-4 w-4" })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex-1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_icons_react2.IconBuilding, { className: "h-8 w-8" }),
            company.name
          ] }),
          company.legal_name && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm text-muted-foreground mt-1", children: company.legal_name })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            import_button2.Button,
            {
              variant: "outline",
              onClick: () => router.push(`/third-parties/companies/${company.id}/edit`),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_icons_react2.IconEdit, { className: "h-4 w-4 mr-2" }),
                "Modifier"
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_button2.Button, { variant: "destructive", onClick: () => setDeleteDialogOpen(true), children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_icons_react2.IconTrash, { className: "h-4 w-4 mr-2" }),
            "Supprimer"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_card2.Card, { className: "mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_card2.CardHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_card2.CardTitle, { children: "Informations g\xE9n\xE9rales" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_badge2.Badge, { variant: "secondary", children: CompanyTypeLabels[company.company_type] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_badge2.Badge, { variant: company.status === "active" ? "default" : "secondary", children: CompanyStatusLabels[company.status] })
          ] })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_card2.CardContent, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "space-y-4", children: [
              company.email && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_icons_react2.IconMail, { className: "h-5 w-5 text-muted-foreground" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm text-muted-foreground", children: "Email" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "font-medium", children: company.email })
                ] })
              ] }),
              company.phone && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_icons_react2.IconPhone, { className: "h-5 w-5 text-muted-foreground" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm text-muted-foreground", children: "T\xE9l\xE9phone" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "font-medium", children: company.phone })
                ] })
              ] }),
              company.website && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_icons_react2.IconWorld, { className: "h-5 w-5 text-muted-foreground" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm text-muted-foreground", children: "Site web" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                    "a",
                    {
                      href: company.website,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      className: "font-medium text-primary hover:underline",
                      children: company.website
                    }
                  )
                ] })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "space-y-4", children: [
              (company.address_line1 || company.city || company.country) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-start gap-3", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_icons_react2.IconMapPin, { className: "h-5 w-5 text-muted-foreground mt-0.5" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm text-muted-foreground", children: "Adresse" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "font-medium", children: [
                    company.address_line1 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: company.address_line1 }),
                    company.address_line2 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: company.address_line2 }),
                    company.city && company.postal_code && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: `${company.postal_code} ${company.city}` }),
                    company.country && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { children: company.country })
                  ] })
                ] })
              ] }),
              company.registration_number && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm text-muted-foreground", children: "SIRET/SIREN" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "font-medium", children: company.registration_number })
              ] }),
              company.vat_number && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm text-muted-foreground", children: "N\xB0 TVA" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "font-medium", children: company.vat_number })
              ] }),
              company.industry && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm text-muted-foreground", children: "Secteur" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "font-medium", children: company.industry })
              ] })
            ] })
          ] }),
          (company.description || company.notes) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_separator.Separator, { className: "my-6" }),
            company.description && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mb-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm text-muted-foreground mb-2", children: "Description" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm whitespace-pre-wrap", children: company.description })
            ] }),
            company.notes && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm text-muted-foreground mb-2", children: "Notes internes" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm whitespace-pre-wrap", children: company.notes })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_tabs.Tabs, { defaultValue: "contacts", className: "w-full", children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_tabs.TabsList, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_tabs.TabsTrigger, { value: "contacts", children: [
            "Contacts (",
            contacts.length,
            ")"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_tabs.TabsTrigger, { value: "activity", children: "Activit\xE9" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_tabs.TabsContent, { value: "contacts", className: "mt-6", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_card2.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_card2.CardHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_card2.CardTitle, { children: "Contacts" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
              import_button2.Button,
              {
                size: "sm",
                onClick: () => router.push(`/third-parties/contacts/new?company_id=${company.id}`),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_icons_react2.IconPlus, { className: "h-4 w-4 mr-2" }),
                  "Ajouter un contact"
                ]
              }
            )
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_card2.CardContent, { children: contacts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "text-center py-12", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_icons_react2.IconUser, { className: "h-12 w-12 mx-auto text-muted-foreground mb-4" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-muted-foreground", children: "Aucun contact" })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_table2.Table, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_table2.TableHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_table2.TableRow, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_table2.TableHead, { children: "Nom" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_table2.TableHead, { children: "Poste" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_table2.TableHead, { children: "Email" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_table2.TableHead, { children: "T\xE9l\xE9phone" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_table2.TableHead, { children: "R\xF4le" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_table2.TableHead, { children: "Statut" })
            ] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_table2.TableBody, { children: contacts.map((contact) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
              import_table2.TableRow,
              {
                className: "cursor-pointer",
                onClick: () => router.push(`/third-parties/contacts/${contact.id}`),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_table2.TableCell, { className: "font-medium", children: [
                    contact.first_name,
                    " ",
                    contact.last_name,
                    contact.is_primary && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_badge2.Badge, { variant: "outline", className: "ml-2", children: "Principal" })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_table2.TableCell, { children: contact.job_title || "-" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_table2.TableCell, { children: contact.email || "-" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_table2.TableCell, { children: contact.phone || "-" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_table2.TableCell, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_badge2.Badge, { variant: "secondary", children: ContactRoleLabels[contact.role] }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_table2.TableCell, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                    import_badge2.Badge,
                    {
                      variant: contact.status === "active" ? "default" : "secondary",
                      children: ContactStatusLabels[contact.status]
                    }
                  ) })
                ]
              },
              contact.id
            )) })
          ] }) })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_tabs.TabsContent, { value: "activity", className: "mt-6", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_card2.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_card2.CardHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_card2.CardTitle, { children: "Historique d'activit\xE9" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_card2.CardContent, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-sm text-muted-foreground", children: "Aucune activit\xE9 r\xE9cente" }) })
        ] }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_alert_dialog2.AlertDialog, { open: deleteDialogOpen, onOpenChange: setDeleteDialogOpen, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_alert_dialog2.AlertDialogContent, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_alert_dialog2.AlertDialogHeader, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_alert_dialog2.AlertDialogTitle, { children: "Confirmer la suppression" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_alert_dialog2.AlertDialogDescription, { children: [
            "\xCAtes-vous s\xFBr de vouloir supprimer l'entreprise",
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("strong", { children: company.name }),
            " ? Cette action est irr\xE9versible."
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_alert_dialog2.AlertDialogFooter, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_alert_dialog2.AlertDialogCancel, { children: "Annuler" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_alert_dialog2.AlertDialogAction, { onClick: handleDelete, className: "bg-destructive hover:bg-destructive/90", children: "Supprimer" })
        ] })
      ] }) })
    ] });
  }

  // pages/Companies/Create.tsx
  var import_react3 = __require("react");
  var import_navigation3 = __require("next/navigation");
  var import_auth3 = __require("@/lib/auth");
  var import_button3 = __require("@/components/ui/button");
  var import_input2 = __require("@/components/ui/input");
  var import_label = __require("@/components/ui/label");
  var import_textarea = __require("@/components/ui/textarea");
  var import_icons_react3 = __require("@tabler/icons-react");
  var import_card3 = __require("@/components/ui/card");
  var import_select2 = __require("@/components/ui/select");
  var import_use_toast3 = __require("@/hooks/use-toast");
  var import_jsx_runtime3 = __require("react/jsx-runtime");
  function CreateCompany() {
    const router = (0, import_navigation3.useRouter)();
    const { toast } = (0, import_use_toast3.useToast)();
    const [isSaving, setIsSaving] = (0, import_react3.useState)(false);
    const [formData, setFormData] = (0, import_react3.useState)({
      name: "",
      legal_name: "",
      registration_number: "",
      vat_number: "",
      company_type: "client" /* CLIENT */,
      status: "prospect" /* PROSPECT */,
      email: "",
      phone: "",
      website: "",
      address_line1: "",
      address_line2: "",
      city: "",
      postal_code: "",
      state: "",
      country: "",
      industry: "",
      description: "",
      notes: ""
    });
    const handleChange = (field, value) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    };
    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!formData.name.trim()) {
        toast({
          title: "Erreur",
          description: "Le nom de l'entreprise est requis",
          variant: "destructive"
        });
        return;
      }
      setIsSaving(true);
      try {
        const token = import_auth3.auth.getToken();
        if (!token) {
          router.push("/login");
          return;
        }
        const cleanData = { ...formData };
        Object.keys(cleanData).forEach((key) => {
          if (cleanData[key] === "" || cleanData[key] === void 0) {
            delete cleanData[key];
          }
        });
        const created = await createCompany(token, cleanData);
        toast({
          title: "Entreprise cr\xE9\xE9e",
          description: `"${created.name}" a \xE9t\xE9 cr\xE9\xE9e avec succ\xE8s`
        });
        router.push(`/third-parties/companies/${created.id}`);
      } catch (error) {
        console.error("Failed to create company:", error);
        toast({
          title: "Erreur",
          description: error.message || "Impossible de cr\xE9er l'entreprise",
          variant: "destructive"
        });
      } finally {
        setIsSaving(false);
      }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "container max-w-4xl mx-auto px-4 py-6 sm:py-8", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center gap-4 mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          import_button3.Button,
          {
            variant: "ghost",
            size: "icon",
            onClick: () => router.push("/third-parties/companies"),
            children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_icons_react3.IconArrowLeft, { className: "h-4 w-4" })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_icons_react3.IconBuilding, { className: "h-6 w-6" }),
            "Nouvelle entreprise"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-sm text-muted-foreground mt-1", children: "Cr\xE9er une nouvelle entreprise tierce" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("form", { onSubmit: handleSubmit, className: "space-y-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_card3.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_card3.CardHeader, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_card3.CardTitle, { children: "Informations g\xE9n\xE9rales" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_card3.CardDescription, { children: "Informations de base de l'entreprise" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_card3.CardContent, { className: "space-y-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_label.Label, { htmlFor: "name", children: [
                  "Nom commercial ",
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-destructive", children: "*" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  import_input2.Input,
                  {
                    id: "name",
                    placeholder: "Acme Corporation",
                    value: formData.name,
                    onChange: (e) => handleChange("name", e.target.value),
                    required: true,
                    autoFocus: true
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "legal_name", children: "Raison sociale" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  import_input2.Input,
                  {
                    id: "legal_name",
                    placeholder: "Acme Corporation SARL",
                    value: formData.legal_name,
                    onChange: (e) => handleChange("legal_name", e.target.value)
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_label.Label, { htmlFor: "company_type", children: [
                  "Type ",
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-destructive", children: "*" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
                  import_select2.Select,
                  {
                    value: formData.company_type,
                    onValueChange: (value) => handleChange("company_type", value),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_select2.SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_select2.SelectValue, {}) }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_select2.SelectContent, { children: Object.entries(CompanyTypeLabels).map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_select2.SelectItem, { value, children: label }, value)) })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "status", children: "Statut" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
                  import_select2.Select,
                  {
                    value: formData.status,
                    onValueChange: (value) => handleChange("status", value),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_select2.SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_select2.SelectValue, {}) }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_select2.SelectContent, { children: Object.entries(CompanyStatusLabels).map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_select2.SelectItem, { value, children: label }, value)) })
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "registration_number", children: "SIRET/SIREN" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  import_input2.Input,
                  {
                    id: "registration_number",
                    placeholder: "123 456 789 00012",
                    value: formData.registration_number,
                    onChange: (e) => handleChange("registration_number", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "vat_number", children: "Num\xE9ro de TVA" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  import_input2.Input,
                  {
                    id: "vat_number",
                    placeholder: "FR12345678901",
                    value: formData.vat_number,
                    onChange: (e) => handleChange("vat_number", e.target.value)
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "industry", children: "Secteur d'activit\xE9" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                import_input2.Input,
                {
                  id: "industry",
                  placeholder: "Technologies de l'information",
                  value: formData.industry,
                  onChange: (e) => handleChange("industry", e.target.value)
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_card3.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_card3.CardHeader, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_card3.CardTitle, { children: "Coordonn\xE9es" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_card3.CardDescription, { children: "Informations de contact de l'entreprise" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_card3.CardContent, { className: "space-y-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "email", children: "Email" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  import_input2.Input,
                  {
                    id: "email",
                    type: "email",
                    placeholder: "contact@acme.com",
                    value: formData.email,
                    onChange: (e) => handleChange("email", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "phone", children: "T\xE9l\xE9phone" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  import_input2.Input,
                  {
                    id: "phone",
                    type: "tel",
                    placeholder: "+33 1 23 45 67 89",
                    value: formData.phone,
                    onChange: (e) => handleChange("phone", e.target.value)
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "website", children: "Site web" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                import_input2.Input,
                {
                  id: "website",
                  type: "url",
                  placeholder: "https://www.acme.com",
                  value: formData.website,
                  onChange: (e) => handleChange("website", e.target.value)
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_card3.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_card3.CardHeader, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_card3.CardTitle, { children: "Adresse" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_card3.CardDescription, { children: "Adresse du si\xE8ge social" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_card3.CardContent, { className: "space-y-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "address_line1", children: "Adresse ligne 1" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                import_input2.Input,
                {
                  id: "address_line1",
                  placeholder: "123 Rue de la Paix",
                  value: formData.address_line1,
                  onChange: (e) => handleChange("address_line1", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "address_line2", children: "Adresse ligne 2" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                import_input2.Input,
                {
                  id: "address_line2",
                  placeholder: "B\xE2timent A, 2\xE8me \xE9tage",
                  value: formData.address_line2,
                  onChange: (e) => handleChange("address_line2", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "postal_code", children: "Code postal" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  import_input2.Input,
                  {
                    id: "postal_code",
                    placeholder: "75001",
                    value: formData.postal_code,
                    onChange: (e) => handleChange("postal_code", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "city", children: "Ville" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  import_input2.Input,
                  {
                    id: "city",
                    placeholder: "Paris",
                    value: formData.city,
                    onChange: (e) => handleChange("city", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "state", children: "R\xE9gion/\xC9tat" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  import_input2.Input,
                  {
                    id: "state",
                    placeholder: "\xCEle-de-France",
                    value: formData.state,
                    onChange: (e) => handleChange("state", e.target.value)
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "country", children: "Pays" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                import_input2.Input,
                {
                  id: "country",
                  placeholder: "France",
                  value: formData.country,
                  onChange: (e) => handleChange("country", e.target.value)
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_card3.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_card3.CardHeader, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_card3.CardTitle, { children: "Informations compl\xE9mentaires" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_card3.CardDescription, { children: "Description et notes sur l'entreprise" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_card3.CardContent, { className: "space-y-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "description", children: "Description" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                import_textarea.Textarea,
                {
                  id: "description",
                  placeholder: "Description courte de l'entreprise...",
                  value: formData.description,
                  onChange: (e) => handleChange("description", e.target.value),
                  rows: 3
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_label.Label, { htmlFor: "notes", children: "Notes internes" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                import_textarea.Textarea,
                {
                  id: "notes",
                  placeholder: "Notes priv\xE9es \xE0 usage interne...",
                  value: formData.notes,
                  onChange: (e) => handleChange("notes", e.target.value),
                  rows: 4
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex flex-col-reverse sm:flex-row gap-3 sm:justify-end", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            import_button3.Button,
            {
              type: "button",
              variant: "outline",
              onClick: () => router.push("/third-parties/companies"),
              disabled: isSaving,
              className: "w-full sm:w-auto",
              children: "Annuler"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            import_button3.Button,
            {
              type: "submit",
              disabled: isSaving || !formData.name.trim(),
              className: "w-full sm:w-auto",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_icons_react3.IconDeviceFloppy, { className: "h-4 w-4 mr-2" }),
                isSaving ? "Cr\xE9ation..." : "Cr\xE9er l'entreprise"
              ]
            }
          )
        ] })
      ] })
    ] });
  }

  // pages/Companies/Edit.tsx
  var import_react4 = __require("react");
  var import_navigation4 = __require("next/navigation");
  var import_auth4 = __require("@/lib/auth");
  var import_button4 = __require("@/components/ui/button");
  var import_input3 = __require("@/components/ui/input");
  var import_label2 = __require("@/components/ui/label");
  var import_textarea2 = __require("@/components/ui/textarea");
  var import_icons_react4 = __require("@tabler/icons-react");
  var import_card4 = __require("@/components/ui/card");
  var import_select3 = __require("@/components/ui/select");
  var import_skeleton3 = __require("@/components/ui/skeleton");
  var import_use_toast4 = __require("@/hooks/use-toast");
  var import_jsx_runtime4 = __require("react/jsx-runtime");
  function EditCompany({ companyId }) {
    const router = (0, import_navigation4.useRouter)();
    const { toast } = (0, import_use_toast4.useToast)();
    const [loading, setLoading] = (0, import_react4.useState)(true);
    const [isSaving, setIsSaving] = (0, import_react4.useState)(false);
    const [company, setCompany] = (0, import_react4.useState)(null);
    (0, import_react4.useEffect)(() => {
      if (companyId) {
        loadCompany();
      }
    }, [companyId]);
    const loadCompany = async () => {
      try {
        const token = import_auth4.auth.getToken();
        if (!token) {
          router.push("/login");
          return;
        }
        setLoading(true);
        const data = await getCompany(token, companyId);
        setCompany(data);
      } catch (error) {
        console.error("Failed to load company:", error);
        toast({
          title: "Erreur",
          description: "Impossible de charger l'entreprise",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    const handleChange = (field, value) => {
      if (!company) return;
      setCompany({ ...company, [field]: value });
    };
    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!company) return;
      if (!company.name.trim()) {
        toast({
          title: "Erreur",
          description: "Le nom de l'entreprise est requis",
          variant: "destructive"
        });
        return;
      }
      setIsSaving(true);
      try {
        const token = import_auth4.auth.getToken();
        if (!token) {
          router.push("/login");
          return;
        }
        const updateData = {
          name: company.name,
          legal_name: company.legal_name || void 0,
          registration_number: company.registration_number || void 0,
          vat_number: company.vat_number || void 0,
          company_type: company.company_type,
          status: company.status,
          email: company.email || void 0,
          phone: company.phone || void 0,
          website: company.website || void 0,
          address_line1: company.address_line1 || void 0,
          address_line2: company.address_line2 || void 0,
          city: company.city || void 0,
          postal_code: company.postal_code || void 0,
          state: company.state || void 0,
          country: company.country || void 0,
          industry: company.industry || void 0,
          description: company.description || void 0,
          notes: company.notes || void 0
        };
        const updated = await updateCompany(token, company.id, updateData);
        toast({
          title: "Entreprise mise \xE0 jour",
          description: `"${updated.name}" a \xE9t\xE9 mise \xE0 jour avec succ\xE8s`
        });
        router.push(`/third-parties/companies/${company.id}`);
      } catch (error) {
        console.error("Failed to update company:", error);
        toast({
          title: "Erreur",
          description: error.message || "Impossible de mettre \xE0 jour l'entreprise",
          variant: "destructive"
        });
      } finally {
        setIsSaving(false);
      }
    };
    if (loading) {
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "container max-w-4xl mx-auto px-4 py-6 sm:py-8", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_skeleton3.Skeleton, { className: "h-12 w-64 mb-6" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "space-y-6", children: [1, 2, 3, 4].map((i) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_skeleton3.Skeleton, { className: "h-64 w-full" }, i)) })
      ] });
    }
    if (!company) {
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "container max-w-4xl mx-auto px-4 py-6 sm:py-8", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: "Entreprise non trouv\xE9e" }) });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "container max-w-4xl mx-auto px-4 py-6 sm:py-8", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex items-center gap-4 mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          import_button4.Button,
          {
            variant: "ghost",
            size: "icon",
            onClick: () => router.push(`/third-parties/companies/${company.id}`),
            children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_icons_react4.IconArrowLeft, { className: "h-4 w-4" })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_icons_react4.IconBuilding, { className: "h-6 w-6" }),
            "Modifier ",
            company.name
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "text-sm text-muted-foreground mt-1", children: "Modifier les informations de l'entreprise" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("form", { onSubmit: handleSubmit, className: "space-y-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_card4.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_card4.CardHeader, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_card4.CardTitle, { children: "Informations g\xE9n\xE9rales" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_card4.CardDescription, { children: "Informations de base de l'entreprise" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_card4.CardContent, { className: "space-y-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_label2.Label, { htmlFor: "name", children: [
                  "Nom commercial ",
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-destructive", children: "*" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  import_input3.Input,
                  {
                    id: "name",
                    placeholder: "Acme Corporation",
                    value: company.name,
                    onChange: (e) => handleChange("name", e.target.value),
                    required: true
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "legal_name", children: "Raison sociale" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  import_input3.Input,
                  {
                    id: "legal_name",
                    placeholder: "Acme Corporation SARL",
                    value: company.legal_name || "",
                    onChange: (e) => handleChange("legal_name", e.target.value)
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_label2.Label, { htmlFor: "company_type", children: [
                  "Type ",
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-destructive", children: "*" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                  import_select3.Select,
                  {
                    value: company.company_type,
                    onValueChange: (value) => handleChange("company_type", value),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_select3.SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_select3.SelectValue, {}) }),
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_select3.SelectContent, { children: Object.entries(CompanyTypeLabels).map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_select3.SelectItem, { value, children: label }, value)) })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "status", children: "Statut" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                  import_select3.Select,
                  {
                    value: company.status,
                    onValueChange: (value) => handleChange("status", value),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_select3.SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_select3.SelectValue, {}) }),
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_select3.SelectContent, { children: Object.entries(CompanyStatusLabels).map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_select3.SelectItem, { value, children: label }, value)) })
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "registration_number", children: "SIRET/SIREN" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  import_input3.Input,
                  {
                    id: "registration_number",
                    placeholder: "123 456 789 00012",
                    value: company.registration_number || "",
                    onChange: (e) => handleChange("registration_number", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "vat_number", children: "Num\xE9ro de TVA" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  import_input3.Input,
                  {
                    id: "vat_number",
                    placeholder: "FR12345678901",
                    value: company.vat_number || "",
                    onChange: (e) => handleChange("vat_number", e.target.value)
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "industry", children: "Secteur d'activit\xE9" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                import_input3.Input,
                {
                  id: "industry",
                  placeholder: "Technologies de l'information",
                  value: company.industry || "",
                  onChange: (e) => handleChange("industry", e.target.value)
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_card4.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_card4.CardHeader, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_card4.CardTitle, { children: "Coordonn\xE9es" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_card4.CardDescription, { children: "Informations de contact de l'entreprise" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_card4.CardContent, { className: "space-y-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "email", children: "Email" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  import_input3.Input,
                  {
                    id: "email",
                    type: "email",
                    placeholder: "contact@acme.com",
                    value: company.email || "",
                    onChange: (e) => handleChange("email", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "phone", children: "T\xE9l\xE9phone" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  import_input3.Input,
                  {
                    id: "phone",
                    type: "tel",
                    placeholder: "+33 1 23 45 67 89",
                    value: company.phone || "",
                    onChange: (e) => handleChange("phone", e.target.value)
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "website", children: "Site web" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                import_input3.Input,
                {
                  id: "website",
                  type: "url",
                  placeholder: "https://www.acme.com",
                  value: company.website || "",
                  onChange: (e) => handleChange("website", e.target.value)
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_card4.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_card4.CardHeader, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_card4.CardTitle, { children: "Adresse" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_card4.CardDescription, { children: "Adresse du si\xE8ge social" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_card4.CardContent, { className: "space-y-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "address_line1", children: "Adresse ligne 1" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                import_input3.Input,
                {
                  id: "address_line1",
                  placeholder: "123 Rue de la Paix",
                  value: company.address_line1 || "",
                  onChange: (e) => handleChange("address_line1", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "address_line2", children: "Adresse ligne 2" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                import_input3.Input,
                {
                  id: "address_line2",
                  placeholder: "B\xE2timent A, 2\xE8me \xE9tage",
                  value: company.address_line2 || "",
                  onChange: (e) => handleChange("address_line2", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "postal_code", children: "Code postal" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  import_input3.Input,
                  {
                    id: "postal_code",
                    placeholder: "75001",
                    value: company.postal_code || "",
                    onChange: (e) => handleChange("postal_code", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "city", children: "Ville" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  import_input3.Input,
                  {
                    id: "city",
                    placeholder: "Paris",
                    value: company.city || "",
                    onChange: (e) => handleChange("city", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "state", children: "R\xE9gion/\xC9tat" }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  import_input3.Input,
                  {
                    id: "state",
                    placeholder: "\xCEle-de-France",
                    value: company.state || "",
                    onChange: (e) => handleChange("state", e.target.value)
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "country", children: "Pays" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                import_input3.Input,
                {
                  id: "country",
                  placeholder: "France",
                  value: company.country || "",
                  onChange: (e) => handleChange("country", e.target.value)
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_card4.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_card4.CardHeader, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_card4.CardTitle, { children: "Informations compl\xE9mentaires" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_card4.CardDescription, { children: "Description et notes sur l'entreprise" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_card4.CardContent, { className: "space-y-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "description", children: "Description" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                import_textarea2.Textarea,
                {
                  id: "description",
                  placeholder: "Description courte de l'entreprise...",
                  value: company.description || "",
                  onChange: (e) => handleChange("description", e.target.value),
                  rows: 3
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_label2.Label, { htmlFor: "notes", children: "Notes internes" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                import_textarea2.Textarea,
                {
                  id: "notes",
                  placeholder: "Notes priv\xE9es \xE0 usage interne...",
                  value: company.notes || "",
                  onChange: (e) => handleChange("notes", e.target.value),
                  rows: 4
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex flex-col-reverse sm:flex-row gap-3 sm:justify-end", children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
            import_button4.Button,
            {
              type: "button",
              variant: "outline",
              onClick: () => router.push(`/third-parties/companies/${company.id}`),
              disabled: isSaving,
              className: "w-full sm:w-auto",
              children: "Annuler"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
            import_button4.Button,
            {
              type: "submit",
              disabled: isSaving || !company.name.trim(),
              className: "w-full sm:w-auto",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_icons_react4.IconDeviceFloppy, { className: "h-4 w-4 mr-2" }),
                isSaving ? "Enregistrement..." : "Enregistrer les modifications"
              ]
            }
          )
        ] })
      ] })
    ] });
  }

  // pages/Contacts/List.tsx
  var import_react5 = __require("react");
  var import_navigation5 = __require("next/navigation");
  var import_auth5 = __require("@/lib/auth");
  var import_button5 = __require("@/components/ui/button");
  var import_input4 = __require("@/components/ui/input");
  var import_icons_react5 = __require("@tabler/icons-react");
  var import_card5 = __require("@/components/ui/card");
  var import_badge3 = __require("@/components/ui/badge");
  var import_table3 = __require("@/components/ui/table");
  var import_select4 = __require("@/components/ui/select");
  var import_skeleton4 = __require("@/components/ui/skeleton");
  var import_use_toast5 = __require("@/hooks/use-toast");
  var import_alert_dialog3 = __require("@/components/ui/alert-dialog");
  var import_jsx_runtime5 = __require("react/jsx-runtime");
  function ContactsList() {
    const router = (0, import_navigation5.useRouter)();
    const searchParams = (0, import_navigation5.useSearchParams)();
    const { toast } = (0, import_use_toast5.useToast)();
    const [contacts, setContacts] = (0, import_react5.useState)([]);
    const [companies, setCompanies] = (0, import_react5.useState)([]);
    const [loading, setLoading] = (0, import_react5.useState)(true);
    const [search, setSearch] = (0, import_react5.useState)("");
    const [companyFilter, setCompanyFilter] = (0, import_react5.useState)(searchParams.get("company_id") || "all");
    const [statusFilter, setStatusFilter] = (0, import_react5.useState)("all");
    const [roleFilter, setRoleFilter] = (0, import_react5.useState)("all");
    const [deleteDialogOpen, setDeleteDialogOpen] = (0, import_react5.useState)(false);
    const [contactToDelete, setContactToDelete] = (0, import_react5.useState)(null);
    (0, import_react5.useEffect)(() => {
      loadCompanies();
      loadContacts();
    }, [companyFilter, statusFilter, roleFilter]);
    const loadCompanies = async () => {
      try {
        const token = import_auth5.auth.getToken();
        if (!token) return;
        const response = await getCompanies(token, { limit: 1e3 });
        setCompanies(response.data || []);
      } catch (error) {
        console.error("Failed to load companies:", error);
      }
    };
    const loadContacts = async () => {
      try {
        const token = import_auth5.auth.getToken();
        if (!token) {
          router.push("/login");
          return;
        }
        setLoading(true);
        const params = { limit: 100 };
        if (search) params.search = search;
        if (companyFilter !== "all") params.company_id = companyFilter;
        if (statusFilter !== "all") params.status = statusFilter;
        if (roleFilter !== "all") params.role = roleFilter;
        const response = await getContacts(token, params);
        setContacts(response.data || []);
      } catch (error) {
        console.error("Failed to load contacts:", error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les contacts",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    const handleSearch = () => {
      loadContacts();
    };
    const handleDelete = async () => {
      if (!contactToDelete) return;
      try {
        const token = import_auth5.auth.getToken();
        if (!token) return;
        await deleteContact(token, contactToDelete.id);
        toast({
          title: "Contact supprim\xE9",
          description: `${contactToDelete.first_name} ${contactToDelete.last_name} a \xE9t\xE9 supprim\xE9`
        });
        setDeleteDialogOpen(false);
        setContactToDelete(null);
        loadContacts();
      } catch (error) {
        console.error("Failed to delete contact:", error);
        toast({
          title: "Erreur",
          description: "Impossible de supprimer le contact",
          variant: "destructive"
        });
      }
    };
    const getCompanyName = (companyId) => {
      const company = companies.find((c) => c.id === companyId);
      return company?.name || "-";
    };
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "container mx-auto px-4 py-6 max-w-7xl", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_icons_react5.IconUser, { className: "h-8 w-8" }),
            "Contacts"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "text-sm text-muted-foreground mt-1", children: "Gestion des contacts des entreprises tierces" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_button5.Button, { onClick: () => router.push("/third-parties/contacts/new"), children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_icons_react5.IconPlus, { className: "h-4 w-4 mr-2" }),
          "Nouveau contact"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_card5.Card, { className: "mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_card5.CardHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_card5.CardTitle, { className: "text-lg", children: "Filtres" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_card5.CardContent, { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex flex-col sm:flex-row gap-3", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex-1 relative", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_icons_react5.IconSearch, { className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              import_input4.Input,
              {
                placeholder: "Rechercher un contact...",
                value: search,
                onChange: (e) => setSearch(e.target.value),
                onKeyDown: (e) => e.key === "Enter" && handleSearch(),
                className: "pl-9"
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_select4.Select, { value: companyFilter, onValueChange: setCompanyFilter, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_select4.SelectTrigger, { className: "w-full sm:w-[200px]", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_select4.SelectValue, { placeholder: "Entreprise" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_select4.SelectContent, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_select4.SelectItem, { value: "all", children: "Toutes les entreprises" }),
              companies.map((company) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_select4.SelectItem, { value: company.id, children: company.name }, company.id))
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_select4.Select, { value: roleFilter, onValueChange: setRoleFilter, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_select4.SelectTrigger, { className: "w-full sm:w-[180px]", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_select4.SelectValue, { placeholder: "R\xF4le" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_select4.SelectContent, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_select4.SelectItem, { value: "all", children: "Tous les r\xF4les" }),
              Object.entries(ContactRoleLabels).map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_select4.SelectItem, { value, children: label }, value))
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_select4.Select, { value: statusFilter, onValueChange: setStatusFilter, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_select4.SelectTrigger, { className: "w-full sm:w-[180px]", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_select4.SelectValue, { placeholder: "Statut" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_select4.SelectContent, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_select4.SelectItem, { value: "all", children: "Tous les statuts" }),
              Object.entries(ContactStatusLabels).map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_select4.SelectItem, { value, children: label }, value))
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_button5.Button, { onClick: handleSearch, variant: "secondary", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_icons_react5.IconFilter, { className: "h-4 w-4 mr-2" }),
            "Filtrer"
          ] })
        ] }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_card5.Card, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_card5.CardHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_card5.CardTitle, { children: loading ? "Chargement..." : `${contacts.length} contact${contacts.length > 1 ? "s" : ""}` }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_button5.Button, { variant: "outline", size: "sm", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_icons_react5.IconDownload, { className: "h-4 w-4 mr-2" }),
            "Exporter"
          ] })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_card5.CardContent, { children: loading ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "space-y-3", children: [1, 2, 3, 4, 5].map((i) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_skeleton4.Skeleton, { className: "h-16 w-full" }, i)) }) : contacts.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "text-center py-12", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_icons_react5.IconUser, { className: "h-12 w-12 mx-auto text-muted-foreground mb-4" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "text-muted-foreground", children: "Aucun contact trouv\xE9" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
            import_button5.Button,
            {
              variant: "outline",
              className: "mt-4",
              onClick: () => router.push("/third-parties/contacts/new"),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_icons_react5.IconPlus, { className: "h-4 w-4 mr-2" }),
                "Cr\xE9er le premier contact"
              ]
            }
          )
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "overflow-x-auto", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_table3.Table, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_table3.TableRow, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableHead, { children: "Nom" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableHead, { children: "Entreprise" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableHead, { children: "Poste" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableHead, { children: "Email" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableHead, { children: "T\xE9l\xE9phone" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableHead, { children: "R\xF4le" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableHead, { children: "Statut" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableHead, { className: "text-right", children: "Actions" })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableBody, { children: contacts.map((contact) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_table3.TableRow, { className: "cursor-pointer hover:bg-muted/50", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableCell, { className: "font-medium", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "flex items-center gap-2", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "font-semibold", children: [
                contact.first_name,
                " ",
                contact.last_name
              ] }),
              contact.is_primary && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_badge3.Badge, { variant: "outline", className: "mt-1 text-xs", children: "Principal" })
            ] }) }) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableCell, { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_icons_react5.IconBuilding, { className: "h-4 w-4 text-muted-foreground" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "text-sm", children: getCompanyName(contact.company_id) })
            ] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableCell, { className: "text-sm", children: contact.job_title || "-" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableCell, { className: "text-sm", children: contact.email || "-" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableCell, { className: "text-sm", children: contact.phone || "-" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableCell, { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_badge3.Badge, { variant: "outline", children: ContactRoleLabels[contact.role] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableCell, { children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_badge3.Badge, { variant: contact.status === "active" ? "default" : "secondary", children: ContactStatusLabels[contact.status] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_table3.TableCell, { className: "text-right", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center justify-end gap-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                import_button5.Button,
                {
                  variant: "ghost",
                  size: "icon",
                  className: "h-8 w-8",
                  onClick: () => router.push(`/third-parties/contacts/${contact.id}`),
                  children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_icons_react5.IconEye, { className: "h-4 w-4" })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                import_button5.Button,
                {
                  variant: "ghost",
                  size: "icon",
                  className: "h-8 w-8",
                  onClick: () => router.push(`/third-parties/contacts/${contact.id}/edit`),
                  children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_icons_react5.IconEdit, { className: "h-4 w-4" })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                import_button5.Button,
                {
                  variant: "ghost",
                  size: "icon",
                  className: "h-8 w-8 text-destructive",
                  onClick: () => {
                    setContactToDelete(contact);
                    setDeleteDialogOpen(true);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_icons_react5.IconTrash, { className: "h-4 w-4" })
                }
              )
            ] }) })
          ] }, contact.id)) })
        ] }) }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_alert_dialog3.AlertDialog, { open: deleteDialogOpen, onOpenChange: setDeleteDialogOpen, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_alert_dialog3.AlertDialogContent, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_alert_dialog3.AlertDialogHeader, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_alert_dialog3.AlertDialogTitle, { children: "Confirmer la suppression" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_alert_dialog3.AlertDialogDescription, { children: [
            "\xCAtes-vous s\xFBr de vouloir supprimer le contact",
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("strong", { children: [
              contactToDelete?.first_name,
              " ",
              contactToDelete?.last_name
            ] }),
            " ? Cette action est irr\xE9versible."
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_alert_dialog3.AlertDialogFooter, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_alert_dialog3.AlertDialogCancel, { children: "Annuler" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_alert_dialog3.AlertDialogAction, { onClick: handleDelete, className: "bg-destructive hover:bg-destructive/90", children: "Supprimer" })
        ] })
      ] }) })
    ] });
  }

  // pages/Contacts/Details.tsx
  var import_react6 = __require("react");
  var import_navigation6 = __require("next/navigation");
  var import_auth6 = __require("@/lib/auth");
  var import_button6 = __require("@/components/ui/button");
  var import_icons_react6 = __require("@tabler/icons-react");
  var import_card6 = __require("@/components/ui/card");
  var import_badge4 = __require("@/components/ui/badge");
  var import_skeleton5 = __require("@/components/ui/skeleton");
  var import_separator2 = __require("@/components/ui/separator");
  var import_tabs2 = __require("@/components/ui/tabs");
  var import_use_toast6 = __require("@/hooks/use-toast");
  var import_alert_dialog4 = __require("@/components/ui/alert-dialog");
  var import_jsx_runtime6 = __require("react/jsx-runtime");
  function ContactDetails({ contactId }) {
    const router = (0, import_navigation6.useRouter)();
    const { toast } = (0, import_use_toast6.useToast)();
    const [contact, setContact] = (0, import_react6.useState)(null);
    const [company, setCompany] = (0, import_react6.useState)(null);
    const [loading, setLoading] = (0, import_react6.useState)(true);
    const [deleteDialogOpen, setDeleteDialogOpen] = (0, import_react6.useState)(false);
    (0, import_react6.useEffect)(() => {
      if (contactId) {
        loadContact();
      }
    }, [contactId]);
    const loadContact = async () => {
      try {
        const token = import_auth6.auth.getToken();
        if (!token) {
          router.push("/login");
          return;
        }
        setLoading(true);
        const data = await getContact(token, contactId);
        setContact(data);
        if (data.company_id) {
          const companyData = await getCompany(token, data.company_id);
          setCompany(companyData);
        }
      } catch (error) {
        console.error("Failed to load contact:", error);
        toast({
          title: "Erreur",
          description: "Impossible de charger le contact",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    const handleDelete = async () => {
      if (!contact) return;
      try {
        const token = import_auth6.auth.getToken();
        if (!token) return;
        await deleteContact(token, contact.id);
        toast({
          title: "Contact supprim\xE9",
          description: `${contact.first_name} ${contact.last_name} a \xE9t\xE9 supprim\xE9`
        });
        router.push("/third-parties/contacts");
      } catch (error) {
        console.error("Failed to delete contact:", error);
        toast({
          title: "Erreur",
          description: "Impossible de supprimer le contact",
          variant: "destructive"
        });
      }
    };
    const handleInvite = () => {
      if (!contact) return;
      router.push(`/third-parties/invitations/new?contact_id=${contact.id}`);
    };
    if (loading) {
      return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "container mx-auto px-4 py-6 max-w-6xl", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_skeleton5.Skeleton, { className: "h-12 w-64 mb-6" }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "grid gap-6", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_skeleton5.Skeleton, { className: "h-48 w-full" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_skeleton5.Skeleton, { className: "h-96 w-full" })
        ] })
      ] });
    }
    if (!contact) {
      return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "container mx-auto px-4 py-6 max-w-6xl", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { children: "Contact non trouv\xE9" }) });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "container mx-auto px-4 py-6 max-w-6xl", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center gap-4 mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          import_button6.Button,
          {
            variant: "ghost",
            size: "icon",
            onClick: () => router.push("/third-parties/contacts"),
            children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_icons_react6.IconArrowLeft, { className: "h-4 w-4" })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex-1", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_icons_react6.IconUser, { className: "h-8 w-8" }),
            contact.civility && `${contact.civility} `,
            contact.first_name,
            " ",
            contact.last_name
          ] }),
          contact.job_title && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm text-muted-foreground mt-1", children: contact.job_title })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex gap-2", children: [
          !contact.has_user_account && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_button6.Button, { variant: "outline", onClick: handleInvite, children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_icons_react6.IconSend, { className: "h-4 w-4 mr-2" }),
            "Inviter"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
            import_button6.Button,
            {
              variant: "outline",
              onClick: () => router.push(`/third-parties/contacts/${contact.id}/edit`),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_icons_react6.IconEdit, { className: "h-4 w-4 mr-2" }),
                "Modifier"
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_button6.Button, { variant: "destructive", onClick: () => setDeleteDialogOpen(true), children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_icons_react6.IconTrash, { className: "h-4 w-4 mr-2" }),
            "Supprimer"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_card6.Card, { className: "mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_card6.CardHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_card6.CardTitle, { children: "Informations du contact" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_badge4.Badge, { variant: "outline", children: ContactRoleLabels[contact.role] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_badge4.Badge, { variant: contact.status === "active" ? "default" : "secondary", children: ContactStatusLabels[contact.status] }),
            contact.is_primary && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_badge4.Badge, { variant: "default", children: "Principal" }),
            contact.has_user_account && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_badge4.Badge, { variant: "secondary", children: "Compte utilisateur" })
          ] })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_card6.CardContent, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "space-y-4", children: [
              company && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_icons_react6.IconBuilding, { className: "h-5 w-5 text-muted-foreground" }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm text-muted-foreground", children: "Entreprise" }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                    "p",
                    {
                      className: "font-medium text-primary hover:underline cursor-pointer",
                      onClick: () => router.push(`/third-parties/companies/${company.id}`),
                      children: company.name
                    }
                  )
                ] })
              ] }),
              contact.email && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_icons_react6.IconMail, { className: "h-5 w-5 text-muted-foreground" }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm text-muted-foreground", children: "Email" }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                    "a",
                    {
                      href: `mailto:${contact.email}`,
                      className: "font-medium text-primary hover:underline",
                      children: contact.email
                    }
                  )
                ] })
              ] }),
              contact.phone && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_icons_react6.IconPhone, { className: "h-5 w-5 text-muted-foreground" }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm text-muted-foreground", children: "T\xE9l\xE9phone" }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "font-medium", children: contact.phone })
                ] })
              ] }),
              contact.mobile && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_icons_react6.IconPhone, { className: "h-5 w-5 text-muted-foreground" }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm text-muted-foreground", children: "Mobile" }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "font-medium", children: contact.mobile })
                ] })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "space-y-4", children: [
              contact.department && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm text-muted-foreground", children: "D\xE9partement" }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "font-medium", children: contact.department })
              ] }),
              contact.extension && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm text-muted-foreground", children: "Extension" }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "font-medium", children: contact.extension })
              ] }),
              contact.linkedin_url && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_icons_react6.IconBrandLinkedin, { className: "h-5 w-5 text-muted-foreground" }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm text-muted-foreground", children: "LinkedIn" }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
                    "a",
                    {
                      href: contact.linkedin_url,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      className: "font-medium text-primary hover:underline",
                      children: "Voir le profil"
                    }
                  )
                ] })
              ] }),
              contact.twitter_handle && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_icons_react6.IconBrandTwitter, { className: "h-5 w-5 text-muted-foreground" }),
                /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm text-muted-foreground", children: "Twitter" }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "font-medium", children: contact.twitter_handle })
                ] })
              ] })
            ] })
          ] }),
          contact.notes && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_separator2.Separator, { className: "my-6" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm text-muted-foreground mb-2", children: "Notes internes" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm whitespace-pre-wrap", children: contact.notes })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_tabs2.Tabs, { defaultValue: "activity", className: "w-full", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_tabs2.TabsList, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_tabs2.TabsTrigger, { value: "activity", children: "Activit\xE9" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_tabs2.TabsTrigger, { value: "invitations", children: "Invitations" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_tabs2.TabsContent, { value: "activity", className: "mt-6", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_card6.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_card6.CardHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_card6.CardTitle, { children: "Historique d'activit\xE9" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_card6.CardContent, { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm text-muted-foreground", children: "Aucune activit\xE9 r\xE9cente" }) })
        ] }) }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_tabs2.TabsContent, { value: "invitations", className: "mt-6", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_card6.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_card6.CardHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_card6.CardTitle, { children: "Invitations" }),
            !contact.has_user_account && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_button6.Button, { size: "sm", onClick: handleInvite, children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_icons_react6.IconSend, { className: "h-4 w-4 mr-2" }),
              "Envoyer une invitation"
            ] })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_card6.CardContent, { children: contact.has_user_account ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm text-muted-foreground", children: "Ce contact poss\xE8de d\xE9j\xE0 un compte utilisateur" }) : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: "text-sm text-muted-foreground", children: "Aucune invitation envoy\xE9e" }) })
        ] }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_alert_dialog4.AlertDialog, { open: deleteDialogOpen, onOpenChange: setDeleteDialogOpen, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_alert_dialog4.AlertDialogContent, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_alert_dialog4.AlertDialogHeader, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_alert_dialog4.AlertDialogTitle, { children: "Confirmer la suppression" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_alert_dialog4.AlertDialogDescription, { children: [
            "\xCAtes-vous s\xFBr de vouloir supprimer le contact",
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("strong", { children: [
              contact.first_name,
              " ",
              contact.last_name
            ] }),
            " ? Cette action est irr\xE9versible."
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_alert_dialog4.AlertDialogFooter, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_alert_dialog4.AlertDialogCancel, { children: "Annuler" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(import_alert_dialog4.AlertDialogAction, { onClick: handleDelete, className: "bg-destructive hover:bg-destructive/90", children: "Supprimer" })
        ] })
      ] }) })
    ] });
  }

  // pages/Contacts/Create.tsx
  var import_react7 = __require("react");
  var import_navigation7 = __require("next/navigation");
  var import_auth7 = __require("@/lib/auth");
  var import_button7 = __require("@/components/ui/button");
  var import_input5 = __require("@/components/ui/input");
  var import_label3 = __require("@/components/ui/label");
  var import_textarea3 = __require("@/components/ui/textarea");
  var import_icons_react7 = __require("@tabler/icons-react");
  var import_card7 = __require("@/components/ui/card");
  var import_select5 = __require("@/components/ui/select");
  var import_switch = __require("@/components/ui/switch");
  var import_skeleton6 = __require("@/components/ui/skeleton");
  var import_use_toast7 = __require("@/hooks/use-toast");
  var import_jsx_runtime7 = __require("react/jsx-runtime");
  function CreateContact() {
    const router = (0, import_navigation7.useRouter)();
    const searchParams = (0, import_navigation7.useSearchParams)();
    const { toast } = (0, import_use_toast7.useToast)();
    const [isSaving, setIsSaving] = (0, import_react7.useState)(false);
    const [loadingCompanies, setLoadingCompanies] = (0, import_react7.useState)(true);
    const [companies, setCompanies] = (0, import_react7.useState)([]);
    const [formData, setFormData] = (0, import_react7.useState)({
      company_id: searchParams.get("company_id") || "",
      first_name: "",
      last_name: "",
      civility: "",
      job_title: "",
      department: "",
      role: "employee" /* EMPLOYEE */,
      email: "",
      phone: "",
      mobile: "",
      extension: "",
      linkedin_url: "",
      twitter_handle: "",
      status: "active" /* ACTIVE */,
      notes: "",
      is_primary: false
    });
    (0, import_react7.useEffect)(() => {
      loadCompanies();
    }, []);
    const loadCompanies = async () => {
      try {
        const token = import_auth7.auth.getToken();
        if (!token) {
          router.push("/login");
          return;
        }
        setLoadingCompanies(true);
        const response = await getCompanies(token, { limit: 1e3, status: "active" });
        setCompanies(response.data || []);
      } catch (error) {
        console.error("Failed to load companies:", error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les entreprises",
          variant: "destructive"
        });
      } finally {
        setLoadingCompanies(false);
      }
    };
    const handleChange = (field, value) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
    };
    const handleSubmit = async (e) => {
      e.preventDefault();
      if (!formData.company_id) {
        toast({
          title: "Erreur",
          description: "Veuillez s\xE9lectionner une entreprise",
          variant: "destructive"
        });
        return;
      }
      if (!formData.first_name.trim() || !formData.last_name.trim()) {
        toast({
          title: "Erreur",
          description: "Le pr\xE9nom et le nom sont requis",
          variant: "destructive"
        });
        return;
      }
      if (!formData.email.trim()) {
        toast({
          title: "Erreur",
          description: "L'email est requis",
          variant: "destructive"
        });
        return;
      }
      setIsSaving(true);
      try {
        const token = import_auth7.auth.getToken();
        if (!token) {
          router.push("/login");
          return;
        }
        const cleanData = { ...formData };
        Object.keys(cleanData).forEach((key) => {
          if (cleanData[key] === "" || cleanData[key] === void 0) {
            delete cleanData[key];
          }
        });
        const created = await createContact(token, cleanData);
        toast({
          title: "Contact cr\xE9\xE9",
          description: `"${created.first_name} ${created.last_name}" a \xE9t\xE9 cr\xE9\xE9 avec succ\xE8s`
        });
        router.push(`/third-parties/contacts/${created.id}`);
      } catch (error) {
        console.error("Failed to create contact:", error);
        toast({
          title: "Erreur",
          description: error.message || "Impossible de cr\xE9er le contact",
          variant: "destructive"
        });
      } finally {
        setIsSaving(false);
      }
    };
    if (loadingCompanies) {
      return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "container max-w-4xl mx-auto px-4 py-6 sm:py-8", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_skeleton6.Skeleton, { className: "h-12 w-64 mb-6" }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "space-y-6", children: [1, 2, 3].map((i) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_skeleton6.Skeleton, { className: "h-64 w-full" }, i)) })
      ] });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "container max-w-4xl mx-auto px-4 py-6 sm:py-8", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "flex items-center gap-4 mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          import_button7.Button,
          {
            variant: "ghost",
            size: "icon",
            onClick: () => router.push("/third-parties/contacts"),
            children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_icons_react7.IconArrowLeft, { className: "h-4 w-4" })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_icons_react7.IconUser, { className: "h-6 w-6" }),
            "Nouveau contact"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "text-sm text-muted-foreground mt-1", children: "Cr\xE9er un nouveau contact pour une entreprise" })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("form", { onSubmit: handleSubmit, className: "space-y-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_card7.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_card7.CardHeader, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_card7.CardTitle, { children: "Entreprise" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_card7.CardDescription, { children: "S\xE9lectionnez l'entreprise associ\xE9e \xE0 ce contact" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_card7.CardContent, { className: "space-y-4", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_label3.Label, { htmlFor: "company_id", children: [
              "Entreprise ",
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-destructive", children: "*" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
              import_select5.Select,
              {
                value: formData.company_id,
                onValueChange: (value) => handleChange("company_id", value),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectValue, { placeholder: "S\xE9lectionner une entreprise" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectContent, { children: companies.map((company) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectItem, { value: company.id, children: company.name }, company.id)) })
                ]
              }
            )
          ] }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_card7.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_card7.CardHeader, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_card7.CardTitle, { children: "Informations personnelles" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_card7.CardDescription, { children: "Informations de base du contact" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_card7.CardContent, { className: "space-y-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_label3.Label, { htmlFor: "civility", children: "Civilit\xE9" }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
                  import_select5.Select,
                  {
                    value: formData.civility,
                    onValueChange: (value) => handleChange("civility", value),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectValue, { placeholder: "S\xE9lectionner" }) }),
                      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_select5.SelectContent, { children: [
                        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectItem, { value: "mr", children: "M." }),
                        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectItem, { value: "mrs", children: "Mme" }),
                        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectItem, { value: "ms", children: "Mlle" }),
                        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectItem, { value: "dr", children: "Dr" })
                      ] })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_label3.Label, { htmlFor: "first_name", children: [
                  "Pr\xE9nom ",
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-destructive", children: "*" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                  import_input5.Input,
                  {
                    id: "first_name",
                    placeholder: "Jean",
                    value: formData.first_name,
                    onChange: (e) => handleChange("first_name", e.target.value),
                    required: true,
                    autoFocus: true
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_label3.Label, { htmlFor: "last_name", children: [
                  "Nom ",
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-destructive", children: "*" })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                  import_input5.Input,
                  {
                    id: "last_name",
                    placeholder: "Dupont",
                    value: formData.last_name,
                    onChange: (e) => handleChange("last_name", e.target.value),
                    required: true
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_label3.Label, { htmlFor: "job_title", children: "Poste" }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                  import_input5.Input,
                  {
                    id: "job_title",
                    placeholder: "Directeur Commercial",
                    value: formData.job_title,
                    onChange: (e) => handleChange("job_title", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_label3.Label, { htmlFor: "department", children: "D\xE9partement" }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                  import_input5.Input,
                  {
                    id: "department",
                    placeholder: "Commercial",
                    value: formData.department,
                    onChange: (e) => handleChange("department", e.target.value)
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_label3.Label, { htmlFor: "role", children: "R\xF4le" }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
                  import_select5.Select,
                  {
                    value: formData.role,
                    onValueChange: (value) => handleChange("role", value),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectValue, {}) }),
                      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectContent, { children: Object.entries(ContactRoleLabels).map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectItem, { value, children: label }, value)) })
                    ]
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_label3.Label, { htmlFor: "status", children: "Statut" }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
                  import_select5.Select,
                  {
                    value: formData.status,
                    onValueChange: (value) => handleChange("status", value),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectValue, {}) }),
                      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectContent, { children: Object.entries(ContactStatusLabels).map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_select5.SelectItem, { value, children: label }, value)) })
                    ]
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "flex items-center justify-between", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-0.5", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_label3.Label, { htmlFor: "is_primary", children: "Contact principal" }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "text-xs text-muted-foreground", children: "Marquer ce contact comme contact principal de l'entreprise" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                import_switch.Switch,
                {
                  id: "is_primary",
                  checked: formData.is_primary,
                  onCheckedChange: (checked) => handleChange("is_primary", checked)
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_card7.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_card7.CardHeader, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_card7.CardTitle, { children: "Coordonn\xE9es" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_card7.CardDescription, { children: "Informations de contact" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_card7.CardContent, { className: "space-y-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_label3.Label, { htmlFor: "email", children: [
                "Email ",
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-destructive", children: "*" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                import_input5.Input,
                {
                  id: "email",
                  type: "email",
                  placeholder: "jean.dupont@entreprise.com",
                  value: formData.email,
                  onChange: (e) => handleChange("email", e.target.value),
                  required: true
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_label3.Label, { htmlFor: "phone", children: "T\xE9l\xE9phone" }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                  import_input5.Input,
                  {
                    id: "phone",
                    type: "tel",
                    placeholder: "+33 1 23 45 67 89",
                    value: formData.phone,
                    onChange: (e) => handleChange("phone", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_label3.Label, { htmlFor: "mobile", children: "Mobile" }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                  import_input5.Input,
                  {
                    id: "mobile",
                    type: "tel",
                    placeholder: "+33 6 12 34 56 78",
                    value: formData.mobile,
                    onChange: (e) => handleChange("mobile", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_label3.Label, { htmlFor: "extension", children: "Extension" }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                  import_input5.Input,
                  {
                    id: "extension",
                    placeholder: "1234",
                    value: formData.extension,
                    onChange: (e) => handleChange("extension", e.target.value)
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_label3.Label, { htmlFor: "linkedin_url", children: "LinkedIn" }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                  import_input5.Input,
                  {
                    id: "linkedin_url",
                    type: "url",
                    placeholder: "https://linkedin.com/in/jeandupont",
                    value: formData.linkedin_url,
                    onChange: (e) => handleChange("linkedin_url", e.target.value)
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_label3.Label, { htmlFor: "twitter_handle", children: "Twitter" }),
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
                  import_input5.Input,
                  {
                    id: "twitter_handle",
                    placeholder: "@jeandupont",
                    value: formData.twitter_handle,
                    onChange: (e) => handleChange("twitter_handle", e.target.value)
                  }
                )
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_card7.Card, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_card7.CardHeader, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_card7.CardTitle, { children: "Notes" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_card7.CardDescription, { children: "Informations compl\xE9mentaires sur le contact" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_card7.CardContent, { className: "space-y-4", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_label3.Label, { htmlFor: "notes", children: "Notes internes" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              import_textarea3.Textarea,
              {
                id: "notes",
                placeholder: "Notes priv\xE9es \xE0 usage interne...",
                value: formData.notes,
                onChange: (e) => handleChange("notes", e.target.value),
                rows: 4
              }
            )
          ] }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "flex flex-col-reverse sm:flex-row gap-3 sm:justify-end", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            import_button7.Button,
            {
              type: "button",
              variant: "outline",
              onClick: () => router.push("/third-parties/contacts"),
              disabled: isSaving,
              className: "w-full sm:w-auto",
              children: "Annuler"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
            import_button7.Button,
            {
              type: "submit",
              disabled: isSaving || !formData.company_id || !formData.first_name.trim() || !formData.last_name.trim() || !formData.email.trim(),
              className: "w-full sm:w-auto",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_icons_react7.IconDeviceFloppy, { className: "h-4 w-4 mr-2" }),
                isSaving ? "Cr\xE9ation..." : "Cr\xE9er le contact"
              ]
            }
          )
        ] })
      ] })
    ] });
  }

  // pages/Invitations/List.tsx
  var import_react8 = __require("react");
  var import_navigation8 = __require("next/navigation");
  var import_auth8 = __require("@/lib/auth");
  var import_button8 = __require("@/components/ui/button");
  var import_icons_react8 = __require("@tabler/icons-react");
  var import_card8 = __require("@/components/ui/card");
  var import_badge5 = __require("@/components/ui/badge");
  var import_table4 = __require("@/components/ui/table");
  var import_select6 = __require("@/components/ui/select");
  var import_skeleton7 = __require("@/components/ui/skeleton");
  var import_use_toast8 = __require("@/hooks/use-toast");
  var import_alert_dialog5 = __require("@/components/ui/alert-dialog");
  var import_jsx_runtime8 = __require("react/jsx-runtime");
  function InvitationsList() {
    const router = (0, import_navigation8.useRouter)();
    const { toast } = (0, import_use_toast8.useToast)();
    const [invitations, setInvitations] = (0, import_react8.useState)([]);
    const [contacts, setContacts] = (0, import_react8.useState)([]);
    const [loading, setLoading] = (0, import_react8.useState)(true);
    const [statusFilter, setStatusFilter] = (0, import_react8.useState)("all");
    const [revokeDialogOpen, setRevokeDialogOpen] = (0, import_react8.useState)(false);
    const [invitationToRevoke, setInvitationToRevoke] = (0, import_react8.useState)(null);
    const [copiedToken, setCopiedToken] = (0, import_react8.useState)(null);
    (0, import_react8.useEffect)(() => {
      loadInvitations();
      loadContacts();
    }, [statusFilter]);
    const loadInvitations = async () => {
      try {
        const token = import_auth8.auth.getToken();
        if (!token) {
          router.push("/login");
          return;
        }
        setLoading(true);
        const params = { limit: 100 };
        if (statusFilter !== "all") params.status = statusFilter;
        const response = await getInvitations(token, params);
        setInvitations(response.data || []);
      } catch (error) {
        console.error("Failed to load invitations:", error);
        toast({
          title: "Erreur",
          description: "Impossible de charger les invitations",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };
    const loadContacts = async () => {
      try {
        const token = import_auth8.auth.getToken();
        if (!token) return;
        const response = await getContacts(token, { limit: 1e3 });
        setContacts(response.data || []);
      } catch (error) {
        console.error("Failed to load contacts:", error);
      }
    };
    const handleRevoke = async () => {
      if (!invitationToRevoke) return;
      try {
        const token = import_auth8.auth.getToken();
        if (!token) return;
        await revokeInvitation(token, invitationToRevoke.id);
        toast({
          title: "Invitation r\xE9voqu\xE9e",
          description: "L'invitation a \xE9t\xE9 r\xE9voqu\xE9e avec succ\xE8s"
        });
        setRevokeDialogOpen(false);
        setInvitationToRevoke(null);
        loadInvitations();
      } catch (error) {
        console.error("Failed to revoke invitation:", error);
        toast({
          title: "Erreur",
          description: "Impossible de r\xE9voquer l'invitation",
          variant: "destructive"
        });
      }
    };
    const copyInvitationLink = async (token) => {
      const baseUrl = window.location.origin;
      const invitationUrl = `${baseUrl}/accept-invitation/${token}`;
      try {
        await navigator.clipboard.writeText(invitationUrl);
        setCopiedToken(token);
        toast({
          title: "Lien copi\xE9",
          description: "Le lien d'invitation a \xE9t\xE9 copi\xE9 dans le presse-papiers"
        });
        setTimeout(() => setCopiedToken(null), 2e3);
      } catch (error) {
        toast({
          title: "Erreur",
          description: "Impossible de copier le lien",
          variant: "destructive"
        });
      }
    };
    const getContactName = (contactId) => {
      const contact = contacts.find((c) => c.id === contactId);
      return contact ? `${contact.first_name} ${contact.last_name}` : "-";
    };
    const getContactEmail = (contactId) => {
      const contact = contacts.find((c) => c.id === contactId);
      return contact?.email || "-";
    };
    const getStatusBadge = (status) => {
      const variants = {
        pending: "outline",
        accepted: "default",
        expired: "secondary",
        revoked: "destructive"
      };
      return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_badge5.Badge, { variant: variants[status.toLowerCase()] || "secondary", children: InvitationStatusLabels[status] });
    };
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat("fr-FR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    };
    const isExpired = (expiresAt) => {
      return new Date(expiresAt) < /* @__PURE__ */ new Date();
    };
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "container mx-auto px-4 py-6 max-w-7xl", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_icons_react8.IconSend, { className: "h-8 w-8" }),
            "Invitations"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "text-sm text-muted-foreground mt-1", children: "Gestion des invitations envoy\xE9es aux contacts" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_button8.Button, { onClick: loadInvitations, variant: "outline", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_icons_react8.IconRefresh, { className: "h-4 w-4 mr-2" }),
          "Actualiser"
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_card8.Card, { className: "mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_card8.CardHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_card8.CardTitle, { className: "text-lg", children: "Filtres" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_card8.CardContent, { children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "flex flex-col sm:flex-row gap-3", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_select6.Select, { value: statusFilter, onValueChange: setStatusFilter, children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_select6.SelectTrigger, { className: "w-full sm:w-[200px]", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_select6.SelectValue, { placeholder: "Statut" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_select6.SelectContent, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_select6.SelectItem, { value: "all", children: "Tous les statuts" }),
            Object.entries(InvitationStatusLabels).map(([value, label]) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_select6.SelectItem, { value, children: label }, value))
          ] })
        ] }) }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_card8.Card, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_card8.CardHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_card8.CardTitle, { children: loading ? "Chargement..." : `${invitations.length} invitation${invitations.length > 1 ? "s" : ""}` }) }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_card8.CardContent, { children: loading ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "space-y-3", children: [1, 2, 3, 4, 5].map((i) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_skeleton7.Skeleton, { className: "h-16 w-full" }, i)) }) : invitations.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "text-center py-12", children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_icons_react8.IconSend, { className: "h-12 w-12 mx-auto text-muted-foreground mb-4" }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("p", { className: "text-muted-foreground", children: "Aucune invitation trouv\xE9e" })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "overflow-x-auto", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_table4.Table, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_table4.TableRow, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableHead, { children: "Contact" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableHead, { children: "Email" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableHead, { children: "Statut" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableHead, { children: "Expire le" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableHead, { children: "Admin" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableHead, { children: "2FA" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableHead, { className: "text-right", children: "Actions" })
          ] }) }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableBody, { children: invitations.map((invitation) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_table4.TableRow, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableCell, { className: "font-medium", children: getContactName(invitation.contact_id) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableCell, { className: "text-sm", children: getContactEmail(invitation.contact_id) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableCell, { children: getStatusBadge(invitation.status) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableCell, { className: "text-sm", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex items-center gap-2", children: [
              formatDate(invitation.expires_at),
              isExpired(invitation.expires_at) && invitation.status === "pending" && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_badge5.Badge, { variant: "destructive", className: "text-xs", children: "Expir\xE9" })
            ] }) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableCell, { children: invitation.can_be_admin ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_icons_react8.IconCheck, { className: "h-4 w-4 text-green-500" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_icons_react8.IconX, { className: "h-4 w-4 text-muted-foreground" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableCell, { children: invitation.two_factor_verified ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_badge5.Badge, { variant: "default", className: "text-xs", children: "V\xE9rifi\xE9" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_badge5.Badge, { variant: "secondary", className: "text-xs", children: "En attente" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_table4.TableCell, { className: "text-right", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex items-center justify-end gap-1", children: [
              invitation.status === "pending" && !isExpired(invitation.expires_at) && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                import_button8.Button,
                {
                  variant: "ghost",
                  size: "icon",
                  className: "h-8 w-8",
                  onClick: () => copyInvitationLink(invitation.token),
                  children: copiedToken === invitation.token ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_icons_react8.IconCheck, { className: "h-4 w-4 text-green-500" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_icons_react8.IconCopy, { className: "h-4 w-4" })
                }
              ),
              (invitation.status === "pending" || invitation.status === "expired") && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                import_button8.Button,
                {
                  variant: "ghost",
                  size: "icon",
                  className: "h-8 w-8 text-destructive",
                  onClick: () => {
                    setInvitationToRevoke(invitation);
                    setRevokeDialogOpen(true);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_icons_react8.IconTrash, { className: "h-4 w-4" })
                }
              )
            ] }) })
          ] }, invitation.id)) })
        ] }) }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_alert_dialog5.AlertDialog, { open: revokeDialogOpen, onOpenChange: setRevokeDialogOpen, children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_alert_dialog5.AlertDialogContent, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_alert_dialog5.AlertDialogHeader, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_alert_dialog5.AlertDialogTitle, { children: "Confirmer la r\xE9vocation" }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_alert_dialog5.AlertDialogDescription, { children: "\xCAtes-vous s\xFBr de vouloir r\xE9voquer cette invitation ? Le contact ne pourra plus utiliser ce lien pour cr\xE9er un compte." })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_alert_dialog5.AlertDialogFooter, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_alert_dialog5.AlertDialogCancel, { children: "Annuler" }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_alert_dialog5.AlertDialogAction, { onClick: handleRevoke, className: "bg-destructive hover:bg-destructive/90", children: "R\xE9voquer" })
        ] })
      ] }) })
    ] });
  }

  // pages/AcceptInvitation.tsx
  var import_react9 = __require("react");
  var import_navigation9 = __require("next/navigation");
  var import_button9 = __require("@/components/ui/button");
  var import_input6 = __require("@/components/ui/input");
  var import_label4 = __require("@/components/ui/label");
  var import_icons_react9 = __require("@tabler/icons-react");
  var import_card9 = __require("@/components/ui/card");
  var import_select7 = __require("@/components/ui/select");
  var import_alert = __require("@/components/ui/alert");
  var import_use_toast9 = __require("@/hooks/use-toast");
  var import_jsx_runtime9 = __require("react/jsx-runtime");
  function AcceptInvitation({ token }) {
    const router = (0, import_navigation9.useRouter)();
    const { toast } = (0, import_use_toast9.useToast)();
    const [step, setStep] = (0, import_react9.useState)("password");
    const [password, setPassword] = (0, import_react9.useState)("");
    const [passwordConfirm, setPasswordConfirm] = (0, import_react9.useState)("");
    const [twoFactorMethod, setTwoFactorMethod] = (0, import_react9.useState)("email");
    const [twoFactorCode, setTwoFactorCode] = (0, import_react9.useState)("");
    const [isLoading, setIsLoading] = (0, import_react9.useState)(false);
    const [error, setError] = (0, import_react9.useState)(null);
    const validatePassword = () => {
      if (password.length < 8) {
        setError("Le mot de passe doit contenir au moins 8 caract\xE8res");
        return false;
      }
      if (password !== passwordConfirm) {
        setError("Les mots de passe ne correspondent pas");
        return false;
      }
      return true;
    };
    const handleAccept = async (e) => {
      e.preventDefault();
      setError(null);
      if (!validatePassword()) {
        return;
      }
      setIsLoading(true);
      try {
        await acceptInvitation(token);
        toast({
          title: "Invitation accept\xE9e",
          description: "Veuillez v\xE9rifier votre email pour le code de v\xE9rification"
        });
        setStep("2fa");
      } catch (error2) {
        console.error("Failed to accept invitation:", error2);
        setError(error2.message || "Impossible d'accepter l'invitation. Le lien est peut-\xEAtre expir\xE9.");
      } finally {
        setIsLoading(false);
      }
    };
    const handleVerify2FA = async (e) => {
      e.preventDefault();
      setError(null);
      if (!twoFactorCode.trim()) {
        setError("Veuillez entrer le code de v\xE9rification");
        return;
      }
      setIsLoading(true);
      try {
        const response = await verifyInvitation2FA(token);
        if (response.access_token) {
          localStorage.setItem("token", response.access_token);
          toast({
            title: "Compte cr\xE9\xE9 avec succ\xE8s",
            description: "Bienvenue sur OpsFlux !"
          });
          router.push("/");
        }
      } catch (error2) {
        console.error("Failed to verify 2FA:", error2);
        setError(error2.message || "Code de v\xE9rification invalide");
      } finally {
        setIsLoading(false);
      }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "min-h-screen flex items-center justify-center bg-muted/20 p-4", children: /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_card9.Card, { className: "w-full max-w-md", children: [
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_card9.CardHeader, { className: "space-y-1", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_icons_react9.IconShieldLock, { className: "h-6 w-6" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_card9.CardTitle, { className: "text-2xl", children: step === "password" ? "Accepter l'invitation" : "V\xE9rification 2FA" })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_card9.CardDescription, { children: step === "password" ? "Cr\xE9ez votre mot de passe pour acc\xE9der \xE0 la plateforme" : "Entrez le code de v\xE9rification envoy\xE9 par email" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_card9.CardContent, { children: [
        error && /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_alert.Alert, { variant: "destructive", className: "mb-4", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_icons_react9.IconAlertCircle, { className: "h-4 w-4" }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_alert.AlertDescription, { children: error })
        ] }),
        step === "password" ? /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("form", { onSubmit: handleAccept, className: "space-y-4", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_label4.Label, { htmlFor: "password", children: [
              "Mot de passe ",
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "text-destructive", children: "*" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              import_input6.Input,
              {
                id: "password",
                type: "password",
                placeholder: "Min. 8 caract\xE8res",
                value: password,
                onChange: (e) => setPassword(e.target.value),
                required: true,
                autoFocus: true
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "text-xs text-muted-foreground", children: "Le mot de passe doit contenir au moins 8 caract\xE8res" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_label4.Label, { htmlFor: "passwordConfirm", children: [
              "Confirmer le mot de passe ",
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "text-destructive", children: "*" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              import_input6.Input,
              {
                id: "passwordConfirm",
                type: "password",
                placeholder: "Confirmez votre mot de passe",
                value: passwordConfirm,
                onChange: (e) => setPasswordConfirm(e.target.value),
                required: true
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_label4.Label, { htmlFor: "twoFactorMethod", children: "M\xE9thode de v\xE9rification 2FA" }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_select7.Select, { value: twoFactorMethod, onValueChange: setTwoFactorMethod, children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_select7.SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_select7.SelectValue, {}) }),
              /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_select7.SelectContent, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_select7.SelectItem, { value: "email", children: "Email" }),
                /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_select7.SelectItem, { value: "app", children: "Application d'authentification" })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "text-xs text-muted-foreground", children: "Un code de v\xE9rification vous sera envoy\xE9" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_button9.Button, { type: "submit", className: "w-full", disabled: isLoading, children: isLoading ? "Traitement..." : "Accepter l'invitation" })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("form", { onSubmit: handleVerify2FA, className: "space-y-4", children: [
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_alert.Alert, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_icons_react9.IconCheck, { className: "h-4 w-4" }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_alert.AlertDescription, { children: "Un code de v\xE9rification a \xE9t\xE9 envoy\xE9 \xE0 votre adresse email." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_label4.Label, { htmlFor: "twoFactorCode", children: [
              "Code de v\xE9rification ",
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { className: "text-destructive", children: "*" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              import_input6.Input,
              {
                id: "twoFactorCode",
                type: "text",
                placeholder: "123456",
                value: twoFactorCode,
                onChange: (e) => setTwoFactorCode(e.target.value),
                required: true,
                autoFocus: true,
                maxLength: 6
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("p", { className: "text-xs text-muted-foreground", children: "Entrez le code \xE0 6 chiffres re\xE7u par email" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_button9.Button, { type: "submit", className: "w-full", disabled: isLoading, children: isLoading ? "V\xE9rification..." : "V\xE9rifier et cr\xE9er mon compte" }),
            /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
              import_button9.Button,
              {
                type: "button",
                variant: "ghost",
                className: "w-full",
                onClick: () => setStep("password"),
                disabled: isLoading,
                children: "Retour"
              }
            )
          ] })
        ] })
      ] })
    ] }) });
  }

  // module.config.ts
  var module = {
    config: {
      code: "third_parties",
      name: "Third Parties",
      version: "1.0.0",
      description: "Gestion des tiers (entreprises, contacts, invitations)"
    },
    // Pages du module
    // IMPORTANT: Routes plus spécifiques (ex: /new) doivent venir AVANT les routes paramétrées (ex: /:id)
    pages: [
      {
        path: "/third-parties/companies",
        component: CompaniesList
      },
      {
        path: "/third-parties/companies/new",
        component: CreateCompany
      },
      {
        path: "/third-parties/companies/:id/edit",
        component: EditCompany
      },
      {
        path: "/third-parties/companies/:id",
        component: CompanyDetails
      },
      {
        path: "/third-parties/contacts",
        component: ContactsList
      },
      {
        path: "/third-parties/contacts/new",
        component: CreateContact
      },
      {
        path: "/third-parties/contacts/:id",
        component: ContactDetails
      },
      {
        path: "/third-parties/invitations",
        component: InvitationsList
      },
      {
        path: "/third-parties/invitations/accept/:token",
        component: AcceptInvitation
      }
    ],
    // Widgets du module
    widgets: []
  };
  var module_config_default = module;
  return __toCommonJS(module_config_exports);
})();
