/**
 * RichTextField — Tiptap-based rich text editor, reusable across the app.
 *
 * Stores its value as an **HTML string**. Every OpsFlux consumer should now
 * use this component wherever a multi-paragraph text was previously handled
 * via `<textarea>` or the legacy `MarkdownField`.
 *
 * Behaviour:
 *   • Value in / out is raw HTML (sanitised on render-only paths).
 *   • Toolbar exposes: heading, bold, italic, strike, code, bullet/numbered
 *     lists, blockquote, link, horizontal rule, undo/redo.
 *   • Placeholder + character-count helper.
 *   • Backward-compatible with old Markdown values — when the incoming
 *     `value` starts with plain markdown hints (e.g. `-`, `#`, `**`), the
 *     editor renders it as plain paragraphs (no conversion); for a cleaner
 *     migration, run a one-off backend converter when needed. In practice
 *     the editor is forgiving: users can keep editing stored Markdown as
 *     plain text until they save once (which persists clean HTML).
 *
 * Rendering (read-only): use `<RichTextDisplay value={html} />` below.
 * It sanitises the HTML via DOMPurify before rendering.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  EditorContent,
  useEditor,
  type Editor,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Image from '@tiptap/extension-image'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { SlashCommands, slashCommandsConfig } from './RichTextSlashCommands'
import DOMPurify from 'dompurify'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Link2,
  Heading1,
  Heading2,
  Minus,
  Undo,
  Redo,
  ImagePlus,
  Table as TableIcon,
  Rows3,
  Columns3,
  Trash2,
  Maximize2,
  Minimize2,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { useToast } from '@/components/ui/Toast'

interface RichTextFieldProps {
  value: string | null | undefined
  onChange: (html: string) => void
  placeholder?: string
  hint?: string
  rows?: number
  disabled?: boolean
  className?: string
  /** Compact toolbar — drops headings and HR. Use in small panels. */
  compact?: boolean
  /**
   * Polymorphic parent for image uploads. When set, the image button is
   * enabled; every image picked is uploaded as a real Attachment row and
   * inserted as `<img data-attachment-id=... src="/api/v1/attachments/.../download"/>`.
   *
   * During Create flow, pass `imageOwnerType="moc_staging"` with a
   * client-generated `imageOwnerId` UUID — the backend re-targets those
   * rows to the new MOC on submit.
   *
   * When undefined, the image button is hidden (Tiptap image extension
   * still loaded so existing content renders correctly).
   */
  imageOwnerType?: string
  imageOwnerId?: string
  /** Max upload size in MB. Defaults to 5. */
  imageMaxSizeMB?: number
}

// Minimum editor height derived from `rows` (each row ~ 1.5rem line-height).
function rowsToMinHeight(rows = 4): string {
  return `${Math.max(rows, 2) * 1.55}rem`
}

// ── Attachment URL hydration ─────────────────────────────────────────────
// The stored HTML contains `<img src="/api/v1/attachments/<id>/download">`
// which cannot load in the browser because the auth header lives in
// localStorage (not a cookie). For every `data-attachment-id` we find,
// fetch the image via the authenticated axios instance, store a blob URL,
// and rewrite the HTML to point at that blob URL. Revoked on unmount.

const ATTACHMENT_ID_RE = /data-attachment-id="([0-9a-f-]{36})"/gi

/** Force every `<img data-attachment-id="X">` to carry the canonical
 *  `src="/api/v1/attachments/X/download"` URL — stripping any blob URL
 *  that the editor might be showing for display. Safe to call on any
 *  rich-text HTML before persisting. */
