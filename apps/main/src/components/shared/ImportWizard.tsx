/**
 * ImportWizard — multi-step modal for importing Excel/CSV/JSON/ODS data.
 *
 * Features:
 *   - File upload with encoding selector (CSV/TSV only)
 *   - Supports CSV, TSV, XLS, XLSX, JSON, ODS
 *   - Auto-match saved template → skip wizard on exact header match
 *   - Column mapping with already-used field exclusion
 *   - Virtual/computed columns (add columns not in the file)
 *   - Transform right sidebar: text, date, concat, split, arithmetic,
 *     math functions (trig, pow, sqrt, log, ln, abs, round...), replace, default
 *   - Data preview with server-side validation
 *   - Import execution with error report download
 */
import { useState, useRef, useCallback, useMemo } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import {
  Upload, X, FileSpreadsheet, Wand2, Save, ChevronRight, ChevronLeft,
  CheckCircle2, XCircle, AlertTriangle, Download, Loader2, Settings2,
  Trash2, Plus, Calculator, Globe, Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  useImportTargets,
  useImportMappings,
  useAutoDetectMapping,
  useValidateImport,
  useExecuteImport,
  useCreateImportMapping,
  useUserSyncProviders,
  useUserSyncPreview,
  useUserSyncExecute,
} from '@/hooks/useImport'
import { useGroups } from '@/hooks/useRbac'
import type {
  ImportTargetObject,
  DuplicateStrategy,
  TargetFieldDef,
  ImportPreviewResponse,
  ImportExecuteResponse,
  RowValidationError,
  ColumnTransform,
  ImportMapping,
  MathFunction,
} from '@/types/api'

// ── Constants ─────────────────────────────────────────────────

const ENCODINGS = [
  { value: 'utf-8', label: 'UTF-8 (défaut)' },
  { value: 'iso-8859-1', label: 'Latin-1 (ISO-8859-1)' },
  { value: 'windows-1252', label: 'Windows-1252' },
  { value: 'utf-16', label: 'UTF-16' },
  { value: 'ascii', label: 'ASCII' },
] as const

// Transform type keys — labels come from i18n
const TRANSFORM_TYPES = [
  'none', 'uppercase', 'lowercase', 'capitalize', 'trim', 'date_format',
  'concat', 'split', 'arithmetic', 'math_func', 'replace', 'default_value',
] as const

// Math function keys — descriptions come from i18n
const MATH_FUNC_KEYS: { value: MathFunction; symbol: string }[] = [
  { value: 'abs', symbol: 'abs(x)' },
  { value: 'round', symbol: 'round(x)' },
  { value: 'ceil', symbol: 'ceil(x)' },
  { value: 'floor', symbol: 'floor(x)' },
  { value: 'sqrt', symbol: '√x' },
  { value: 'pow', symbol: 'x^n' },
  { value: 'nroot', symbol: 'ⁿ√x' },
  { value: 'log10', symbol: 'log₁₀(x)' },
  { value: 'ln', symbol: 'ln(x)' },
  { value: 'log', symbol: 'log(x)' },
  { value: 'exp', symbol: 'eˣ' },
  { value: 'sin', symbol: 'sin(x)' },
  { value: 'cos', symbol: 'cos(x)' },
  { value: 'tan', symbol: 'tan(x)' },
  { value: 'asin', symbol: 'asin(x)' },
  { value: 'acos', symbol: 'acos(x)' },
  { value: 'atan', symbol: 'atan(x)' },
  { value: 'sign', symbol: 'sign(x)' },
  { value: 'min', symbol: 'min(x,y)' },
  { value: 'max', symbol: 'max(x,y)' },
]

const DATE_INPUT_FORMATS = [
  'DD/MM/YYYY', 'DD-MM-YYYY', 'DD.MM.YYYY',
  'MM/DD/YYYY', 'MM-DD-YYYY',
  'YYYY-MM-DD', 'YYYY/MM/DD', 'YYYY.MM.DD',
  'DD/MM/YY', 'MM/DD/YY',
  'YYYYMMDD',
  'DD MMM YYYY', // 15 Mar 2026
  'MMM DD, YYYY', // Mar 15, 2026
]

const ACCEPTED_EXTENSIONS = '.csv,.xlsx,.xls,.tsv,.json,.ods'

// ── Virtual column prefix ─────────────────────────────────────
const VIRTUAL_PREFIX = '__virtual__'

// ── Types ─────────────────────────────────────────────────────

interface ImportWizardProps {
  open: boolean
  onClose: () => void
  targetObject: ImportTargetObject
  onImportComplete?: () => void
}

interface ParsedFile {
  fileName: string
  fileSize: number
  sheets: string[]
  selectedSheet: string
  headers: string[]
  rows: Record<string, unknown>[]
}

interface SyncPreviewUser {
  external_ref: string
  email: string
  first_name: string
  last_name: string
  department: string | null
  position: string | null
  phone: string | null
  groups: string[]
  active: boolean
  already_exists: boolean
}

interface SyncPreviewResult {
  provider: string
  total: number
  users: SyncPreviewUser[]
  new_count: number
  existing_count: number
}

type Step = 0 | 1 | 2 | 3

const STEPS = ['step_upload', 'step_mapping', 'step_preview', 'step_report'] as const

// ── Transform engine (client-side) ────────────────────────────

function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  return parseFloat(String(v ?? '0').replace(',', '.')) || 0
}

function applyTransform(
  value: unknown,
  transform: ColumnTransform,
  row: Record<string, unknown>,
): unknown {
  const s = String(value ?? '')
  const p = transform.params ?? {}

  switch (transform.type) {
    case 'none':
      return value
    case 'uppercase':
      return s.toUpperCase()
    case 'lowercase':
      return s.toLowerCase()
    case 'capitalize':
      return s.replace(/\b\w/g, (c) => c.toUpperCase())
    case 'trim':
      return s.trim()
    case 'date_format': {
      const din = p.dateInputFormat ?? 'DD/MM/YYYY'
      return reformatDate(s, din)
    }
    case 'concat': {
      const cols = p.columns ?? []
      const sep = p.separator ?? ' '
      const parts = [s, ...cols.map((c) => String(row[c] ?? ''))]
      return parts.filter(Boolean).join(sep)
    }
    case 'split': {
      const sep = p.separator ?? ';'
      const idx = p.splitIndex ?? 0
      const parts = s.split(sep)
      return parts[idx]?.trim() ?? ''
    }
    case 'arithmetic': {
      const num = toNum(value)
      const other = p.columns?.[0]
        ? toNum(row[p.columns[0]])
        : (typeof p.constant === 'number' ? p.constant : toNum(p.constant))
      switch (p.operator) {
        case '+': return num + other
        case '-': return num - other
        case '*': return num * other
        case '/': return other !== 0 ? num / other : 0
        default: return num
      }
    }
    case 'math_func': {
      const num = toNum(value)
      const exp = p.exponent ?? 2
      switch (p.mathFunc) {
        case 'abs': return Math.abs(num)
        case 'round': return Math.round(num)
        case 'ceil': return Math.ceil(num)
        case 'floor': return Math.floor(num)
        case 'sqrt': return Math.sqrt(Math.abs(num))
        case 'pow': return Math.pow(num, exp)
        case 'nroot': return exp !== 0 ? Math.pow(Math.abs(num), 1 / exp) : 0
        case 'log10':
        case 'log': return num > 0 ? Math.log10(num) : 0
        case 'ln': return num > 0 ? Math.log(num) : 0
        case 'exp': return Math.exp(num)
        case 'sin': return Math.sin(num)
        case 'cos': return Math.cos(num)
        case 'tan': return Math.tan(num)
        case 'asin': return Math.asin(Math.min(1, Math.max(-1, num)))
        case 'acos': return Math.acos(Math.min(1, Math.max(-1, num)))
        case 'atan': return Math.atan(num)
        case 'sign': return Math.sign(num)
        case 'min': {
          const others = (p.columns ?? []).map((c) => toNum(row[c]))
          return Math.min(num, ...others)
        }
        case 'max': {
          const others = (p.columns ?? []).map((c) => toNum(row[c]))
          return Math.max(num, ...others)
        }
        default: return num
      }
    }
    case 'replace': {
      const find = p.find ?? ''
      const rep = p.replaceWith ?? ''
      return find ? s.split(find).join(rep) : s
    }
    case 'default_value':
      return s || String(p.constant ?? '')
    default:
      return value
  }
}

