/**
 * DocumentEditor — rich text editor for documents.
 *
 * Uses a contentEditable div with execCommand-based toolbar.
 * Stores content as HTML string for API compatibility.
 */
import { useRef, useCallback, useEffect } from 'react'
import {
  FileText, Bold, Italic, Underline as UnderlineIcon, Heading1, List,
  ListOrdered, Quote, Undo2, Redo2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DocumentEditorProps {
  initialContent?: string
  /** @deprecated Use initialContent instead */
  content?: unknown
  onChange: (content: string) => void
  readOnly?: boolean
}

/**
 * Execute a formatting command on the current selection.
 */
function execCmd(command: string, value?: string) {
  document.execCommand(command, false, value)
}

interface ToolbarBtnProps {
  icon: React.ElementType
  title: string
  onClick: () => void
  active?: boolean
}

function ToolbarBtn({ icon: Icon, title, onClick, active }: ToolbarBtnProps) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Prevent stealing focus from the editor
        e.preventDefault()
        onClick()
      }}
      className={cn(
        'p-1.5 rounded hover:bg-accent text-muted-foreground transition-colors',
        active && 'bg-accent text-foreground',
      )}
      title={title}
    >
      <Icon size={14} />
    </button>
  )
}

function Separator() {
  return <div className="w-px h-4 bg-border mx-1" />
}

/**
 * Resolve initial content from either the new `initialContent` prop
 * or the legacy `content` prop (which may be a BlockNote JSON array).
 */
function resolveInitialHtml(initialContent?: string, content?: unknown): string {
  if (typeof initialContent === 'string') return initialContent
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    // Extract text from BlockNote JSON blocks and wrap in <p> tags
    return content
      .map((block: Record<string, unknown>) => {
        const inlines = block.content as Array<Record<string, string>> | undefined
        if (inlines) {
          const text = inlines.map((i) => i.text || '').join('')
          return text ? `<p>${text}</p>` : ''
        }
        return ''
      })
      .filter(Boolean)
      .join('')
  }
  return ''
}

export function DocumentEditor({
  initialContent,
  content,
  onChange,
  readOnly = false,
}: DocumentEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isInitializedRef = useRef(false)

  // Set initial HTML once
  useEffect(() => {
    if (editorRef.current && !isInitializedRef.current) {
      const html = resolveInitialHtml(initialContent, content)
      editorRef.current.innerHTML = html || ''
      isInitializedRef.current = true
    }
  }, [initialContent, content])

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      onChange(editorRef.current.innerHTML)
    }
  }, [onChange])

  // Strip formatting on paste to get clean HTML
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
  }, [])

  return (
    <div className="w-full h-full min-h-[300px] flex flex-col border border-border rounded-md overflow-hidden bg-background">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30 shrink-0 flex-wrap">
          <ToolbarBtn icon={Bold} title="Gras (Ctrl+B)" onClick={() => execCmd('bold')} />
          <ToolbarBtn icon={Italic} title="Italique (Ctrl+I)" onClick={() => execCmd('italic')} />
          <ToolbarBtn icon={UnderlineIcon} title="Souligne (Ctrl+U)" onClick={() => execCmd('underline')} />
          <Separator />
          <ToolbarBtn icon={Heading1} title="Titre" onClick={() => execCmd('formatBlock', 'h2')} />
          <ToolbarBtn icon={Quote} title="Citation" onClick={() => execCmd('formatBlock', 'blockquote')} />
          <Separator />
          <ToolbarBtn icon={List} title="Liste a puces" onClick={() => execCmd('insertUnorderedList')} />
          <ToolbarBtn icon={ListOrdered} title="Liste numerotee" onClick={() => execCmd('insertOrderedList')} />
          <Separator />
          <ToolbarBtn icon={Undo2} title="Annuler (Ctrl+Z)" onClick={() => execCmd('undo')} />
          <ToolbarBtn icon={Redo2} title="Retablir (Ctrl+Y)" onClick={() => execCmd('redo')} />
          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <FileText size={10} />
            Editeur de texte
          </span>
        </div>
      )}

      {/* Editor area */}
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        className={cn(
          'flex-1 w-full min-h-[280px] p-4 text-sm bg-background text-foreground leading-relaxed',
          'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-inset',
          'overflow-y-auto',
          // Prose-like styling for rich text content
          '[&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2',
          '[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5',
          '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1',
          '[&_p]:mb-2 [&_p]:leading-relaxed',
          '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-2',
          '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-2',
          '[&_li]:mb-0.5',
          '[&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-2',
          readOnly && 'cursor-default',
        )}
        data-placeholder="Saisissez le contenu du document..."
        style={{ minHeight: '280px' }}
      />

      {/* Placeholder styling via CSS-in-JS workaround */}
      <style>{`
        [data-placeholder]:empty::before {
          content: attr(data-placeholder);
          color: var(--muted-foreground, #9ca3af);
          opacity: 0.6;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}

export default DocumentEditor