function canonicaliseAttachmentUrls(html: string): string {
  if (!html) return html
  return html.replace(
    /<img\b[^>]*>/gi,
    (imgTag) => {
      const idMatch = imgTag.match(/data-attachment-id="([0-9a-f-]{36})"/i)
      if (!idMatch) return imgTag
      const id = idMatch[1]
      const canonical = `/api/v1/attachments/${id}/download`
      if (/\ssrc="/.test(imgTag)) {
        return imgTag.replace(/(\ssrc=")[^"]*(")/, `$1${canonical}$2`)
      }
      // No src yet — append it before the closing slash/bracket.
      return imgTag.replace(/\s*\/?>$/, ` src="${canonical}" />`)
    },
  )
}

/** Replace `/api/v1/attachments/X/download` URLs inside the src of
 *  `<img data-attachment-id="X">` tags with authenticated blob URLs.
 *  Each blob URL that gets minted is reported via `onMint` so the caller
 *  can revoke them later. Safe to call with empty/missing HTML. */
async function hydrateAttachmentUrls(
  html: string,
  onMint: (blobUrl: string) => void,
): Promise<string> {
  if (!html) return html
  const ids = Array.from(
    new Set([...html.matchAll(ATTACHMENT_ID_RE)].map((m) => m[1])),
  )
  if (ids.length === 0) return html
  const pairs = await Promise.all(
    ids.map((id) =>
      api
        .get(`/api/v1/attachments/${id}/download`, { responseType: 'blob' })
        .then((res) => {
          const url = URL.createObjectURL(res.data)
          onMint(url)
          return [id, url] as const
        })
        .catch(() => [id, null] as const),
    ),
  )
  let out = html
  for (const [id, url] of pairs) {
    if (!url) continue
    // Conservative: only rewrite the <img> that carries this exact id,
    // handling both attribute orders (data-attachment-id before / after src).
    const imgRe = new RegExp(
      `(<img[^>]*data-attachment-id="${id}"[^>]*\\ssrc=")[^"]*(")`,
      'gi',
    )
    out = out.replace(imgRe, `$1${url}$2`)
    const imgReAlt = new RegExp(
      `(<img[^>]*\\ssrc=")[^"]*("[^>]*data-attachment-id="${id}")`,
      'gi',
    )
    out = out.replace(imgReAlt, `$1${url}$2`)
  }
  return out
}

// ── Resizable Image NodeView ──────────────────────────────────────────────
// Wraps <img> in a React component that shows a SE-corner drag handle when
// the node is selected. Mouse drag updates the `width` attribute; Tiptap
// persists it to the HTML. The handle only appears on selection to keep
// the reading view clean.

function ResizableImageNodeView(props: any) {
  const { node, selected, updateAttributes, editor } = props
  const wrapperRef = useRef<HTMLSpanElement | null>(null)
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (ev: React.PointerEvent) => {
    ev.preventDefault()
    ev.stopPropagation()
    const startX = ev.clientX
    const startWidth = wrapperRef.current?.firstElementChild
      ? (wrapperRef.current.firstElementChild as HTMLImageElement).offsetWidth
      : (node.attrs.width as number | null) ?? 300
    setDragging(true)
    const onMove = (e: PointerEvent) => {
      const next = Math.max(40, Math.round(startWidth + (e.clientX - startX)))
      updateAttributes({ width: next })
    }
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const width = node.attrs.width as number | null
  const isEditable = editor?.isEditable

  return (
    <NodeViewWrapper
      as="span"
      ref={wrapperRef as any}
      className={cn(
        'inline-block relative my-1',
        selected && isEditable && 'outline outline-2 outline-primary/60 rounded',
      )}
      style={{ width: width ? `${width}px` : undefined, maxWidth: '100%' }}
    >
      <img
        src={node.attrs.src}
        alt={node.attrs.alt ?? ''}
        data-attachment-id={node.attrs['data-attachment-id'] ?? undefined}
        className="block max-w-full h-auto rounded"
        draggable={false}
      />
      {selected && isEditable && (
        <span
          className={cn(
            'absolute bottom-0 right-0 w-3 h-3 bg-primary border border-white',
            'rounded-sm cursor-se-resize translate-x-1/2 translate-y-1/2',
            'hover:scale-125 transition-transform',
            dragging && 'scale-125',
          )}
          title="Redimensionner"
          onPointerDown={onPointerDown}
        />
      )}
    </NodeViewWrapper>
  )
}

/** Extension-image augmented with width attr, data-attachment-id and a
 *  React NodeView that shows a resize handle when selected. */
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      'data-attachment-id': {
        default: null,
        parseHTML: (el) => el.getAttribute('data-attachment-id'),
        renderHTML: (attrs) => {
          const v = attrs['data-attachment-id']
          return v ? { 'data-attachment-id': v } : {}
        },
      },
      width: {
        default: null,
        parseHTML: (el) => {
          const w = el.getAttribute('width')
          return w ? Number(w) : null
        },
        renderHTML: (attrs) => {
          if (!attrs.width) return {}
          return { width: attrs.width, style: `width: ${attrs.width}px;` }
        },
      },
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageNodeView)
  },
})

