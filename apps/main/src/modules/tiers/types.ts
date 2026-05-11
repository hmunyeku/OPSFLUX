export interface Tiers {
  id: string
  name: string
  type: 'client' | 'subcontractor' | 'partner' | 'supplier'
  status: 'active' | 'pending' | 'draft' | 'archived'
  siret?: string
  vatNumber?: string
  address?: string
  website?: string
  caAnnual?: number       // EUR
  caDelta?: number        // % vs N-1
  activeProjects?: number
  outstandingInvoices?: number  // EUR
  lateInvoices?: number
  createdAt: string       // ISO
  primaryContact?: {
    name: string; role: string; email: string; phone: string
  }
  projects?: Array<{
    id: string; ref: string; subject: string; hours: number
    status: 'active' | 'paused' | 'closed'; statusLabel: string
  }>
  activity?: Array<{ at: string; label: string }>
}
