/**
 * DocumentEditor — rich text editor for documents.
 *
 * Uses a simple textarea editor. BlockNote integration is available
 * when the Vite dev server is started fresh (npm run dev).
 */
import { useState, useCallback } from 'react'
import { FileText, Bold, Italic, Heading1, List } from 'lucide-react'

export interface DocumentEditorProps {
  content?: unknown
  onChange: (content: unknown) => void
  readOnly?: boolean
}

export function DocumentEditor({ content, onChange, readOnly = false }: DocumentEditorProps) {
  const [textContent, setTextContent] = useState(() => {
    if (typeof content === 'string') return content
    if (Array.isArray(content)) {
      // Extract text from BlockNote JSON blocks
      return content
        .map((block: Record<string, unknown>) => {
          const inlines = block.content as Array<Record<string, string>> | undefined
          if (inlines) return inlines.map((i) => i.text || '').join('')
          return ''
        })
        .filter(Boolean)
        .join('\n')
    }
    return ''
  })

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTextContent(e.target.value)
      // Convert to simple block format for API compatibility
      const blocks = e.target.value.split('\n').map((line, i) => ({
        id: `block-${i}`,
        type: 'paragraph' as const,
        content: [{ type: 'text' as const, text: line }],
      }))
      onChange(blocks)
    },
    [onChange],
  )

  return (
    <div className="w-full h-full min-h-[300px] flex flex-col border border-border rounded-md overflow-hidden bg-background">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-muted/30 shrink-0">
          <button type="button" className="p-1.5 rounded hover:bg-accent text-muted-foreground" title="Gras">
            <Bold size={14} />
          </button>
          <button type="button" className="p-1.5 rounded hover:bg-accent text-muted-foreground" title="Italique">
            <Italic size={14} />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button type="button" className="p-1.5 rounded hover:bg-accent text-muted-foreground" title="Titre">
            <Heading1 size={14} />
          </button>
          <button type="button" className="p-1.5 rounded hover:bg-accent text-muted-foreground" title="Liste">
            <List size={14} />
          </button>
          <div className="flex-1" />
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <FileText size={10} />
            Editeur de texte
          </span>
        </div>
      )}
      {/* Editor area */}
      <textarea
        className="flex-1 w-full min-h-[280px] p-4 text-sm bg-background text-foreground border-0 resize-none focus:outline-none leading-relaxed"
        value={textContent}
        onChange={handleChange}
        readOnly={readOnly}
        placeholder="Saisissez le contenu du document..."
        spellCheck
      />
    </div>
  )
}

export default DocumentEditor
