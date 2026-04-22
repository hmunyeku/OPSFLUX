import { useTranslation } from 'react-i18next'
import { useToast } from '@/components/ui/Toast'
import { useUIStore } from '@/stores/uiStore'
import { useAds, useAdsPax, useAdsEvents, useAdsExternalLinks, useStayPrograms, useAdsImputationSuggestion, useSubmitAds, useCancelAds, useStartAdsProgress, useApproveAds, useDecideAdsPax, useRejectAds, useRequestAdsStayChange, useRequestReviewAds, useResubmitAds, useCompleteAds, useManualDepartureAds, useAdsPdf, useCreateExternalLink, useCreateStayProgram, useSubmitStayProgram, useApproveStayProgram, useUpdateAds, useAddPaxToAdsV2, useRemovePaxFromAds, usePaxCandidates } from '@/hooks/usePaxlog'
import { usePermission } from '@/hooks/usePermission'
import { useAuthStore } from '@/stores/authStore'
import { useAssetTree } from '@/hooks/useAssets'
import { useDictionaryLabels } from '@/hooks/useDictionary'
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useDebounce } from '@/hooks/useDebounce'
import type { AssetTreeNode } from '@/types/api'
import type { AdsStayChangeRequest, StayProgramCreate, PaxCandidate, AdsPax } from '@/services/paxlogService'
import { paxlogService } from '@/services/paxlogService'
import { cn } from '@/lib/utils'
import { CollapsibleSection } from '@/components/shared/CollapsibleSection'
import { ReadOnlyRow, DynamicPanelShell, DynamicPanelField, FormGrid, PanelActionButton, DangerConfirmButton, DetailFieldGrid, panelInputClass } from '@/components/layout/DynamicPanel'
import { CheckCircle2, XCircle, RefreshCw, ClipboardList, Loader2, Link2, Download, ThumbsUp, ThumbsDown, Send, LogOut, Clock, Plus, Search, X, Trash2, Flag, Info, Users, BedDouble, BookOpen } from 'lucide-react'
import { TabBar } from '@/components/ui/Tabs'
import { Tooltip } from '@/components/ui/Tooltip'
import { CrossModuleLink } from '@/components/shared/CrossModuleLink'
import { ImputationManager } from '@/components/shared/ImputationManager'
import { AdsExternalLinksAudit } from '@/pages/paxlog/components/AdsExternalLinksAudit'
import { TagManager } from '@/components/shared/TagManager'
import { AttachmentManager } from '@/components/shared/AttachmentManager'
import { NoteManager } from '@/components/shared/NoteManager'
import { ADS_STATUS_LABELS_FALLBACK, ADS_STATUS_BADGES, formatDate, formatDateTime, StatusBadge, AllowedCompaniesPicker, buildExternalRecipientOptions } from '../shared'
import type { AllowedCompanySelection } from '../shared'

