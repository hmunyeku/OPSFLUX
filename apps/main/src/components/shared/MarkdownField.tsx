/**
 * MarkdownField / MarkdownDisplay — lightweight "bloc-notes" widgets.
 *
 * Pattern chosen after surveying the codebase:
 *   * AssistantPanel already renders markdown via `marked.parse()` with
 *     escaping and GFM/breaks options — same approach reused here.
 *   * Every other module uses plain `<textarea>` for input. We keep the
 *     native textarea (accessible, copy/paste works, keyboard familiar)
 *     and add a toggle to preview the rendered output before saving.
 *   * No new dependency: `marked` is already in `apps/main/package.json`.
 *
 * MarkdownField — controlled input with Edit / Preview toggle buttons.
 * MarkdownDisplay — read-only render for detail views.
 *
 * Markdown features supported (via marked GFM): headings, bold, italic,
 * strikethrough, lists, checkboxes, tables, links, code blocks, quotes.
 * Inputs are HTML-escaped before parsing so user content can never
 * inject raw HTML/scripts.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, Pencil } from 'lucide-react'
import { marked } from 'marked'
import { cn } from '@/lib/utils'

function renderMarkdown(content: string): string {
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return marked.parse(escaped, { breaks: true, gfm: true, async: false }) as string
}

const markdownBodyClass = cn(
  // Typography that matches the surrounding panel density
  'prose prose-sm max-w-none',
  'prose-p:my-1 prose-p:leading-snug prose-p:text-foreground',
  'prose-ul:my-1 prose-ol:my-1 prose-li:my-0',
  'prose-headings:mb-1 prose-headings:mt-2 prose-headings:text-foreground',
  'prose-h1:text-base prose-h2:text-sm prose-h3:text-xs',
  'prose-strong:text-foreground prose-em:text-foreground',
  'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
  'prose-code:text-foreground prose-code:bg-muted/50 prose-code:px-1 prose-code:rounded',
  'prose-code:before:content-none prose-code:after:content-none',
  'prose-blockquote:border-l-border prose-blockquote:text-muted-foreground',
  'prose-hr:border-border',
  'text-xs text-foreground',
)

interface MarkdownFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  className?: string
  /** Hide the edit/preview toggle (edit-only mode). */
  disablePreview?: boolean
  /** Keyboard shortcut hint shown in the toolbar (e.g. "Shift+Entrée = nouvelle ligne"). */
  hint?: string
}

/**
 * Text area with an Edit / Preview toggle. Uses `marked` for preview.
 * No new deps, no bundled editor — just a textarea and a rendered view.
 */
export function MarkdownField({
  value,
  onChange,
  placeholder,
  rows = 5,
  className,
  disablePreview = false,
  hint,
}: MarkdownFieldProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const html = useMemo(() => renderMarkdown(value || ''), [value])

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {!disablePreview && (
        <div className="flex items-center justify-between">
          <div className="inline-flex rounded border border-border overflow-hidden text-[10px]">
            <button
              type="button"
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 transition-colors',
                mode === 'edit'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted',
              )}
              onClick={() => setMode('edit')}
            >
              <Pencil size={10} /> {t('common.edit')}
            </button>
            <button
              type="button"
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 transition-colors border-l border-border',
                mode === 'preview'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-muted',
              )}
              onClick={() => setMode('preview')}
            >
              <Eye size={10} /> {t('common.preview')}
            </button>
          </div>
          {hint && (
            <span className="text-[10px] text-muted-foreground/60">{hint}</span>
          )}
        </div>
      )}

      {mode === 'edit' ? (
        <textarea
          className="gl-form-input resize-y font-mono text-xs"
          style={{ minHeight: `${rows * 1.6}rem` }}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          spellCheck
        />
      ) : (
        <div
          className={cn(
            markdownBodyClass,
            'min-h-[64px] rounded border border-border bg-muted/10 px-3 py-2',
          )}
          style={{ minHeight: `${rows * 1.6}rem` }}
          dangerouslySetInnerHTML={{
            __html:
              html.trim() ||
              `<p class="text-muted-foreground/50">${t('common.empty_preview')}</p>`,
          }}
        />
      )}
    </div>
  )
}

interface MarkdownDisplayProps {
  value: string | null | undefined
  className?: string
  /** Shown when value is empty. Defaults to an em-dash. */
  emptyLabel?: string
}

/**
 * Read-only markdown renderer. Use inside ReadOnlyRow when the field is
 * multi-paragraph / bullet list / table. Escapes HTML first (XSS safe).
 */
export function MarkdownDisplay({
  value,
  className,
  emptyLabel = '—',
}: MarkdownDisplayProps) {
  const html = useMemo(
    () => (value ? renderMarkdown(value) : ''),
    [value],
  )
  if (!value || !value.trim()) {
    return <span className="text-muted-foreground/60">{emptyLabel}</span>
  }
  return (
    <div
      className={cn(markdownBodyClass, className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