function reformatDate(s: string, inputFmt: string): string {
  if (!s.trim()) return ''

  // Handle compact YYYYMMDD
  if (inputFmt === 'YYYYMMDD' && s.length >= 8) {
    return s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8)
  }

  // Handle "DD MMM YYYY" or "MMM DD, YYYY"
  const monthNames: Record<string, string> = {
    jan: '01', fev: '02', feb: '02', mar: '03', avr: '04', apr: '04',
    mai: '05', may: '05', jun: '06', jui: '07', jul: '07', aou: '08', aug: '08',
    sep: '09', oct: '10', nov: '11', dec: '12',
  }
  if (inputFmt === 'DD MMM YYYY' || inputFmt === 'MMM DD, YYYY') {
    const cleaned = s.replace(/,/g, '').trim()
    const parts = cleaned.split(/\s+/)
    if (parts.length >= 3) {
      if (inputFmt === 'DD MMM YYYY') {
        const dd = parts[0].padStart(2, '0')
        const mm = monthNames[parts[1].toLowerCase().slice(0, 3)] ?? '01'
        return parts[2] + '-' + mm + '-' + dd
      } else {
        const mm = monthNames[parts[0].toLowerCase().slice(0, 3)] ?? '01'
        const dd = parts[1].padStart(2, '0')
        return parts[2] + '-' + mm + '-' + dd
      }
    }
    return s
  }

  // Standard delimiter-based formats
  const iParts = inputFmt.split(/[/\-.]/)
  const sParts = s.split(/[/\-.]/)
  if (sParts.length < 3) return s

  const map: Record<string, string> = {}
  iParts.forEach((p, i) => {
    const key = p.replace(/#/g, '').toUpperCase()
    if (key.startsWith('D')) map['DD'] = sParts[i]
    else if (key.startsWith('M')) map['MM'] = sParts[i]
    else if (key.startsWith('Y')) map['YYYY'] = sParts[i]
  })

  if (!map['DD'] || !map['MM'] || !map['YYYY']) return s
  if (map['YYYY'].length === 2) map['YYYY'] = '20' + map['YYYY']

  return map['YYYY'] + '-' + map['MM'].padStart(2, '0') + '-' + map['DD'].padStart(2, '0')
}

function applyAllTransforms(
  rows: Record<string, unknown>[],
  columnMapping: Record<string, string>,
  transforms: Record<string, ColumnTransform>,
): Record<string, unknown>[] {
  const hasTransforms = Object.keys(transforms).length > 0
  const hasVirtuals = Object.keys(columnMapping).some((k) => k.startsWith(VIRTUAL_PREFIX))
  if (!hasTransforms && !hasVirtuals) return rows

  return rows.map((row) => {
    const newRow = { ...row }
    for (const [key, _targetField] of Object.entries(columnMapping)) {
      const transform = transforms[key]
      if (!transform || transform.type === 'none') continue

      if (key.startsWith(VIRTUAL_PREFIX)) {
        // Virtual column: source from params.sourceColumn or constant
        const srcCol = transform.params?.sourceColumn
        const srcVal = srcCol ? row[srcCol] : ''
        newRow[key] = applyTransform(srcVal, transform, row)
      } else {
        newRow[key] = applyTransform(row[key], transform, row)
      }
    }
    return newRow
  })
}

// ── Auto-match helpers ────────────────────────────────────────

function headersMatch(fileHeaders: string[], savedHeaders: string[]): boolean {
  if (fileHeaders.length !== savedHeaders.length) return false
  const sorted1 = [...fileHeaders].sort()
  const sorted2 = [...savedHeaders].sort()
  return sorted1.every((h, i) => h === sorted2[i])
}

function findMatchingMapping(fileHeaders: string[], mappings: ImportMapping[]): ImportMapping | null {
  for (const m of mappings) {
    if (m.file_headers && headersMatch(fileHeaders, m.file_headers)) return m
  }
  return null
}

// ── Main component ────────────────────────────────────────────