export function AdsDetailPanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const openDynamicPanel = useUIStore((s) => s.openDynamicPanel)
  const { data: ads, isLoading, isError, error } = useAds(id)
  const { data: adsPax } = useAdsPax(id)
  const { data: adsEvents } = useAdsEvents(id)
  const { data: externalLinks = [] } = useAdsExternalLinks(id)
  const { data: stayPrograms = [] } = useStayPrograms({ ads_id: id })
  const { data: imputationSuggestion } = useAdsImputationSuggestion(id)
  const submitAds = useSubmitAds()
  const cancelAds = useCancelAds()
  const startAdsProgress = useStartAdsProgress()
  const approveAds = useApproveAds()
  const decideAdsPax = useDecideAdsPax()
  const rejectAds = useRejectAds()
  const requestAdsStayChange = useRequestAdsStayChange()
  const requestReviewAds = useRequestReviewAds()
  const resubmitAds = useResubmitAds()
  const completeAds = useCompleteAds()
  const manualDepartureAds = useManualDepartureAds()
  const downloadPdf = useAdsPdf()
  const createExtLink = useCreateExternalLink()
  const createStayProgram = useCreateStayProgram()
  const submitStayProgram = useSubmitStayProgram()
  const approveStayProgram = useApproveStayProgram()
  const updateAds = useUpdateAds()
  const addPaxV2 = useAddPaxToAdsV2()
  const removePax = useRemovePaxFromAds()
  const { hasPermission } = usePermission()
  const currentUser = useAuthStore((s) => s.user)
  const { data: assetTree = [] } = useAssetTree()
  const visitCategoryLabels = useDictionaryLabels('visit_category')
  const transportModeLabels = useDictionaryLabels('transport_mode')
  const adsStatusLabels = useDictionaryLabels('pax_ads_status', ADS_STATUS_LABELS_FALLBACK)

  // Aligns AdsDetailPanel with the standard Voyage/Vector/Rotation
  // detail-panel pattern: a TabBar segments the heavy content (9+
  // CollapsibleSections in the old single-scroll layout) into 4
  // logical pages. Default tab keeps the core read at hand.
  type AdsDetailTab = 'informations' | 'passagers' | 'sejours' | 'historique'
  const [detailTab, setDetailTab] = useState<AdsDetailTab>('informations')
  const [rejectReason, setRejectReason] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [reviewReason, setReviewReason] = useState('')
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [resubmitReason, setResubmitReason] = useState('')
  const [showResubmitForm, setShowResubmitForm] = useState(false)
  const [stayChangeReason, setStayChangeReason] = useState('')
  const [showStayChangeForm, setShowStayChangeForm] = useState(false)
  const [showExternalLinkForm, setShowExternalLinkForm] = useState(false)
  const [externalLinkRecipientKey, setExternalLinkRecipientKey] = useState('')
  const [manualDepartureReason, setManualDepartureReason] = useState('')
  const [showManualDepartureForm, setShowManualDepartureForm] = useState(false)
  const [proposedStartDate, setProposedStartDate] = useState('')
  const [proposedEndDate, setProposedEndDate] = useState('')
  const [proposedVisitPurpose, setProposedVisitPurpose] = useState('')
  const [paxSearch, setPaxSearch] = useState('')
  const [showPaxPicker, setShowPaxPicker] = useState(false)
  const [showStayProgramForm, setShowStayProgramForm] = useState(false)
  const [allowedCompanySearch, setAllowedCompanySearch] = useState('')
  const [allowedCompaniesDraft, setAllowedCompaniesDraft] = useState<AllowedCompanySelection[]>([])
  const [paxRejectEntryId, setPaxRejectEntryId] = useState<string | null>(null)
  const [paxRejectReason, setPaxRejectReason] = useState('')
  const [stayProgramTarget, setStayProgramTarget] = useState<{ user_id?: string | null; contact_id?: string | null }>({})
  const [stayMovements, setStayMovements] = useState<Array<{ effective_date: string; from_location: string; to_location: string; transport_mode: string; notes: string }>>([
    { effective_date: '', from_location: '', to_location: '', transport_mode: '', notes: '' },
  ])
  const debouncedPaxSearch = useDebounce(paxSearch, 300)
  const { data: paxCandidates } = usePaxCandidates(debouncedPaxSearch, id)

  // Resolve asset name from tree
  const resolveAssetName = useCallback((assetId: string | null | undefined): string | null => {
    if (!assetId || assetTree.length === 0) return null
    const find = (nodes: AssetTreeNode[]): AssetTreeNode | null => {
      for (const n of nodes) {
        if (n.id === assetId) return n
        const found = find(n.children)
        if (found) return found
      }
      return null
    }
    const asset = find(assetTree)
    return asset ? `${asset.name} (${asset.code})` : null
  }, [assetTree])

  useEffect(() => {
    if (!ads) return
    setProposedStartDate(ads.start_date)
    setProposedEndDate(ads.end_date)
    setProposedVisitPurpose(ads.visit_purpose)
    setAllowedCompaniesDraft((ads.allowed_company_ids ?? []).map((companyId, index) => ({
      id: companyId,
      name: ads.allowed_company_names?.[index] || companyId,
    })))
  }, [ads])

  const eligibleExternalRecipients = useMemo(
    () => buildExternalRecipientOptions(adsPax, t('common.unknown')),
    [adsPax, t],
  )

  const selectedExternalRecipient = useMemo(
    () => eligibleExternalRecipients.find((entry) => entry.key === externalLinkRecipientKey) || null,
    [eligibleExternalRecipients, externalLinkRecipientKey],
  )

  useEffect(() => {
    if (eligibleExternalRecipients.length === 1) {
      setExternalLinkRecipientKey(eligibleExternalRecipients[0].key)
      return
    }
    if (!eligibleExternalRecipients.some((entry) => entry.key === externalLinkRecipientKey)) {
      setExternalLinkRecipientKey(eligibleExternalRecipients[0]?.key || '')
    }
  }, [eligibleExternalRecipients, externalLinkRecipientKey])

  if (isLoading) {
    return (
      <DynamicPanelShell title={t('common.loading')} icon={<ClipboardList size={14} className="text-primary" />}>
        <div className="flex items-center justify-center py-16"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
      </DynamicPanelShell>
    )
  }

  if (isError || !ads) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : t('common.error')
    return (
      <DynamicPanelShell title={t('paxlog.ads_detail.not_found_title')} icon={<ClipboardList size={14} className="text-primary" />}>
        <div className="py-10 px-4 space-y-2">
          <p className="text-sm font-medium text-foreground">{t('paxlog.ads_detail.not_found_message')}</p>
          <p className="text-xs text-muted-foreground">{message}</p>
        </div>
      </DynamicPanelShell>
    )
  }

  const compliantPaxCount = (adsPax ?? []).filter((entry) => entry.compliant === true).length
  const nonCompliantPaxCount = (adsPax ?? []).filter((entry) => entry.compliant === false).length
  const approvedProjectIds = new Set(
    (adsEvents ?? [])
      .filter((event) => event.event_type === 'project_review_approved')
      .flatMap((event) => {
        const metadata = (event.metadata_json ?? {}) as { project_id?: string; project_ids?: string[] }
        return metadata.project_ids?.length ? metadata.project_ids : metadata.project_id ? [metadata.project_id] : []
      }),
  )
  const linkedProjects = ads.linked_projects ?? []
  const pendingProjectReviews = linkedProjects.filter((project) => !approvedProjectIds.has(project.project_id))
  const approvedProjectReviews = linkedProjects.filter((project) => approvedProjectIds.has(project.project_id))
  const isProjectReviewer = pendingProjectReviews.some((project) => project.project_manager_id === currentUser?.id)
  const isInitiatorReviewer = ads.status === 'pending_initiator_review' && ads.requester_id === currentUser?.id
  const canSubmit = ['draft', 'requires_review'].includes(ads.status) && hasPermission('paxlog.ads.submit')
  const canCancel = !['cancelled', 'completed', 'rejected'].includes(ads.status) && hasPermission('paxlog.ads.cancel')
  const canApprove = (
    (['submitted', 'pending_validation'].includes(ads.status) && hasPermission('paxlog.ads.approve'))
    || (ads.status === 'pending_initiator_review' && (isInitiatorReviewer || hasPermission('paxlog.ads.approve')))
    || (ads.status === 'pending_project_review' && (isProjectReviewer || hasPermission('paxlog.ads.approve')))
  )
  const canReject = (
    (['submitted', 'pending_validation'].includes(ads.status) && hasPermission('paxlog.ads.approve'))
    || (ads.status === 'pending_initiator_review' && (isInitiatorReviewer || hasPermission('paxlog.ads.approve')))
    || (ads.status === 'pending_project_review' && (isProjectReviewer || hasPermission('paxlog.ads.approve')))
  )
  const canRequestReview = ['submitted', 'pending_compliance', 'pending_validation', 'approved', 'in_progress'].includes(ads.status) && hasPermission('paxlog.ads.approve')
  const canRequestStayChange =
    ['submitted', 'pending_compliance', 'pending_validation', 'approved', 'in_progress'].includes(ads.status)
    && hasPermission('paxlog.ads.update')
    && (ads.requester_id === currentUser?.id || hasPermission('paxlog.ads.approve'))
  const canResubmit = ads.status === 'requires_review' && hasPermission('paxlog.ads.submit')
  const canStartProgress = ads.status === 'approved' && hasPermission('paxlog.ads.approve')
  const canCompleteAds = ads.status === 'in_progress' && hasPermission('paxlog.ads.approve')
  const canDownloadPdf = ['approved', 'in_progress', 'completed'].includes(ads.status)
  const canGenerateLink = ['draft', 'requires_review', 'approved', 'in_progress'].includes(ads.status)
  const hasAllowedCompaniesForExternalLink = (allowedCompaniesDraft?.length ?? 0) > 0
  const stayProgramsEnabled = ['draft', 'requires_review', 'approved', 'in_progress'].includes(ads.status)
  const canManageStayPrograms = stayProgramsEnabled && hasPermission('paxlog.stay.create')
  const canApproveStayPrograms = stayProgramsEnabled && hasPermission('paxlog.stay.approve')
  const canEditAllowedCompanies = ['draft', 'requires_review'].includes(ads.status) && hasPermission('paxlog.ads.update')
  const adsSubmissionChecklist = [
    { label: t('paxlog.ads_detail.checklist.destination'), done: !!ads.site_entry_asset_id },
    { label: t('paxlog.ads_detail.checklist.category'), done: !!ads.visit_category },
    { label: t('paxlog.ads_detail.checklist.dates'), done: !!ads.start_date && !!ads.end_date },
    { label: t('paxlog.ads_detail.checklist.purpose'), done: !!ads.visit_purpose },
    { label: t('paxlog.ads_detail.checklist.passenger'), done: (adsPax?.length ?? 0) > 0 },
  ]
  const formatEventValue = (value: unknown) => {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (value === null || value === undefined) return '—'
    return JSON.stringify(value)
  }
  const getAvmChangeFieldLabel = (field: string) => {
    const fieldLabels: Record<string, string> = {
      title: t('common.title'),
      description: t('common.description'),
      planned_start_date: t('paxlog.create_avm.window.start'),
      planned_end_date: t('paxlog.create_avm.window.end'),
      mission_type: t('paxlog.mission_type'),
      pax_quota: t('paxlog.avm_detail.fields.planned_pax'),
      requires_badge: t('paxlog.requires_badge'),
      requires_epi: t('paxlog.requires_epi'),
      requires_visa: t('paxlog.requires_visa'),
      eligible_displacement_allowance: t('paxlog.displacement_allowance'),
    }
    return fieldLabels[field] || field
  }
  const adsTimeline = (adsEvents ?? []).slice(0, 8)
  const latestOperationalImpact = (adsEvents ?? []).find((event) => ['avm_modified_requires_review', 'avm_cancelled', 'planner_activity_modified_requires_review', 'planner_activity_cancelled', 'stay_change_requested'].includes(event.event_type))
  const getAdsEventLabel = (eventType: string) => {
    const eventLabels: Record<string, string> = {
      stay_change_requested: t('paxlog.ads_detail.history.events.stay_change_requested'),
      submitted_for_initiator_review: t('paxlog.ads_detail.history.events.submitted_for_initiator_review'),
      initiator_review_approved: t('paxlog.ads_detail.history.events.initiator_review_approved'),
      initiator_review_rejected: t('paxlog.ads_detail.history.events.initiator_review_rejected'),
      submitted_for_project_review: t('paxlog.ads_detail.history.events.submitted_for_project_review'),
      project_review_approved: t('paxlog.ads_detail.history.events.project_review_approved'),
      avm_modified_requires_review: t('paxlog.ads_detail.history.events.avm_modified_requires_review'),
      avm_cancelled: t('paxlog.ads_detail.history.events.avm_cancelled'),
      planner_activity_modified_requires_review: t('paxlog.ads_detail.history.events.planner_activity_modified_requires_review'),
      planner_activity_cancelled: t('paxlog.ads_detail.history.events.planner_activity_cancelled'),
      submitted: t('paxlog.ads_detail.history.events.submitted'),
      approved: t('paxlog.ads_detail.history.events.approved'),
      in_progress: t('paxlog.ads_detail.history.events.in_progress'),
      completed: t('paxlog.ads_detail.history.events.completed'),
      rejected: t('paxlog.ads_detail.history.events.rejected'),
      requires_review: t('paxlog.ads_detail.history.events.requires_review'),
      cancelled: t('paxlog.ads_detail.history.events.cancelled'),
      resubmitted: t('paxlog.ads_detail.history.events.resubmitted'),
      updated: t('paxlog.ads_detail.history.events.updated'),
      overdue_return_alert: t('paxlog.ads_detail.history.events.overdue_return_alert'),
    }
    return eventLabels[eventType] || eventType
  }
  const latestOperationalImpactMeta = latestOperationalImpact?.metadata_json as {
    changes?: Record<string, { from?: unknown; to?: unknown; before?: unknown; after?: unknown }>
    avm_id?: string
    avm_reference?: string
    planner_activity_id?: string
    planner_activity_title?: string
    change_kinds?: string[]
    primary_change_kind?: string
  } | null
  const adsReadyToSubmit = adsSubmissionChecklist.every((item) => item.done)
  const adsNextAction =
    ads.status === 'draft'
      ? (adsReadyToSubmit
        ? t('paxlog.ads_detail.next_action.draft_ready')
        : t('paxlog.ads_detail.next_action.draft_missing'))
      : ads.status === 'submitted'
        ? t('paxlog.ads_detail.next_action.submitted')
        : ads.status === 'pending_initiator_review'
          ? t('paxlog.ads_detail.next_action.pending_initiator_review')
        : ads.status === 'pending_compliance'
          ? t('paxlog.ads_detail.next_action.pending_compliance')
          : ads.status === 'pending_validation'
            ? t('paxlog.ads_detail.next_action.pending_validation')
            : ads.status === 'pending_project_review'
              ? t('paxlog.ads_detail.next_action.pending_project_review', { count: pendingProjectReviews.length || 1 })
            : ads.status === 'requires_review'
              ? t('paxlog.ads_detail.next_action.requires_review')
            : ads.status === 'approved'
              ? t('paxlog.ads_detail.next_action.approved')
              : ads.status === 'in_progress'
                ? t('paxlog.ads_detail.next_action.in_progress')
                : ads.status === 'completed'
                  ? t('paxlog.ads_detail.next_action.completed')
                  : ads.status === 'rejected'
                    ? t('paxlog.ads_detail.next_action.rejected')
                    : t('paxlog.ads_detail.next_action.cancelled')
  const latestOperationalImpactChanges = latestOperationalImpactMeta?.changes
  const getExternalLinkEventLabel = (action: string) => {
    const labels: Record<string, string> = {
      public_access: t('paxlog.ads_detail.external_link.events.public_access'),
      authenticated_access: t('paxlog.ads_detail.external_link.events.authenticated_access'),
      otp_sent: t('paxlog.ads_detail.external_link.events.otp_sent'),
      otp_failed: t('paxlog.ads_detail.external_link.events.otp_failed'),
      otp_validated: t('paxlog.ads_detail.external_link.events.otp_validated'),
      otp_rate_limited: t('paxlog.ads_detail.external_link.events.otp_rate_limited'),
      otp_verify_rate_limited: t('paxlog.ads_detail.external_link.events.otp_verify_rate_limited'),
      otp_locked: t('paxlog.ads_detail.external_link.events.otp_locked'),
      session_invalid: t('paxlog.ads_detail.external_link.events.session_invalid'),
      session_expired: t('paxlog.ads_detail.external_link.events.session_expired'),
      session_context_mismatch: t('paxlog.ads_detail.external_link.events.session_context_mismatch'),
      session_ip_changed: t('paxlog.ads_detail.external_link.events.session_ip_changed'),
      public_access_rate_limited: t('paxlog.ads_detail.external_link.events.public_access_rate_limited'),
    }
    return labels[action] || action
  }
  const latestStayChangeKinds = latestOperationalImpactMeta?.change_kinds ?? (
    latestOperationalImpactMeta?.primary_change_kind ? [latestOperationalImpactMeta.primary_change_kind] : []
  )
  const getStayChangeKindLabel = (kind: string) => {
    const labels: Record<string, string> = {
      extension: t('paxlog.ads_detail.operational_impact.stay_change_kinds.extension'),
      early_return: t('paxlog.ads_detail.operational_impact.stay_change_kinds.early_return'),
      transport_change: t('paxlog.ads_detail.operational_impact.stay_change_kinds.transport_change'),
      window_change: t('paxlog.ads_detail.operational_impact.stay_change_kinds.window_change'),
      stay_change: t('paxlog.ads_detail.operational_impact.stay_change_kinds.stay_change'),
    }
    return labels[kind] || kind
  }

  const handleReject = () => {
    rejectAds.mutate({ id, reason: rejectReason || undefined })
    setShowRejectForm(false)
    setRejectReason('')
  }

  const handleRequestReview = () => {
    if (!reviewReason.trim()) return
    requestReviewAds.mutate(
      { id, reason: reviewReason.trim() },
      {
        onSuccess: () => {
          setShowReviewForm(false)
          setReviewReason('')
        },
      },
    )
  }

  const handleResubmit = () => {
    if (!resubmitReason.trim()) return
    resubmitAds.mutate(
      { id, reason: resubmitReason.trim() },
      {
        onSuccess: () => {
          setShowResubmitForm(false)
          setResubmitReason('')
        },
      },
    )
  }

  const handleRequestStayChange = () => {
    if (!stayChangeReason.trim()) return
    const payload: AdsStayChangeRequest = { reason: stayChangeReason.trim() }
    if (proposedStartDate && proposedStartDate !== ads.start_date) payload.start_date = proposedStartDate
    if (proposedEndDate && proposedEndDate !== ads.end_date) payload.end_date = proposedEndDate
    if (proposedVisitPurpose.trim() && proposedVisitPurpose.trim() !== ads.visit_purpose) payload.visit_purpose = proposedVisitPurpose.trim()

    requestAdsStayChange.mutate(
      { id, payload },
      {
        onSuccess: () => {
          setShowStayChangeForm(false)
          setStayChangeReason('')
        },
      },
    )
  }

  const handleManualDeparture = () => {
    if (!manualDepartureReason.trim()) return
    manualDepartureAds.mutate(
      { id, reason: manualDepartureReason.trim() },
      {
        onSuccess: () => {
          setShowManualDepartureForm(false)
          setManualDepartureReason('')
        },
      },
    )
  }

  const handleGenerateLink = (recipient?: { user_id: string | null; contact_id: string | null }) => {
    if (!hasAllowedCompaniesForExternalLink) {
      toast({
        title: "Ajoutez au moins une entreprise autorisée avant de générer un lien externe.",
        variant: 'error',
      })
      return
    }
    if (!recipient?.user_id && !recipient?.contact_id) {
      toast({
        title: t('paxlog.ads_detail.external_link.no_recipient'),
        variant: 'error',
      })
      return
    }
    const popup = window.open('', '_blank')
    if (popup) {
      popup.document.write(`<html><body style="font-family: sans-serif; padding: 16px;">${t('common.loading')}</body></html>`)
      popup.document.close()
    }
    createExtLink.mutate(
      {
        adsId: id,
        payload: {
          expires_hours: 72,
          max_uses: 5,
          otp_required: true,
          recipient_user_id: recipient.user_id,
          recipient_contact_id: recipient.contact_id,
        },
      },
      {
        onSuccess: (link) => {
          setShowExternalLinkForm(false)
          const url = paxlogService.resolveExternalLinkUrl(link)
          if (popup) popup.location.href = url
          else window.open(url, '_blank')
        },
        onError: () => {
          if (popup && !popup.closed) popup.close()
        },
      },
    )
  }

  const openExternalLinkFlow = () => {
    if (!hasAllowedCompaniesForExternalLink) {
      toast({
        title: "Ajoutez au moins une entreprise autorisée dans l'AdS avant de générer un lien externe.",
        variant: 'error',
      })
      return
    }
    if (eligibleExternalRecipients.length === 0) {
      toast({
        title: t('paxlog.ads_detail.external_link.no_recipient'),
        variant: 'error',
      })
      return
    }
    if (eligibleExternalRecipients.length === 1) {
      handleGenerateLink(eligibleExternalRecipients[0])
      return
    }
    setShowExternalLinkForm(true)
  }

  const handleApprovePassenger = (entryId: string) => {
    decideAdsPax.mutate({ adsId: id, entryId, payload: { action: 'approve' } })
  }

  const handleRejectPassenger = () => {
    if (!paxRejectEntryId) return
    decideAdsPax.mutate(
      {
        adsId: id,
        entryId: paxRejectEntryId,
        payload: { action: 'reject', reason: paxRejectReason.trim() || null },
      },
      {
        onSuccess: () => {
          setPaxRejectEntryId(null)
          setPaxRejectReason('')
        },
      },
    )
  }

  const addStayMovement = () => {
    setStayMovements((prev) => [...prev, { effective_date: '', from_location: '', to_location: '', transport_mode: '', notes: '' }])
  }

  const updateStayMovement = (index: number, patch: Partial<(typeof stayMovements)[number]>) => {
    setStayMovements((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const removeStayMovement = (index: number) => {
    setStayMovements((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const handleCreateStayProgram = () => {
    const movements = stayMovements
      .filter((row) => row.effective_date || row.from_location || row.to_location || row.transport_mode || row.notes)
      .map((row) => ({
        effective_date: row.effective_date || null,
        from_location: row.from_location || null,
        to_location: row.to_location || null,
        transport_mode: row.transport_mode || null,
        notes: row.notes || null,
      }))
    if ((!stayProgramTarget.user_id && !stayProgramTarget.contact_id) || movements.length === 0) return
    const payload: StayProgramCreate = {
      ads_id: id,
      user_id: stayProgramTarget.user_id || null,
      contact_id: stayProgramTarget.contact_id || null,
      movements,
    }
    createStayProgram.mutate(payload, {
      onSuccess: () => {
        setShowStayProgramForm(false)
        setStayProgramTarget({})
        setStayMovements([{ effective_date: '', from_location: '', to_location: '', transport_mode: '', notes: '' }])
      },
    })
  }

  return (
    <DynamicPanelShell
      title={ads.reference}
      subtitle={`${t('paxlog.ads_label')} — ${visitCategoryLabels[ads.visit_category] || ads.visit_category}`}
      icon={<ClipboardList size={14} className="text-primary" />}
      actions={
        <div className="flex items-center gap-1">
          {canGenerateLink && (
            <>
              {hasAllowedCompaniesForExternalLink ? (
                <PanelActionButton variant="default" disabled={createExtLink.isPending} onClick={openExternalLinkFlow}>
                  {createExtLink.isPending ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />} {t('paxlog.ads_detail.actions.external_link')}
                </PanelActionButton>
              ) : (
                <Tooltip content={t('paxlog.ads_detail.external_link.no_allowed_companies')}>
                  <span className="inline-flex">
                    <PanelActionButton variant="default" disabled onClick={openExternalLinkFlow}>
                      <Link2 size={12} /> {t('paxlog.ads_detail.actions.external_link')}
                    </PanelActionButton>
                  </span>
                </Tooltip>
              )}
            </>
          )}
          {canDownloadPdf && (
            <PanelActionButton variant="default" disabled={downloadPdf.isPending} onClick={() => downloadPdf.mutate(id)}>
              {downloadPdf.isPending ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} PDF
            </PanelActionButton>
          )}
          {canApprove && (
            <PanelActionButton variant="primary" disabled={approveAds.isPending} onClick={() => approveAds.mutate(id)}>
              <ThumbsUp size={12} /> {t('common.validate')}
            </PanelActionButton>
          )}
          {canStartProgress && (
            <PanelActionButton variant="primary" disabled={startAdsProgress.isPending} onClick={() => startAdsProgress.mutate(id)}>
              {startAdsProgress.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} {t('paxlog.ads_detail.actions.start_progress')}
            </PanelActionButton>
          )}
          {canCompleteAds && (
            <PanelActionButton variant="default" onClick={() => setShowManualDepartureForm(true)}>
              <LogOut size={12} /> {t('paxlog.ads_detail.actions.manual_departure')}
            </PanelActionButton>
          )}
          {canCompleteAds && (
            <PanelActionButton variant="primary" disabled={completeAds.isPending} onClick={() => completeAds.mutate(id)}>
              {completeAds.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} {t('paxlog.ads_detail.actions.complete')}
            </PanelActionButton>
          )}
          {canReject && !showRejectForm && (
            <PanelActionButton variant="default" onClick={() => setShowRejectForm(true)}>
              <ThumbsDown size={12} /> {t('common.reject')}
            </PanelActionButton>
          )}
          {canRequestReview && !showReviewForm && (
            <PanelActionButton variant="default" onClick={() => setShowReviewForm(true)}>
              <RefreshCw size={12} /> {t('paxlog.ads_detail.actions.request_review')}
            </PanelActionButton>
          )}
          {canRequestStayChange && !showStayChangeForm && (
            <PanelActionButton variant="default" onClick={() => setShowStayChangeForm(true)}>
              <Clock size={12} /> {t('paxlog.ads_detail.actions.request_stay_change')}
            </PanelActionButton>
          )}
          {canSubmit && (
            <PanelActionButton variant="primary" disabled={submitAds.isPending} onClick={() => submitAds.mutate(id, {
              onSuccess: () => toast({ title: t('paxlog.ads_detail.toasts.submitted'), variant: 'success' }),
              onError: (err: unknown) => {
                const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
                toast({ title: t('common.error'), description: detail || t('paxlog.ads_detail.toasts.submit_error'), variant: 'error' })
              },
            })}>
              <Send size={12} /> {t('common.submit')}
            </PanelActionButton>
          )}
          {canResubmit && !showResubmitForm && (
            <PanelActionButton variant="primary" onClick={() => setShowResubmitForm(true)}>
              <RefreshCw size={12} /> {t('paxlog.ads_detail.actions.resubmit')}
            </PanelActionButton>
          )}
          {canCancel && (
            <DangerConfirmButton
              icon={<XCircle size={12} />}
              onConfirm={() => cancelAds.mutate(id)}
              confirmLabel={t('paxlog.cancel_question')}
            >
              {t('common.cancel')}
            </DangerConfirmButton>
          )}
        </div>
      }
    >
      <div className="p-4 space-y-5">
        {showExternalLinkForm && (
          <div className="border border-primary/30 rounded-lg bg-primary/5 p-3 space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-primary">{t('paxlog.ads_detail.external_link.title')}</p>
              <p className="text-xs text-muted-foreground">{t('paxlog.ads_detail.external_link.description')}</p>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">{t('paxlog.ads_detail.external_link.recipient_label')}</label>
              <select
                value={externalLinkRecipientKey}
                onChange={(e) => setExternalLinkRecipientKey(e.target.value)}
                className={panelInputClass}
              >
                {eligibleExternalRecipients.map((recipient) => (
                  <option key={recipient.key} value={recipient.key}>
                    {recipient.label}{recipient.contactSummary ? ` — ${recipient.contactSummary}` : ''}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">{t('paxlog.ads_detail.external_link.channel_hint')}</p>
            </div>
            <div className="flex items-center gap-2">
              <PanelActionButton
                variant="primary"
                disabled={createExtLink.isPending || !selectedExternalRecipient}
                onClick={() => selectedExternalRecipient && handleGenerateLink(selectedExternalRecipient)}
              >
                {createExtLink.isPending ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                {t('paxlog.ads_detail.external_link.confirm')}
              </PanelActionButton>
              <PanelActionButton onClick={() => setShowExternalLinkForm(false)}>{t('common.cancel')}</PanelActionButton>
            </div>
          </div>
        )}

        {/* Reject reason inline form */}
        {showRejectForm && (
          <div className="border border-red-300 rounded-lg bg-red-50 dark:bg-red-900/10 dark:border-red-800 p-3 space-y-2">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">{t('paxlog.ads_detail.reject.reason_title')}</p>
            <textarea
              className="gl-form-input text-xs min-h-[60px]"
              placeholder={t('paxlog.ads_detail.reject.placeholder')}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button className="gl-button-sm gl-button-danger" disabled={rejectAds.isPending} onClick={handleReject}>
                {rejectAds.isPending ? <Loader2 size={12} className="animate-spin" /> : <ThumbsDown size={12} />}
                {t('paxlog.confirm_reject')}
              </button>
              <button className="gl-button-sm gl-button-default" onClick={() => setShowRejectForm(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {showReviewForm && (
          <div className="border border-amber-300 rounded-lg bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t('paxlog.ads_detail.request_review.reason_title')}</p>
            <textarea
              className="gl-form-input text-xs min-h-[60px]"
              placeholder={t('paxlog.ads_detail.request_review.placeholder')}
              value={reviewReason}
              onChange={(e) => setReviewReason(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button className="gl-button-sm gl-button-default" disabled={requestReviewAds.isPending || !reviewReason.trim()} onClick={handleRequestReview}>
                {requestReviewAds.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {t('paxlog.ads_detail.request_review.confirm')}
              </button>
              <button className="gl-button-sm gl-button-default" onClick={() => setShowReviewForm(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {showStayChangeForm && (
          <div className="border border-indigo-300 rounded-lg bg-indigo-50 dark:bg-indigo-900/10 dark:border-indigo-800 p-3 space-y-3">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-400">{t('paxlog.ads_detail.stay_change.title')}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('paxlog.ads_detail.stay_change.start_date')}</label>
                <input type="date" className="gl-form-input text-xs" value={proposedStartDate} onChange={(e) => setProposedStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t('paxlog.ads_detail.stay_change.end_date')}</label>
                <input type="date" className="gl-form-input text-xs" value={proposedEndDate} onChange={(e) => setProposedEndDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('paxlog.ads_detail.stay_change.visit_purpose')}</label>
              <textarea
                className="gl-form-input text-xs min-h-[56px]"
                value={proposedVisitPurpose}
                onChange={(e) => setProposedVisitPurpose(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('paxlog.ads_detail.stay_change.reason')}</label>
              <textarea
                className="gl-form-input text-xs min-h-[60px]"
                placeholder={t('paxlog.ads_detail.stay_change.reason_placeholder')}
                value={stayChangeReason}
                onChange={(e) => setStayChangeReason(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                className="gl-button-sm gl-button-default"
                disabled={requestAdsStayChange.isPending || !stayChangeReason.trim()}
                onClick={handleRequestStayChange}
              >
                {requestAdsStayChange.isPending ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
                {t('paxlog.ads_detail.stay_change.confirm')}
              </button>
              <button className="gl-button-sm gl-button-default" onClick={() => setShowStayChangeForm(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {showManualDepartureForm && (
          <div className="border border-sky-300 rounded-lg bg-sky-50 dark:bg-sky-900/10 dark:border-sky-800 p-3 space-y-2">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">{t('paxlog.ads_detail.manual_departure.title')}</p>
            <textarea
              className="gl-form-input text-xs min-h-[60px]"
              placeholder={t('paxlog.ads_detail.manual_departure.placeholder')}
              value={manualDepartureReason}
              onChange={(e) => setManualDepartureReason(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button className="gl-button-sm gl-button-default" disabled={manualDepartureAds.isPending || !manualDepartureReason.trim()} onClick={handleManualDeparture}>
                {manualDepartureAds.isPending ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
                {t('paxlog.ads_detail.manual_departure.confirm')}
              </button>
              <button className="gl-button-sm gl-button-default" onClick={() => { setShowManualDepartureForm(false); setManualDepartureReason('') }}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {showResubmitForm && (
          <div className="border border-sky-300 rounded-lg bg-sky-50 dark:bg-sky-900/10 dark:border-sky-800 p-3 space-y-2">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">{t('paxlog.ads_detail.resubmit.reason_title')}</p>
            <textarea
              className="gl-form-input text-xs min-h-[60px]"
              placeholder={t('paxlog.ads_detail.resubmit.placeholder')}
              value={resubmitReason}
              onChange={(e) => setResubmitReason(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button className="gl-button-sm gl-button-confirm" disabled={resubmitAds.isPending || !resubmitReason.trim()} onClick={handleResubmit}>
                {resubmitAds.isPending ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {t('paxlog.ads_detail.resubmit.confirm')}
              </button>
              <button className="gl-button-sm gl-button-default" onClick={() => setShowResubmitForm(false)}>{t('common.cancel')}</button>
            </div>
          </div>
        )}

        {/* Status badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={ads.status} labels={adsStatusLabels} badges={ADS_STATUS_BADGES} />
          <span className={cn('gl-badge', ads.type === 'team' ? 'gl-badge-info' : 'gl-badge-neutral')}>
            {ads.type === 'individual' ? t('paxlog.create_ads.type.individual') : t('paxlog.create_ads.type.team')}
          </span>
          {ads.cross_company_flag && <span className="gl-badge gl-badge-warning">{t('paxlog.ads_detail.cross_company')}</span>}
          {ads.is_round_trip_no_overnight && (
            <span className="gl-badge gl-badge-info" title={t('paxlog.ads_detail.round_trip_no_overnight_hint') || 'Visite d\'une journée — comptée dans le forecast PAX du jour uniquement'}>
              A/R sans nuitée
            </span>
          )}
        </div>

        {/* Tabbed navigation — standard pattern across all detail panels
            (Voyage, Vector, Rotation). Segments what was previously a
            mile-long scroll with 9+ stacked sections into 4 clear pages. */}
        <TabBar<AdsDetailTab>
          items={(() => {
            // t() returns the key literal when the translation is
            // missing, which is truthy and defeats a simple `|| 'fr'`
            // fallback. Compare against the key to detect misses.
            const lbl = (key: string, fb: string) => {
              const r = t(key)
              return r === key ? fb : r
            }
            return [
              { id: 'informations', label: lbl('paxlog.ads_detail.tabs.informations', 'Informations'), icon: Info },
              { id: 'passagers', label: lbl('paxlog.ads_detail.tabs.passengers', 'Passagers'), icon: Users, badge: adsPax?.length ?? 0 },
              { id: 'sejours', label: lbl('paxlog.ads_detail.tabs.stays', 'Séjours'), icon: BedDouble, badge: stayPrograms.length || undefined },
              { id: 'historique', label: lbl('paxlog.ads_detail.tabs.history', 'Historique'), icon: BookOpen },
            ]
          })()}
          activeId={detailTab}
          onTabChange={setDetailTab}
        />

        {detailTab === 'informations' && (<>
        <CollapsibleSection
          id="ads-readiness"
          // Clean, consistent section title (aligned with Voyage panel
          // conventions: short noun, no inline status).
          title="Synthèse"
          defaultExpanded
        >
          <div className="space-y-3">
            {/* Compact progress + KPI row — replaces the old heavy
                5-line checklist + 3 summary cards which duplicated info
                with the Visit/Transport section below. */}
            {ads.status === 'draft' && (
              <div className="rounded-md border border-border bg-muted/20 px-3 py-2 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {t('paxlog.ads_detail.readiness.imputation_hint')}
                </p>
                <span
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    adsReadyToSubmit
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                  )}
                  title={adsSubmissionChecklist.filter(i => !i.done).map(i => i.label).join(' · ')}
                >
                  {adsSubmissionChecklist.filter((i) => i.done).length}/{adsSubmissionChecklist.length}
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-baseline gap-2 px-3 py-1.5 rounded-md border border-border/60 bg-card">
                <span className="text-base font-bold tabular-nums font-display text-foreground">{adsPax?.length ?? 0}</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('paxlog.ads_detail.kpis.passengers')}</span>
              </div>
              <div className="flex items-baseline gap-2 px-3 py-1.5 rounded-md border border-border/60 bg-card">
                <span className="text-base font-bold tabular-nums font-display text-emerald-600">{compliantPaxCount}</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('paxlog.ads_detail.kpis.compliant_pax')}</span>
              </div>
              <div className="flex items-baseline gap-2 px-3 py-1.5 rounded-md border border-border/60 bg-card">
                <span className={cn('text-base font-bold tabular-nums font-display', nonCompliantPaxCount > 0 ? 'text-amber-600' : 'text-foreground')}>{nonCompliantPaxCount}</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{t('paxlog.ads_detail.kpis.compliance_gaps')}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{adsNextAction}</p>
          </div>
        </CollapsibleSection>

        {/* Visit details + Transport — 2-column grid */}
        <CollapsibleSection id="ads-visit" title={t('paxlog.ads_detail.sections.visit_transport')} defaultExpanded>
          <DetailFieldGrid>
            <ReadOnlyRow label={t('paxlog.ads_detail.fields.purpose')} value={ads.visit_purpose} />
            <ReadOnlyRow label={t('paxlog.ads_detail.fields.category')} value={visitCategoryLabels[ads.visit_category] || ads.visit_category} />
            <ReadOnlyRow label={t('paxlog.ads_detail.fields.site')} value={
              ads.site_entry_asset_id ? (
                <CrossModuleLink module="assets" id={ads.site_entry_asset_id} label={resolveAssetName(ads.site_entry_asset_id) || ads.site_name || ads.site_entry_asset_id} mode="navigate" />
              ) : (ads.site_name || '—')
            } />
            <ReadOnlyRow label={t('paxlog.ads_detail.fields.dates')} value={`${formatDate(ads.start_date)} → ${formatDate(ads.end_date)}`} />
            {ads.requester_name && <ReadOnlyRow label={t('paxlog.ads_detail.fields.requester')} value={ads.requester_name} />}
            {ads.created_by_name && ads.created_by !== ads.requester_id && <ReadOnlyRow label={t('paxlog.ads_detail.fields.created_by')} value={ads.created_by_name} />}
            {(ads.allowed_company_names?.length ?? 0) > 0 && (
              <ReadOnlyRow label={t('paxlog.ads_detail.fields.allowed_companies')} value={ads.allowed_company_names?.join(', ') || '—'} />
            )}
            {ads.project_id && (
              <ReadOnlyRow label={t('paxlog.ads_detail.fields.project')} value={
                <CrossModuleLink module="projets" id={ads.project_id} label={ads.project_name || ads.project_id} mode="navigate" />
              } />
            )}
            {(linkedProjects.length > 1) && (
              <ReadOnlyRow
                label={t('paxlog.ads_detail.fields.related_projects')}
                value={
                  <span className="inline-flex flex-wrap gap-x-1 gap-y-1">
                    {linkedProjects.map((project, index) => (
                      <span key={project.project_id}>
                        <CrossModuleLink
                          module="projets"
                          id={project.project_id}
                          label={project.project_name || project.project_id}
                          mode="navigate"
                        />
                        {index < linkedProjects.length - 1 ? ', ' : ''}
                      </span>
                    ))}
                  </span>
                }
              />
            )}
            {ads.status === 'pending_project_review' && linkedProjects.length > 0 && (
              <ReadOnlyRow
                label={t('paxlog.ads_detail.fields.project_review_status')}
                value={
                  <div className="space-y-2">
                    {pendingProjectReviews.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {pendingProjectReviews.map((project) => (
                          <span key={project.project_id} className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                            <CrossModuleLink
                              module="projets"
                              id={project.project_id}
                              label={project.project_name || project.project_id}
                              mode="navigate"
                            />
                            <span>{t('paxlog.ads_detail.project_review.pending')}</span>
                            {project.project_manager_name && <span className="text-amber-700/90 dark:text-amber-300/90">{t('paxlog.ads_detail.project_review.manager', { name: project.project_manager_name })}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                    {approvedProjectReviews.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {approvedProjectReviews.map((project) => (
                          <span key={project.project_id} className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                            <CrossModuleLink
                              module="projets"
                              id={project.project_id}
                              label={project.project_name || project.project_id}
                              mode="navigate"
                            />
                            <span>{t('paxlog.ads_detail.project_review.approved')}</span>
                            {project.project_manager_name && <span className="text-emerald-700/90 dark:text-emerald-300/90">{t('paxlog.ads_detail.project_review.manager', { name: project.project_manager_name })}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {t('paxlog.ads_detail.project_review.summary', {
                        approved: approvedProjectReviews.length,
                        pending: pendingProjectReviews.length,
                        total: linkedProjects.length,
                      })}
                    </p>
                  </div>
                }
              />
            )}
            {ads.outbound_transport_mode && <ReadOnlyRow label={t('paxlog.ads_detail.fields.outbound_transport')} value={transportModeLabels[ads.outbound_transport_mode] || ads.outbound_transport_mode} />}
            {ads.return_transport_mode && <ReadOnlyRow label={t('paxlog.ads_detail.fields.return_transport')} value={transportModeLabels[ads.return_transport_mode] || ads.return_transport_mode} />}
          </DetailFieldGrid>
          {canEditAllowedCompanies && (
            <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-foreground">{t('paxlog.ads_detail.fields.allowed_companies')}</p>
              </div>
              <AllowedCompaniesPicker
                value={allowedCompaniesDraft}
                onChange={setAllowedCompaniesDraft}
                searchValue={allowedCompanySearch}
                onSearchChange={setAllowedCompanySearch}
                disabled={updateAds.isPending}
                chipVariant="background"
              />
              <div className="flex justify-end">
                <PanelActionButton
                  variant="primary"
                  disabled={updateAds.isPending}
                  onClick={() => updateAds.mutate({ id, payload: { allowed_company_ids: allowedCompaniesDraft.map((company) => company.id) } })}
                >
                  {updateAds.isPending ? <Loader2 size={12} className="animate-spin" /> : t('common.save')}
                </PanelActionButton>
              </div>
            </div>
          )}
        </CollapsibleSection>

        {(ads.origin_mission_notice_id || ads.origin_mission_program_id) && (
          <CollapsibleSection id="ads-origin-avm" title={t('paxlog.ads_detail.sections.origin_mission')} defaultExpanded>
            <DetailFieldGrid>
              {ads.origin_mission_notice_id && (
                <ReadOnlyRow
                  label={t('paxlog.ads_detail.fields.origin_avm')}
                  value={
                    <CrossModuleLink
                      module="paxlog"
                      id={ads.origin_mission_notice_id}
                      subtype="avm"
                      label={ads.origin_mission_notice_reference || ads.origin_mission_notice_title || ads.origin_mission_notice_id}
                      mode="navigate"
                    />
                  }
                />
              )}
              {ads.origin_mission_notice_title && (
                <ReadOnlyRow label={t('paxlog.ads_detail.fields.origin_mission_title')} value={ads.origin_mission_notice_title} />
              )}
              {ads.origin_mission_program_activity && (
                <ReadOnlyRow label={t('paxlog.ads_detail.fields.origin_program_activity')} value={ads.origin_mission_program_activity} />
              )}
            </DetailFieldGrid>
          </CollapsibleSection>
        )}

        {ads.planner_activity_id && (
          <CollapsibleSection id="ads-origin-planner" title={t('paxlog.ads_detail.sections.origin_planner')} defaultExpanded>
            <DetailFieldGrid>
              <ReadOnlyRow
                label={t('paxlog.ads_detail.fields.planner_activity')}
                value={
                  <CrossModuleLink
                    module="planner"
                    id={ads.planner_activity_id}
                    label={ads.planner_activity_title || ads.planner_activity_id}
                    mode="navigate"
                  />
                }
              />
              {ads.planner_activity_title && (
                <ReadOnlyRow label={t('paxlog.ads_detail.fields.planner_activity_title')} value={ads.planner_activity_title} />
              )}
              {ads.planner_activity_status && (
                <ReadOnlyRow label={t('paxlog.ads_detail.fields.planner_activity_status')} value={ads.planner_activity_status} />
              )}
            </DetailFieldGrid>
          </CollapsibleSection>
        )}

        {latestOperationalImpact && (
          <CollapsibleSection id="ads-operational-impact" title={t('paxlog.ads_detail.sections.operational_impact')} defaultExpanded>
            <div className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-3 text-xs text-amber-950 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-50">
              <p className="font-medium">
                {latestOperationalImpact.event_type === 'stay_change_requested'
                  ? t('paxlog.ads_detail.operational_impact.stay_change')
                  : latestOperationalImpact.event_type === 'avm_cancelled'
                  ? t('paxlog.ads_detail.operational_impact.avm_cancelled')
                  : latestOperationalImpact.event_type === 'planner_activity_cancelled'
                    ? t('paxlog.ads_detail.operational_impact.planner_cancelled')
                    : latestOperationalImpact.event_type === 'planner_activity_modified_requires_review'
                      ? t('paxlog.ads_detail.operational_impact.planner_modified')
                      : t('paxlog.ads_detail.operational_impact.avm_modified')}
              </p>
              {!!latestOperationalImpact.reason && (
                <p className="text-amber-900/90 dark:text-amber-100/90">{latestOperationalImpact.reason}</p>
              )}
              {!!(latestOperationalImpact.metadata_json as { avm_id?: string; avm_reference?: string } | null)?.avm_id && (
                <p className="text-amber-900/90 dark:text-amber-100/90">
                  {t('paxlog.ads_detail.history.source_avm')}{' '}
                  <CrossModuleLink
                    module="paxlog"
                    id={(latestOperationalImpact.metadata_json as { avm_id?: string }).avm_id!}
                    subtype="avm"
                  label={(latestOperationalImpact.metadata_json as { avm_reference?: string }).avm_reference || (latestOperationalImpact.metadata_json as { avm_id?: string }).avm_id!}
                  mode="navigate"
                />
              </p>
              )}
              {!!(latestOperationalImpact.metadata_json as { planner_activity_title?: string } | null)?.planner_activity_title && (
                <p className="text-amber-900/90 dark:text-amber-100/90">
                  {t('paxlog.ads_detail.fields.planner_activity_title')}{' '}
                  {(latestOperationalImpact.metadata_json as { planner_activity_title?: string }).planner_activity_title}
                </p>
              )}
              {latestOperationalImpactChanges && (
                <div className="space-y-1">
                  <p className="font-medium">{t('paxlog.ads_detail.operational_impact.changed_fields')}</p>
                  {Object.entries(latestOperationalImpactChanges).map(([field, diff]) => (
                    <div key={field} className="text-[11px] text-amber-900/90 dark:text-amber-100/90">
                      <span className="font-medium">{getAvmChangeFieldLabel(field)}</span>: {formatEventValue(diff.from ?? diff.before)} → {formatEventValue(diff.to ?? diff.after)}
                    </div>
                  ))}
                </div>
              )}
              {latestOperationalImpact.event_type === 'stay_change_requested' && latestStayChangeKinds.length > 0 && (
                <div className="space-y-1">
                  <p className="font-medium">{t('paxlog.ads_detail.operational_impact.stay_change_types')}</p>
                  <div className="flex flex-wrap gap-2">
                    {latestStayChangeKinds.map((kind) => (
                      <span key={kind} className="gl-badge gl-badge-neutral">
                        {getStayChangeKindLabel(kind)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}
        </>)}

        {detailTab === 'passagers' && (<>
        {/* PAX list with compliance status + add/remove */}
        <CollapsibleSection
          id="ads-pax"
          title={t('paxlog.ads_detail.sections.passengers', { count: adsPax?.length || 0 })}
          defaultExpanded
          headerAction={ads && ['draft', 'requires_review'].includes(ads.status) && hasPermission('paxlog.ads.update') ? (
            <button
              className="gl-button gl-button-confirm h-5 w-5 flex text-primary"
              onClick={() => setShowPaxPicker(true)}
              title={t('paxlog.ads_detail.actions.add_passenger')}
            >
              <Plus size={13} />
            </button>
          ) : undefined}
        >
          {/* PAX Search & Add */}
          {showPaxPicker && (
            <div className="mb-3">
              <div className="space-y-2 p-2 rounded-md border border-border bg-card">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        className={cn(panelInputClass, 'pl-7')}
                        placeholder={t('paxlog.ads_detail.search_pax_placeholder')}
                        value={paxSearch}
                        onChange={(e) => setPaxSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <button className="p-1 text-muted-foreground hover:text-foreground" onClick={() => { setShowPaxPicker(false); setPaxSearch('') }}>
                      <X size={14} />
                    </button>
                  </div>
                  {paxCandidates && paxCandidates.length > 0 && (
                    <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                      {paxCandidates.map((c: PaxCandidate) => {
                        // Check if already in AdS
                        const alreadyAdded = adsPax?.some((ap: AdsPax) =>
                          (c.user_id && ap.user_id === c.user_id) || (c.contact_id && ap.contact_id === c.contact_id)
                        )
                        return (
                          <button
                            key={`${c.source}-${c.id}`}
                            disabled={alreadyAdded || addPaxV2.isPending}
                            className={cn(
                              'w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left transition-colors',
                              alreadyAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-accent/60 cursor-pointer',
                            )}
                            onClick={() => {
                              const body = c.source === 'user'
                                ? { user_id: c.user_id! }
                                : { contact_id: c.contact_id! }
                              addPaxV2.mutate({ adsId: id, body }, {
                                onSuccess: () => setPaxSearch(''),
                              })
                            }}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-medium truncate">{c.last_name} {c.first_name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {c.source === 'user'
                                  ? t('paxlog.ads_detail.pax_candidate.user', { email: c.email ? ` • ${c.email}` : '' })
                                  : t('paxlog.ads_detail.pax_candidate.contact', { position: c.position ? ` • ${c.position}` : '' })}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={cn('gl-badge text-[9px]', (c.pax_type || c.type) === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
                                {(c.pax_type || c.type) === 'internal' ? t('paxlog.ads_detail.passenger_type.internal') : t('paxlog.ads_detail.passenger_type.external')}
                              </span>
                              {alreadyAdded ? (
                                <CheckCircle2 size={12} className="text-green-500" />
                              ) : (
                                <Plus size={12} className="text-primary" />
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {paxSearch.length >= 1 && paxCandidates && paxCandidates.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2 italic">{t('paxlog.ads_detail.empty.pax_search', { search: paxSearch })}</p>
                  )}
                </div>
            </div>
          )}

          {!adsPax || adsPax.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 italic">{t('paxlog.ads_detail.empty.passengers')}</p>
          ) : (
            <div className="space-y-1">
              {adsPax.map((ap: AdsPax) => (
                <div key={ap.id} className="rounded px-2 py-1.5 hover:bg-accent/50 text-xs group">
                  {(() => {
                    const complianceSummary = (ap.compliance_summary ?? null) as null | {
                      compliant?: boolean
                      covered_layers?: string[]
                      verification_sequence?: string[]
                      issues_summary?: string
                      results?: Array<{
                        credential_type_name: string
                        status: string
                        message: string
                        layer?: string | null
                        layer_label?: string | null
                        blocking?: boolean
                      }>
                    }
                    const blockingResults = (complianceSummary?.results ?? []).filter((item) => item.blocking)
                    // Spec §3.6: non-blocking issues must be surfaced as
                    // warnings separately from blocking ones so the
                    // validator can make an informed decision. Filter
                    // out issues with an explicit OK status.
                    const nonBlockingResults = (complianceSummary?.results ?? []).filter(
                      (item) => !item.blocking && (item.status || '').toLowerCase() !== 'ok'
                        && (item.status || '').toLowerCase() !== 'compliant',
                    )
                    return (
                      <>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {(ap.user_id || ap.contact_id) ? (
                          <button
                            className="font-medium text-primary hover:underline text-left"
                            onClick={() =>
                              openDynamicPanel({
                                type: 'detail',
                                module: 'paxlog',
                                id: (ap.user_id || ap.contact_id)!,
                                meta: {
                                  subtype: 'profile',
                                  pax_source: (ap.pax_source || (ap.user_id ? 'user' : 'contact')),
                                  from_ads_id: id,
                                },
                              })
                            }
                          >
                            {`${ap.pax_last_name ?? ''} ${ap.pax_first_name ?? ''}`.trim()}
                          </button>
                        ) : (
                          <>{ap.pax_last_name ?? ''} {ap.pax_first_name ?? ''}</>
                        )}
                      </p>
                      {ap.pax_badge && <p className="text-[10px] text-muted-foreground">{t('paxlog.ads_detail.fields.badge', { value: ap.pax_badge })}</p>}
                      {ap.pax_company_name && <p className="text-[10px] text-muted-foreground">{ap.pax_company_name}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {ap.compliant === true && <CheckCircle2 size={13} className="text-green-600" />}
                      {ap.compliant === false && <XCircle size={13} className="text-red-500" />}
                      <span className={cn('gl-badge', ap.pax_type === 'internal' ? 'gl-badge-info' : 'gl-badge-neutral')}>
                        {ap.pax_type === 'internal' ? t('paxlog.ads_detail.passenger_type.internal') : t('paxlog.ads_detail.passenger_type.external')}
                      </span>
                      <StatusBadge status={ap.status} />
                      {canApprove && !['approved', 'rejected', 'no_show'].includes(ap.status) && (
                        <>
                          <button
                            className="p-1 rounded text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                            onClick={() => handleApprovePassenger(ap.id)}
                            title={t('paxlog.ads_detail.actions.validate_passenger')}
                          >
                            <ThumbsUp size={12} />
                          </button>
                          <button
                            className="p-1 rounded text-amber-600 hover:bg-amber-500/10 transition-colors"
                            onClick={() => {
                              setPaxRejectEntryId(ap.id)
                              setPaxRejectReason('')
                            }}
                            title={t('paxlog.ads_detail.actions.reject_passenger')}
                          >
                            <ThumbsDown size={12} />
                          </button>
                        </>
                      )}
                      {(ap.user_id || ap.contact_id) && hasPermission('paxlog.ads.update') && (
                        <button
                          className="gl-button gl-button-danger"
                          onClick={() => removePax.mutate({ adsId: id, entryId: ap.id })}
                          title={t('paxlog.ads_detail.actions.remove_passenger')}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  {complianceSummary && (
                    <div className="mt-2 space-y-1.5">
                      {(complianceSummary.verification_sequence ?? complianceSummary.covered_layers ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(complianceSummary.verification_sequence ?? complianceSummary.covered_layers ?? []).map((layer) => (
                            <span key={`${ap.id}-${layer}`} className="gl-badge gl-badge-neutral">
                              {layer === 'site_requirements'
                                ? t('paxlog.ads_detail.compliance.layers.site_requirements')
                                : layer === 'job_profile'
                                  ? t('paxlog.ads_detail.compliance.layers.job_profile')
                                  : t('paxlog.ads_detail.compliance.layers.self_declaration')}
                            </span>
                          ))}
                        </div>
                      )}
                      {/* Spec §3.6: BLOCKING issues (red) — pax cannot be approved */}
                      {blockingResults.length > 0 && (
                        <div className="rounded-md border border-red-400/60 bg-red-50/80 px-2 py-1.5 text-[11px] text-red-900 dark:border-red-700 dark:bg-red-950/30 dark:text-red-200">
                          <p className="font-semibold flex items-center gap-1">
                            <XCircle size={11} />
                            {t('paxlog.ads_detail.compliance.blocking_title') || 'Non-conformités bloquantes'}
                          </p>
                          <div className="mt-1 space-y-1">
                            {blockingResults.map((item, index) => (
                              <p key={`${ap.id}-blocking-${index}`}>
                                <span className="font-medium">{item.layer_label || item.layer || 'Compliance'}</span>
                                {' — '}
                                {item.message}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Spec §3.6: NON-BLOCKING issues (amber warning) — pax can be approved but reviewer is warned */}
                      {nonBlockingResults.length > 0 && (
                        <div className="rounded-md border border-amber-400/60 bg-amber-50/80 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                          <p className="font-semibold flex items-center gap-1">
                            <Flag size={11} />
                            {t('paxlog.ads_detail.compliance.non_blocking_title') || 'Signalements non-bloquants'}
                          </p>
                          <div className="mt-1 space-y-1">
                            {nonBlockingResults.map((item, index) => (
                              <p key={`${ap.id}-nonblocking-${index}`}>
                                <span className="font-medium">{item.layer_label || item.layer || 'Compliance'}</span>
                                {' — '}
                                {item.message}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                      {blockingResults.length === 0 && nonBlockingResults.length === 0 && complianceSummary.compliant === true && (
                        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 size={11} />
                          {t('paxlog.ads_detail.compliance.compliant')}
                        </p>
                      )}
                    </div>
                  )}
                  {paxRejectEntryId === ap.id && (
                    <div className="mt-2 rounded-md border border-border bg-card p-2 space-y-2">
                      <textarea
                        className="gl-form-input text-xs min-h-[56px]"
                        placeholder={t('paxlog.ads_detail.reject.passenger_placeholder')}
                        value={paxRejectReason}
                        onChange={(e) => setPaxRejectReason(e.target.value)}
                      />
                      <div className="flex items-center gap-2">
                        <button className="gl-button-sm gl-button-danger" disabled={decideAdsPax.isPending} onClick={handleRejectPassenger}>
                          {t('common.reject')}
                        </button>
                        <button
                          className="gl-button-sm gl-button-secondary"
                          onClick={() => {
                            setPaxRejectEntryId(null)
                            setPaxRejectReason('')
                          }}
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                      </>
                    )
                  })()}
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
        </>)}

        {detailTab === 'informations' && (<>
        {/* Cost Imputations */}
        <CollapsibleSection id="ads-imputations" title={t('paxlog.ads_detail.sections.imputations')} defaultExpanded>
          {imputationSuggestion && (
            <div className="mb-3 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('paxlog.ads_detail.imputation.backend_suggestion')}</p>
              <p className="mt-1 text-xs text-foreground">
                {t('paxlog.ads_detail.imputation.project')}: <span className="font-medium">{imputationSuggestion.project_name || t('common.none')}</span>
                {' • '}
                {t('paxlog.ads_detail.imputation.cost_center')}: <span className="font-medium">{imputationSuggestion.cost_center_name || t('common.none')}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t('paxlog.ads_detail.imputation.sources', { project: imputationSuggestion.project_source, cost_center: imputationSuggestion.cost_center_source })}
              </p>
            </div>
          )}
          <ImputationManager
            ownerType="ads"
            ownerId={id}
            editable={!!ads && ['draft', 'requires_review'].includes(ads.status)}
            defaultProjectId={imputationSuggestion?.project_id || ads.project_id}
            defaultCostCenterId={imputationSuggestion?.cost_center_id || null}
          />
        </CollapsibleSection>
        </>)}

        {detailTab === 'sejours' && (<>
        <CollapsibleSection id="ads-stay-programs" title={t('paxlog.ads_detail.sections.stay_programs', { count: stayPrograms.length })} defaultExpanded>
          <div className="space-y-3 p-3">
            {canManageStayPrograms && !showStayProgramForm && (
              <PanelActionButton onClick={() => setShowStayProgramForm(true)}>
                <Plus size={12} /> {t('paxlog.ads_detail.stay_programs.create')}
              </PanelActionButton>
            )}

            {showStayProgramForm && (
              <div className="space-y-3 rounded-lg border border-border bg-card p-3">
                <DynamicPanelField label={t('paxlog.ads_detail.stay_programs.target_pax')}>
                  <select
                    value={stayProgramTarget.user_id || stayProgramTarget.contact_id || ''}
                    onChange={(e) => {
                      const selected = adsPax?.find((entry) => (entry.user_id || entry.contact_id) === e.target.value)
                      setStayProgramTarget({
                        user_id: selected?.user_id || null,
                        contact_id: selected?.contact_id || null,
                      })
                    }}
                    className={panelInputClass}
                  >
                    <option value="">{t('common.select')}</option>
                    {(adsPax || []).map((entry) => {
                      const value = entry.user_id || entry.contact_id || ''
                      const label = `${entry.pax_last_name || ''} ${entry.pax_first_name || ''}`.trim() || entry.pax_badge || value
                      return <option key={entry.id} value={value}>{label}</option>
                    })}
                  </select>
                </DynamicPanelField>

                {stayMovements.map((movement, index) => (
                  <div key={index} className="space-y-2 rounded-md border border-border/70 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-foreground">{t('paxlog.ads_detail.stay_programs.movement', { index: index + 1 })}</p>
                      {stayMovements.length > 1 && (
                        <button type="button" className="text-xs text-danger hover:underline" onClick={() => removeStayMovement(index)}>
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                    <FormGrid className="@\[900px\]:grid-cols-2">
                      <DynamicPanelField label={t('paxlog.ads_detail.stay_programs.fields.effective_date')}>
                        <input type="date" value={movement.effective_date} onChange={(e) => updateStayMovement(index, { effective_date: e.target.value })} className={panelInputClass} />
                      </DynamicPanelField>
                      <DynamicPanelField label={t('paxlog.ads_detail.stay_programs.fields.transport_mode')}>
                        <input value={movement.transport_mode} onChange={(e) => updateStayMovement(index, { transport_mode: e.target.value })} className={panelInputClass} />
                      </DynamicPanelField>
                      <DynamicPanelField label={t('paxlog.ads_detail.stay_programs.fields.from_location')}>
                        <input value={movement.from_location} onChange={(e) => updateStayMovement(index, { from_location: e.target.value })} className={panelInputClass} />
                      </DynamicPanelField>
                      <DynamicPanelField label={t('paxlog.ads_detail.stay_programs.fields.to_location')}>
                        <input value={movement.to_location} onChange={(e) => updateStayMovement(index, { to_location: e.target.value })} className={panelInputClass} />
                      </DynamicPanelField>
                    </FormGrid>
                    <DynamicPanelField label={t('common.notes')}>
                      <textarea value={movement.notes} onChange={(e) => updateStayMovement(index, { notes: e.target.value })} className={cn(panelInputClass, 'min-h-[56px] resize-y')} />
                    </DynamicPanelField>
                  </div>
                ))}

                <div className="flex items-center gap-2">
                  <PanelActionButton onClick={addStayMovement}>
                    <Plus size={12} /> {t('paxlog.ads_detail.stay_programs.add_movement')}
                  </PanelActionButton>
                  <PanelActionButton variant="primary" disabled={createStayProgram.isPending || (!stayProgramTarget.user_id && !stayProgramTarget.contact_id)} onClick={handleCreateStayProgram}>
                    {createStayProgram.isPending ? <Loader2 size={12} className="animate-spin" /> : <><Send size={12} /> {t('common.create')}</>}
                  </PanelActionButton>
                  <PanelActionButton onClick={() => setShowStayProgramForm(false)}>
                    <X size={12} /> {t('common.cancel')}
                  </PanelActionButton>
                </div>
              </div>
            )}

            {stayPrograms.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t('paxlog.ads_detail.stay_programs.empty')}</p>
            ) : (
              <div className="space-y-3">
                {stayPrograms.map((program) => {
                  const paxEntry = adsPax?.find((entry) =>
                    (program.user_id && entry.user_id === program.user_id) ||
                    (program.contact_id && entry.contact_id === program.contact_id),
                  )
                  const paxLabel = `${paxEntry?.pax_last_name || ''} ${paxEntry?.pax_first_name || ''}`.trim() || paxEntry?.pax_badge || t('paxlog.ads_detail.stay_programs.unknown_pax')
                  return (
                    <div key={program.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">{paxLabel}</p>
                          <p className="text-[11px] text-muted-foreground">{t('paxlog.ads_detail.stay_programs.created_at', { date: formatDate(program.created_at) })}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={program.status} map={{
                            draft: { labelKey: 'paxlog.status.ads.draft', badge: 'gl-badge-neutral' },
                            submitted: { labelKey: 'paxlog.status.ads.submitted', badge: 'gl-badge-info' },
                            approved: { labelKey: 'paxlog.status.ads.approved', badge: 'gl-badge-success' },
                            rejected: { labelKey: 'paxlog.status.ads.rejected', badge: 'gl-badge-danger' },
                          }} />
                          {program.status === 'draft' && canManageStayPrograms && (
                            <PanelActionButton onClick={() => submitStayProgram.mutate(program.id)} disabled={submitStayProgram.isPending}>
                              <Send size={12} /> {t('common.submit')}
                            </PanelActionButton>
                          )}
                          {program.status === 'submitted' && canApproveStayPrograms && (
                            <PanelActionButton variant="primary" onClick={() => approveStayProgram.mutate(program.id)} disabled={approveStayProgram.isPending}>
                              <CheckCircle2 size={12} /> {t('common.validate')}
                            </PanelActionButton>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        {program.movements.map((movement, movementIndex) => (
                          <div key={movementIndex} className="rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{t('paxlog.ads_detail.stay_programs.movement', { index: movementIndex + 1 })}</span>
                            {' • '}
                            {String(movement.effective_date || '—')}
                            {' • '}
                            {String(movement.from_location || '—')}
                            {' → '}
                            {String(movement.to_location || '—')}
                            {movement.transport_mode ? ` • ${String(movement.transport_mode)}` : ''}
                            {movement.notes ? ` • ${String(movement.notes)}` : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </CollapsibleSection>
        </>)}

        {detailTab === 'historique' && (<>
        {/* Workflow timeline */}
        <CollapsibleSection id="ads-history" title={t('common.history')}>
          <div className="space-y-1">
            <ReadOnlyRow label={t('paxlog.ads_detail.history.created_at')} value={formatDate(ads.created_at)} />
            {ads.submitted_at && <ReadOnlyRow label={t('paxlog.ads_detail.history.submitted_at')} value={formatDate(ads.submitted_at)} />}
            {ads.approved_at && (
              <div className="flex items-center gap-1.5 px-2 py-1">
                <CheckCircle2 size={12} className="text-green-600 shrink-0" />
                <span className="text-xs text-green-700 dark:text-green-400 font-medium">{t('paxlog.ads_detail.history.approved_at', { date: formatDate(ads.approved_at) })}</span>
              </div>
            )}
            {ads.rejected_at && (
              <div className="px-2 py-1 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <XCircle size={12} className="text-red-600 shrink-0" />
                  <span className="text-xs text-red-700 dark:text-red-400 font-medium">{t('paxlog.ads_detail.history.rejected_at', { date: formatDate(ads.rejected_at) })}</span>
                </div>
                {ads.rejection_reason && <p className="text-xs text-muted-foreground pl-5">{ads.rejection_reason}</p>}
              </div>
            )}
            {ads.status === 'requires_review' && ads.rejection_reason && (
              <div className="px-2 py-1 space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <RefreshCw size={12} className="text-amber-600 shrink-0" />
                  <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">{t('paxlog.ads_detail.history.requires_review')}</span>
                </div>
                <p className="text-xs text-muted-foreground pl-5">{ads.rejection_reason}</p>
              </div>
            )}
            {adsTimeline.map((event) => {
              const metadata = event.metadata_json as {
                changes?: Record<string, { from?: unknown; to?: unknown; before?: unknown; after?: unknown }>
                avm_id?: string
                avm_reference?: string
              } | null
              const changes = metadata?.changes
              return (
                <div key={event.id} className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-foreground">{getAdsEventLabel(event.event_type)}</span>
                    <span className="text-[11px] text-muted-foreground">{formatDate(event.recorded_at)}</span>
                  </div>
                  {event.reason && <p className="text-xs text-muted-foreground">{event.reason}</p>}
                  {metadata?.avm_id && (
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">{t('paxlog.ads_detail.history.source_avm')}</span>{' '}
                      <CrossModuleLink
                        module="paxlog"
                        id={metadata.avm_id}
                        subtype="avm"
                        label={metadata.avm_reference || metadata.avm_id}
                        mode="navigate"
                      />
                    </div>
                  )}
                  {changes && (
                    <div className="space-y-1">
                      {Object.entries(changes).map(([field, diff]) => (
                        <div key={field} className="text-[11px] text-muted-foreground">
                          <span className="font-medium text-foreground">{getAvmChangeFieldLabel(field)}</span>: {formatEventValue(diff.from ?? diff.before)} → {formatEventValue(diff.to ?? diff.after)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            <AdsExternalLinksAudit
              externalLinks={externalLinks}
              formatDateTime={formatDateTime}
              getExternalLinkEventLabel={getExternalLinkEventLabel}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="ads-tags-notes" title={t('paxlog.ads_detail.sections.tags_notes_files')}>
          <div className="space-y-3 p-3">
            <TagManager ownerType="ads" ownerId={ads.id} compact />
            <AttachmentManager ownerType="ads" ownerId={ads.id} compact />
            <NoteManager ownerType="ads" ownerId={ads.id} compact />
          </div>
        </CollapsibleSection>
        </>)}
      </div>
    </DynamicPanelShell>
  )
}

// ── Create Incident Panel ─────────────────────────────────────