function useHydratedAttachmentHtml(html: string | null | undefined): string {
  const [hydrated, setHydrated] = useState<string>(html ?? '')
  const blobsRef = useRef<string[]>([])

  useEffect(() => {
    // Revoke previously held blob URLs to avoid leaks.
    blobsRef.current.forEach((u) => URL.revokeObjectURL(u))
    blobsRef.current = []

    const src = html ?? ''
    setHydrated(src)  // render un-hydrated first, swap in on resolve
    if (!src) return

    let cancelled = false
    void (async () => {
      const out = await hydrateAttachmentUrls(src, (u) =>
        blobsRef.current.push(u),
      )
      if (!cancelled) setHydrated(out)
    })()

    return () => {
      cancelled = true
    }
  }, [html])

  useEffect(() => {
    return () => {
      blobsRef.current.forEach((u) => URL.revokeObjectURL(u))
      blobsRef.current = []
    }
  }, [])

  return hydrated
}

function ToolbarButton({
  editor,
  onClick,
  active,
  disabled,
  title,
  children,
}: {
  editor: Editor | null
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={!editor || disabled}
      onClick={() => {
        editor?.chain().focus()
        onClick()
      }}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        'disabled:opacity-40 disabled:pointer-events-none',
      )}
    >
      {children}
    </button>
  )
}

