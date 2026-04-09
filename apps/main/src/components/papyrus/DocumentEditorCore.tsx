import { useEffect, useMemo, useState } from 'react'
import { Braces, Code2, FilePlus2, Heading1, Pilcrow, Plus, SeparatorHorizontal, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type PapyrusBlock = Record<string, unknown>

export interface PapyrusDocumentShape {
  id: string
  version: number
  meta: {
    id: string
    version: number
    document_type: 'free' | 'template' | 'report' | 'form'
    title?: string | null
    description?: string | null
    template_id?: string | null
    workflow_id?: string | null
    current_state?: string | null
    acl: Record<string, unknown>
    tags: string[]
    created_at?: string | null
    updated_at?: string | null
    [key: string]: unknown
  }
  blocks: PapyrusBlock[]
  refs: Array<Record<string, unknown> | string>
  workflow: Record<string, unknown>
  schedule: Record<string, unknown>
  render: Record<string, unknown>
}

export interface DocumentEditorProps {
  content?: unknown
  onChange: (content: PapyrusDocumentShape) => void
  readOnly?: boolean
}

function createEmptyPapyrusDocument(existing?: Partial<PapyrusDocumentShape>): PapyrusDocumentShape {
  const id = typeof existing?.id === 'string' ? existing.id : `papyrus_${Math.random().toString(36).slice(2, 10)}`
  return {
    id,
    version: typeof existing?.version === 'number' ? existing.version : 1,
    meta: {
      id,
      version: typeof existing?.version === 'number' ? existing.version : 1,
      document_type: 'free',
      title: null,
      description: null,
      template_id: null,
      workflow_id: null,
      current_state: null,
      acl: {},
      tags: [],
      ...(existing?.meta ?? {}),
    },
    blocks: Array.isArray(existing?.blocks) ? existing.blocks : [],
    refs: Array.isArray(existing?.refs) ? existing.refs : [],
    workflow: existing?.workflow ?? {},
    schedule: existing?.schedule ?? {},
    render: existing?.render ?? { html: true, pdf: true, pdf_engine: 'opsflux_pdf_service' },
  }
}

function normalizePapyrusDocument(content: unknown): PapyrusDocumentShape {
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    const candidate = content as Record<string, unknown>
    if (candidate.meta && Array.isArray(candidate.blocks)) {
      return createEmptyPapyrusDocument(candidate as Partial<PapyrusDocumentShape>)
    }
    if (typeof candidate.html === 'string') {
      return createEmptyPapyrusDocument({
        blocks: candidate.html
          .split(/\n{2,}/)
          .map((part, index) => ({
            id: `block_${index + 1}`,
            type: 'paragraph',
            locked: false,
            content: [{ type: 'text', text: part.replace(/<[^>]+>/g, '').trim() }],
          }))
          .filter((block) => Array.isArray(block.content) && (block.content[0] as { text?: string }).text),
      })
    }
    return createEmptyPapyrusDocument({
      blocks: [
        {
          id: 'legacy_payload',
          type: 'legacy_payload',
          locked: false,
          payload: candidate,
        },
      ],
    })
  }
  if (Array.isArray(content)) {
    return createEmptyPapyrusDocument({ blocks: content as PapyrusBlock[] })
  }
  return createEmptyPapyrusDocument()
}

function blockText(block: PapyrusBlock): string {
  const inline = block.content
  if (Array.isArray(inline)) {
    return inline
      .map((item) => (item && typeof item === 'object' && typeof (item as { text?: string }).text === 'string' ? (item as { text: string }).text : ''))
      .join('')
  }
  if (typeof block.text === 'string') return block.text
  return ''
}

function setBlockText(block: PapyrusBlock, text: string): PapyrusBlock {
  return {
    ...block,
    content: [{ type: 'text', text }],
  }
}

function createBlock(type: 'paragraph' | 'heading' | 'code' | 'separator'): PapyrusBlock {
  if (type === 'separator') {
    return { id: `block_${Math.random().toString(36).slice(2, 10)}`, type: 'separator', locked: false }
  }
  if (type === 'heading') {
    return {
      id: `block_${Math.random().toString(36).slice(2, 10)}`,
      type: 'heading',
      locked: false,
      props: { level: 2 },
      content: [{ type: 'text', text: 'Nouveau titre' }],
    }
  }
  if (type === 'code') {
    return {
      id: `block_${Math.random().toString(36).slice(2, 10)}`,
      type: 'codeBlock',
      locked: false,
      content: [{ type: 'text', text: '' }],
    }
  }
  return {
    id: `block_${Math.random().toString(36).slice(2, 10)}`,
    type: 'paragraph',
    locked: false,
    content: [{ type: 'text', text: '' }],
  }
}

