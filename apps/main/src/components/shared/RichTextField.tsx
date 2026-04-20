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
import { useEffect } from 'react'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
}

// Minimum editor height derived from `rows` (each row ~ 1.5rem line-height).
function rowsToMinHeight(rows = 4): string {
  return `${Math.max(rows, 2) * 1.55}rem`
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
}: RichTextFieldProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: false, // keep it simple — inline `code` only
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? '',
      }),
    ],
    content: value || '',
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? '' : ed.getHTML()
      onChange(html)
    },
  })

  // Sync external value updates (e.g. after save→refresh)
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if ((value || '') !== current) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [disabled, editor])

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
    <div className={cn('rounded border border-border bg-background', className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-1.5 py-1">
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
        {!compact && (
          <ToolbarButton
            editor={editor}
            onClick={() => editor?.chain().setHorizontalRule().run()}
            disabled={disabled}
            title="Séparateur"
          >
            <Minus size={12} />
          </ToolbarButton>
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
        </span>
      </div>

      {/* Editor surface */}
      <EditorContent
        editor={editor}
        className={cn(
          'prose prose-sm max-w-none px-3 py-2 text-sm outline-none',
          '[&_.ProseMirror]:min-h-[var(--rte-min-h)] [&_.ProseMirror]:outline-none',
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
    'pre',
  ],
  ALLOWED_ATTR: ['href', 'rel', 'target'],
}

export function RichTextDisplay({ value, className, empty = '—' }: RichTextDisplayProps) {
  if (!value || !value.trim()) {
    return <span className="text-muted-foreground">{empty}</span>
  }
  const clean = DOMPurify.sanitize(value, PURIFY_CONFIG)
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
        className,
      )}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  )
}
