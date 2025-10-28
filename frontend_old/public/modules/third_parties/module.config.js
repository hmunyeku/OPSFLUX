// ../modules/third_parties/frontend/pages/Companies/List.tsx
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  IconBuilding,
  IconPlus,
  IconSearch,
  IconFilter,
  IconDownload,
  IconEdit,
  IconTrash,
  IconEye
} from "@tabler/icons-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

// ../modules/third_parties/frontend/api.ts
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

// ../modules/third_parties/frontend/pages/Companies/List.tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { jsx, jsxs } from "react/jsx-runtime";
function CompaniesList() {
  const router = useRouter();
  const { toast } = useToast();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [companyToDelete, setCompanyToDelete] = useState(null);
  useEffect(() => {
    loadCompanies();
  }, [typeFilter, statusFilter]);
  const loadCompanies = async () => {
    try {
      const token = auth.getToken();
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
      const token = auth.getToken();
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
    return /* @__PURE__ */ jsx(Badge, { variant: config.variant, children: config.label });
  };
  const getTypeBadge = (type) => {
    const labels = {
      client: "Client",
      supplier: "Fournisseur",
      partner: "Partenaire",
      contractor: "Sous-traitant",
      other: "Autre"
    };
    return /* @__PURE__ */ jsx(Badge, { variant: "secondary", children: labels[type.toLowerCase()] || type });
  };
  return /* @__PURE__ */ jsxs("div", { className: "container mx-auto px-4 py-6 max-w-7xl", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
          /* @__PURE__ */ jsx(IconBuilding, { className: "h-8 w-8" }),
          "Entreprises"
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground mt-1", children: "Gestion des entreprises tierces (clients, fournisseurs, partenaires)" })
      ] }),
      /* @__PURE__ */ jsxs(Button, { onClick: () => router.push("/third-parties/companies/new"), children: [
        /* @__PURE__ */ jsx(IconPlus, { className: "h-4 w-4 mr-2" }),
        "Nouvelle entreprise"
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Card, { className: "mb-6", children: [
      /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsx(CardTitle, { className: "text-lg", children: "Filtres" }) }),
      /* @__PURE__ */ jsx(CardContent, { children: /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row gap-3", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex-1 relative", children: [
          /* @__PURE__ */ jsx(IconSearch, { className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" }),
          /* @__PURE__ */ jsx(
            Input,
            {
              placeholder: "Rechercher une entreprise...",
              value: search,
              onChange: (e) => setSearch(e.target.value),
              onKeyDown: (e) => e.key === "Enter" && handleSearch(),
              className: "pl-9"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs(Select, { value: typeFilter, onValueChange: setTypeFilter, children: [
          /* @__PURE__ */ jsx(SelectTrigger, { className: "w-full sm:w-[180px]", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Type" }) }),
          /* @__PURE__ */ jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsx(SelectItem, { value: "all", children: "Tous les types" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "client", children: "Client" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "supplier", children: "Fournisseur" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "partner", children: "Partenaire" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "contractor", children: "Sous-traitant" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "other", children: "Autre" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs(Select, { value: statusFilter, onValueChange: setStatusFilter, children: [
          /* @__PURE__ */ jsx(SelectTrigger, { className: "w-full sm:w-[180px]", children: /* @__PURE__ */ jsx(SelectValue, { placeholder: "Statut" }) }),
          /* @__PURE__ */ jsxs(SelectContent, { children: [
            /* @__PURE__ */ jsx(SelectItem, { value: "all", children: "Tous les statuts" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "active", children: "Actif" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "inactive", children: "Inactif" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "prospect", children: "Prospect" }),
            /* @__PURE__ */ jsx(SelectItem, { value: "archived", children: "Archiv\xE9" })
          ] })
        ] }),
        /* @__PURE__ */ jsxs(Button, { onClick: handleSearch, variant: "secondary", children: [
          /* @__PURE__ */ jsx(IconFilter, { className: "h-4 w-4 mr-2" }),
          "Filtrer"
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs(Card, { children: [
      /* @__PURE__ */ jsx(CardHeader, { children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsx(CardTitle, { children: loading ? "Chargement..." : `${companies.length} entreprise${companies.length > 1 ? "s" : ""}` }),
        /* @__PURE__ */ jsxs(Button, { variant: "outline", size: "sm", children: [
          /* @__PURE__ */ jsx(IconDownload, { className: "h-4 w-4 mr-2" }),
          "Exporter"
        ] })
      ] }) }),
      /* @__PURE__ */ jsx(CardContent, { children: loading ? /* @__PURE__ */ jsx("div", { className: "space-y-3", children: [1, 2, 3, 4, 5].map((i) => /* @__PURE__ */ jsx(Skeleton, { className: "h-16 w-full" }, i)) }) : companies.length === 0 ? /* @__PURE__ */ jsxs("div", { className: "text-center py-12", children: [
        /* @__PURE__ */ jsx(IconBuilding, { className: "h-12 w-12 mx-auto text-muted-foreground mb-4" }),
        /* @__PURE__ */ jsx("p", { className: "text-muted-foreground", children: "Aucune entreprise trouv\xE9e" }),
        /* @__PURE__ */ jsxs(
          Button,
          {
            variant: "outline",
            className: "mt-4",
            onClick: () => router.push("/third-parties/companies/new"),
            children: [
              /* @__PURE__ */ jsx(IconPlus, { className: "h-4 w-4 mr-2" }),
              "Cr\xE9er la premi\xE8re entreprise"
            ]
          }
        )
      ] }) : /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs(Table, { children: [
        /* @__PURE__ */ jsx(TableHeader, { children: /* @__PURE__ */ jsxs(TableRow, { children: [
          /* @__PURE__ */ jsx(TableHead, { children: "Nom" }),
          /* @__PURE__ */ jsx(TableHead, { children: "Type" }),
          /* @__PURE__ */ jsx(TableHead, { children: "Statut" }),
          /* @__PURE__ */ jsx(TableHead, { children: "Email" }),
          /* @__PURE__ */ jsx(TableHead, { children: "Pays" }),
          /* @__PURE__ */ jsx(TableHead, { className: "text-center", children: "Contacts" }),
          /* @__PURE__ */ jsx(TableHead, { className: "text-right", children: "Actions" })
        ] }) }),
        /* @__PURE__ */ jsx(TableBody, { children: companies.map((company) => /* @__PURE__ */ jsxs(TableRow, { className: "cursor-pointer hover:bg-muted/50", children: [
          /* @__PURE__ */ jsx(TableCell, { className: "font-medium", children: /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx("div", { className: "font-semibold", children: company.name }),
            company.legal_name && /* @__PURE__ */ jsx("div", { className: "text-xs text-muted-foreground", children: company.legal_name })
          ] }) }),
          /* @__PURE__ */ jsx(TableCell, { children: getTypeBadge(company.company_type) }),
          /* @__PURE__ */ jsx(TableCell, { children: getStatusBadge(company.status) }),
          /* @__PURE__ */ jsx(TableCell, { className: "text-sm", children: company.email || "-" }),
          /* @__PURE__ */ jsx(TableCell, { className: "text-sm", children: company.country || "-" }),
          /* @__PURE__ */ jsx(TableCell, { className: "text-center", children: /* @__PURE__ */ jsx(Badge, { variant: "outline", children: company.contact_count }) }),
          /* @__PURE__ */ jsx(TableCell, { className: "text-right", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-end gap-1", children: [
            /* @__PURE__ */ jsx(
              Button,
              {
                variant: "ghost",
                size: "icon",
                className: "h-8 w-8",
                onClick: () => router.push(`/third-parties/companies/${company.id}`),
                children: /* @__PURE__ */ jsx(IconEye, { className: "h-4 w-4" })
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                variant: "ghost",
                size: "icon",
                className: "h-8 w-8",
                onClick: () => router.push(`/third-parties/companies/${company.id}/edit`),
                children: /* @__PURE__ */ jsx(IconEdit, { className: "h-4 w-4" })
              }
            ),
            /* @__PURE__ */ jsx(
              Button,
              {
                variant: "ghost",
                size: "icon",
                className: "h-8 w-8 text-destructive",
                onClick: () => {
                  setCompanyToDelete(company);
                  setDeleteDialogOpen(true);
                },
                children: /* @__PURE__ */ jsx(IconTrash, { className: "h-4 w-4" })
              }
            )
          ] }) })
        ] }, company.id)) })
      ] }) }) })
    ] }),
    /* @__PURE__ */ jsx(AlertDialog, { open: deleteDialogOpen, onOpenChange: setDeleteDialogOpen, children: /* @__PURE__ */ jsxs(AlertDialogContent, { children: [
      /* @__PURE__ */ jsxs(AlertDialogHeader, { children: [
        /* @__PURE__ */ jsx(AlertDialogTitle, { children: "Confirmer la suppression" }),
        /* @__PURE__ */ jsxs(AlertDialogDescription, { children: [
          "\xCAtes-vous s\xFBr de vouloir supprimer l'entreprise",
          " ",
          /* @__PURE__ */ jsx("strong", { children: companyToDelete?.name }),
          " ? Cette action est irr\xE9versible."
        ] })
      ] }),
      /* @__PURE__ */ jsxs(AlertDialogFooter, { children: [
        /* @__PURE__ */ jsx(AlertDialogCancel, { children: "Annuler" }),
        /* @__PURE__ */ jsx(AlertDialogAction, { onClick: handleDelete, className: "bg-destructive hover:bg-destructive/90", children: "Supprimer" })
      ] })
    ] }) })
  ] });
}

// ../modules/third_parties/frontend/pages/Companies/Details.tsx
import { useState as useState2, useEffect as useEffect2 } from "react";
import { useRouter as useRouter2 } from "next/navigation";
import { auth as auth2 } from "@/lib/auth";
import { Button as Button2 } from "@/components/ui/button";
import {
  IconArrowLeft,
  IconEdit as IconEdit2,
  IconTrash as IconTrash2,
  IconBuilding as IconBuilding2,
  IconMail,
  IconPhone,
  IconWorld,
  IconMapPin,
  IconUser,
  IconPlus as IconPlus2
} from "@tabler/icons-react";
import { Card as Card2, CardContent as CardContent2, CardHeader as CardHeader2, CardTitle as CardTitle2 } from "@/components/ui/card";
import { Badge as Badge2 } from "@/components/ui/badge";
import { Skeleton as Skeleton2 } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table as Table2,
  TableBody as TableBody2,
  TableCell as TableCell2,
  TableHead as TableHead2,
  TableHeader as TableHeader2,
  TableRow as TableRow2
} from "@/components/ui/table";
import { useToast as useToast2 } from "@/hooks/use-toast";

// ../modules/third_parties/frontend/types/index.ts
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

// ../modules/third_parties/frontend/pages/Companies/Details.tsx
import {
  AlertDialog as AlertDialog2,
  AlertDialogAction as AlertDialogAction2,
  AlertDialogCancel as AlertDialogCancel2,
  AlertDialogContent as AlertDialogContent2,
  AlertDialogDescription as AlertDialogDescription2,
  AlertDialogFooter as AlertDialogFooter2,
  AlertDialogHeader as AlertDialogHeader2,
  AlertDialogTitle as AlertDialogTitle2
} from "@/components/ui/alert-dialog";
import { Fragment, jsx as jsx2, jsxs as jsxs2 } from "react/jsx-runtime";
function CompanyDetails({ companyId }) {
  const router = useRouter2();
  const { toast } = useToast2();
  const [company, setCompany] = useState2(null);
  const [contacts, setContacts] = useState2([]);
  const [loading, setLoading] = useState2(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState2(false);
  useEffect2(() => {
    if (companyId) {
      loadCompany();
      loadContacts();
    }
  }, [companyId]);
  const loadCompany = async () => {
    try {
      const token = auth2.getToken();
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
      const token = auth2.getToken();
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
      const token = auth2.getToken();
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
    return /* @__PURE__ */ jsxs2("div", { className: "container mx-auto px-4 py-6 max-w-6xl", children: [
      /* @__PURE__ */ jsx2(Skeleton2, { className: "h-12 w-64 mb-6" }),
      /* @__PURE__ */ jsxs2("div", { className: "grid gap-6", children: [
        /* @__PURE__ */ jsx2(Skeleton2, { className: "h-48 w-full" }),
        /* @__PURE__ */ jsx2(Skeleton2, { className: "h-96 w-full" })
      ] })
    ] });
  }
  if (!company) {
    return /* @__PURE__ */ jsx2("div", { className: "container mx-auto px-4 py-6 max-w-6xl", children: /* @__PURE__ */ jsx2("p", { children: "Entreprise non trouv\xE9e" }) });
  }
  return /* @__PURE__ */ jsxs2("div", { className: "container mx-auto px-4 py-6 max-w-6xl", children: [
    /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-4 mb-6", children: [
      /* @__PURE__ */ jsx2(
        Button2,
        {
          variant: "ghost",
          size: "icon",
          onClick: () => router.push("/third-parties/companies"),
          children: /* @__PURE__ */ jsx2(IconArrowLeft, { className: "h-4 w-4" })
        }
      ),
      /* @__PURE__ */ jsxs2("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsxs2("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
          /* @__PURE__ */ jsx2(IconBuilding2, { className: "h-8 w-8" }),
          company.name
        ] }),
        company.legal_name && /* @__PURE__ */ jsx2("p", { className: "text-sm text-muted-foreground mt-1", children: company.legal_name })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ jsxs2(
          Button2,
          {
            variant: "outline",
            onClick: () => router.push(`/third-parties/companies/${company.id}/edit`),
            children: [
              /* @__PURE__ */ jsx2(IconEdit2, { className: "h-4 w-4 mr-2" }),
              "Modifier"
            ]
          }
        ),
        /* @__PURE__ */ jsxs2(Button2, { variant: "destructive", onClick: () => setDeleteDialogOpen(true), children: [
          /* @__PURE__ */ jsx2(IconTrash2, { className: "h-4 w-4 mr-2" }),
          "Supprimer"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2(Card2, { className: "mb-6", children: [
      /* @__PURE__ */ jsx2(CardHeader2, { children: /* @__PURE__ */ jsxs2("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsx2(CardTitle2, { children: "Informations g\xE9n\xE9rales" }),
        /* @__PURE__ */ jsxs2("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsx2(Badge2, { variant: "secondary", children: CompanyTypeLabels[company.company_type] }),
          /* @__PURE__ */ jsx2(Badge2, { variant: company.status === "active" ? "default" : "secondary", children: CompanyStatusLabels[company.status] })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxs2(CardContent2, { children: [
        /* @__PURE__ */ jsxs2("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [
          /* @__PURE__ */ jsxs2("div", { className: "space-y-4", children: [
            company.email && /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx2(IconMail, { className: "h-5 w-5 text-muted-foreground" }),
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx2("p", { className: "text-sm text-muted-foreground", children: "Email" }),
                /* @__PURE__ */ jsx2("p", { className: "font-medium", children: company.email })
              ] })
            ] }),
            company.phone && /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx2(IconPhone, { className: "h-5 w-5 text-muted-foreground" }),
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx2("p", { className: "text-sm text-muted-foreground", children: "T\xE9l\xE9phone" }),
                /* @__PURE__ */ jsx2("p", { className: "font-medium", children: company.phone })
              ] })
            ] }),
            company.website && /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx2(IconWorld, { className: "h-5 w-5 text-muted-foreground" }),
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx2("p", { className: "text-sm text-muted-foreground", children: "Site web" }),
                /* @__PURE__ */ jsx2(
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
          /* @__PURE__ */ jsxs2("div", { className: "space-y-4", children: [
            (company.address_line1 || company.city || company.country) && /* @__PURE__ */ jsxs2("div", { className: "flex items-start gap-3", children: [
              /* @__PURE__ */ jsx2(IconMapPin, { className: "h-5 w-5 text-muted-foreground mt-0.5" }),
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx2("p", { className: "text-sm text-muted-foreground", children: "Adresse" }),
                /* @__PURE__ */ jsxs2("div", { className: "font-medium", children: [
                  company.address_line1 && /* @__PURE__ */ jsx2("p", { children: company.address_line1 }),
                  company.address_line2 && /* @__PURE__ */ jsx2("p", { children: company.address_line2 }),
                  company.city && company.postal_code && /* @__PURE__ */ jsx2("p", { children: `${company.postal_code} ${company.city}` }),
                  company.country && /* @__PURE__ */ jsx2("p", { children: company.country })
                ] })
              ] })
            ] }),
            company.registration_number && /* @__PURE__ */ jsxs2("div", { children: [
              /* @__PURE__ */ jsx2("p", { className: "text-sm text-muted-foreground", children: "SIRET/SIREN" }),
              /* @__PURE__ */ jsx2("p", { className: "font-medium", children: company.registration_number })
            ] }),
            company.vat_number && /* @__PURE__ */ jsxs2("div", { children: [
              /* @__PURE__ */ jsx2("p", { className: "text-sm text-muted-foreground", children: "N\xB0 TVA" }),
              /* @__PURE__ */ jsx2("p", { className: "font-medium", children: company.vat_number })
            ] }),
            company.industry && /* @__PURE__ */ jsxs2("div", { children: [
              /* @__PURE__ */ jsx2("p", { className: "text-sm text-muted-foreground", children: "Secteur" }),
              /* @__PURE__ */ jsx2("p", { className: "font-medium", children: company.industry })
            ] })
          ] })
        ] }),
        (company.description || company.notes) && /* @__PURE__ */ jsxs2(Fragment, { children: [
          /* @__PURE__ */ jsx2(Separator, { className: "my-6" }),
          company.description && /* @__PURE__ */ jsxs2("div", { className: "mb-4", children: [
            /* @__PURE__ */ jsx2("p", { className: "text-sm text-muted-foreground mb-2", children: "Description" }),
            /* @__PURE__ */ jsx2("p", { className: "text-sm whitespace-pre-wrap", children: company.description })
          ] }),
          company.notes && /* @__PURE__ */ jsxs2("div", { children: [
            /* @__PURE__ */ jsx2("p", { className: "text-sm text-muted-foreground mb-2", children: "Notes internes" }),
            /* @__PURE__ */ jsx2("p", { className: "text-sm whitespace-pre-wrap", children: company.notes })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs2(Tabs, { defaultValue: "contacts", className: "w-full", children: [
      /* @__PURE__ */ jsxs2(TabsList, { children: [
        /* @__PURE__ */ jsxs2(TabsTrigger, { value: "contacts", children: [
          "Contacts (",
          contacts.length,
          ")"
        ] }),
        /* @__PURE__ */ jsx2(TabsTrigger, { value: "activity", children: "Activit\xE9" })
      ] }),
      /* @__PURE__ */ jsx2(TabsContent, { value: "contacts", className: "mt-6", children: /* @__PURE__ */ jsxs2(Card2, { children: [
        /* @__PURE__ */ jsx2(CardHeader2, { children: /* @__PURE__ */ jsxs2("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx2(CardTitle2, { children: "Contacts" }),
          /* @__PURE__ */ jsxs2(
            Button2,
            {
              size: "sm",
              onClick: () => router.push(`/third-parties/contacts/new?company_id=${company.id}`),
              children: [
                /* @__PURE__ */ jsx2(IconPlus2, { className: "h-4 w-4 mr-2" }),
                "Ajouter un contact"
              ]
            }
          )
        ] }) }),
        /* @__PURE__ */ jsx2(CardContent2, { children: contacts.length === 0 ? /* @__PURE__ */ jsxs2("div", { className: "text-center py-12", children: [
          /* @__PURE__ */ jsx2(IconUser, { className: "h-12 w-12 mx-auto text-muted-foreground mb-4" }),
          /* @__PURE__ */ jsx2("p", { className: "text-muted-foreground", children: "Aucun contact" })
        ] }) : /* @__PURE__ */ jsxs2(Table2, { children: [
          /* @__PURE__ */ jsx2(TableHeader2, { children: /* @__PURE__ */ jsxs2(TableRow2, { children: [
            /* @__PURE__ */ jsx2(TableHead2, { children: "Nom" }),
            /* @__PURE__ */ jsx2(TableHead2, { children: "Poste" }),
            /* @__PURE__ */ jsx2(TableHead2, { children: "Email" }),
            /* @__PURE__ */ jsx2(TableHead2, { children: "T\xE9l\xE9phone" }),
            /* @__PURE__ */ jsx2(TableHead2, { children: "R\xF4le" }),
            /* @__PURE__ */ jsx2(TableHead2, { children: "Statut" })
          ] }) }),
          /* @__PURE__ */ jsx2(TableBody2, { children: contacts.map((contact) => /* @__PURE__ */ jsxs2(
            TableRow2,
            {
              className: "cursor-pointer",
              onClick: () => router.push(`/third-parties/contacts/${contact.id}`),
              children: [
                /* @__PURE__ */ jsxs2(TableCell2, { className: "font-medium", children: [
                  contact.first_name,
                  " ",
                  contact.last_name,
                  contact.is_primary && /* @__PURE__ */ jsx2(Badge2, { variant: "outline", className: "ml-2", children: "Principal" })
                ] }),
                /* @__PURE__ */ jsx2(TableCell2, { children: contact.job_title || "-" }),
                /* @__PURE__ */ jsx2(TableCell2, { children: contact.email || "-" }),
                /* @__PURE__ */ jsx2(TableCell2, { children: contact.phone || "-" }),
                /* @__PURE__ */ jsx2(TableCell2, { children: /* @__PURE__ */ jsx2(Badge2, { variant: "secondary", children: ContactRoleLabels[contact.role] }) }),
                /* @__PURE__ */ jsx2(TableCell2, { children: /* @__PURE__ */ jsx2(
                  Badge2,
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
      /* @__PURE__ */ jsx2(TabsContent, { value: "activity", className: "mt-6", children: /* @__PURE__ */ jsxs2(Card2, { children: [
        /* @__PURE__ */ jsx2(CardHeader2, { children: /* @__PURE__ */ jsx2(CardTitle2, { children: "Historique d'activit\xE9" }) }),
        /* @__PURE__ */ jsx2(CardContent2, { children: /* @__PURE__ */ jsx2("p", { className: "text-sm text-muted-foreground", children: "Aucune activit\xE9 r\xE9cente" }) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsx2(AlertDialog2, { open: deleteDialogOpen, onOpenChange: setDeleteDialogOpen, children: /* @__PURE__ */ jsxs2(AlertDialogContent2, { children: [
      /* @__PURE__ */ jsxs2(AlertDialogHeader2, { children: [
        /* @__PURE__ */ jsx2(AlertDialogTitle2, { children: "Confirmer la suppression" }),
        /* @__PURE__ */ jsxs2(AlertDialogDescription2, { children: [
          "\xCAtes-vous s\xFBr de vouloir supprimer l'entreprise",
          " ",
          /* @__PURE__ */ jsx2("strong", { children: company.name }),
          " ? Cette action est irr\xE9versible."
        ] })
      ] }),
      /* @__PURE__ */ jsxs2(AlertDialogFooter2, { children: [
        /* @__PURE__ */ jsx2(AlertDialogCancel2, { children: "Annuler" }),
        /* @__PURE__ */ jsx2(AlertDialogAction2, { onClick: handleDelete, className: "bg-destructive hover:bg-destructive/90", children: "Supprimer" })
      ] })
    ] }) })
  ] });
}

// ../modules/third_parties/frontend/pages/Companies/Create.tsx
import { useState as useState3 } from "react";
import { useRouter as useRouter3 } from "next/navigation";
import { auth as auth3 } from "@/lib/auth";
import { Button as Button3 } from "@/components/ui/button";
import { Input as Input2 } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  IconArrowLeft as IconArrowLeft2,
  IconDeviceFloppy,
  IconBuilding as IconBuilding3
} from "@tabler/icons-react";
import { Card as Card3, CardContent as CardContent3, CardDescription, CardHeader as CardHeader3, CardTitle as CardTitle3 } from "@/components/ui/card";
import {
  Select as Select2,
  SelectContent as SelectContent2,
  SelectItem as SelectItem2,
  SelectTrigger as SelectTrigger2,
  SelectValue as SelectValue2
} from "@/components/ui/select";
import { useToast as useToast3 } from "@/hooks/use-toast";
import { jsx as jsx3, jsxs as jsxs3 } from "react/jsx-runtime";
function CreateCompany() {
  const router = useRouter3();
  const { toast } = useToast3();
  const [isSaving, setIsSaving] = useState3(false);
  const [formData, setFormData] = useState3({
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
      const token = auth3.getToken();
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
  return /* @__PURE__ */ jsxs3("div", { className: "container max-w-4xl mx-auto px-4 py-6 sm:py-8", children: [
    /* @__PURE__ */ jsxs3("div", { className: "flex items-center gap-4 mb-6", children: [
      /* @__PURE__ */ jsx3(
        Button3,
        {
          variant: "ghost",
          size: "icon",
          onClick: () => router.push("/third-parties/companies"),
          children: /* @__PURE__ */ jsx3(IconArrowLeft2, { className: "h-4 w-4" })
        }
      ),
      /* @__PURE__ */ jsxs3("div", { children: [
        /* @__PURE__ */ jsxs3("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
          /* @__PURE__ */ jsx3(IconBuilding3, { className: "h-6 w-6" }),
          "Nouvelle entreprise"
        ] }),
        /* @__PURE__ */ jsx3("p", { className: "text-sm text-muted-foreground mt-1", children: "Cr\xE9er une nouvelle entreprise tierce" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs3("form", { onSubmit: handleSubmit, className: "space-y-6", children: [
      /* @__PURE__ */ jsxs3(Card3, { children: [
        /* @__PURE__ */ jsxs3(CardHeader3, { children: [
          /* @__PURE__ */ jsx3(CardTitle3, { children: "Informations g\xE9n\xE9rales" }),
          /* @__PURE__ */ jsx3(CardDescription, { children: "Informations de base de l'entreprise" })
        ] }),
        /* @__PURE__ */ jsxs3(CardContent3, { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxs3(Label, { htmlFor: "name", children: [
                "Nom commercial ",
                /* @__PURE__ */ jsx3("span", { className: "text-destructive", children: "*" })
              ] }),
              /* @__PURE__ */ jsx3(
                Input2,
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
            /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx3(Label, { htmlFor: "legal_name", children: "Raison sociale" }),
              /* @__PURE__ */ jsx3(
                Input2,
                {
                  id: "legal_name",
                  placeholder: "Acme Corporation SARL",
                  value: formData.legal_name,
                  onChange: (e) => handleChange("legal_name", e.target.value)
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxs3(Label, { htmlFor: "company_type", children: [
                "Type ",
                /* @__PURE__ */ jsx3("span", { className: "text-destructive", children: "*" })
              ] }),
              /* @__PURE__ */ jsxs3(
                Select2,
                {
                  value: formData.company_type,
                  onValueChange: (value) => handleChange("company_type", value),
                  children: [
                    /* @__PURE__ */ jsx3(SelectTrigger2, { children: /* @__PURE__ */ jsx3(SelectValue2, {}) }),
                    /* @__PURE__ */ jsx3(SelectContent2, { children: Object.entries(CompanyTypeLabels).map(([value, label]) => /* @__PURE__ */ jsx3(SelectItem2, { value, children: label }, value)) })
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx3(Label, { htmlFor: "status", children: "Statut" }),
              /* @__PURE__ */ jsxs3(
                Select2,
                {
                  value: formData.status,
                  onValueChange: (value) => handleChange("status", value),
                  children: [
                    /* @__PURE__ */ jsx3(SelectTrigger2, { children: /* @__PURE__ */ jsx3(SelectValue2, {}) }),
                    /* @__PURE__ */ jsx3(SelectContent2, { children: Object.entries(CompanyStatusLabels).map(([value, label]) => /* @__PURE__ */ jsx3(SelectItem2, { value, children: label }, value)) })
                  ]
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx3(Label, { htmlFor: "registration_number", children: "SIRET/SIREN" }),
              /* @__PURE__ */ jsx3(
                Input2,
                {
                  id: "registration_number",
                  placeholder: "123 456 789 00012",
                  value: formData.registration_number,
                  onChange: (e) => handleChange("registration_number", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx3(Label, { htmlFor: "vat_number", children: "Num\xE9ro de TVA" }),
              /* @__PURE__ */ jsx3(
                Input2,
                {
                  id: "vat_number",
                  placeholder: "FR12345678901",
                  value: formData.vat_number,
                  onChange: (e) => handleChange("vat_number", e.target.value)
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx3(Label, { htmlFor: "industry", children: "Secteur d'activit\xE9" }),
            /* @__PURE__ */ jsx3(
              Input2,
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
      /* @__PURE__ */ jsxs3(Card3, { children: [
        /* @__PURE__ */ jsxs3(CardHeader3, { children: [
          /* @__PURE__ */ jsx3(CardTitle3, { children: "Coordonn\xE9es" }),
          /* @__PURE__ */ jsx3(CardDescription, { children: "Informations de contact de l'entreprise" })
        ] }),
        /* @__PURE__ */ jsxs3(CardContent3, { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx3(Label, { htmlFor: "email", children: "Email" }),
              /* @__PURE__ */ jsx3(
                Input2,
                {
                  id: "email",
                  type: "email",
                  placeholder: "contact@acme.com",
                  value: formData.email,
                  onChange: (e) => handleChange("email", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx3(Label, { htmlFor: "phone", children: "T\xE9l\xE9phone" }),
              /* @__PURE__ */ jsx3(
                Input2,
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
          /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx3(Label, { htmlFor: "website", children: "Site web" }),
            /* @__PURE__ */ jsx3(
              Input2,
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
      /* @__PURE__ */ jsxs3(Card3, { children: [
        /* @__PURE__ */ jsxs3(CardHeader3, { children: [
          /* @__PURE__ */ jsx3(CardTitle3, { children: "Adresse" }),
          /* @__PURE__ */ jsx3(CardDescription, { children: "Adresse du si\xE8ge social" })
        ] }),
        /* @__PURE__ */ jsxs3(CardContent3, { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx3(Label, { htmlFor: "address_line1", children: "Adresse ligne 1" }),
            /* @__PURE__ */ jsx3(
              Input2,
              {
                id: "address_line1",
                placeholder: "123 Rue de la Paix",
                value: formData.address_line1,
                onChange: (e) => handleChange("address_line1", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx3(Label, { htmlFor: "address_line2", children: "Adresse ligne 2" }),
            /* @__PURE__ */ jsx3(
              Input2,
              {
                id: "address_line2",
                placeholder: "B\xE2timent A, 2\xE8me \xE9tage",
                value: formData.address_line2,
                onChange: (e) => handleChange("address_line2", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
            /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx3(Label, { htmlFor: "postal_code", children: "Code postal" }),
              /* @__PURE__ */ jsx3(
                Input2,
                {
                  id: "postal_code",
                  placeholder: "75001",
                  value: formData.postal_code,
                  onChange: (e) => handleChange("postal_code", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx3(Label, { htmlFor: "city", children: "Ville" }),
              /* @__PURE__ */ jsx3(
                Input2,
                {
                  id: "city",
                  placeholder: "Paris",
                  value: formData.city,
                  onChange: (e) => handleChange("city", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx3(Label, { htmlFor: "state", children: "R\xE9gion/\xC9tat" }),
              /* @__PURE__ */ jsx3(
                Input2,
                {
                  id: "state",
                  placeholder: "\xCEle-de-France",
                  value: formData.state,
                  onChange: (e) => handleChange("state", e.target.value)
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx3(Label, { htmlFor: "country", children: "Pays" }),
            /* @__PURE__ */ jsx3(
              Input2,
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
      /* @__PURE__ */ jsxs3(Card3, { children: [
        /* @__PURE__ */ jsxs3(CardHeader3, { children: [
          /* @__PURE__ */ jsx3(CardTitle3, { children: "Informations compl\xE9mentaires" }),
          /* @__PURE__ */ jsx3(CardDescription, { children: "Description et notes sur l'entreprise" })
        ] }),
        /* @__PURE__ */ jsxs3(CardContent3, { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx3(Label, { htmlFor: "description", children: "Description" }),
            /* @__PURE__ */ jsx3(
              Textarea,
              {
                id: "description",
                placeholder: "Description courte de l'entreprise...",
                value: formData.description,
                onChange: (e) => handleChange("description", e.target.value),
                rows: 3
              }
            )
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx3(Label, { htmlFor: "notes", children: "Notes internes" }),
            /* @__PURE__ */ jsx3(
              Textarea,
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
      /* @__PURE__ */ jsxs3("div", { className: "flex flex-col-reverse sm:flex-row gap-3 sm:justify-end", children: [
        /* @__PURE__ */ jsx3(
          Button3,
          {
            type: "button",
            variant: "outline",
            onClick: () => router.push("/third-parties/companies"),
            disabled: isSaving,
            className: "w-full sm:w-auto",
            children: "Annuler"
          }
        ),
        /* @__PURE__ */ jsxs3(
          Button3,
          {
            type: "submit",
            disabled: isSaving || !formData.name.trim(),
            className: "w-full sm:w-auto",
            children: [
              /* @__PURE__ */ jsx3(IconDeviceFloppy, { className: "h-4 w-4 mr-2" }),
              isSaving ? "Cr\xE9ation..." : "Cr\xE9er l'entreprise"
            ]
          }
        )
      ] })
    ] })
  ] });
}

// ../modules/third_parties/frontend/pages/Companies/Edit.tsx
import { useState as useState4, useEffect as useEffect3 } from "react";
import { useRouter as useRouter4 } from "next/navigation";
import { auth as auth4 } from "@/lib/auth";
import { Button as Button4 } from "@/components/ui/button";
import { Input as Input3 } from "@/components/ui/input";
import { Label as Label2 } from "@/components/ui/label";
import { Textarea as Textarea2 } from "@/components/ui/textarea";
import {
  IconArrowLeft as IconArrowLeft3,
  IconDeviceFloppy as IconDeviceFloppy2,
  IconBuilding as IconBuilding4
} from "@tabler/icons-react";
import { Card as Card4, CardContent as CardContent4, CardDescription as CardDescription2, CardHeader as CardHeader4, CardTitle as CardTitle4 } from "@/components/ui/card";
import {
  Select as Select3,
  SelectContent as SelectContent3,
  SelectItem as SelectItem3,
  SelectTrigger as SelectTrigger3,
  SelectValue as SelectValue3
} from "@/components/ui/select";
import { Skeleton as Skeleton3 } from "@/components/ui/skeleton";
import { useToast as useToast4 } from "@/hooks/use-toast";
import { jsx as jsx4, jsxs as jsxs4 } from "react/jsx-runtime";
function EditCompany({ companyId }) {
  const router = useRouter4();
  const { toast } = useToast4();
  const [loading, setLoading] = useState4(true);
  const [isSaving, setIsSaving] = useState4(false);
  const [company, setCompany] = useState4(null);
  useEffect3(() => {
    if (companyId) {
      loadCompany();
    }
  }, [companyId]);
  const loadCompany = async () => {
    try {
      const token = auth4.getToken();
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
      const token = auth4.getToken();
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
    return /* @__PURE__ */ jsxs4("div", { className: "container max-w-4xl mx-auto px-4 py-6 sm:py-8", children: [
      /* @__PURE__ */ jsx4(Skeleton3, { className: "h-12 w-64 mb-6" }),
      /* @__PURE__ */ jsx4("div", { className: "space-y-6", children: [1, 2, 3, 4].map((i) => /* @__PURE__ */ jsx4(Skeleton3, { className: "h-64 w-full" }, i)) })
    ] });
  }
  if (!company) {
    return /* @__PURE__ */ jsx4("div", { className: "container max-w-4xl mx-auto px-4 py-6 sm:py-8", children: /* @__PURE__ */ jsx4("p", { children: "Entreprise non trouv\xE9e" }) });
  }
  return /* @__PURE__ */ jsxs4("div", { className: "container max-w-4xl mx-auto px-4 py-6 sm:py-8", children: [
    /* @__PURE__ */ jsxs4("div", { className: "flex items-center gap-4 mb-6", children: [
      /* @__PURE__ */ jsx4(
        Button4,
        {
          variant: "ghost",
          size: "icon",
          onClick: () => router.push(`/third-parties/companies/${company.id}`),
          children: /* @__PURE__ */ jsx4(IconArrowLeft3, { className: "h-4 w-4" })
        }
      ),
      /* @__PURE__ */ jsxs4("div", { children: [
        /* @__PURE__ */ jsxs4("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
          /* @__PURE__ */ jsx4(IconBuilding4, { className: "h-6 w-6" }),
          "Modifier ",
          company.name
        ] }),
        /* @__PURE__ */ jsx4("p", { className: "text-sm text-muted-foreground mt-1", children: "Modifier les informations de l'entreprise" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4("form", { onSubmit: handleSubmit, className: "space-y-6", children: [
      /* @__PURE__ */ jsxs4(Card4, { children: [
        /* @__PURE__ */ jsxs4(CardHeader4, { children: [
          /* @__PURE__ */ jsx4(CardTitle4, { children: "Informations g\xE9n\xE9rales" }),
          /* @__PURE__ */ jsx4(CardDescription2, { children: "Informations de base de l'entreprise" })
        ] }),
        /* @__PURE__ */ jsxs4(CardContent4, { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs4("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxs4(Label2, { htmlFor: "name", children: [
                "Nom commercial ",
                /* @__PURE__ */ jsx4("span", { className: "text-destructive", children: "*" })
              ] }),
              /* @__PURE__ */ jsx4(
                Input3,
                {
                  id: "name",
                  placeholder: "Acme Corporation",
                  value: company.name,
                  onChange: (e) => handleChange("name", e.target.value),
                  required: true
                }
              )
            ] }),
            /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx4(Label2, { htmlFor: "legal_name", children: "Raison sociale" }),
              /* @__PURE__ */ jsx4(
                Input3,
                {
                  id: "legal_name",
                  placeholder: "Acme Corporation SARL",
                  value: company.legal_name || "",
                  onChange: (e) => handleChange("legal_name", e.target.value)
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs4("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxs4(Label2, { htmlFor: "company_type", children: [
                "Type ",
                /* @__PURE__ */ jsx4("span", { className: "text-destructive", children: "*" })
              ] }),
              /* @__PURE__ */ jsxs4(
                Select3,
                {
                  value: company.company_type,
                  onValueChange: (value) => handleChange("company_type", value),
                  children: [
                    /* @__PURE__ */ jsx4(SelectTrigger3, { children: /* @__PURE__ */ jsx4(SelectValue3, {}) }),
                    /* @__PURE__ */ jsx4(SelectContent3, { children: Object.entries(CompanyTypeLabels).map(([value, label]) => /* @__PURE__ */ jsx4(SelectItem3, { value, children: label }, value)) })
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx4(Label2, { htmlFor: "status", children: "Statut" }),
              /* @__PURE__ */ jsxs4(
                Select3,
                {
                  value: company.status,
                  onValueChange: (value) => handleChange("status", value),
                  children: [
                    /* @__PURE__ */ jsx4(SelectTrigger3, { children: /* @__PURE__ */ jsx4(SelectValue3, {}) }),
                    /* @__PURE__ */ jsx4(SelectContent3, { children: Object.entries(CompanyStatusLabels).map(([value, label]) => /* @__PURE__ */ jsx4(SelectItem3, { value, children: label }, value)) })
                  ]
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs4("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx4(Label2, { htmlFor: "registration_number", children: "SIRET/SIREN" }),
              /* @__PURE__ */ jsx4(
                Input3,
                {
                  id: "registration_number",
                  placeholder: "123 456 789 00012",
                  value: company.registration_number || "",
                  onChange: (e) => handleChange("registration_number", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx4(Label2, { htmlFor: "vat_number", children: "Num\xE9ro de TVA" }),
              /* @__PURE__ */ jsx4(
                Input3,
                {
                  id: "vat_number",
                  placeholder: "FR12345678901",
                  value: company.vat_number || "",
                  onChange: (e) => handleChange("vat_number", e.target.value)
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx4(Label2, { htmlFor: "industry", children: "Secteur d'activit\xE9" }),
            /* @__PURE__ */ jsx4(
              Input3,
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
      /* @__PURE__ */ jsxs4(Card4, { children: [
        /* @__PURE__ */ jsxs4(CardHeader4, { children: [
          /* @__PURE__ */ jsx4(CardTitle4, { children: "Coordonn\xE9es" }),
          /* @__PURE__ */ jsx4(CardDescription2, { children: "Informations de contact de l'entreprise" })
        ] }),
        /* @__PURE__ */ jsxs4(CardContent4, { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs4("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx4(Label2, { htmlFor: "email", children: "Email" }),
              /* @__PURE__ */ jsx4(
                Input3,
                {
                  id: "email",
                  type: "email",
                  placeholder: "contact@acme.com",
                  value: company.email || "",
                  onChange: (e) => handleChange("email", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx4(Label2, { htmlFor: "phone", children: "T\xE9l\xE9phone" }),
              /* @__PURE__ */ jsx4(
                Input3,
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
          /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx4(Label2, { htmlFor: "website", children: "Site web" }),
            /* @__PURE__ */ jsx4(
              Input3,
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
      /* @__PURE__ */ jsxs4(Card4, { children: [
        /* @__PURE__ */ jsxs4(CardHeader4, { children: [
          /* @__PURE__ */ jsx4(CardTitle4, { children: "Adresse" }),
          /* @__PURE__ */ jsx4(CardDescription2, { children: "Adresse du si\xE8ge social" })
        ] }),
        /* @__PURE__ */ jsxs4(CardContent4, { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx4(Label2, { htmlFor: "address_line1", children: "Adresse ligne 1" }),
            /* @__PURE__ */ jsx4(
              Input3,
              {
                id: "address_line1",
                placeholder: "123 Rue de la Paix",
                value: company.address_line1 || "",
                onChange: (e) => handleChange("address_line1", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx4(Label2, { htmlFor: "address_line2", children: "Adresse ligne 2" }),
            /* @__PURE__ */ jsx4(
              Input3,
              {
                id: "address_line2",
                placeholder: "B\xE2timent A, 2\xE8me \xE9tage",
                value: company.address_line2 || "",
                onChange: (e) => handleChange("address_line2", e.target.value)
              }
            )
          ] }),
          /* @__PURE__ */ jsxs4("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
            /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx4(Label2, { htmlFor: "postal_code", children: "Code postal" }),
              /* @__PURE__ */ jsx4(
                Input3,
                {
                  id: "postal_code",
                  placeholder: "75001",
                  value: company.postal_code || "",
                  onChange: (e) => handleChange("postal_code", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx4(Label2, { htmlFor: "city", children: "Ville" }),
              /* @__PURE__ */ jsx4(
                Input3,
                {
                  id: "city",
                  placeholder: "Paris",
                  value: company.city || "",
                  onChange: (e) => handleChange("city", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx4(Label2, { htmlFor: "state", children: "R\xE9gion/\xC9tat" }),
              /* @__PURE__ */ jsx4(
                Input3,
                {
                  id: "state",
                  placeholder: "\xCEle-de-France",
                  value: company.state || "",
                  onChange: (e) => handleChange("state", e.target.value)
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx4(Label2, { htmlFor: "country", children: "Pays" }),
            /* @__PURE__ */ jsx4(
              Input3,
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
      /* @__PURE__ */ jsxs4(Card4, { children: [
        /* @__PURE__ */ jsxs4(CardHeader4, { children: [
          /* @__PURE__ */ jsx4(CardTitle4, { children: "Informations compl\xE9mentaires" }),
          /* @__PURE__ */ jsx4(CardDescription2, { children: "Description et notes sur l'entreprise" })
        ] }),
        /* @__PURE__ */ jsxs4(CardContent4, { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx4(Label2, { htmlFor: "description", children: "Description" }),
            /* @__PURE__ */ jsx4(
              Textarea2,
              {
                id: "description",
                placeholder: "Description courte de l'entreprise...",
                value: company.description || "",
                onChange: (e) => handleChange("description", e.target.value),
                rows: 3
              }
            )
          ] }),
          /* @__PURE__ */ jsxs4("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsx4(Label2, { htmlFor: "notes", children: "Notes internes" }),
            /* @__PURE__ */ jsx4(
              Textarea2,
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
      /* @__PURE__ */ jsxs4("div", { className: "flex flex-col-reverse sm:flex-row gap-3 sm:justify-end", children: [
        /* @__PURE__ */ jsx4(
          Button4,
          {
            type: "button",
            variant: "outline",
            onClick: () => router.push(`/third-parties/companies/${company.id}`),
            disabled: isSaving,
            className: "w-full sm:w-auto",
            children: "Annuler"
          }
        ),
        /* @__PURE__ */ jsxs4(
          Button4,
          {
            type: "submit",
            disabled: isSaving || !company.name.trim(),
            className: "w-full sm:w-auto",
            children: [
              /* @__PURE__ */ jsx4(IconDeviceFloppy2, { className: "h-4 w-4 mr-2" }),
              isSaving ? "Enregistrement..." : "Enregistrer les modifications"
            ]
          }
        )
      ] })
    ] })
  ] });
}

// ../modules/third_parties/frontend/pages/Contacts/List.tsx
import { useState as useState5, useEffect as useEffect4 } from "react";
import { useRouter as useRouter5, useSearchParams } from "next/navigation";
import { auth as auth5 } from "@/lib/auth";
import { Button as Button5 } from "@/components/ui/button";
import { Input as Input4 } from "@/components/ui/input";
import {
  IconUser as IconUser2,
  IconPlus as IconPlus3,
  IconSearch as IconSearch2,
  IconFilter as IconFilter2,
  IconDownload as IconDownload2,
  IconEdit as IconEdit3,
  IconTrash as IconTrash3,
  IconEye as IconEye2,
  IconBuilding as IconBuilding5
} from "@tabler/icons-react";
import { Card as Card5, CardContent as CardContent5, CardHeader as CardHeader5, CardTitle as CardTitle5 } from "@/components/ui/card";
import { Badge as Badge3 } from "@/components/ui/badge";
import {
  Table as Table3,
  TableBody as TableBody3,
  TableCell as TableCell3,
  TableHead as TableHead3,
  TableHeader as TableHeader3,
  TableRow as TableRow3
} from "@/components/ui/table";
import {
  Select as Select4,
  SelectContent as SelectContent4,
  SelectItem as SelectItem4,
  SelectTrigger as SelectTrigger4,
  SelectValue as SelectValue4
} from "@/components/ui/select";
import { Skeleton as Skeleton4 } from "@/components/ui/skeleton";
import { useToast as useToast5 } from "@/hooks/use-toast";
import {
  AlertDialog as AlertDialog3,
  AlertDialogAction as AlertDialogAction3,
  AlertDialogCancel as AlertDialogCancel3,
  AlertDialogContent as AlertDialogContent3,
  AlertDialogDescription as AlertDialogDescription3,
  AlertDialogFooter as AlertDialogFooter3,
  AlertDialogHeader as AlertDialogHeader3,
  AlertDialogTitle as AlertDialogTitle3
} from "@/components/ui/alert-dialog";
import { jsx as jsx5, jsxs as jsxs5 } from "react/jsx-runtime";
function ContactsList() {
  const router = useRouter5();
  const searchParams = useSearchParams();
  const { toast } = useToast5();
  const [contacts, setContacts] = useState5([]);
  const [companies, setCompanies] = useState5([]);
  const [loading, setLoading] = useState5(true);
  const [search, setSearch] = useState5("");
  const [companyFilter, setCompanyFilter] = useState5(searchParams.get("company_id") || "all");
  const [statusFilter, setStatusFilter] = useState5("all");
  const [roleFilter, setRoleFilter] = useState5("all");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState5(false);
  const [contactToDelete, setContactToDelete] = useState5(null);
  useEffect4(() => {
    loadCompanies();
    loadContacts();
  }, [companyFilter, statusFilter, roleFilter]);
  const loadCompanies = async () => {
    try {
      const token = auth5.getToken();
      if (!token) return;
      const response = await getCompanies(token, { limit: 1e3 });
      setCompanies(response.data || []);
    } catch (error) {
      console.error("Failed to load companies:", error);
    }
  };
  const loadContacts = async () => {
    try {
      const token = auth5.getToken();
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
      const token = auth5.getToken();
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
  return /* @__PURE__ */ jsxs5("div", { className: "container mx-auto px-4 py-6 max-w-7xl", children: [
    /* @__PURE__ */ jsxs5("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6", children: [
      /* @__PURE__ */ jsxs5("div", { children: [
        /* @__PURE__ */ jsxs5("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
          /* @__PURE__ */ jsx5(IconUser2, { className: "h-8 w-8" }),
          "Contacts"
        ] }),
        /* @__PURE__ */ jsx5("p", { className: "text-sm text-muted-foreground mt-1", children: "Gestion des contacts des entreprises tierces" })
      ] }),
      /* @__PURE__ */ jsxs5(Button5, { onClick: () => router.push("/third-parties/contacts/new"), children: [
        /* @__PURE__ */ jsx5(IconPlus3, { className: "h-4 w-4 mr-2" }),
        "Nouveau contact"
      ] })
    ] }),
    /* @__PURE__ */ jsxs5(Card5, { className: "mb-6", children: [
      /* @__PURE__ */ jsx5(CardHeader5, { children: /* @__PURE__ */ jsx5(CardTitle5, { className: "text-lg", children: "Filtres" }) }),
      /* @__PURE__ */ jsx5(CardContent5, { children: /* @__PURE__ */ jsxs5("div", { className: "flex flex-col sm:flex-row gap-3", children: [
        /* @__PURE__ */ jsxs5("div", { className: "flex-1 relative", children: [
          /* @__PURE__ */ jsx5(IconSearch2, { className: "absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" }),
          /* @__PURE__ */ jsx5(
            Input4,
            {
              placeholder: "Rechercher un contact...",
              value: search,
              onChange: (e) => setSearch(e.target.value),
              onKeyDown: (e) => e.key === "Enter" && handleSearch(),
              className: "pl-9"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs5(Select4, { value: companyFilter, onValueChange: setCompanyFilter, children: [
          /* @__PURE__ */ jsx5(SelectTrigger4, { className: "w-full sm:w-[200px]", children: /* @__PURE__ */ jsx5(SelectValue4, { placeholder: "Entreprise" }) }),
          /* @__PURE__ */ jsxs5(SelectContent4, { children: [
            /* @__PURE__ */ jsx5(SelectItem4, { value: "all", children: "Toutes les entreprises" }),
            companies.map((company) => /* @__PURE__ */ jsx5(SelectItem4, { value: company.id, children: company.name }, company.id))
          ] })
        ] }),
        /* @__PURE__ */ jsxs5(Select4, { value: roleFilter, onValueChange: setRoleFilter, children: [
          /* @__PURE__ */ jsx5(SelectTrigger4, { className: "w-full sm:w-[180px]", children: /* @__PURE__ */ jsx5(SelectValue4, { placeholder: "R\xF4le" }) }),
          /* @__PURE__ */ jsxs5(SelectContent4, { children: [
            /* @__PURE__ */ jsx5(SelectItem4, { value: "all", children: "Tous les r\xF4les" }),
            Object.entries(ContactRoleLabels).map(([value, label]) => /* @__PURE__ */ jsx5(SelectItem4, { value, children: label }, value))
          ] })
        ] }),
        /* @__PURE__ */ jsxs5(Select4, { value: statusFilter, onValueChange: setStatusFilter, children: [
          /* @__PURE__ */ jsx5(SelectTrigger4, { className: "w-full sm:w-[180px]", children: /* @__PURE__ */ jsx5(SelectValue4, { placeholder: "Statut" }) }),
          /* @__PURE__ */ jsxs5(SelectContent4, { children: [
            /* @__PURE__ */ jsx5(SelectItem4, { value: "all", children: "Tous les statuts" }),
            Object.entries(ContactStatusLabels).map(([value, label]) => /* @__PURE__ */ jsx5(SelectItem4, { value, children: label }, value))
          ] })
        ] }),
        /* @__PURE__ */ jsxs5(Button5, { onClick: handleSearch, variant: "secondary", children: [
          /* @__PURE__ */ jsx5(IconFilter2, { className: "h-4 w-4 mr-2" }),
          "Filtrer"
        ] })
      ] }) })
    ] }),
    /* @__PURE__ */ jsxs5(Card5, { children: [
      /* @__PURE__ */ jsx5(CardHeader5, { children: /* @__PURE__ */ jsxs5("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsx5(CardTitle5, { children: loading ? "Chargement..." : `${contacts.length} contact${contacts.length > 1 ? "s" : ""}` }),
        /* @__PURE__ */ jsxs5(Button5, { variant: "outline", size: "sm", children: [
          /* @__PURE__ */ jsx5(IconDownload2, { className: "h-4 w-4 mr-2" }),
          "Exporter"
        ] })
      ] }) }),
      /* @__PURE__ */ jsx5(CardContent5, { children: loading ? /* @__PURE__ */ jsx5("div", { className: "space-y-3", children: [1, 2, 3, 4, 5].map((i) => /* @__PURE__ */ jsx5(Skeleton4, { className: "h-16 w-full" }, i)) }) : contacts.length === 0 ? /* @__PURE__ */ jsxs5("div", { className: "text-center py-12", children: [
        /* @__PURE__ */ jsx5(IconUser2, { className: "h-12 w-12 mx-auto text-muted-foreground mb-4" }),
        /* @__PURE__ */ jsx5("p", { className: "text-muted-foreground", children: "Aucun contact trouv\xE9" }),
        /* @__PURE__ */ jsxs5(
          Button5,
          {
            variant: "outline",
            className: "mt-4",
            onClick: () => router.push("/third-parties/contacts/new"),
            children: [
              /* @__PURE__ */ jsx5(IconPlus3, { className: "h-4 w-4 mr-2" }),
              "Cr\xE9er le premier contact"
            ]
          }
        )
      ] }) : /* @__PURE__ */ jsx5("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs5(Table3, { children: [
        /* @__PURE__ */ jsx5(TableHeader3, { children: /* @__PURE__ */ jsxs5(TableRow3, { children: [
          /* @__PURE__ */ jsx5(TableHead3, { children: "Nom" }),
          /* @__PURE__ */ jsx5(TableHead3, { children: "Entreprise" }),
          /* @__PURE__ */ jsx5(TableHead3, { children: "Poste" }),
          /* @__PURE__ */ jsx5(TableHead3, { children: "Email" }),
          /* @__PURE__ */ jsx5(TableHead3, { children: "T\xE9l\xE9phone" }),
          /* @__PURE__ */ jsx5(TableHead3, { children: "R\xF4le" }),
          /* @__PURE__ */ jsx5(TableHead3, { children: "Statut" }),
          /* @__PURE__ */ jsx5(TableHead3, { className: "text-right", children: "Actions" })
        ] }) }),
        /* @__PURE__ */ jsx5(TableBody3, { children: contacts.map((contact) => /* @__PURE__ */ jsxs5(TableRow3, { className: "cursor-pointer hover:bg-muted/50", children: [
          /* @__PURE__ */ jsx5(TableCell3, { className: "font-medium", children: /* @__PURE__ */ jsx5("div", { className: "flex items-center gap-2", children: /* @__PURE__ */ jsxs5("div", { children: [
            /* @__PURE__ */ jsxs5("div", { className: "font-semibold", children: [
              contact.first_name,
              " ",
              contact.last_name
            ] }),
            contact.is_primary && /* @__PURE__ */ jsx5(Badge3, { variant: "outline", className: "mt-1 text-xs", children: "Principal" })
          ] }) }) }),
          /* @__PURE__ */ jsx5(TableCell3, { children: /* @__PURE__ */ jsxs5("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx5(IconBuilding5, { className: "h-4 w-4 text-muted-foreground" }),
            /* @__PURE__ */ jsx5("span", { className: "text-sm", children: getCompanyName(contact.company_id) })
          ] }) }),
          /* @__PURE__ */ jsx5(TableCell3, { className: "text-sm", children: contact.job_title || "-" }),
          /* @__PURE__ */ jsx5(TableCell3, { className: "text-sm", children: contact.email || "-" }),
          /* @__PURE__ */ jsx5(TableCell3, { className: "text-sm", children: contact.phone || "-" }),
          /* @__PURE__ */ jsx5(TableCell3, { children: /* @__PURE__ */ jsx5(Badge3, { variant: "outline", children: ContactRoleLabels[contact.role] }) }),
          /* @__PURE__ */ jsx5(TableCell3, { children: /* @__PURE__ */ jsx5(Badge3, { variant: contact.status === "active" ? "default" : "secondary", children: ContactStatusLabels[contact.status] }) }),
          /* @__PURE__ */ jsx5(TableCell3, { className: "text-right", children: /* @__PURE__ */ jsxs5("div", { className: "flex items-center justify-end gap-1", children: [
            /* @__PURE__ */ jsx5(
              Button5,
              {
                variant: "ghost",
                size: "icon",
                className: "h-8 w-8",
                onClick: () => router.push(`/third-parties/contacts/${contact.id}`),
                children: /* @__PURE__ */ jsx5(IconEye2, { className: "h-4 w-4" })
              }
            ),
            /* @__PURE__ */ jsx5(
              Button5,
              {
                variant: "ghost",
                size: "icon",
                className: "h-8 w-8",
                onClick: () => router.push(`/third-parties/contacts/${contact.id}/edit`),
                children: /* @__PURE__ */ jsx5(IconEdit3, { className: "h-4 w-4" })
              }
            ),
            /* @__PURE__ */ jsx5(
              Button5,
              {
                variant: "ghost",
                size: "icon",
                className: "h-8 w-8 text-destructive",
                onClick: () => {
                  setContactToDelete(contact);
                  setDeleteDialogOpen(true);
                },
                children: /* @__PURE__ */ jsx5(IconTrash3, { className: "h-4 w-4" })
              }
            )
          ] }) })
        ] }, contact.id)) })
      ] }) }) })
    ] }),
    /* @__PURE__ */ jsx5(AlertDialog3, { open: deleteDialogOpen, onOpenChange: setDeleteDialogOpen, children: /* @__PURE__ */ jsxs5(AlertDialogContent3, { children: [
      /* @__PURE__ */ jsxs5(AlertDialogHeader3, { children: [
        /* @__PURE__ */ jsx5(AlertDialogTitle3, { children: "Confirmer la suppression" }),
        /* @__PURE__ */ jsxs5(AlertDialogDescription3, { children: [
          "\xCAtes-vous s\xFBr de vouloir supprimer le contact",
          " ",
          /* @__PURE__ */ jsxs5("strong", { children: [
            contactToDelete?.first_name,
            " ",
            contactToDelete?.last_name
          ] }),
          " ? Cette action est irr\xE9versible."
        ] })
      ] }),
      /* @__PURE__ */ jsxs5(AlertDialogFooter3, { children: [
        /* @__PURE__ */ jsx5(AlertDialogCancel3, { children: "Annuler" }),
        /* @__PURE__ */ jsx5(AlertDialogAction3, { onClick: handleDelete, className: "bg-destructive hover:bg-destructive/90", children: "Supprimer" })
      ] })
    ] }) })
  ] });
}

// ../modules/third_parties/frontend/pages/Contacts/Details.tsx
import { useState as useState6, useEffect as useEffect5 } from "react";
import { useRouter as useRouter6 } from "next/navigation";
import { auth as auth6 } from "@/lib/auth";
import { Button as Button6 } from "@/components/ui/button";
import {
  IconArrowLeft as IconArrowLeft4,
  IconEdit as IconEdit4,
  IconTrash as IconTrash4,
  IconUser as IconUser3,
  IconMail as IconMail2,
  IconPhone as IconPhone2,
  IconBuilding as IconBuilding6,
  IconBrandLinkedin,
  IconBrandTwitter,
  IconSend
} from "@tabler/icons-react";
import { Card as Card6, CardContent as CardContent6, CardHeader as CardHeader6, CardTitle as CardTitle6 } from "@/components/ui/card";
import { Badge as Badge4 } from "@/components/ui/badge";
import { Skeleton as Skeleton5 } from "@/components/ui/skeleton";
import { Separator as Separator2 } from "@/components/ui/separator";
import { Tabs as Tabs2, TabsContent as TabsContent2, TabsList as TabsList2, TabsTrigger as TabsTrigger2 } from "@/components/ui/tabs";
import { useToast as useToast6 } from "@/hooks/use-toast";
import {
  AlertDialog as AlertDialog4,
  AlertDialogAction as AlertDialogAction4,
  AlertDialogCancel as AlertDialogCancel4,
  AlertDialogContent as AlertDialogContent4,
  AlertDialogDescription as AlertDialogDescription4,
  AlertDialogFooter as AlertDialogFooter4,
  AlertDialogHeader as AlertDialogHeader4,
  AlertDialogTitle as AlertDialogTitle4
} from "@/components/ui/alert-dialog";
import { Fragment as Fragment2, jsx as jsx6, jsxs as jsxs6 } from "react/jsx-runtime";
function ContactDetails({ contactId }) {
  const router = useRouter6();
  const { toast } = useToast6();
  const [contact, setContact] = useState6(null);
  const [company, setCompany] = useState6(null);
  const [loading, setLoading] = useState6(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState6(false);
  useEffect5(() => {
    if (contactId) {
      loadContact();
    }
  }, [contactId]);
  const loadContact = async () => {
    try {
      const token = auth6.getToken();
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
      const token = auth6.getToken();
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
    return /* @__PURE__ */ jsxs6("div", { className: "container mx-auto px-4 py-6 max-w-6xl", children: [
      /* @__PURE__ */ jsx6(Skeleton5, { className: "h-12 w-64 mb-6" }),
      /* @__PURE__ */ jsxs6("div", { className: "grid gap-6", children: [
        /* @__PURE__ */ jsx6(Skeleton5, { className: "h-48 w-full" }),
        /* @__PURE__ */ jsx6(Skeleton5, { className: "h-96 w-full" })
      ] })
    ] });
  }
  if (!contact) {
    return /* @__PURE__ */ jsx6("div", { className: "container mx-auto px-4 py-6 max-w-6xl", children: /* @__PURE__ */ jsx6("p", { children: "Contact non trouv\xE9" }) });
  }
  return /* @__PURE__ */ jsxs6("div", { className: "container mx-auto px-4 py-6 max-w-6xl", children: [
    /* @__PURE__ */ jsxs6("div", { className: "flex items-center gap-4 mb-6", children: [
      /* @__PURE__ */ jsx6(
        Button6,
        {
          variant: "ghost",
          size: "icon",
          onClick: () => router.push("/third-parties/contacts"),
          children: /* @__PURE__ */ jsx6(IconArrowLeft4, { className: "h-4 w-4" })
        }
      ),
      /* @__PURE__ */ jsxs6("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsxs6("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
          /* @__PURE__ */ jsx6(IconUser3, { className: "h-8 w-8" }),
          contact.civility && `${contact.civility} `,
          contact.first_name,
          " ",
          contact.last_name
        ] }),
        contact.job_title && /* @__PURE__ */ jsx6("p", { className: "text-sm text-muted-foreground mt-1", children: contact.job_title })
      ] }),
      /* @__PURE__ */ jsxs6("div", { className: "flex gap-2", children: [
        !contact.has_user_account && /* @__PURE__ */ jsxs6(Button6, { variant: "outline", onClick: handleInvite, children: [
          /* @__PURE__ */ jsx6(IconSend, { className: "h-4 w-4 mr-2" }),
          "Inviter"
        ] }),
        /* @__PURE__ */ jsxs6(
          Button6,
          {
            variant: "outline",
            onClick: () => router.push(`/third-parties/contacts/${contact.id}/edit`),
            children: [
              /* @__PURE__ */ jsx6(IconEdit4, { className: "h-4 w-4 mr-2" }),
              "Modifier"
            ]
          }
        ),
        /* @__PURE__ */ jsxs6(Button6, { variant: "destructive", onClick: () => setDeleteDialogOpen(true), children: [
          /* @__PURE__ */ jsx6(IconTrash4, { className: "h-4 w-4 mr-2" }),
          "Supprimer"
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs6(Card6, { className: "mb-6", children: [
      /* @__PURE__ */ jsx6(CardHeader6, { children: /* @__PURE__ */ jsxs6("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ jsx6(CardTitle6, { children: "Informations du contact" }),
        /* @__PURE__ */ jsxs6("div", { className: "flex gap-2", children: [
          /* @__PURE__ */ jsx6(Badge4, { variant: "outline", children: ContactRoleLabels[contact.role] }),
          /* @__PURE__ */ jsx6(Badge4, { variant: contact.status === "active" ? "default" : "secondary", children: ContactStatusLabels[contact.status] }),
          contact.is_primary && /* @__PURE__ */ jsx6(Badge4, { variant: "default", children: "Principal" }),
          contact.has_user_account && /* @__PURE__ */ jsx6(Badge4, { variant: "secondary", children: "Compte utilisateur" })
        ] })
      ] }) }),
      /* @__PURE__ */ jsxs6(CardContent6, { children: [
        /* @__PURE__ */ jsxs6("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [
          /* @__PURE__ */ jsxs6("div", { className: "space-y-4", children: [
            company && /* @__PURE__ */ jsxs6("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx6(IconBuilding6, { className: "h-5 w-5 text-muted-foreground" }),
              /* @__PURE__ */ jsxs6("div", { children: [
                /* @__PURE__ */ jsx6("p", { className: "text-sm text-muted-foreground", children: "Entreprise" }),
                /* @__PURE__ */ jsx6(
                  "p",
                  {
                    className: "font-medium text-primary hover:underline cursor-pointer",
                    onClick: () => router.push(`/third-parties/companies/${company.id}`),
                    children: company.name
                  }
                )
              ] })
            ] }),
            contact.email && /* @__PURE__ */ jsxs6("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx6(IconMail2, { className: "h-5 w-5 text-muted-foreground" }),
              /* @__PURE__ */ jsxs6("div", { children: [
                /* @__PURE__ */ jsx6("p", { className: "text-sm text-muted-foreground", children: "Email" }),
                /* @__PURE__ */ jsx6(
                  "a",
                  {
                    href: `mailto:${contact.email}`,
                    className: "font-medium text-primary hover:underline",
                    children: contact.email
                  }
                )
              ] })
            ] }),
            contact.phone && /* @__PURE__ */ jsxs6("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx6(IconPhone2, { className: "h-5 w-5 text-muted-foreground" }),
              /* @__PURE__ */ jsxs6("div", { children: [
                /* @__PURE__ */ jsx6("p", { className: "text-sm text-muted-foreground", children: "T\xE9l\xE9phone" }),
                /* @__PURE__ */ jsx6("p", { className: "font-medium", children: contact.phone })
              ] })
            ] }),
            contact.mobile && /* @__PURE__ */ jsxs6("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx6(IconPhone2, { className: "h-5 w-5 text-muted-foreground" }),
              /* @__PURE__ */ jsxs6("div", { children: [
                /* @__PURE__ */ jsx6("p", { className: "text-sm text-muted-foreground", children: "Mobile" }),
                /* @__PURE__ */ jsx6("p", { className: "font-medium", children: contact.mobile })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs6("div", { className: "space-y-4", children: [
            contact.department && /* @__PURE__ */ jsxs6("div", { children: [
              /* @__PURE__ */ jsx6("p", { className: "text-sm text-muted-foreground", children: "D\xE9partement" }),
              /* @__PURE__ */ jsx6("p", { className: "font-medium", children: contact.department })
            ] }),
            contact.extension && /* @__PURE__ */ jsxs6("div", { children: [
              /* @__PURE__ */ jsx6("p", { className: "text-sm text-muted-foreground", children: "Extension" }),
              /* @__PURE__ */ jsx6("p", { className: "font-medium", children: contact.extension })
            ] }),
            contact.linkedin_url && /* @__PURE__ */ jsxs6("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx6(IconBrandLinkedin, { className: "h-5 w-5 text-muted-foreground" }),
              /* @__PURE__ */ jsxs6("div", { children: [
                /* @__PURE__ */ jsx6("p", { className: "text-sm text-muted-foreground", children: "LinkedIn" }),
                /* @__PURE__ */ jsx6(
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
            contact.twitter_handle && /* @__PURE__ */ jsxs6("div", { className: "flex items-center gap-3", children: [
              /* @__PURE__ */ jsx6(IconBrandTwitter, { className: "h-5 w-5 text-muted-foreground" }),
              /* @__PURE__ */ jsxs6("div", { children: [
                /* @__PURE__ */ jsx6("p", { className: "text-sm text-muted-foreground", children: "Twitter" }),
                /* @__PURE__ */ jsx6("p", { className: "font-medium", children: contact.twitter_handle })
              ] })
            ] })
          ] })
        ] }),
        contact.notes && /* @__PURE__ */ jsxs6(Fragment2, { children: [
          /* @__PURE__ */ jsx6(Separator2, { className: "my-6" }),
          /* @__PURE__ */ jsxs6("div", { children: [
            /* @__PURE__ */ jsx6("p", { className: "text-sm text-muted-foreground mb-2", children: "Notes internes" }),
            /* @__PURE__ */ jsx6("p", { className: "text-sm whitespace-pre-wrap", children: contact.notes })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs6(Tabs2, { defaultValue: "activity", className: "w-full", children: [
      /* @__PURE__ */ jsxs6(TabsList2, { children: [
        /* @__PURE__ */ jsx6(TabsTrigger2, { value: "activity", children: "Activit\xE9" }),
        /* @__PURE__ */ jsx6(TabsTrigger2, { value: "invitations", children: "Invitations" })
      ] }),
      /* @__PURE__ */ jsx6(TabsContent2, { value: "activity", className: "mt-6", children: /* @__PURE__ */ jsxs6(Card6, { children: [
        /* @__PURE__ */ jsx6(CardHeader6, { children: /* @__PURE__ */ jsx6(CardTitle6, { children: "Historique d'activit\xE9" }) }),
        /* @__PURE__ */ jsx6(CardContent6, { children: /* @__PURE__ */ jsx6("p", { className: "text-sm text-muted-foreground", children: "Aucune activit\xE9 r\xE9cente" }) })
      ] }) }),
      /* @__PURE__ */ jsx6(TabsContent2, { value: "invitations", className: "mt-6", children: /* @__PURE__ */ jsxs6(Card6, { children: [
        /* @__PURE__ */ jsx6(CardHeader6, { children: /* @__PURE__ */ jsxs6("div", { className: "flex items-center justify-between", children: [
          /* @__PURE__ */ jsx6(CardTitle6, { children: "Invitations" }),
          !contact.has_user_account && /* @__PURE__ */ jsxs6(Button6, { size: "sm", onClick: handleInvite, children: [
            /* @__PURE__ */ jsx6(IconSend, { className: "h-4 w-4 mr-2" }),
            "Envoyer une invitation"
          ] })
        ] }) }),
        /* @__PURE__ */ jsx6(CardContent6, { children: contact.has_user_account ? /* @__PURE__ */ jsx6("p", { className: "text-sm text-muted-foreground", children: "Ce contact poss\xE8de d\xE9j\xE0 un compte utilisateur" }) : /* @__PURE__ */ jsx6("p", { className: "text-sm text-muted-foreground", children: "Aucune invitation envoy\xE9e" }) })
      ] }) })
    ] }),
    /* @__PURE__ */ jsx6(AlertDialog4, { open: deleteDialogOpen, onOpenChange: setDeleteDialogOpen, children: /* @__PURE__ */ jsxs6(AlertDialogContent4, { children: [
      /* @__PURE__ */ jsxs6(AlertDialogHeader4, { children: [
        /* @__PURE__ */ jsx6(AlertDialogTitle4, { children: "Confirmer la suppression" }),
        /* @__PURE__ */ jsxs6(AlertDialogDescription4, { children: [
          "\xCAtes-vous s\xFBr de vouloir supprimer le contact",
          " ",
          /* @__PURE__ */ jsxs6("strong", { children: [
            contact.first_name,
            " ",
            contact.last_name
          ] }),
          " ? Cette action est irr\xE9versible."
        ] })
      ] }),
      /* @__PURE__ */ jsxs6(AlertDialogFooter4, { children: [
        /* @__PURE__ */ jsx6(AlertDialogCancel4, { children: "Annuler" }),
        /* @__PURE__ */ jsx6(AlertDialogAction4, { onClick: handleDelete, className: "bg-destructive hover:bg-destructive/90", children: "Supprimer" })
      ] })
    ] }) })
  ] });
}

// ../modules/third_parties/frontend/pages/Contacts/Create.tsx
import { useState as useState7, useEffect as useEffect6 } from "react";
import { useRouter as useRouter7, useSearchParams as useSearchParams2 } from "next/navigation";
import { auth as auth7 } from "@/lib/auth";
import { Button as Button7 } from "@/components/ui/button";
import { Input as Input5 } from "@/components/ui/input";
import { Label as Label3 } from "@/components/ui/label";
import { Textarea as Textarea3 } from "@/components/ui/textarea";
import {
  IconArrowLeft as IconArrowLeft5,
  IconDeviceFloppy as IconDeviceFloppy3,
  IconUser as IconUser4
} from "@tabler/icons-react";
import { Card as Card7, CardContent as CardContent7, CardDescription as CardDescription3, CardHeader as CardHeader7, CardTitle as CardTitle7 } from "@/components/ui/card";
import {
  Select as Select5,
  SelectContent as SelectContent5,
  SelectItem as SelectItem5,
  SelectTrigger as SelectTrigger5,
  SelectValue as SelectValue5
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton as Skeleton6 } from "@/components/ui/skeleton";
import { useToast as useToast7 } from "@/hooks/use-toast";
import { jsx as jsx7, jsxs as jsxs7 } from "react/jsx-runtime";
function CreateContact() {
  const router = useRouter7();
  const searchParams = useSearchParams2();
  const { toast } = useToast7();
  const [isSaving, setIsSaving] = useState7(false);
  const [loadingCompanies, setLoadingCompanies] = useState7(true);
  const [companies, setCompanies] = useState7([]);
  const [formData, setFormData] = useState7({
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
  useEffect6(() => {
    loadCompanies();
  }, []);
  const loadCompanies = async () => {
    try {
      const token = auth7.getToken();
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
      const token = auth7.getToken();
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
    return /* @__PURE__ */ jsxs7("div", { className: "container max-w-4xl mx-auto px-4 py-6 sm:py-8", children: [
      /* @__PURE__ */ jsx7(Skeleton6, { className: "h-12 w-64 mb-6" }),
      /* @__PURE__ */ jsx7("div", { className: "space-y-6", children: [1, 2, 3].map((i) => /* @__PURE__ */ jsx7(Skeleton6, { className: "h-64 w-full" }, i)) })
    ] });
  }
  return /* @__PURE__ */ jsxs7("div", { className: "container max-w-4xl mx-auto px-4 py-6 sm:py-8", children: [
    /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-4 mb-6", children: [
      /* @__PURE__ */ jsx7(
        Button7,
        {
          variant: "ghost",
          size: "icon",
          onClick: () => router.push("/third-parties/contacts"),
          children: /* @__PURE__ */ jsx7(IconArrowLeft5, { className: "h-4 w-4" })
        }
      ),
      /* @__PURE__ */ jsxs7("div", { children: [
        /* @__PURE__ */ jsxs7("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
          /* @__PURE__ */ jsx7(IconUser4, { className: "h-6 w-6" }),
          "Nouveau contact"
        ] }),
        /* @__PURE__ */ jsx7("p", { className: "text-sm text-muted-foreground mt-1", children: "Cr\xE9er un nouveau contact pour une entreprise" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs7("form", { onSubmit: handleSubmit, className: "space-y-6", children: [
      /* @__PURE__ */ jsxs7(Card7, { children: [
        /* @__PURE__ */ jsxs7(CardHeader7, { children: [
          /* @__PURE__ */ jsx7(CardTitle7, { children: "Entreprise" }),
          /* @__PURE__ */ jsx7(CardDescription3, { children: "S\xE9lectionnez l'entreprise associ\xE9e \xE0 ce contact" })
        ] }),
        /* @__PURE__ */ jsx7(CardContent7, { className: "space-y-4", children: /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxs7(Label3, { htmlFor: "company_id", children: [
            "Entreprise ",
            /* @__PURE__ */ jsx7("span", { className: "text-destructive", children: "*" })
          ] }),
          /* @__PURE__ */ jsxs7(
            Select5,
            {
              value: formData.company_id,
              onValueChange: (value) => handleChange("company_id", value),
              children: [
                /* @__PURE__ */ jsx7(SelectTrigger5, { children: /* @__PURE__ */ jsx7(SelectValue5, { placeholder: "S\xE9lectionner une entreprise" }) }),
                /* @__PURE__ */ jsx7(SelectContent5, { children: companies.map((company) => /* @__PURE__ */ jsx7(SelectItem5, { value: company.id, children: company.name }, company.id)) })
              ]
            }
          )
        ] }) })
      ] }),
      /* @__PURE__ */ jsxs7(Card7, { children: [
        /* @__PURE__ */ jsxs7(CardHeader7, { children: [
          /* @__PURE__ */ jsx7(CardTitle7, { children: "Informations personnelles" }),
          /* @__PURE__ */ jsx7(CardDescription3, { children: "Informations de base du contact" })
        ] }),
        /* @__PURE__ */ jsxs7(CardContent7, { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs7("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
            /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx7(Label3, { htmlFor: "civility", children: "Civilit\xE9" }),
              /* @__PURE__ */ jsxs7(
                Select5,
                {
                  value: formData.civility,
                  onValueChange: (value) => handleChange("civility", value),
                  children: [
                    /* @__PURE__ */ jsx7(SelectTrigger5, { children: /* @__PURE__ */ jsx7(SelectValue5, { placeholder: "S\xE9lectionner" }) }),
                    /* @__PURE__ */ jsxs7(SelectContent5, { children: [
                      /* @__PURE__ */ jsx7(SelectItem5, { value: "mr", children: "M." }),
                      /* @__PURE__ */ jsx7(SelectItem5, { value: "mrs", children: "Mme" }),
                      /* @__PURE__ */ jsx7(SelectItem5, { value: "ms", children: "Mlle" }),
                      /* @__PURE__ */ jsx7(SelectItem5, { value: "dr", children: "Dr" })
                    ] })
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxs7(Label3, { htmlFor: "first_name", children: [
                "Pr\xE9nom ",
                /* @__PURE__ */ jsx7("span", { className: "text-destructive", children: "*" })
              ] }),
              /* @__PURE__ */ jsx7(
                Input5,
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
            /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsxs7(Label3, { htmlFor: "last_name", children: [
                "Nom ",
                /* @__PURE__ */ jsx7("span", { className: "text-destructive", children: "*" })
              ] }),
              /* @__PURE__ */ jsx7(
                Input5,
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
          /* @__PURE__ */ jsxs7("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx7(Label3, { htmlFor: "job_title", children: "Poste" }),
              /* @__PURE__ */ jsx7(
                Input5,
                {
                  id: "job_title",
                  placeholder: "Directeur Commercial",
                  value: formData.job_title,
                  onChange: (e) => handleChange("job_title", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx7(Label3, { htmlFor: "department", children: "D\xE9partement" }),
              /* @__PURE__ */ jsx7(
                Input5,
                {
                  id: "department",
                  placeholder: "Commercial",
                  value: formData.department,
                  onChange: (e) => handleChange("department", e.target.value)
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs7("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx7(Label3, { htmlFor: "role", children: "R\xF4le" }),
              /* @__PURE__ */ jsxs7(
                Select5,
                {
                  value: formData.role,
                  onValueChange: (value) => handleChange("role", value),
                  children: [
                    /* @__PURE__ */ jsx7(SelectTrigger5, { children: /* @__PURE__ */ jsx7(SelectValue5, {}) }),
                    /* @__PURE__ */ jsx7(SelectContent5, { children: Object.entries(ContactRoleLabels).map(([value, label]) => /* @__PURE__ */ jsx7(SelectItem5, { value, children: label }, value)) })
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx7(Label3, { htmlFor: "status", children: "Statut" }),
              /* @__PURE__ */ jsxs7(
                Select5,
                {
                  value: formData.status,
                  onValueChange: (value) => handleChange("status", value),
                  children: [
                    /* @__PURE__ */ jsx7(SelectTrigger5, { children: /* @__PURE__ */ jsx7(SelectValue5, {}) }),
                    /* @__PURE__ */ jsx7(SelectContent5, { children: Object.entries(ContactStatusLabels).map(([value, label]) => /* @__PURE__ */ jsx7(SelectItem5, { value, children: label }, value)) })
                  ]
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs7("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ jsxs7("div", { className: "space-y-0.5", children: [
              /* @__PURE__ */ jsx7(Label3, { htmlFor: "is_primary", children: "Contact principal" }),
              /* @__PURE__ */ jsx7("p", { className: "text-xs text-muted-foreground", children: "Marquer ce contact comme contact principal de l'entreprise" })
            ] }),
            /* @__PURE__ */ jsx7(
              Switch,
              {
                id: "is_primary",
                checked: formData.is_primary,
                onCheckedChange: (checked) => handleChange("is_primary", checked)
              }
            )
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsxs7(Card7, { children: [
        /* @__PURE__ */ jsxs7(CardHeader7, { children: [
          /* @__PURE__ */ jsx7(CardTitle7, { children: "Coordonn\xE9es" }),
          /* @__PURE__ */ jsx7(CardDescription3, { children: "Informations de contact" })
        ] }),
        /* @__PURE__ */ jsxs7(CardContent7, { className: "space-y-4", children: [
          /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
            /* @__PURE__ */ jsxs7(Label3, { htmlFor: "email", children: [
              "Email ",
              /* @__PURE__ */ jsx7("span", { className: "text-destructive", children: "*" })
            ] }),
            /* @__PURE__ */ jsx7(
              Input5,
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
          /* @__PURE__ */ jsxs7("div", { className: "grid grid-cols-1 md:grid-cols-3 gap-4", children: [
            /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx7(Label3, { htmlFor: "phone", children: "T\xE9l\xE9phone" }),
              /* @__PURE__ */ jsx7(
                Input5,
                {
                  id: "phone",
                  type: "tel",
                  placeholder: "+33 1 23 45 67 89",
                  value: formData.phone,
                  onChange: (e) => handleChange("phone", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx7(Label3, { htmlFor: "mobile", children: "Mobile" }),
              /* @__PURE__ */ jsx7(
                Input5,
                {
                  id: "mobile",
                  type: "tel",
                  placeholder: "+33 6 12 34 56 78",
                  value: formData.mobile,
                  onChange: (e) => handleChange("mobile", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx7(Label3, { htmlFor: "extension", children: "Extension" }),
              /* @__PURE__ */ jsx7(
                Input5,
                {
                  id: "extension",
                  placeholder: "1234",
                  value: formData.extension,
                  onChange: (e) => handleChange("extension", e.target.value)
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs7("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx7(Label3, { htmlFor: "linkedin_url", children: "LinkedIn" }),
              /* @__PURE__ */ jsx7(
                Input5,
                {
                  id: "linkedin_url",
                  type: "url",
                  placeholder: "https://linkedin.com/in/jeandupont",
                  value: formData.linkedin_url,
                  onChange: (e) => handleChange("linkedin_url", e.target.value)
                }
              )
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
              /* @__PURE__ */ jsx7(Label3, { htmlFor: "twitter_handle", children: "Twitter" }),
              /* @__PURE__ */ jsx7(
                Input5,
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
      /* @__PURE__ */ jsxs7(Card7, { children: [
        /* @__PURE__ */ jsxs7(CardHeader7, { children: [
          /* @__PURE__ */ jsx7(CardTitle7, { children: "Notes" }),
          /* @__PURE__ */ jsx7(CardDescription3, { children: "Informations compl\xE9mentaires sur le contact" })
        ] }),
        /* @__PURE__ */ jsx7(CardContent7, { className: "space-y-4", children: /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx7(Label3, { htmlFor: "notes", children: "Notes internes" }),
          /* @__PURE__ */ jsx7(
            Textarea3,
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
      /* @__PURE__ */ jsxs7("div", { className: "flex flex-col-reverse sm:flex-row gap-3 sm:justify-end", children: [
        /* @__PURE__ */ jsx7(
          Button7,
          {
            type: "button",
            variant: "outline",
            onClick: () => router.push("/third-parties/contacts"),
            disabled: isSaving,
            className: "w-full sm:w-auto",
            children: "Annuler"
          }
        ),
        /* @__PURE__ */ jsxs7(
          Button7,
          {
            type: "submit",
            disabled: isSaving || !formData.company_id || !formData.first_name.trim() || !formData.last_name.trim() || !formData.email.trim(),
            className: "w-full sm:w-auto",
            children: [
              /* @__PURE__ */ jsx7(IconDeviceFloppy3, { className: "h-4 w-4 mr-2" }),
              isSaving ? "Cr\xE9ation..." : "Cr\xE9er le contact"
            ]
          }
        )
      ] })
    ] })
  ] });
}

// ../modules/third_parties/frontend/pages/Invitations/List.tsx
import { useState as useState8, useEffect as useEffect7 } from "react";
import { useRouter as useRouter8 } from "next/navigation";
import { auth as auth8 } from "@/lib/auth";
import { Button as Button8 } from "@/components/ui/button";
import {
  IconSend as IconSend2,
  IconRefresh,
  IconTrash as IconTrash5,
  IconCopy,
  IconCheck,
  IconX
} from "@tabler/icons-react";
import { Card as Card8, CardContent as CardContent8, CardHeader as CardHeader8, CardTitle as CardTitle8 } from "@/components/ui/card";
import { Badge as Badge5 } from "@/components/ui/badge";
import {
  Table as Table4,
  TableBody as TableBody4,
  TableCell as TableCell4,
  TableHead as TableHead4,
  TableHeader as TableHeader4,
  TableRow as TableRow4
} from "@/components/ui/table";
import {
  Select as Select6,
  SelectContent as SelectContent6,
  SelectItem as SelectItem6,
  SelectTrigger as SelectTrigger6,
  SelectValue as SelectValue6
} from "@/components/ui/select";
import { Skeleton as Skeleton7 } from "@/components/ui/skeleton";
import { useToast as useToast8 } from "@/hooks/use-toast";
import {
  AlertDialog as AlertDialog5,
  AlertDialogAction as AlertDialogAction5,
  AlertDialogCancel as AlertDialogCancel5,
  AlertDialogContent as AlertDialogContent5,
  AlertDialogDescription as AlertDialogDescription5,
  AlertDialogFooter as AlertDialogFooter5,
  AlertDialogHeader as AlertDialogHeader5,
  AlertDialogTitle as AlertDialogTitle5
} from "@/components/ui/alert-dialog";
import { jsx as jsx8, jsxs as jsxs8 } from "react/jsx-runtime";
function InvitationsList() {
  const router = useRouter8();
  const { toast } = useToast8();
  const [invitations, setInvitations] = useState8([]);
  const [contacts, setContacts] = useState8([]);
  const [loading, setLoading] = useState8(true);
  const [statusFilter, setStatusFilter] = useState8("all");
  const [revokeDialogOpen, setRevokeDialogOpen] = useState8(false);
  const [invitationToRevoke, setInvitationToRevoke] = useState8(null);
  const [copiedToken, setCopiedToken] = useState8(null);
  useEffect7(() => {
    loadInvitations();
    loadContacts();
  }, [statusFilter]);
  const loadInvitations = async () => {
    try {
      const token = auth8.getToken();
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
      const token = auth8.getToken();
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
      const token = auth8.getToken();
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
    return /* @__PURE__ */ jsx8(Badge5, { variant: variants[status.toLowerCase()] || "secondary", children: InvitationStatusLabels[status] });
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
  return /* @__PURE__ */ jsxs8("div", { className: "container mx-auto px-4 py-6 max-w-7xl", children: [
    /* @__PURE__ */ jsxs8("div", { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6", children: [
      /* @__PURE__ */ jsxs8("div", { children: [
        /* @__PURE__ */ jsxs8("h1", { className: "text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2", children: [
          /* @__PURE__ */ jsx8(IconSend2, { className: "h-8 w-8" }),
          "Invitations"
        ] }),
        /* @__PURE__ */ jsx8("p", { className: "text-sm text-muted-foreground mt-1", children: "Gestion des invitations envoy\xE9es aux contacts" })
      ] }),
      /* @__PURE__ */ jsxs8(Button8, { onClick: loadInvitations, variant: "outline", children: [
        /* @__PURE__ */ jsx8(IconRefresh, { className: "h-4 w-4 mr-2" }),
        "Actualiser"
      ] })
    ] }),
    /* @__PURE__ */ jsxs8(Card8, { className: "mb-6", children: [
      /* @__PURE__ */ jsx8(CardHeader8, { children: /* @__PURE__ */ jsx8(CardTitle8, { className: "text-lg", children: "Filtres" }) }),
      /* @__PURE__ */ jsx8(CardContent8, { children: /* @__PURE__ */ jsx8("div", { className: "flex flex-col sm:flex-row gap-3", children: /* @__PURE__ */ jsxs8(Select6, { value: statusFilter, onValueChange: setStatusFilter, children: [
        /* @__PURE__ */ jsx8(SelectTrigger6, { className: "w-full sm:w-[200px]", children: /* @__PURE__ */ jsx8(SelectValue6, { placeholder: "Statut" }) }),
        /* @__PURE__ */ jsxs8(SelectContent6, { children: [
          /* @__PURE__ */ jsx8(SelectItem6, { value: "all", children: "Tous les statuts" }),
          Object.entries(InvitationStatusLabels).map(([value, label]) => /* @__PURE__ */ jsx8(SelectItem6, { value, children: label }, value))
        ] })
      ] }) }) })
    ] }),
    /* @__PURE__ */ jsxs8(Card8, { children: [
      /* @__PURE__ */ jsx8(CardHeader8, { children: /* @__PURE__ */ jsx8(CardTitle8, { children: loading ? "Chargement..." : `${invitations.length} invitation${invitations.length > 1 ? "s" : ""}` }) }),
      /* @__PURE__ */ jsx8(CardContent8, { children: loading ? /* @__PURE__ */ jsx8("div", { className: "space-y-3", children: [1, 2, 3, 4, 5].map((i) => /* @__PURE__ */ jsx8(Skeleton7, { className: "h-16 w-full" }, i)) }) : invitations.length === 0 ? /* @__PURE__ */ jsxs8("div", { className: "text-center py-12", children: [
        /* @__PURE__ */ jsx8(IconSend2, { className: "h-12 w-12 mx-auto text-muted-foreground mb-4" }),
        /* @__PURE__ */ jsx8("p", { className: "text-muted-foreground", children: "Aucune invitation trouv\xE9e" })
      ] }) : /* @__PURE__ */ jsx8("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs8(Table4, { children: [
        /* @__PURE__ */ jsx8(TableHeader4, { children: /* @__PURE__ */ jsxs8(TableRow4, { children: [
          /* @__PURE__ */ jsx8(TableHead4, { children: "Contact" }),
          /* @__PURE__ */ jsx8(TableHead4, { children: "Email" }),
          /* @__PURE__ */ jsx8(TableHead4, { children: "Statut" }),
          /* @__PURE__ */ jsx8(TableHead4, { children: "Expire le" }),
          /* @__PURE__ */ jsx8(TableHead4, { children: "Admin" }),
          /* @__PURE__ */ jsx8(TableHead4, { children: "2FA" }),
          /* @__PURE__ */ jsx8(TableHead4, { className: "text-right", children: "Actions" })
        ] }) }),
        /* @__PURE__ */ jsx8(TableBody4, { children: invitations.map((invitation) => /* @__PURE__ */ jsxs8(TableRow4, { children: [
          /* @__PURE__ */ jsx8(TableCell4, { className: "font-medium", children: getContactName(invitation.contact_id) }),
          /* @__PURE__ */ jsx8(TableCell4, { className: "text-sm", children: getContactEmail(invitation.contact_id) }),
          /* @__PURE__ */ jsx8(TableCell4, { children: getStatusBadge(invitation.status) }),
          /* @__PURE__ */ jsx8(TableCell4, { className: "text-sm", children: /* @__PURE__ */ jsxs8("div", { className: "flex items-center gap-2", children: [
            formatDate(invitation.expires_at),
            isExpired(invitation.expires_at) && invitation.status === "pending" && /* @__PURE__ */ jsx8(Badge5, { variant: "destructive", className: "text-xs", children: "Expir\xE9" })
          ] }) }),
          /* @__PURE__ */ jsx8(TableCell4, { children: invitation.can_be_admin ? /* @__PURE__ */ jsx8(IconCheck, { className: "h-4 w-4 text-green-500" }) : /* @__PURE__ */ jsx8(IconX, { className: "h-4 w-4 text-muted-foreground" }) }),
          /* @__PURE__ */ jsx8(TableCell4, { children: invitation.two_factor_verified ? /* @__PURE__ */ jsx8(Badge5, { variant: "default", className: "text-xs", children: "V\xE9rifi\xE9" }) : /* @__PURE__ */ jsx8(Badge5, { variant: "secondary", className: "text-xs", children: "En attente" }) }),
          /* @__PURE__ */ jsx8(TableCell4, { className: "text-right", children: /* @__PURE__ */ jsxs8("div", { className: "flex items-center justify-end gap-1", children: [
            invitation.status === "pending" && !isExpired(invitation.expires_at) && /* @__PURE__ */ jsx8(
              Button8,
              {
                variant: "ghost",
                size: "icon",
                className: "h-8 w-8",
                onClick: () => copyInvitationLink(invitation.token),
                children: copiedToken === invitation.token ? /* @__PURE__ */ jsx8(IconCheck, { className: "h-4 w-4 text-green-500" }) : /* @__PURE__ */ jsx8(IconCopy, { className: "h-4 w-4" })
              }
            ),
            (invitation.status === "pending" || invitation.status === "expired") && /* @__PURE__ */ jsx8(
              Button8,
              {
                variant: "ghost",
                size: "icon",
                className: "h-8 w-8 text-destructive",
                onClick: () => {
                  setInvitationToRevoke(invitation);
                  setRevokeDialogOpen(true);
                },
                children: /* @__PURE__ */ jsx8(IconTrash5, { className: "h-4 w-4" })
              }
            )
          ] }) })
        ] }, invitation.id)) })
      ] }) }) })
    ] }),
    /* @__PURE__ */ jsx8(AlertDialog5, { open: revokeDialogOpen, onOpenChange: setRevokeDialogOpen, children: /* @__PURE__ */ jsxs8(AlertDialogContent5, { children: [
      /* @__PURE__ */ jsxs8(AlertDialogHeader5, { children: [
        /* @__PURE__ */ jsx8(AlertDialogTitle5, { children: "Confirmer la r\xE9vocation" }),
        /* @__PURE__ */ jsx8(AlertDialogDescription5, { children: "\xCAtes-vous s\xFBr de vouloir r\xE9voquer cette invitation ? Le contact ne pourra plus utiliser ce lien pour cr\xE9er un compte." })
      ] }),
      /* @__PURE__ */ jsxs8(AlertDialogFooter5, { children: [
        /* @__PURE__ */ jsx8(AlertDialogCancel5, { children: "Annuler" }),
        /* @__PURE__ */ jsx8(AlertDialogAction5, { onClick: handleRevoke, className: "bg-destructive hover:bg-destructive/90", children: "R\xE9voquer" })
      ] })
    ] }) })
  ] });
}

// ../modules/third_parties/frontend/pages/AcceptInvitation.tsx
import { useState as useState9 } from "react";
import { useRouter as useRouter9 } from "next/navigation";
import { Button as Button9 } from "@/components/ui/button";
import { Input as Input6 } from "@/components/ui/input";
import { Label as Label4 } from "@/components/ui/label";
import {
  IconShieldLock,
  IconCheck as IconCheck2,
  IconAlertCircle
} from "@tabler/icons-react";
import { Card as Card9, CardContent as CardContent9, CardDescription as CardDescription4, CardHeader as CardHeader9, CardTitle as CardTitle9 } from "@/components/ui/card";
import {
  Select as Select7,
  SelectContent as SelectContent7,
  SelectItem as SelectItem7,
  SelectTrigger as SelectTrigger7,
  SelectValue as SelectValue7
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast as useToast9 } from "@/hooks/use-toast";
import { jsx as jsx9, jsxs as jsxs9 } from "react/jsx-runtime";
function AcceptInvitation({ token }) {
  const router = useRouter9();
  const { toast } = useToast9();
  const [step, setStep] = useState9("password");
  const [password, setPassword] = useState9("");
  const [passwordConfirm, setPasswordConfirm] = useState9("");
  const [twoFactorMethod, setTwoFactorMethod] = useState9("email");
  const [twoFactorCode, setTwoFactorCode] = useState9("");
  const [isLoading, setIsLoading] = useState9(false);
  const [error, setError] = useState9(null);
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
  return /* @__PURE__ */ jsx9("div", { className: "min-h-screen flex items-center justify-center bg-muted/20 p-4", children: /* @__PURE__ */ jsxs9(Card9, { className: "w-full max-w-md", children: [
    /* @__PURE__ */ jsxs9(CardHeader9, { className: "space-y-1", children: [
      /* @__PURE__ */ jsxs9("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsx9(IconShieldLock, { className: "h-6 w-6" }),
        /* @__PURE__ */ jsx9(CardTitle9, { className: "text-2xl", children: step === "password" ? "Accepter l'invitation" : "V\xE9rification 2FA" })
      ] }),
      /* @__PURE__ */ jsx9(CardDescription4, { children: step === "password" ? "Cr\xE9ez votre mot de passe pour acc\xE9der \xE0 la plateforme" : "Entrez le code de v\xE9rification envoy\xE9 par email" })
    ] }),
    /* @__PURE__ */ jsxs9(CardContent9, { children: [
      error && /* @__PURE__ */ jsxs9(Alert, { variant: "destructive", className: "mb-4", children: [
        /* @__PURE__ */ jsx9(IconAlertCircle, { className: "h-4 w-4" }),
        /* @__PURE__ */ jsx9(AlertDescription, { children: error })
      ] }),
      step === "password" ? /* @__PURE__ */ jsxs9("form", { onSubmit: handleAccept, className: "space-y-4", children: [
        /* @__PURE__ */ jsxs9("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxs9(Label4, { htmlFor: "password", children: [
            "Mot de passe ",
            /* @__PURE__ */ jsx9("span", { className: "text-destructive", children: "*" })
          ] }),
          /* @__PURE__ */ jsx9(
            Input6,
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
          /* @__PURE__ */ jsx9("p", { className: "text-xs text-muted-foreground", children: "Le mot de passe doit contenir au moins 8 caract\xE8res" })
        ] }),
        /* @__PURE__ */ jsxs9("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxs9(Label4, { htmlFor: "passwordConfirm", children: [
            "Confirmer le mot de passe ",
            /* @__PURE__ */ jsx9("span", { className: "text-destructive", children: "*" })
          ] }),
          /* @__PURE__ */ jsx9(
            Input6,
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
        /* @__PURE__ */ jsxs9("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx9(Label4, { htmlFor: "twoFactorMethod", children: "M\xE9thode de v\xE9rification 2FA" }),
          /* @__PURE__ */ jsxs9(Select7, { value: twoFactorMethod, onValueChange: setTwoFactorMethod, children: [
            /* @__PURE__ */ jsx9(SelectTrigger7, { children: /* @__PURE__ */ jsx9(SelectValue7, {}) }),
            /* @__PURE__ */ jsxs9(SelectContent7, { children: [
              /* @__PURE__ */ jsx9(SelectItem7, { value: "email", children: "Email" }),
              /* @__PURE__ */ jsx9(SelectItem7, { value: "app", children: "Application d'authentification" })
            ] })
          ] }),
          /* @__PURE__ */ jsx9("p", { className: "text-xs text-muted-foreground", children: "Un code de v\xE9rification vous sera envoy\xE9" })
        ] }),
        /* @__PURE__ */ jsx9(Button9, { type: "submit", className: "w-full", disabled: isLoading, children: isLoading ? "Traitement..." : "Accepter l'invitation" })
      ] }) : /* @__PURE__ */ jsxs9("form", { onSubmit: handleVerify2FA, className: "space-y-4", children: [
        /* @__PURE__ */ jsxs9(Alert, { children: [
          /* @__PURE__ */ jsx9(IconCheck2, { className: "h-4 w-4" }),
          /* @__PURE__ */ jsx9(AlertDescription, { children: "Un code de v\xE9rification a \xE9t\xE9 envoy\xE9 \xE0 votre adresse email." })
        ] }),
        /* @__PURE__ */ jsxs9("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsxs9(Label4, { htmlFor: "twoFactorCode", children: [
            "Code de v\xE9rification ",
            /* @__PURE__ */ jsx9("span", { className: "text-destructive", children: "*" })
          ] }),
          /* @__PURE__ */ jsx9(
            Input6,
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
          /* @__PURE__ */ jsx9("p", { className: "text-xs text-muted-foreground", children: "Entrez le code \xE0 6 chiffres re\xE7u par email" })
        ] }),
        /* @__PURE__ */ jsxs9("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx9(Button9, { type: "submit", className: "w-full", disabled: isLoading, children: isLoading ? "V\xE9rification..." : "V\xE9rifier et cr\xE9er mon compte" }),
          /* @__PURE__ */ jsx9(
            Button9,
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

// ../modules/third_parties/frontend/module.config.ts
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
export {
  module_config_default as default
};