export function ImportWizard({ open, onClose, targetObject, onImportComplete }: ImportWizardProps) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>(0)
  const [parsedFile, setParsedFile] = useState<ParsedFile | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [transforms, setTransforms] = useState<Record<string, ColumnTransform>>({})
  const [confidence, setConfidence] = useState<Record<string, number>>({})
  const [dupStrategy, setDupStrategy] = useState<DuplicateStrategy>('skip')
  const [previewResult, setPreviewResult] = useState<ImportPreviewResponse | null>(null)
  const [importResult, setImportResult] = useState<ImportExecuteResponse | null>(null)
  const [showSaveMapping, setShowSaveMapping] = useState(false)
  const [mappingName, setMappingName] = useState('')
  const [mappingDesc, setMappingDesc] = useState('')
  const [errorsOnly, setErrorsOnly] = useState(false)
  const [encoding, setEncoding] = useState('utf-8')
  const [autoImportMapping, setAutoImportMapping] = useState<ImportMapping | null>(null)
  const [editingTransform, setEditingTransform] = useState<string | null>(null)
  // Virtual columns: list of virtual column keys
  const [virtualColumns, setVirtualColumns] = useState<string[]>([])
  const [virtualCounter, setVirtualCounter] = useState(0)
  // Deduplication by field(s)
  const [dedupFields, setDedupFields] = useState<string[]>([])
  const [dedupCount, setDedupCount] = useState(0)

  // ── External provider sync state ──
  const supportsExternalSync = targetObject === 'user' || targetObject === 'group'
  const [importSource, setImportSource] = useState<'file' | 'external' | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null)
  const [syncPreview, setSyncPreview] = useState<SyncPreviewResult | null>(null)
  const [syncSelectedEmails, setSyncSelectedEmails] = useState<Set<string>>(new Set())
  const [syncGroupMapping, setSyncGroupMapping] = useState<Record<string, string | null>>({})
  const [syncDupStrategy, setSyncDupStrategy] = useState<'skip' | 'update'>('skip')
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null)
  // Steps for external: 0=source select, 1=provider pick+preview, 2=group mapping, 3=result
  const [syncStep, setSyncStep] = useState(0)

  const { data: targets } = useImportTargets()
  const { data: savedMappings } = useImportMappings(targetObject)
  const autoDetect = useAutoDetectMapping()
  const validateMut = useValidateImport()
  const executeMut = useExecuteImport()
  const saveMappingMut = useCreateImportMapping()

  // External sync hooks
  const { data: syncProviders } = useUserSyncProviders()
  const syncPreviewMut = useUserSyncPreview()
  const syncExecuteMut = useUserSyncExecute()
  const { data: groupsList } = useGroups()

  const targetInfo = useMemo(
    () => targets?.find((ti) => ti.key === targetObject),
    [targets, targetObject],
  )
  const targetFields: TargetFieldDef[] = targetInfo?.fields ?? []

  const fileInputRef = useRef<HTMLInputElement>(null)
  const rawFileRef = useRef<File | null>(null)

  // All headers = file headers + virtual columns
  const allHeaders = useMemo(() => {
    if (!parsedFile) return []
    return [...parsedFile.headers, ...virtualColumns]
  }, [parsedFile, virtualColumns])

  const reset = useCallback(() => {
    setStep(0); setParsedFile(null); setColumnMapping({}); setTransforms({})
    setConfidence({}); setDupStrategy('skip'); setPreviewResult(null); setImportResult(null)
    setShowSaveMapping(false); setMappingName(''); setMappingDesc(''); setErrorsOnly(false)
    setEncoding('utf-8'); setAutoImportMapping(null); setEditingTransform(null)
    setVirtualColumns([]); setVirtualCounter(0); setDedupFields([]); setDedupCount(0)
    rawFileRef.current = null
    // External sync reset
    setImportSource(null); setSelectedProvider(null); setSyncPreview(null)
    setSyncSelectedEmails(new Set()); setSyncGroupMapping({}); setSyncDupStrategy('skip')
    setSyncResult(null); setSyncStep(0)
  }, [])

  const handleClose = useCallback(() => { reset(); onClose() }, [reset, onClose])

  // ── File parsing ────────────────────────────────────────────

  const parseFileWithEncoding = useCallback(async (file: File, enc: string): Promise<ParsedFile | null> => {
    const ext = file.name.split('.').pop()?.toLowerCase()
    rawFileRef.current = file

    if (ext === 'csv' || ext === 'tsv') {
      const Papa = await import('papaparse')
      const buf = await file.arrayBuffer()
      const decoder = new TextDecoder(enc)
      const text = decoder.decode(buf)
      const result = Papa.parse(text, { header: true, skipEmptyLines: true })
      const headers = result.meta.fields ?? []
      return { fileName: file.name, fileSize: file.size, sheets: [], selectedSheet: '', headers, rows: result.data as Record<string, unknown>[] }
    }

    if (ext === 'xlsx' || ext === 'xls' || ext === 'ods') {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheetNames = wb.SheetNames
      const firstSheet = sheetNames[0]
      const ws = wb.Sheets[firstSheet]
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      const headers = data.length > 0 ? Object.keys(data[0]) : []
      return { fileName: file.name, fileSize: file.size, sheets: sheetNames, selectedSheet: firstSheet, headers, rows: data }
    }

    if (ext === 'json') {
      const buf = await file.arrayBuffer()
      const decoder = new TextDecoder(enc)
      const text = decoder.decode(buf)
      let parsed: unknown = JSON.parse(text)
      // Support array of objects or { data: [...] }
      if (!Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>
        const arrKey = Object.keys(obj).find((k) => Array.isArray(obj[k]))
        parsed = arrKey ? obj[arrKey] : [obj]
      }
      const arr = (parsed as Record<string, unknown>[]).filter((r) => r && typeof r === 'object')
      const headers = arr.length > 0 ? Object.keys(arr[0]) : []
      return { fileName: file.name, fileSize: file.size, sheets: [], selectedSheet: '', headers, rows: arr }
    }

    return null
  }, [])

  const handleFile = useCallback(async (file: File) => {
    const parsed = await parseFileWithEncoding(file, encoding)
    if (!parsed) return
    setParsedFile(parsed)
    setColumnMapping({}); setTransforms({}); setConfidence({})
    setAutoImportMapping(null); setVirtualColumns([]); setVirtualCounter(0)
    if (savedMappings) {
      const match = findMatchingMapping(parsed.headers, savedMappings)
      if (match) setAutoImportMapping(match)
    }
  }, [encoding, parseFileWithEncoding, savedMappings])

  const handleEncodingChange = useCallback(async (enc: string) => {
    setEncoding(enc)
    const file = rawFileRef.current
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'csv' && ext !== 'tsv' && ext !== 'json') return
    const parsed = await parseFileWithEncoding(file, enc)
    if (parsed) { setParsedFile(parsed); setColumnMapping({}); setTransforms({}); setConfidence({}) }
  }, [parseFileWithEncoding])

  const handleSheetChange = useCallback(async (sheetName: string) => {
    const file = rawFileRef.current
    if (!file) return
    const XLSX = await import('xlsx')
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    const headers = data.length > 0 ? Object.keys(data[0]) : []
    setParsedFile((prev) => prev ? { ...prev, selectedSheet: sheetName, headers, rows: data } : null)
    setColumnMapping({}); setTransforms({}); setConfidence({}); setAutoImportMapping(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  // ── Virtual columns ─────────────────────────────────────────

  const addVirtualColumn = useCallback(() => {
    const n = virtualCounter + 1
    const key = VIRTUAL_PREFIX + n
    setVirtualColumns((prev) => [...prev, key])
    setVirtualCounter(n)
    // Default: no mapping, but open transform editor
    setEditingTransform(key)
  }, [virtualCounter])

  const removeVirtualColumn = useCallback((key: string) => {
    setVirtualColumns((prev) => prev.filter((v) => v !== key))
    setColumnMapping((prev) => { const n = { ...prev }; delete n[key]; return n })
    setTransforms((prev) => { const n = { ...prev }; delete n[key]; return n })
    if (editingTransform === key) setEditingTransform(null)
  }, [editingTransform])

  // ── Deduplication ────────────────────────────────────────────

  const applyDedup = useCallback(() => {
    if (!parsedFile || dedupFields.length === 0) return
    const seen = new Set<string>()
    const unique: Record<string, unknown>[] = []
    for (const row of parsedFile.rows) {
      const key = dedupFields.map((f) => String(row[f] ?? '')).join('||')
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(row)
      }
    }
    const removed = parsedFile.rows.length - unique.length
    setDedupCount(removed)
    setParsedFile((prev) => prev ? { ...prev, rows: unique } : null)
  }, [parsedFile, dedupFields])

  const addDedupField = useCallback((field: string) => {
    if (field && !dedupFields.includes(field)) setDedupFields((prev) => [...prev, field])
  }, [dedupFields])

  const removeDedupField = useCallback((field: string) => {
    setDedupFields((prev) => prev.filter((f) => f !== field))
    setDedupCount(0)
  }, [])

  // ── Auto-import ─────────────────────────────────────────────

  const handleAutoImport = useCallback(() => {
    if (!parsedFile || !autoImportMapping) return
    const mapping = autoImportMapping
    const trMap = (mapping.transforms ?? {}) as Record<string, ColumnTransform>
    const transformedRows = applyAllTransforms(parsedFile.rows, mapping.column_mapping, trMap)
    executeMut.mutate(
      { target_object: targetObject, column_mapping: mapping.column_mapping, rows: transformedRows, duplicate_strategy: dupStrategy, mapping_id: mapping.id },
      { onSuccess: (result) => { setImportResult(result); setStep(3); onImportComplete?.() } },
    )
  }, [parsedFile, autoImportMapping, targetObject, dupStrategy, executeMut, onImportComplete])

  // ── Step 2 ──────────────────────────────────────────────────

  const handleAutoDetect = useCallback(() => {
    if (!parsedFile) return
    autoDetect.mutate(
      { targetObject, fileHeaders: parsedFile.headers },
      { onSuccess: (result) => { setColumnMapping(result.suggested_mapping); setConfidence(result.confidence) } },
    )
  }, [autoDetect, parsedFile, targetObject])

  const handleLoadMapping = useCallback((mapping: ImportMapping) => {
    setColumnMapping(mapping.column_mapping)
    if (mapping.transforms) setTransforms(mapping.transforms as Record<string, ColumnTransform>)
    setConfidence({})
  }, [])

  const handleSaveMapping = useCallback(() => {
    if (!mappingName.trim() || !parsedFile) return
    saveMappingMut.mutate(
      {
        name: mappingName.trim(), description: mappingDesc.trim() || undefined,
        target_object: targetObject, column_mapping: columnMapping,
        transforms: Object.keys(transforms).length > 0 ? transforms : undefined,
        file_headers: parsedFile.headers,
      },
      { onSuccess: () => { setShowSaveMapping(false); setMappingName(''); setMappingDesc('') } },
    )
  }, [saveMappingMut, mappingName, mappingDesc, targetObject, columnMapping, transforms, parsedFile])

  // ── Step 3 & 4 ─────────────────────────────────────────────

  const handleValidate = useCallback(() => {
    if (!parsedFile) return
    const transformedRows = applyAllTransforms(parsedFile.rows.slice(0, 100), columnMapping, transforms)
    validateMut.mutate(
      { target_object: targetObject, column_mapping: columnMapping, rows: transformedRows, duplicate_strategy: dupStrategy },
      { onSuccess: (result) => setPreviewResult(result) },
    )
  }, [validateMut, parsedFile, targetObject, columnMapping, transforms, dupStrategy])

  const handleExecute = useCallback(() => {
    if (!parsedFile) return
    const transformedRows = applyAllTransforms(parsedFile.rows, columnMapping, transforms)
    executeMut.mutate(
      { target_object: targetObject, column_mapping: columnMapping, rows: transformedRows, duplicate_strategy: dupStrategy },
      { onSuccess: (result) => { setImportResult(result); onImportComplete?.() } },
    )
  }, [executeMut, parsedFile, targetObject, columnMapping, transforms, dupStrategy, onImportComplete])

  const downloadErrorReport = useCallback(async () => {
    if (!importResult?.errors.length) return
    const Papa = await import('papaparse')
    const { saveAs } = await import('file-saver')
    const csv = Papa.unparse(importResult.errors.map((e) => ({ ligne: e.row_index + 1, champ: e.field, message: e.message, severite: e.severity })))
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    saveAs(blob, 'import-errors.csv')
  }, [importResult])

  // ── External sync handlers ─────────────────────────────────

  const handleSyncFetchPreview = useCallback(() => {
    if (!selectedProvider) return
    syncPreviewMut.mutate(selectedProvider, {
      onSuccess: (data) => {
        setSyncPreview(data)
        // Auto-select all new users
        const newEmails = new Set(data.users.filter(u => !u.already_exists).map(u => u.email))
        setSyncSelectedEmails(newEmails)
        // Init group mapping from all unique groups
        const allGroups = new Set(data.users.flatMap(u => u.groups))
        const mapping: Record<string, string | null> = {}
        allGroups.forEach(g => { mapping[g] = null })
        setSyncGroupMapping(mapping)
        setSyncStep(1)
      },
    })
  }, [selectedProvider, syncPreviewMut])

  const handleSyncToggleUser = useCallback((email: string) => {
    setSyncSelectedEmails(prev => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email); else next.add(email)
      return next
    })
  }, [])

  const handleSyncSelectAllNew = useCallback(() => {
    if (!syncPreview) return
    const newEmails = syncPreview.users.filter(u => !u.already_exists).map(u => u.email)
    setSyncSelectedEmails(new Set(newEmails))
  }, [syncPreview])

  const handleSyncExecute = useCallback(() => {
    if (!selectedProvider || syncSelectedEmails.size === 0) return
    syncExecuteMut.mutate({
      provider: selectedProvider,
      selected_emails: Array.from(syncSelectedEmails),
      group_mapping: Object.entries(syncGroupMapping).map(([source_group, target_group_id]) => ({
        source_group,
        target_group_id,
      })),
      duplicate_strategy: syncDupStrategy,
    }, {
      onSuccess: (result) => {
        setSyncResult(result)
        setSyncStep(3)
        onImportComplete?.()
      },
    })
  }, [selectedProvider, syncSelectedEmails, syncGroupMapping, syncDupStrategy, syncExecuteMut, onImportComplete])

  // ── Navigation ──────────────────────────────────────────────

  const canGoNext = useMemo(() => {
    if (step === 0) return !!parsedFile
    if (step === 1) return Object.keys(columnMapping).length > 0
    if (step === 2) return !!previewResult
    return false
  }, [step, parsedFile, columnMapping, previewResult])

  const goNext = useCallback(() => {
    if (step === 1) { setStep(2); setTimeout(handleValidate, 100); return }
    if (step === 2) { setStep(3); setTimeout(handleExecute, 100); return }
    setStep((s) => Math.min(s + 1, 3) as Step)
  }, [step, handleValidate, handleExecute])

  const goBack = useCallback(() => {
    if (step === 2) setPreviewResult(null)
    setStep((s) => Math.max(s - 1, 0) as Step)
  }, [step])

  const mappedTargetFields = useMemo(() => new Set(Object.values(columnMapping)), [columnMapping])
  const missingRequired = useMemo(
    () => targetFields.filter((f) => f.required && !mappedTargetFields.has(f.key)),
    [targetFields, mappedTargetFields],
  )

  // ── Render ──────────────────────────────────────────────────

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-black/40 backdrop-blur-sm animate-in fade-in" />
        <Dialog.Content className={cn(
          'fixed left-1/2 top-1/2 z-[var(--z-modal)] -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-card shadow-xl animate-in fade-in slide-in-from-bottom-4 max-h-[90vh] flex flex-col',
          // Wider when transform panel is open
          editingTransform && step === 1 ? 'w-[95vw] max-w-6xl' : 'w-[95vw] max-w-4xl',
        )}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
            <div className="flex items-center gap-3">
              <FileSpreadsheet size={18} className="text-primary" />
              <Dialog.Title className="text-sm font-semibold">{t('import.wizard_title')}</Dialog.Title>
              <span className="text-xs text-muted-foreground">— {t(`import.targets.${targetObject}`)}</span>
            </div>
            <Dialog.Close asChild>
              <button className="gl-button gl-button-default"><X size={16} /></button>
            </Dialog.Close>
          </div>

          {/* ── External sync flow ── */}
          {supportsExternalSync && importSource === 'external' ? (
            <>
              {/* Stepper for external flow */}
              <div className="flex items-center gap-1 px-6 py-3 border-b bg-muted/30 shrink-0">
                {(['source', 'preview', 'groups', 'result'] as const).map((sk, i) => {
                  const labels = [t('import.sync.source_title'), t('import.step_preview'), t('import.sync.group_mapping'), t('import.step_report')]
                  return (
                    <div key={sk} className="flex items-center gap-1">
                      <div className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                        i === syncStep ? 'bg-primary text-primary-foreground' :
                        i < syncStep ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                      )}>
                        <span className="w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-bold bg-white/20">{i + 1}</span>
                        {labels[i]}
                      </div>
                      {i < 3 && <ChevronRight size={12} className="text-muted-foreground/40" />}
                    </div>
                  )
                })}
              </div>

              {/* External sync content */}
              <div className="flex-1 overflow-auto min-h-[350px]">
                {syncStep === 0 && (
                  <div className="px-6 py-4 space-y-4">
                    <p className="text-sm font-medium">{t('import.sync.select_provider')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(syncProviders ?? []).map(prov => (
                        <button
                          key={prov.id}
                          disabled={!prov.configured}
                          onClick={() => setSelectedProvider(prov.id)}
                          className={cn(
                            'flex items-center gap-3 p-4 rounded-lg border text-left transition-colors',
                            selectedProvider === prov.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-accent',
                            !prov.configured && 'opacity-50 cursor-not-allowed',
                          )}
                        >
                          <Globe size={20} className={cn(selectedProvider === prov.id ? 'text-primary' : 'text-muted-foreground')} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{prov.label}</p>
                            {!prov.configured ? (
                              <p className="text-xs text-destructive">{t('import.sync.not_configured')}</p>
                            ) : prov.last_sync_at ? (
                              <p className="text-xs text-muted-foreground">{t('import.sync.last_sync')}: {new Date(prov.last_sync_at).toLocaleDateString()}</p>
                            ) : null}
                          </div>
                          {selectedProvider === prov.id && <CheckCircle2 size={16} className="text-primary shrink-0" />}
                        </button>
                      ))}
                    </div>
                    {selectedProvider && !(syncProviders ?? []).find(p => p.id === selectedProvider)?.configured && (
                      <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-700">
                        <AlertTriangle size={14} className="shrink-0" />
                        <span>
                          {t('import.sync.configure_first')}{' '}
                          <a
                            href="/settings#integrations"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline font-medium hover:text-amber-900"
                          >
                            Paramètres → Intégrations
                          </a>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {syncStep === 1 && syncPreview && (
                  <div className="px-6 py-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{t('import.sync.preview_title', { provider: selectedProvider })}</p>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-green-600">{t('import.sync.new_users', { count: syncPreview.new_count })}</span>
                        <span className="text-muted-foreground">{t('import.sync.existing_users', { count: syncPreview.existing_count })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <button onClick={handleSyncSelectAllNew} className="gl-button gl-button-sm gl-button-default">
                        {t('import.sync.select_all_new')}
                      </button>
                      <span className="text-xs text-muted-foreground">{syncSelectedEmails.size} selected</span>
                    </div>
                    <div className="border rounded max-h-[340px] overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 sticky top-0">
                          <tr>
                            <th className="w-8 px-2 py-2" />
                            <th className="px-2 py-2 text-left font-medium">{t('users.first_name')}</th>
                            <th className="px-2 py-2 text-left font-medium">{t('users.last_name')}</th>
                            <th className="px-2 py-2 text-left font-medium">{t('auth.email')}</th>
                            <th className="px-2 py-2 text-left font-medium">{t('common.status')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {syncPreview.users.map(u => (
                            <tr key={u.external_ref} className={cn('hover:bg-accent/50', u.already_exists && 'opacity-60')}>
                              <td className="px-2 py-1.5 text-center">
                                <input type="checkbox" checked={syncSelectedEmails.has(u.email)}
                                  onChange={() => handleSyncToggleUser(u.email)}
                                  className="rounded border-input" />
                              </td>
                              <td className="px-2 py-1.5">{u.first_name}</td>
                              <td className="px-2 py-1.5">{u.last_name}</td>
                              <td className="px-2 py-1.5">{u.email}</td>
                              <td className="px-2 py-1.5">
                                {u.already_exists ? (
                                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 text-[10px]">exists</span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 text-[10px]">new</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Duplicate strategy for existing */}
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-medium">{t('import.duplicate_strategy')}:</label>
                      <select value={syncDupStrategy} onChange={e => setSyncDupStrategy(e.target.value as 'skip' | 'update')}
                        className="gl-form-input text-xs px-2 py-1 rounded border">
                        <option value="skip">{t('import.duplicate_skip')}</option>
                        <option value="update">{t('import.duplicate_update')}</option>
                      </select>
                    </div>
                  </div>
                )}

                {syncStep === 2 && syncPreview && (
                  <div className="px-6 py-4 space-y-4">
                    <p className="text-sm font-medium">{t('import.sync.group_mapping')}</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      {t('import.sync.group_mapping')}
                    </p>
                    {Object.keys(syncGroupMapping).length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">{t('import.sync.no_mapping')}</p>
                    ) : (
                      <div className="border rounded overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">{t('import.sync.source_group')}</th>
                              <th className="px-3 py-2 text-left font-medium">{t('import.sync.target_group')}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {Object.entries(syncGroupMapping).map(([srcGroup, targetId]) => (
                              <tr key={srcGroup}>
                                <td className="px-3 py-2 font-mono">{srcGroup}</td>
                                <td className="px-3 py-2">
                                  <select
                                    value={targetId ?? ''}
                                    onChange={e => setSyncGroupMapping(prev => ({ ...prev, [srcGroup]: e.target.value || null }))}
                                    className="gl-form-input text-xs px-2 py-1 rounded border w-full"
                                  >
                                    <option value="">{t('import.sync.no_mapping')}</option>
                                    {(groupsList?.items ?? []).map(g => (
                                      <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {syncStep === 3 && (
                  <div className="px-6 py-4 space-y-4">
                    {syncExecuteMut.isPending ? (
                      <div className="flex flex-col items-center gap-3 py-10">
                        <Loader2 size={28} className="animate-spin text-primary" />
                        <p className="text-sm text-muted-foreground">{t('import.sync.importing')}</p>
                      </div>
                    ) : syncResult ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 size={20} className="text-green-600" />
                          <p className="text-sm font-medium">
                            {t('import.sync.import_result', {
                              created: syncResult.created,
                              updated: syncResult.updated,
                              skipped: syncResult.skipped,
                            })}
                          </p>
                        </div>
                        {syncResult.errors.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-destructive">{t('import.errors', { count: syncResult.errors.length })}</p>
                            <ul className="text-xs text-destructive/80 list-disc pl-4 space-y-0.5">
                              {syncResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              {/* External sync footer */}
              <div className="flex items-center justify-between px-6 py-3 border-t shrink-0">
                <div>
                  {syncStep > 0 && syncStep < 3 && (
                    <button onClick={() => setSyncStep(s => Math.max(0, s - 1) as 0 | 1 | 2 | 3)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded border hover:bg-accent">
                      <ChevronLeft size={12} /> {t('import.previous')}
                    </button>
                  )}
                  {syncStep === 0 && (
                    <button onClick={() => { setImportSource(null); setSelectedProvider(null) }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs rounded border hover:bg-accent">
                      <ChevronLeft size={12} /> {t('import.previous')}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {syncStep < 3 && (
                    <button onClick={handleClose} className="gl-button-sm gl-button-default">{t('import.cancel')}</button>
                  )}
                  {syncStep === 0 && (
                    <button onClick={handleSyncFetchPreview}
                      disabled={!selectedProvider || syncPreviewMut.isPending || !(syncProviders ?? []).find(p => p.id === selectedProvider)?.configured}
                      className="gl-button-sm gl-button-primary">
                      {syncPreviewMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
                      {syncPreviewMut.isPending ? t('import.sync.fetching') : t('import.sync.fetch_users')}
                    </button>
                  )}
                  {syncStep === 1 && (
                    <button onClick={() => setSyncStep(2)} disabled={syncSelectedEmails.size === 0}
                      className="gl-button-sm gl-button-primary">
                      {t('import.next')} <ChevronRight size={12} />
                    </button>
                  )}
                  {syncStep === 2 && (
                    <button onClick={handleSyncExecute} disabled={syncSelectedEmails.size === 0 || syncExecuteMut.isPending}
                      className="gl-button-sm gl-button-primary">
                      {syncExecuteMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                      {t('import.import_button')}
                    </button>
                  )}
                  {syncStep === 3 && (
                    <button onClick={handleClose}
                      className="gl-button-sm gl-button-primary">
                      {t('import.finish')}
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : supportsExternalSync && importSource === null ? (
            <>
              {/* Source selection step */}
              <div className="flex-1 overflow-auto min-h-[350px]">
                <div className="px-6 py-6 space-y-4">
                  <p className="text-sm font-medium">{t('import.sync.source_title')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button
                      onClick={() => setImportSource('file')}
                      className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed hover:border-primary/50 hover:bg-accent/50 transition-colors"
                    >
                      <FileSpreadsheet size={32} className="text-muted-foreground" />
                      <span className="text-sm font-medium">{t('import.sync.source_file')}</span>
                      <span className="text-xs text-muted-foreground">{t('import.accepted_formats')}</span>
                    </button>
                    <button
                      onClick={() => setImportSource('external')}
                      className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed hover:border-primary/50 hover:bg-accent/50 transition-colors"
                    >
                      <Globe size={32} className="text-muted-foreground" />
                      <span className="text-sm font-medium">{t('import.sync.source_external')}</span>
                      <span className="text-xs text-muted-foreground">LDAP, Azure AD, GouTi, Okta, Keycloak</span>
                    </button>
                  </div>
                </div>
              </div>
              {/* Source selection footer */}
              <div className="flex items-center justify-end px-6 py-3 border-t shrink-0">
                <button onClick={handleClose} className="gl-button-sm gl-button-default">{t('import.cancel')}</button>
              </div>
            </>
          ) : (
            <>
              {/* Normal file import stepper */}
              <div className="flex items-center gap-1 px-6 py-3 border-b bg-muted/30 shrink-0">
                {STEPS.map((sk, i) => (
                  <div key={sk} className="flex items-center gap-1">
                    <div className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                      i === step ? 'bg-primary text-primary-foreground' :
                      i < step ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                    )}>
                      <span className="w-4 h-4 flex items-center justify-center rounded-full text-[10px] font-bold bg-white/20">{i + 1}</span>
                      {t(`import.${sk}`)}
                    </div>
                    {i < STEPS.length - 1 && <ChevronRight size={12} className="text-muted-foreground/40" />}
                  </div>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto min-h-[350px]">
                {step === 0 && (
                  <div className="px-6 py-4">
                    <StepUpload parsedFile={parsedFile} encoding={encoding} autoImportMapping={autoImportMapping}
                      isAutoImporting={executeMut.isPending} onFile={handleFile} onSheetChange={handleSheetChange}
                      onDrop={handleDrop} onEncodingChange={handleEncodingChange} onAutoImport={handleAutoImport}
                      onDismissAutoImport={() => setAutoImportMapping(null)} fileInputRef={fileInputRef} t={t} />
                  </div>
                )}

                {step === 1 && parsedFile && (
                  <div className="flex h-full">
                    {/* Left: mapping table */}
                    <div className={cn(
                      'flex-1 overflow-auto px-6 py-4 border-r',
                      editingTransform ? 'min-w-0' : '',
                    )}>
                      <StepMapping
                        allHeaders={allHeaders} targetFields={targetFields} columnMapping={columnMapping}
                        transforms={transforms} confidence={confidence} dupStrategy={dupStrategy}
                        missingRequired={missingRequired} mappedTargetFields={mappedTargetFields}
                        savedMappings={savedMappings ?? []} showSaveMapping={showSaveMapping}
                        mappingName={mappingName} mappingDesc={mappingDesc} isAutoDetecting={autoDetect.isPending}
                        editingTransform={editingTransform} sampleRow={parsedFile.rows[0]}
                        virtualColumns={virtualColumns}
                        onMappingChange={(h, f) => setColumnMapping((prev) => {
                          const next = { ...prev }; if (f) next[h] = f; else delete next[h]; return next
                        })}
                        onEditTransform={setEditingTransform}
                        onDupStrategyChange={setDupStrategy}
                        onAutoDetect={handleAutoDetect} onLoadMapping={handleLoadMapping}
                        onToggleSaveMapping={() => setShowSaveMapping(!showSaveMapping)}
                        onMappingNameChange={setMappingName} onMappingDescChange={setMappingDesc}
                        onSaveMapping={handleSaveMapping} isSaving={saveMappingMut.isPending}
                        onAddVirtual={addVirtualColumn} onRemoveVirtual={removeVirtualColumn}
                        fileHeaders={parsedFile.headers}
                        dedupFields={dedupFields} dedupCount={dedupCount}
                        onAddDedupField={addDedupField} onRemoveDedupField={removeDedupField}
                        onApplyDedup={applyDedup}
                        t={t}
                      />
                    </div>
                    {/* Right: transform panel */}
                    {editingTransform && (
                      <div className="w-[320px] shrink-0 overflow-auto p-4 bg-muted/20">
                        <TransformEditor
                          header={editingTransform}
                          allHeaders={parsedFile.headers}
                          isVirtual={editingTransform.startsWith(VIRTUAL_PREFIX)}
                          current={transforms[editingTransform] ?? { type: 'none' }}
                          sampleValue={parsedFile.rows[0] ? String(parsedFile.rows[0][editingTransform] ?? '') : ''}
                          sampleRow={parsedFile.rows[0]}
                          onChange={(tr) => setTransforms((prev) => {
                            const next = { ...prev }; if (tr && tr.type !== 'none') next[editingTransform] = tr; else delete next[editingTransform]; return next
                          })}
                          onClose={() => setEditingTransform(null)}
                          t={t}
                        />
                      </div>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div className="px-6 py-4">
                    <StepPreview previewResult={previewResult} isValidating={validateMut.isPending}
                      errorsOnly={errorsOnly} onErrorsOnlyChange={setErrorsOnly}
                      columnMapping={columnMapping} targetFields={targetFields} t={t} />
                  </div>
                )}
                {step === 3 && (
                  <div className="px-6 py-4">
                    <StepReport importResult={importResult} isExecuting={executeMut.isPending}
                      onDownloadErrors={downloadErrorReport} t={t} />
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-3 border-t shrink-0">
                <div>
                  {step === 0 && supportsExternalSync && (
                    <button onClick={() => setImportSource(null)}
                      className="gl-button-sm gl-button-default">
                      <ChevronLeft size={12} /> {t('import.previous')}
                    </button>
                  )}
                  {step > 0 && step < 3 && (
                    <button onClick={goBack} className="gl-button-sm gl-button-default">
                      <ChevronLeft size={12} /> {t('import.previous')}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {step < 3 && (
                    <button onClick={handleClose} className="gl-button-sm gl-button-default">{t('import.cancel')}</button>
                  )}
                  {step < 2 && (
                    <button onClick={goNext} disabled={!canGoNext}
                      className="gl-button-sm gl-button-primary">
                      {t('import.next')} <ChevronRight size={12} />
                    </button>
                  )}
                  {step === 2 && (
                    <button onClick={goNext} disabled={!previewResult || validateMut.isPending}
                      className="gl-button-sm gl-button-primary">
                      {t('import.import_button')} <Upload size={12} />
                    </button>
                  )}
                  {step === 3 && (
                    <button onClick={handleClose}
                      className="gl-button-sm gl-button-primary">
                      {t('import.finish')}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}


// ── Step 1: File Upload ───────────────────────────────────────

function StepUpload({ parsedFile, encoding, autoImportMapping, isAutoImporting, onFile, onSheetChange, onDrop, onEncodingChange, onAutoImport, onDismissAutoImport, fileInputRef, t }: {
  parsedFile: ParsedFile | null; encoding: string; autoImportMapping: ImportMapping | null; isAutoImporting: boolean
  onFile: (f: File) => void; onSheetChange: (s: string) => void; onDrop: (e: React.DragEvent) => void
  onEncodingChange: (enc: string) => void; onAutoImport: () => void; onDismissAutoImport: () => void
  fileInputRef: React.RefObject<HTMLInputElement | null>; t: (k: string, o?: Record<string, unknown>) => string
}) {
  const isTextFile = parsedFile?.fileName?.match(/\.(csv|tsv|json)$/i)

  return (
    <div className="space-y-4">
      {autoImportMapping && parsedFile && (
        <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded">
          <CheckCircle2 size={16} className="text-green-600 shrink-0" />
          <div className="flex-1 text-xs">
            <p className="font-medium text-green-700">{t('import.template_recognized')} : &laquo;{autoImportMapping.name}&raquo;</p>
            <p className="text-green-600/80 mt-0.5">{t('import.template_match_msg')}</p>
          </div>
          <button onClick={onAutoImport} disabled={isAutoImporting}
            className="gl-button gl-button-sm gl-button-confirm flex text-white">
            {isAutoImporting ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {t('import.import_now')}
          </button>
          <button onClick={onDismissAutoImport} className="gl-button gl-button-confirm text-green-600" title={t('import.customize')}><X size={14} /></button>
        </div>
      )}
      <div onDragOver={(e) => e.preventDefault()} onDrop={onDrop} onClick={() => fileInputRef.current?.click()}
        className={cn('border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors',
          parsedFile ? 'border-primary/30 bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/50')}>
        <input ref={fileInputRef as React.RefObject<HTMLInputElement>} type="file" accept={ACCEPTED_EXTENSIONS} className="hidden"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file) }} />
        {parsedFile ? (
          <div className="space-y-2">
            <FileSpreadsheet size={32} className="mx-auto text-primary" />
            <p className="text-sm font-medium">{parsedFile.fileName}</p>
            <p className="text-xs text-muted-foreground">{(parsedFile.fileSize / 1024).toFixed(1)} Ko — {t('import.file_info', { rows: parsedFile.rows.length, cols: parsedFile.headers.length })}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload size={32} className="mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('import.drop_file')}</p>
            <p className="text-xs text-muted-foreground/60">{t('import.or_click')}</p>
            <p className="text-[10px] text-muted-foreground/40">CSV, TSV, XLSX, XLS, ODS, JSON</p>
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">{t('import.encoding')}:</label>
          <select value={encoding} onChange={(e) => onEncodingChange(e.target.value)}
            disabled={!!parsedFile && !isTextFile} className="text-xs border rounded px-2 py-1 bg-background disabled:opacity-50">
            {ENCODINGS.map((enc) => <option key={enc.value} value={enc.value}>{enc.label}</option>)}
          </select>
        </div>
        {parsedFile && parsedFile.sheets.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">{t('import.select_sheet')}:</label>
            <select value={parsedFile.selectedSheet} onChange={(e) => onSheetChange(e.target.value)} className="text-xs border rounded px-2 py-1 bg-background">
              {parsedFile.sheets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}
      </div>
      {parsedFile && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{t('import.file_column')}s :</p>
          <div className="flex flex-wrap gap-1">
            {parsedFile.headers.map((h) => <span key={h} className="px-2 py-0.5 bg-muted rounded text-[11px] font-mono">{h}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}


// ── Step 2: Column Mapping ────────────────────────────────────

function StepMapping({ allHeaders, targetFields, columnMapping, transforms, confidence, dupStrategy, missingRequired, mappedTargetFields, savedMappings, showSaveMapping, mappingName, mappingDesc, isAutoDetecting, editingTransform, sampleRow, virtualColumns: _vc, onMappingChange, onEditTransform, onDupStrategyChange, onAutoDetect, onLoadMapping, onToggleSaveMapping, onMappingNameChange, onMappingDescChange, onSaveMapping, isSaving, onAddVirtual, onRemoveVirtual, fileHeaders, dedupFields, dedupCount, onAddDedupField, onRemoveDedupField, onApplyDedup, t }: {
  allHeaders: string[]; targetFields: TargetFieldDef[]; columnMapping: Record<string, string>
  transforms: Record<string, ColumnTransform>; confidence: Record<string, number>; dupStrategy: DuplicateStrategy
  missingRequired: TargetFieldDef[]; mappedTargetFields: Set<string>; savedMappings: ImportMapping[]
  showSaveMapping: boolean; mappingName: string; mappingDesc: string; isAutoDetecting: boolean
  editingTransform: string | null; sampleRow?: Record<string, unknown>; virtualColumns: string[]
  onMappingChange: (h: string, f: string | null) => void
  onEditTransform: (h: string | null) => void; onDupStrategyChange: (s: DuplicateStrategy) => void
  onAutoDetect: () => void; onLoadMapping: (m: ImportMapping) => void; onToggleSaveMapping: () => void
  onMappingNameChange: (v: string) => void; onMappingDescChange: (v: string) => void; onSaveMapping: () => void
  isSaving: boolean; onAddVirtual: () => void; onRemoveVirtual: (k: string) => void
  fileHeaders: string[]; dedupFields: string[]; dedupCount: number
  onAddDedupField: (f: string) => void; onRemoveDedupField: (f: string) => void; onApplyDedup: () => void
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onAutoDetect} disabled={isAutoDetecting}
          className="gl-button gl-button-sm gl-button-default flex">
          {isAutoDetecting ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
          {t('import.auto_detect')}
        </button>
        {savedMappings.length > 0 && (
          <select onChange={(e) => { const m = savedMappings.find((s) => s.id === e.target.value); if (m) onLoadMapping(m) }}
            defaultValue="" className="text-xs border rounded px-2 py-1.5 bg-background">
            <option value="" disabled>{t('import.load_mapping')}</option>
            {savedMappings.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <button onClick={onAddVirtual} className="gl-button-sm gl-button-default"
          title={t('import.add_computed_column')}>
          <Plus size={12} /> <Calculator size={12} /> {t('import.add_computed_column')}
        </button>
        <button onClick={onToggleSaveMapping} className="gl-button-sm gl-button-default ml-auto">
          <Save size={12} /> {t('import.save_mapping')}
        </button>
      </div>

      {showSaveMapping && (
        <div className="flex items-end gap-2 p-3 bg-muted/50 rounded border">
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground">{t('import.mapping_name')}</label>
            <input value={mappingName} onChange={(e) => onMappingNameChange(e.target.value)}
              className="w-full text-xs border rounded px-2 py-1 bg-background" placeholder="Mon mapping tiers..." />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground">{t('import.mapping_description')}</label>
            <input value={mappingDesc} onChange={(e) => onMappingDescChange(e.target.value)}
              className="w-full text-xs border rounded px-2 py-1 bg-background" />
          </div>
          <button onClick={onSaveMapping} disabled={!mappingName.trim() || isSaving}
            className="gl-button gl-button-sm gl-button-confirm">
            {isSaving ? <Loader2 size={12} className="animate-spin" /> : t('common.save')}
          </button>
        </div>
      )}

      {missingRequired.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-700">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div><span className="font-medium">{t('import.required_missing')} : </span>{missingRequired.map((f) => f.label).join(', ')}</div>
        </div>
      )}

      {/* Mapping table */}
      <div className="border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('import.file_column')}</th>
              <th className="text-center px-1 py-2 w-6"></th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t('import.target_field')}</th>
              <th className="text-center px-3 py-2 font-medium text-muted-foreground w-24">{t('import.transform_col')}</th>
              <th className="text-center px-2 py-2 font-medium text-muted-foreground w-10">%</th>
            </tr>
          </thead>
          <tbody>
            {allHeaders.map((h) => {
              const isVirtual = h.startsWith(VIRTUAL_PREFIX)
              const mapped = columnMapping[h]
              const conf = confidence[h]
              const transform = transforms[h]
              const hasTransform = transform && transform.type !== 'none'
              const isEditing = editingTransform === h
              return (
                <tr key={h} className={cn('border-b last:border-0', isEditing && 'bg-primary/5', isVirtual && 'bg-violet-50/50')}>
                  <td className="px-3 py-1.5 font-mono text-[11px]">
                    <div className="flex items-center gap-1.5">
                      {isVirtual ? (
                        <>
                          <Calculator size={11} className="text-violet-500 shrink-0" />
                          <span className="text-violet-600 italic">{t('import.computed_column')} #{h.replace(VIRTUAL_PREFIX, '')}</span>
                          <button onClick={() => onRemoveVirtual(h)} className="ml-1 p-0.5 rounded hover:bg-red-100 text-red-400"><Trash2 size={10} /></button>
                        </>
                      ) : (
                        <>
                          {h}
                          {sampleRow && <span className="text-[9px] text-muted-foreground/60 truncate max-w-[120px] block">ex: {String(sampleRow[h] ?? '').slice(0, 30)}</span>}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="text-center text-muted-foreground/40">→</td>
                  <td className="px-3 py-1.5">
                    <select value={mapped ?? ''} onChange={(e) => onMappingChange(h, e.target.value || null)}
                      className={cn('w-full text-xs border rounded px-2 py-1 bg-background', !mapped && 'text-muted-foreground')}>
                      <option value="">{t('import.unmapped')}</option>
                      {targetFields.map((f) => {
                        const isUsedByOther = mappedTargetFields.has(f.key) && mapped !== f.key
                        if (isUsedByOther) return null
                        return <option key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</option>
                      })}
                    </select>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <button onClick={() => onEditTransform(isEditing ? null : h)}
                      className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors',
                        hasTransform ? 'bg-primary/10 border-primary/30 text-primary' :
                        isVirtual ? 'bg-violet-100 border-violet-300 text-violet-600' : 'hover:bg-accent')}>
                      <Settings2 size={10} />
                      {hasTransform ? t(`import.transform.${transform.type}`).slice(0, 14) : isVirtual ? t('import.configure') : '—'}
                    </button>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {conf != null && (
                      <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded',
                        conf >= 0.8 ? 'bg-green-100 text-green-700' : conf >= 0.5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')}>
                        {Math.round(conf * 100)}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Duplicate strategy */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{t('import.duplicate_strategy')}</p>
        <div className="flex gap-3">
          {(['skip', 'update', 'fail'] as const).map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="radio" name="dupStrategy" checked={dupStrategy === s} onChange={() => onDupStrategyChange(s)} className="accent-primary" />
              {t(`import.duplicate_${s}`)}
            </label>
          ))}
        </div>
      </div>

      {/* File deduplication by field(s) */}
      <div className="space-y-2 p-3 bg-muted/30 rounded border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t('import.dedup_title')}</p>
            <p className="text-[10px] text-muted-foreground/60">{t('import.dedup_help')}</p>
          </div>
          {dedupFields.length > 0 && (
            <button onClick={onApplyDedup}
              className="gl-button gl-button-sm gl-button-confirm flex">
              <Trash2 size={10} /> {t('import.dedup_title')}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select onChange={(e) => { if (e.target.value) { onAddDedupField(e.target.value); e.target.value = '' } }}
            defaultValue="" className="text-xs border rounded px-2 py-1 bg-background">
            <option value="" disabled>{t('import.dedup_select_field')}</option>
            {fileHeaders.filter((h) => !dedupFields.includes(h)).map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          {dedupFields.map((f) => (
            <span key={f} className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 rounded text-[10px] font-mono">
              {f}
              <button onClick={() => onRemoveDedupField(f)} className="hover:text-red-500"><X size={8} /></button>
            </span>
          ))}
        </div>
        {dedupCount > 0 && (
          <p className="text-[10px] text-green-600 font-medium">{t('import.dedup_removed', { count: dedupCount })}</p>
        )}
      </div>
    </div>
  )
}


// ── Transform Editor (right sidebar) ──────────────────────────

function TransformEditor({ header, allHeaders, isVirtual, current, sampleValue, sampleRow, onChange, onClose, t }: {
  header: string; allHeaders: string[]; isVirtual: boolean; current: ColumnTransform; sampleValue: string
  sampleRow?: Record<string, unknown>; onChange: (tr: ColumnTransform) => void; onClose: () => void
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  const [type, setType] = useState(current.type)
  const [params, setParams] = useState(current.params ?? {})
  const updateParams = (patch: Record<string, unknown>) => setParams((prev) => ({ ...prev, ...patch }))

  // For virtual columns: source column selector
  const [sourceColumn, setSourceColumn] = useState(current.params?.sourceColumn ?? '')

  const effectiveValue = useMemo(() => {
    if (isVirtual && sourceColumn && sampleRow) return String(sampleRow[sourceColumn] ?? '')
    return sampleValue
  }, [isVirtual, sourceColumn, sampleRow, sampleValue])

  const effectiveRow = sampleRow ?? {}

  const preview = useMemo(() => {
    try {
      const tr: ColumnTransform = { type, params: { ...params, sourceColumn: sourceColumn || undefined } }
      return String(applyTransform(effectiveValue, tr, effectiveRow))
    } catch { return t('import.transform.error_value') }
  }, [type, params, sourceColumn, effectiveValue, effectiveRow])

  const handleApply = () => {
    const finalParams = { ...params }
    if (isVirtual && sourceColumn) finalParams.sourceColumn = sourceColumn
    onChange({ type, params: Object.keys(finalParams).length > 0 ? finalParams : undefined })
  }

  const needsExponent = type === 'math_func' && (params.mathFunc === 'pow' || params.mathFunc === 'nroot')
  const needsColumns = type === 'math_func' && (params.mathFunc === 'min' || params.mathFunc === 'max')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-primary">
          {isVirtual ? (
            <span className="flex items-center gap-1"><Calculator size={12} /> {t('import.transform.virtual_title')}</span>
          ) : (
            <span>{t('import.transform.title')}</span>
          )}
        </p>
        <button onClick={onClose} className="gl-button gl-button-default"><X size={14} /></button>
      </div>

      {!isVirtual && (
        <p className="text-[10px] text-muted-foreground font-mono bg-muted/50 rounded px-2 py-1 truncate">{header}</p>
      )}

      {/* Virtual: source column */}
      {isVirtual && (
        <div className="space-y-1">
          <label className="text-[10px] font-medium text-muted-foreground">{t('import.transform.source_column')}</label>
          <select value={sourceColumn} onChange={(e) => setSourceColumn(e.target.value)}
            className="w-full text-xs border rounded px-2 py-1 bg-background">
            <option value="">{t('import.transform.source_none')}</option>
            {allHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
      )}

      {/* Type */}
      <div className="space-y-1">
        <label className="text-[10px] font-medium text-muted-foreground">{t('import.transform.type_label')}</label>
        <select value={type} onChange={(e) => { setType(e.target.value as ColumnTransform['type']); setParams({}) }}
          className="w-full text-xs border rounded px-2 py-1 bg-background">
          {TRANSFORM_TYPES.map((k) => <option key={k} value={k}>{t(`import.transform.${k}`)}</option>)}
        </select>
      </div>

      {/* date_format */}
      {type === 'date_format' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">{t('import.transform.date_source_format')}</label>
            <select value={params.dateInputFormat ?? 'DD/MM/YYYY'} onChange={(e) => updateParams({ dateInputFormat: e.target.value })}
              className="w-full text-xs border rounded px-2 py-1 bg-background">
              {DATE_INPUT_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">{t('import.transform.date_target_format')}</label>
            <input value="YYYY-MM-DD" disabled className="w-full text-xs border rounded px-2 py-1 bg-muted text-muted-foreground font-mono" />
            <p className="text-[9px] text-muted-foreground/60">{t('import.transform.date_target_hint')}</p>
          </div>
        </div>
      )}

      {/* concat */}
      {type === 'concat' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">{t('import.transform.add_column')}</label>
            <select onChange={(e) => { if (e.target.value) updateParams({ columns: [...(params.columns ?? []), e.target.value] }); e.target.value = '' }}
              defaultValue="" className="w-full text-xs border rounded px-2 py-1 bg-background">
              <option value="" disabled>{t('import.transform.choose')}</option>
              {allHeaders.filter((h) => h !== header && !(params.columns ?? []).includes(h)).map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          {(params.columns as string[] | undefined)?.length ? (
            <div className="flex flex-wrap gap-1">
              {(params.columns as string[]).map((c: string) => (
                <span key={c} className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 rounded text-[10px]">
                  {c} <button onClick={() => updateParams({ columns: (params.columns as string[]).filter((x: string) => x !== c) })} className="hover:text-red-500"><X size={8} /></button>
                </span>
              ))}
            </div>
          ) : null}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">{t('import.transform.separator')}</label>
            <input value={params.separator ?? ' '} onChange={(e) => updateParams({ separator: e.target.value })} className="w-full text-xs border rounded px-2 py-1 bg-background" />
          </div>
        </div>
      )}

      {/* split */}
      {type === 'split' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">{t('import.transform.delimiter')}</label>
            <input value={params.separator ?? ';'} onChange={(e) => updateParams({ separator: e.target.value })} className="w-full text-xs border rounded px-2 py-1 bg-background" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">{t('import.transform.split_keep_part')}</label>
            <input type="number" min={0} value={params.splitIndex ?? 0} onChange={(e) => updateParams({ splitIndex: parseInt(e.target.value) || 0 })} className="w-full text-xs border rounded px-2 py-1 bg-background" />
          </div>
        </div>
      )}

      {/* arithmetic */}
      {type === 'arithmetic' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">{t('import.transform.operator')}</label>
            <select value={params.operator ?? '+'} onChange={(e) => updateParams({ operator: e.target.value })} className="w-full text-xs border rounded px-2 py-1 bg-background">
              {[{ v: '+', k: 'op_add' }, { v: '-', k: 'op_sub' }, { v: '*', k: 'op_mul' }, { v: '/', k: 'op_div' }].map((op) =>
                <option key={op.v} value={op.v}>{t(`import.transform.${op.k}`)}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">{t('import.transform.with_column')}</label>
            <select value={(params.columns as string[])?.[0] ?? ''} onChange={(e) => updateParams({ columns: e.target.value ? [e.target.value] : [] })} className="w-full text-xs border rounded px-2 py-1 bg-background">
              <option value="">{t('import.transform.constant_option')}</option>
              {allHeaders.filter((h) => h !== header).map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">{t('import.transform.constant')}</label>
            <input type="number" value={params.constant ?? ''} onChange={(e) => updateParams({ constant: parseFloat(e.target.value) || 0, columns: [] })}
              className="w-full text-xs border rounded px-2 py-1 bg-background" disabled={!!(params.columns as string[])?.[0]} />
          </div>
        </div>
      )}

      {/* math_func */}
      {type === 'math_func' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">{t('import.transform.function')}</label>
            <select value={params.mathFunc ?? 'abs'} onChange={(e) => updateParams({ mathFunc: e.target.value })} className="w-full text-xs border rounded px-2 py-1 bg-background">
              {MATH_FUNC_KEYS.map((f) => <option key={f.value} value={f.value}>{f.symbol} — {t(`import.math.${f.value}`)}</option>)}
            </select>
          </div>
          {needsExponent && (
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{params.mathFunc === 'pow' ? t('import.transform.exponent') : t('import.transform.root_degree')}</label>
              <input type="number" value={params.exponent ?? 2} onChange={(e) => updateParams({ exponent: parseFloat(e.target.value) || 2 })} className="w-full text-xs border rounded px-2 py-1 bg-background" />
            </div>
          )}
          {needsColumns && (
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">{t('import.transform.compare_with')}</label>
              <select onChange={(e) => { if (e.target.value) updateParams({ columns: [...(params.columns ?? []), e.target.value] }); e.target.value = '' }}
                defaultValue="" className="w-full text-xs border rounded px-2 py-1 bg-background">
                <option value="" disabled>{t('import.transform.add_column_dots')}</option>
                {allHeaders.filter((h) => h !== header && !(params.columns ?? []).includes(h)).map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
              {(params.columns as string[] | undefined)?.length ? (
                <div className="flex flex-wrap gap-1 mt-1">
                  {(params.columns as string[]).map((c: string) => (
                    <span key={c} className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 rounded text-[10px]">{c}
                      <button onClick={() => updateParams({ columns: (params.columns as string[]).filter((x: string) => x !== c) })} className="hover:text-red-500"><X size={8} /></button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* replace */}
      {type === 'replace' && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">{t('import.transform.search')}</label>
            <input value={params.find ?? ''} onChange={(e) => updateParams({ find: e.target.value })} className="w-full text-xs border rounded px-2 py-1 bg-background" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">{t('import.transform.replace_with')}</label>
            <input value={params.replaceWith ?? ''} onChange={(e) => updateParams({ replaceWith: e.target.value })} className="w-full text-xs border rounded px-2 py-1 bg-background" />
          </div>
        </div>
      )}

      {/* default_value */}
      {type === 'default_value' && (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">{t('import.transform.default_hint')}</label>
          <input value={params.constant ?? ''} onChange={(e) => updateParams({ constant: e.target.value })} className="w-full text-xs border rounded px-2 py-1 bg-background" />
        </div>
      )}

      {/* Preview */}
      {type !== 'none' && (
        <div className="text-[10px] p-2 bg-background rounded border space-y-1">
          <p className="text-muted-foreground font-medium">{t('import.transform.preview_label')} :</p>
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-muted-foreground/60 truncate max-w-[100px]">{effectiveValue || t('import.transform.empty_value')}</span>
            <span className="text-muted-foreground shrink-0">→</span>
            <span className="font-mono font-medium text-primary truncate">{preview}</span>
          </div>
        </div>
      )}

      {/* Apply button */}
      <button onClick={handleApply}
        className="gl-button gl-button-sm gl-button-confirm w-full">
        {t('import.transform.apply')}
      </button>
    </div>
  )
}


// ── Step 3: Data Preview ──────────────────────────────────────

function StepPreview({ previewResult, isValidating, errorsOnly, onErrorsOnlyChange, columnMapping, targetFields, t }: {
  previewResult: ImportPreviewResponse | null; isValidating: boolean; errorsOnly: boolean
  onErrorsOnlyChange: (v: boolean) => void; columnMapping: Record<string, string>; targetFields: TargetFieldDef[]
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  if (isValidating) return (
    <div className="flex flex-col items-center justify-center h-48 gap-3">
      <Loader2 size={24} className="animate-spin text-primary" />
      <p className="text-xs text-muted-foreground">Validation en cours…</p>
    </div>
  )
  if (!previewResult) return null

  const mappedFields = Object.values(columnMapping)
  const fieldDefs = targetFields.filter((f) => mappedFields.includes(f.key))
  const errorsByRow: Record<number, RowValidationError[]> = {}
  for (const e of previewResult.errors) { if (!errorsByRow[e.row_index]) errorsByRow[e.row_index] = []; errorsByRow[e.row_index].push(e) }
  const displayRows = errorsOnly ? previewResult.preview_rows.filter((_, i) => errorsByRow[i]) : previewResult.preview_rows

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1 text-green-600"><CheckCircle2 size={12} /> {t('import.valid_rows', { count: previewResult.valid_count })}</span>
        {previewResult.error_count > 0 && <span className="flex items-center gap-1 text-red-600"><XCircle size={12} /> {t('import.error_rows', { count: previewResult.error_count })}</span>}
        {previewResult.warning_count > 0 && <span className="flex items-center gap-1 text-amber-600"><AlertTriangle size={12} /> {t('import.warning_rows', { count: previewResult.warning_count })}</span>}
        {previewResult.duplicate_count > 0 && <span className="text-muted-foreground">{t('import.duplicate_rows', { count: previewResult.duplicate_count })}</span>}
        <label className="flex items-center gap-1.5 ml-auto cursor-pointer">
          <input type="checkbox" checked={errorsOnly} onChange={(e) => onErrorsOnlyChange(e.target.checked)} className="accent-primary" />
          <span className="text-muted-foreground">{t('import.show_errors_only')}</span>
        </label>
      </div>
      <div className="border rounded overflow-auto max-h-[320px]">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/80 border-b">
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-8">#</th>
              <th className="px-2 py-1.5 text-center font-medium text-muted-foreground w-6"></th>
              {fieldDefs.map((f) => <th key={f.key} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{f.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, displayIdx) => {
              const origIdx = errorsOnly ? previewResult.preview_rows.indexOf(row) : displayIdx
              const rowErrors = errorsByRow[origIdx]
              const hasError = rowErrors?.some((e) => e.severity === 'error')
              const hasWarning = rowErrors?.some((e) => e.severity === 'warning')
              return (
                <tr key={origIdx} className={cn('border-b last:border-0', hasError ? 'bg-red-50' : hasWarning ? 'bg-amber-50' : '')}>
                  <td className="px-2 py-1 text-muted-foreground">{origIdx + 1}</td>
                  <td className="px-2 py-1 text-center">
                    {hasError && <XCircle size={11} className="text-red-500" />}
                    {!hasError && hasWarning && <AlertTriangle size={11} className="text-amber-500" />}
                    {!hasError && !hasWarning && <CheckCircle2 size={11} className="text-green-500" />}
                  </td>
                  {fieldDefs.map((f) => {
                    const fieldError = rowErrors?.find((e) => e.field === f.key)
                    return <td key={f.key} className={cn('px-2 py-1 max-w-[200px] truncate', fieldError && 'text-red-600')}
                      title={fieldError?.message ?? String(row[f.key] ?? '')}>{String(row[f.key] ?? '')}</td>
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}


// ── Step 4: Import Report ─────────────────────────────────────

function StepReport({ importResult, isExecuting, onDownloadErrors, t }: {
  importResult: ImportExecuteResponse | null; isExecuting: boolean; onDownloadErrors: () => void
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  if (isExecuting) return (
    <div className="flex flex-col items-center justify-center h-48 gap-3">
      <Loader2 size={24} className="animate-spin text-primary" /><p className="text-xs text-muted-foreground">{t('import.importing')}</p>
    </div>
  )
  if (!importResult) return null
  const hasErrors = importResult.errors.length > 0

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        {hasErrors ? <AlertTriangle size={40} className="mx-auto text-amber-500" /> : <CheckCircle2 size={40} className="mx-auto text-green-500" />}
        <h3 className="text-sm font-semibold">{t('import.report_title')}</h3>
        <p className="text-xs text-muted-foreground">{t('import.rows_processed', { count: importResult.total_processed })}</p>
      </div>
      <div className="grid grid-cols-4 gap-3 max-w-md mx-auto">
        <StatCard label={t('import.created', { count: importResult.created })} value={importResult.created} color="green" />
        <StatCard label={t('import.updated', { count: importResult.updated })} value={importResult.updated} color="blue" />
        <StatCard label={t('import.skipped', { count: importResult.skipped })} value={importResult.skipped} color="gray" />
        <StatCard label={t('import.errors', { count: importResult.errors.length })} value={importResult.errors.length} color="red" />
      </div>
      {hasErrors && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">{t('import.error_details')}</p>
            <button onClick={onDownloadErrors} className="gl-button gl-button-default flex text-[10px]">
              <Download size={10} /> {t('import.download_errors')}
            </button>
          </div>
          <div className="border rounded overflow-auto max-h-[200px]">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 z-10"><tr className="bg-muted/80 border-b">
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Ligne</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Champ</th>
                <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Message</th>
              </tr></thead>
              <tbody>
                {importResult.errors.slice(0, 50).map((e, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-2 py-1">{e.row_index + 1}</td>
                    <td className="px-2 py-1 font-mono">{e.field}</td>
                    <td className="px-2 py-1 text-red-600">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    green: 'text-green-600 bg-green-50 border-green-200', blue: 'text-blue-600 bg-blue-50 border-blue-200',
    gray: 'text-gray-600 bg-gray-50 border-gray-200', red: 'text-red-600 bg-red-50 border-red-200',
  }
  return (
    <div className={cn('rounded border p-3 text-center', colors[color])}>
      <p className="text-lg font-bold">{value}</p><p className="text-[10px] mt-0.5">{label}</p>
    </div>
  )
}