export function RichTextField({
  value,
  onChange,
  placeholder,
  hint,
  rows = 4,
  disabled,
  className,
  compact = false,
  imageOwnerType,
  imageOwnerId,
  imageMaxSizeMB = 5,
}: RichTextFieldProps) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  // Escape exits fullscreen — keeps parity with the hint shown in the
  // fullscreen header. Only captures the event when the editor is the
  // active component so we don't hijack other Escape handlers.
  useEffect(() => {
    if (!fullscreen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Don't swallow if user is inside a dropdown / tippy popup
        const target = e.target as HTMLElement | null
        if (target?.closest('.tippy-box')) return
        setFullscreen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fullscreen])
  // Canonical HTML we just emitted through onChange. Used to tell
  // "this value prop change is our own roundtrip — keep editor as-is"
  // from "external update — reset editor to hydrated value".
  const lastEmittedCanonRef = useRef<string>('')

  const editor = useEditor({
    extensions: [
      // StarterKit v3 already bundles Link, Heading, Bold, Italic, Strike,
      // Code, BulletList, OrderedList, Blockquote, HorizontalRule, History.
      // We only tune Link behaviour (external target, no auto-open on click).
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false, // keep it simple — inline `code` only
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? '',
      }),
      ResizableImage.configure({
        // Inline images are rarely useful inside paragraphs; keep them as
        // block nodes so they get their own line and the reconciliation
        // regex has a clean anchor.
        inline: false,
        allowBase64: false,
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: { class: 'rt-table' },
      }),
      TableRow,
      TableHeader,
      TableCell,
      SlashCommands.configure({ suggestion: slashCommandsConfig }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? '' : ed.getHTML()
      // Canonicalise: every `<img data-attachment-id="X">` must carry
      // `src="/api/v1/attachments/X/download"` regardless of whether
      // the editor currently shows a blob URL (hydrated) or a raw
      // `createObjectURL` just used for the in-flight preview.
      const canon = canonicaliseAttachmentUrls(html)
      lastEmittedCanonRef.current = canon
      onChange(canon)
    },
  })

  // Sync the editor on external value changes (not our own roundtrip).
  // Images are hydrated asynchronously — we fetch each blob via the
  // authenticated axios client, then apply the resulting HTML via
  // setContent. The canonical form is used as the stable identity,
  // preserving cursor/selection during normal typing.
  const editorBlobsRef = useRef<string[]>([])
  useEffect(() => {
    if (!editor) return
    const canonValue = canonicaliseAttachmentUrls(value || '')
    if (canonValue === lastEmittedCanonRef.current) return  // our own roundtrip
    lastEmittedCanonRef.current = canonValue

    let cancelled = false
    void (async () => {
      const hydrated = await hydrateAttachmentUrls(
        value || '',
        (url) => editorBlobsRef.current.push(url),
      )
      if (cancelled || !editor) return
      // Apply only if the editor still shows the same canonical version.
      if (canonicaliseAttachmentUrls(editor.getHTML()) === canonValue) {
        editor.commands.setContent(hydrated, { emitUpdate: false })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  // Revoke blob URLs on unmount to avoid memory leaks.
  useEffect(() => {
    return () => {
      editorBlobsRef.current.forEach((u) => URL.revokeObjectURL(u))
      editorBlobsRef.current = []
    }
  }, [])

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [disabled, editor])

  const canUploadImage = !!imageOwnerType && !!imageOwnerId && !disabled

  const openImagePicker = () => {
    if (!canUploadImage) {
      toast({
        title: t('rich_text.image_save_first'),
        variant: 'warning',
      })
      return
    }
    fileInputRef.current?.click()
  }

  const handleImageFile = async (file: File) => {
    if (!editor || !canUploadImage) return
    // Size guard — backend rejects > STORAGE_MAX_FILE_SIZE_MB too, but we
    // fail fast here with a clearer message.
    if (file.size > imageMaxSizeMB * 1024 * 1024) {
      toast({
        title: t('rich_text.image_too_large', { max: imageMaxSizeMB }),
        variant: 'error',
      })
      return
    }
    if (!file.type.startsWith('image/')) {
      toast({ title: t('rich_text.image_invalid_type'), variant: 'error' })
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('owner_type', imageOwnerType as string)
      form.append('owner_id', imageOwnerId as string)
      form.append('category', 'inline_image')
      const { data } = await api.post('/api/v1/attachments', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const attId = data?.id as string | undefined
      if (!attId) throw new Error('Upload returned no attachment id')
      // Use a blob URL for the immediate in-editor preview (avoids a 401
      // roundtrip to /download on the raw browser <img> load). The
      // canonicaliser strips this back to the persistent `/download`
      // form when onUpdate fires, so the DB never sees blob: URLs.
      const previewUrl = URL.createObjectURL(file)
      editorBlobsRef.current.push(previewUrl)
      editor.chain().focus().setImage({
        src: previewUrl,
        alt: file.name,
        'data-attachment-id': attId,
      } as never).run()
    } catch (err) {
      console.error('[RichTextField] image upload failed', err)
      toast({
        title: t('rich_text.image_upload_failed'),
        variant: 'error',
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const promptLink = () => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL du lien', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div
      className={cn(
        'rounded border border-border bg-background',
        fullscreen && 'fixed inset-4 z-[100] shadow-2xl flex flex-col',
        className,
      )}
    >
      {fullscreen && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-2 shrink-0">
          <p className="text-sm font-medium text-foreground">Éditeur plein écran</p>
          <p className="text-[11px] text-muted-foreground">
            Tapez <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">/</kbd> pour insérer un bloc · glissez-déposez une image · <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">Échap</kbd> pour quitter
          </p>
        </div>
      )}

      {/* Toolbar */}
      <div
        className={cn(
          'flex flex-wrap items-center border-b border-border bg-muted/30 shrink-0',
          fullscreen ? 'gap-1 px-3 py-1.5' : 'gap-0.5 px-1.5 py-1',
        )}
      >
        {!compact && (
          <>
            <ToolbarButton
              editor={editor}
              onClick={() => editor?.chain().toggleHeading({ level: 1 }).run()}
              active={editor?.isActive('heading', { level: 1 })}
              disabled={disabled}
              title="Titre 1"
            >
              <Heading1 size={12} />
            </ToolbarButton>
            <ToolbarButton
              editor={editor}
              onClick={() => editor?.chain().toggleHeading({ level: 2 }).run()}
              active={editor?.isActive('heading', { level: 2 })}
              disabled={disabled}
              title="Titre 2"
            >
              <Heading2 size={12} />
            </ToolbarButton>
            <span className="mx-0.5 h-4 w-px bg-border" />
          </>
        )}
        <ToolbarButton
          editor={editor}
          onClick={() => editor?.chain().toggleBold().run()}
          active={editor?.isActive('bold')}
          disabled={disabled}
          title="Gras (Ctrl+B)"
        >
          <Bold size={12} />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor?.chain().toggleItalic().run()}
          active={editor?.isActive('italic')}
          disabled={disabled}
          title="Italique (Ctrl+I)"
        >
          <Italic size={12} />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor?.chain().toggleStrike().run()}
          active={editor?.isActive('strike')}
          disabled={disabled}
          title="Barré"
        >
          <Strikethrough size={12} />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor?.chain().toggleCode().run()}
          active={editor?.isActive('code')}
          disabled={disabled}
          title="Code inline"
        >
          <Code size={12} />
        </ToolbarButton>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <ToolbarButton
          editor={editor}
          onClick={() => editor?.chain().toggleBulletList().run()}
          active={editor?.isActive('bulletList')}
          disabled={disabled}
          title="Liste à puces"
        >
          <List size={12} />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor?.chain().toggleOrderedList().run()}
          active={editor?.isActive('orderedList')}
          disabled={disabled}
          title="Liste numérotée"
        >
          <ListOrdered size={12} />
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          onClick={() => editor?.chain().toggleBlockquote().run()}
          active={editor?.isActive('blockquote')}
          disabled={disabled}
          title="Citation"
        >
          <Quote size={12} />
        </ToolbarButton>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <ToolbarButton
          editor={editor}
          onClick={promptLink}
          active={editor?.isActive('link')}
          disabled={disabled}
          title="Lien"
        >
          <Link2 size={12} />
        </ToolbarButton>
        {imageOwnerType !== undefined && (
          <ToolbarButton
            editor={editor}
            onClick={openImagePicker}
            disabled={disabled || uploading}
            title={
              canUploadImage
                ? t('rich_text.image_insert')
                : t('rich_text.image_save_first')
            }
          >
            {uploading ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ImagePlus size={12} />
            )}
          </ToolbarButton>
        )}
        {!compact && (
          <>
            <ToolbarButton
              editor={editor}
              onClick={() => editor?.chain().setHorizontalRule().run()}
              disabled={disabled}
              title="Séparateur"
            >
              <Minus size={12} />
            </ToolbarButton>
            {/* Table controls — context-sensitive: insert 3×3 when not
                inside a table; add row/col/delete when inside. */}
            {editor?.isActive('table') ? (
              <>
                <ToolbarButton
                  editor={editor}
                  onClick={() => editor?.chain().focus().addRowAfter().run()}
                  disabled={disabled}
                  title="Ajouter une ligne"
                >
                  <Rows3 size={12} />
                </ToolbarButton>
                <ToolbarButton
                  editor={editor}
                  onClick={() => editor?.chain().focus().addColumnAfter().run()}
                  disabled={disabled}
                  title="Ajouter une colonne"
                >
                  <Columns3 size={12} />
                </ToolbarButton>
                <ToolbarButton
                  editor={editor}
                  onClick={() => editor?.chain().focus().deleteTable().run()}
                  disabled={disabled}
                  title="Supprimer le tableau"
                >
                  <Trash2 size={12} />
                </ToolbarButton>
              </>
            ) : (
              <ToolbarButton
                editor={editor}
                onClick={() =>
                  editor
                    ?.chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                    .run()
                }
                disabled={disabled}
                title="Insérer un tableau (3×3)"
              >
                <TableIcon size={12} />
              </ToolbarButton>
            )}
          </>
        )}
        <span className="ml-auto flex items-center gap-0.5">
          <ToolbarButton
            editor={editor}
            onClick={() => editor?.chain().undo().run()}
            disabled={disabled || !editor?.can().undo()}
            title="Annuler (Ctrl+Z)"
          >
            <Undo size={12} />
          </ToolbarButton>
          <ToolbarButton
            editor={editor}
            onClick={() => editor?.chain().redo().run()}
            disabled={disabled || !editor?.can().redo()}
            title="Rétablir (Ctrl+Y)"
          >
            <Redo size={12} />
          </ToolbarButton>
          {!compact && (
            <ToolbarButton
              editor={editor}
              onClick={() => setFullscreen((v) => !v)}
              disabled={false}
              title={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
            >
              {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </ToolbarButton>
          )}
        </span>
      </div>

      {/* Hidden file input driven by the image toolbar button */}
      {imageOwnerType !== undefined && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleImageFile(f)
          }}
        />
      )}

      {/* Editor surface */}
      <EditorContent
        editor={editor}
        className={cn(
          'prose prose-sm max-w-none px-3 py-2 text-sm outline-none',
          fullscreen && 'flex-1 overflow-auto',
          '[&_.ProseMirror]:min-h-[var(--rte-min-h)] [&_.ProseMirror]:outline-none',
          fullscreen && '[&_.ProseMirror]:min-h-full',
          '[&_.ProseMirror_p]:my-1 [&_.ProseMirror_ul]:my-1 [&_.ProseMirror_ol]:my-1',
          '[&_.ProseMirror_h1]:text-base [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:mb-1',
          '[&_.ProseMirror_h2]:text-sm [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:mb-1',
          '[&_.ProseMirror_h3]:text-sm [&_.ProseMirror_h3]:font-medium [&_.ProseMirror_h3]:mb-1',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground/60',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0',
          '[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline',
          '[&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-muted',
          '[&_.ProseMirror_code]:px-1 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:text-xs',
          '[&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-border',
          '[&_.ProseMirror_blockquote]:pl-2 [&_.ProseMirror_blockquote]:text-muted-foreground',
          // Tables
          '[&_.rt-table]:w-full [&_.rt-table]:my-2 [&_.rt-table]:border-collapse',
          '[&_.rt-table]:table-fixed',
          '[&_.rt-table_td]:border [&_.rt-table_td]:border-border',
          '[&_.rt-table_td]:px-2 [&_.rt-table_td]:py-1 [&_.rt-table_td]:align-top',
          '[&_.rt-table_th]:border [&_.rt-table_th]:border-border',
          '[&_.rt-table_th]:bg-muted/40 [&_.rt-table_th]:px-2 [&_.rt-table_th]:py-1',
          '[&_.rt-table_th]:font-semibold [&_.rt-table_th]:text-left',
          '[&_.rt-table_.selectedCell]:bg-primary/10',
          '[&_.rt-table_.column-resize-handle]:absolute',
          '[&_.rt-table_.column-resize-handle]:right-[-1px] [&_.rt-table_.column-resize-handle]:top-0',
          '[&_.rt-table_.column-resize-handle]:w-[3px] [&_.rt-table_.column-resize-handle]:h-full',
          '[&_.rt-table_.column-resize-handle]:bg-primary [&_.rt-table_.column-resize-handle]:cursor-col-resize',
        )}
        style={{ ['--rte-min-h' as string]: rowsToMinHeight(rows) }}
      />

      {hint && (
        <div className="border-t border-border/60 px-3 py-1 text-[10px] text-muted-foreground">
          {hint}
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Read-only display — sanitises HTML before injection.
// ────────────────────────────────────────────────────────────────────────────

interface RichTextDisplayProps {
  value: string | null | undefined
  className?: string
  empty?: string
}

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'p', 'br', 'strong', 'em', 's', 'u', 'code',
    'h1', 'h2', 'h3', 'h4',
    'ul', 'ol', 'li',
    'blockquote', 'hr',
    'a',
    'pre', 'span',
    // Images uploaded via the editor — src always points at our own
    // authenticated /attachments/:id/download route, which the backend
    // resolves to a data URI for the PDF. data-attachment-id is kept so
    // backend reconciliation can detect removed images on save.
    'img',
    // Tables — insert / resize / add row & column supported in the editor
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
  ],
  ALLOWED_ATTR: [
    'href', 'rel', 'target',
    'src', 'alt', 'width', 'height', 'data-attachment-id', 'class', 'style',
    // Table attributes used by the Tiptap table extension
    'colspan', 'rowspan', 'colwidth',
  ],
  // Allow `blob:` URIs so hydrated image srcs (authenticated blob URLs)
  // survive sanitisation. Default DOMPurify regex omits the blob scheme.
  ALLOWED_URI_REGEXP:
    /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|file|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
}

export function RichTextDisplay({ value, className, empty = '—' }: RichTextDisplayProps) {
  // Hydrate attachment URLs to authenticated blob URLs before display,
  // otherwise `<img src="/api/v1/attachments/.../download">` 401s in the
  // browser (auth header lives in localStorage, not cookies).
  const hydrated = useHydratedAttachmentHtml(value)
  if (!value || !value.trim()) {
    return <span className="text-muted-foreground">{empty}</span>
  }
  const clean = DOMPurify.sanitize(hydrated, PURIFY_CONFIG)
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none text-sm',
        '[&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_ul]:list-disc [&_ul]:pl-5',
        '[&_ol]:list-decimal [&_ol]:pl-5',
        '[&_h1]:text-base [&_h1]:font-semibold',
        '[&_h2]:text-sm [&_h2]:font-semibold',
        '[&_a]:text-primary [&_a]:underline',
        '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-2',
        '[&_blockquote]:text-muted-foreground',
        // Tables
        '[&_table]:w-full [&_table]:my-2 [&_table]:border-collapse',
        '[&_table_td]:border [&_table_td]:border-border [&_table_td]:px-2 [&_table_td]:py-1 [&_table_td]:align-top',
        '[&_table_th]:border [&_table_th]:border-border [&_table_th]:bg-muted/40',
        '[&_table_th]:px-2 [&_table_th]:py-1 [&_table_th]:font-semibold [&_table_th]:text-left',
        // Images
        '[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