export function DocumentEditor({ content, onChange, readOnly = false }: DocumentEditorProps) {
  const normalized = useMemo(() => normalizePapyrusDocument(content), [content])
  const [doc, setDoc] = useState<PapyrusDocumentShape>(normalized)
  const [mode, setMode] = useState<'blocks' | 'json'>('blocks')
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(normalized, null, 2))
  const [jsonError, setJsonError] = useState<string | null>(null)

  useEffect(() => {
    setDoc(normalized)
    setJsonDraft(JSON.stringify(normalized, null, 2))
    setJsonError(null)
  }, [normalized])

  const commit = (next: PapyrusDocumentShape) => {
    setDoc(next)
    setJsonDraft(JSON.stringify(next, null, 2))
    onChange(next)
  }

  const updateBlock = (index: number, updater: (block: PapyrusBlock) => PapyrusBlock) => {
    const nextBlocks = [...doc.blocks]
    nextBlocks[index] = updater(nextBlocks[index] ?? {})
    commit({ ...doc, blocks: nextBlocks, version: doc.version + 1, meta: { ...doc.meta, version: doc.version + 1 } })
  }

  const removeBlock = (index: number) => {
    const nextBlocks = doc.blocks.filter((_, currentIndex) => currentIndex !== index)
    commit({ ...doc, blocks: nextBlocks, version: doc.version + 1, meta: { ...doc.meta, version: doc.version + 1 } })
  }

  const addBlock = (type: 'paragraph' | 'heading' | 'code' | 'separator') => {
    commit({
      ...doc,
      blocks: [...doc.blocks, createBlock(type)],
      version: doc.version + 1,
      meta: { ...doc.meta, version: doc.version + 1 },
    })
  }

  const applyJsonDraft = () => {
    try {
      const parsed = JSON.parse(jsonDraft) as PapyrusDocumentShape
      const next = normalizePapyrusDocument(parsed)
      setJsonError(null)
      commit(next)
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : 'JSON invalide')
    }
  }

  return (
    <div className="w-full min-h-[320px] flex flex-col border border-border rounded-md overflow-hidden bg-background">
      <div className="flex items-center gap-1 px-2 py-2 border-b border-border bg-muted/30 flex-wrap">
        <button type="button" className={cn('gl-button-sm', mode === 'blocks' ? 'gl-button-confirm' : 'gl-button-default')} onClick={() => setMode('blocks')}>
          <FilePlus2 size={12} />
          <span>Blocs</span>
        </button>
        <button type="button" className={cn('gl-button-sm', mode === 'json' ? 'gl-button-confirm' : 'gl-button-default')} onClick={() => setMode('json')}>
          <Braces size={12} />
          <span>JSON</span>
        </button>
        {!readOnly && mode === 'blocks' && (
          <>
            <button type="button" className="gl-button-sm gl-button-default" onClick={() => addBlock('paragraph')}>
              <Pilcrow size={12} />
              <span>Paragraphe</span>
            </button>
            <button type="button" className="gl-button-sm gl-button-default" onClick={() => addBlock('heading')}>
              <Heading1 size={12} />
              <span>Titre</span>
            </button>
            <button type="button" className="gl-button-sm gl-button-default" onClick={() => addBlock('code')}>
              <Code2 size={12} />
              <span>Code</span>
            </button>
            <button type="button" className="gl-button-sm gl-button-default" onClick={() => addBlock('separator')}>
              <SeparatorHorizontal size={12} />
              <span>Séparateur</span>
            </button>
          </>
        )}
        <div className="ml-auto text-[11px] text-muted-foreground">
          Papyrus v{doc.version}
        </div>
      </div>

      {mode === 'json' ? (
        <div className="p-3 space-y-2">
          <textarea
            value={jsonDraft}
            onChange={(event) => setJsonDraft(event.target.value)}
            readOnly={readOnly}
            className="w-full min-h-[360px] rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
          />
          {!readOnly && (
            <div className="flex items-center gap-2">
              <button type="button" className="gl-button-sm gl-button-confirm" onClick={applyJsonDraft}>
                <Plus size={12} />
                <span>Appliquer JSON</span>
              </button>
              {jsonError ? <span className="text-xs text-red-600 dark:text-red-400">{jsonError}</span> : null}
            </div>
          )}
        </div>
      ) : (
        <div className="p-3 space-y-3">
          {doc.blocks.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Aucun bloc. Ajoute un paragraphe ou passe en mode JSON.</div>
          ) : null}
          {doc.blocks.map((block, index) => {
            const type = String(block.type ?? 'paragraph')
            const isSeparator = type === 'separator'
            const isCode = type === 'codeBlock'
            return (
              <div key={String(block.id ?? index)} className="rounded-md border border-border bg-muted/10 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{type}</span>
                  {!readOnly ? (
                    <button type="button" className="gl-button-sm gl-button-danger" onClick={() => removeBlock(index)}>
                      <Trash2 size={12} />
                      <span>Supprimer</span>
                    </button>
                  ) : null}
                </div>
                {isSeparator ? (
                  <div className="h-px bg-border my-3" />
                ) : (
                  <textarea
                    value={blockText(block)}
                    readOnly={readOnly}
                    onChange={(event) => updateBlock(index, (current) => setBlockText(current, event.target.value))}
                    className={cn(
                      'w-full rounded-md border border-border bg-background px-3 py-2 text-sm',
                      isCode ? 'font-mono min-h-[140px]' : 'min-h-[90px]',
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default DocumentEditor
