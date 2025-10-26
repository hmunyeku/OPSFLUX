/**
 * Configuration frontend pour le module Third Parties
 */

import type { Module } from "@/lib/types/module"

// Import des pages
import CompaniesList from "./pages/Companies/List"
import CompaniesDetails from "./pages/Companies/Details"
import CompaniesCreate from "./pages/Companies/Create"
import CompaniesEdit from "./pages/Companies/Edit"
import ContactsList from "./pages/Contacts/List"
import ContactsDetails from "./pages/Contacts/Details"
import ContactsCreate from "./pages/Contacts/Create"
import InvitationsList from "./pages/Invitations/List"
import AcceptInvitation from "./pages/AcceptInvitation"

const module: Module = {
  config: {
    code: "third_parties",
    name: "Third Parties",
    version: "1.0.0",
    description: "Gestion des tiers (entreprises, contacts, invitations)",
  },

  // Pages du module
  // IMPORTANT: Routes plus spécifiques (ex: /new) doivent venir AVANT les routes paramétrées (ex: /:id)
  pages: [
    {
      path: "/third-parties/companies",
      component: CompaniesList,
    },
    {
      path: "/third-parties/companies/new",
      component: CompaniesCreate,
    },
    {
      path: "/third-parties/companies/:id/edit",
      component: CompaniesEdit,
    },
    {
      path: "/third-parties/companies/:id",
      component: CompaniesDetails,
    },
    {
      path: "/third-parties/contacts",
      component: ContactsList,
    },
    {
      path: "/third-parties/contacts/new",
      component: ContactsCreate,
    },
    {
      path: "/third-parties/contacts/:id",
      component: ContactsDetails,
    },
    {
      path: "/third-parties/invitations",
      component: InvitationsList,
    },
    {
      path: "/third-parties/invitations/accept/:token",
      component: AcceptInvitation,
    },
  ],

  // Widgets du module
  widgets: [],
}

export default module
