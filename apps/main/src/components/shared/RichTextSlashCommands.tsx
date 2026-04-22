/**
 * RichTextSlashCommands — Notion-like "/" menu for the Tiptap editor.
 *
 * Typing `/` at the start of an empty line opens a floating menu of
 * block types. Arrow keys + Enter pick; Esc dismisses. Each entry
 * wraps a chained Tiptap command so the caller doesn't need to know
 * the ProseMirror plumbing.
 *
 * Installed extensions (dev dep added in package.json):
 *   @tiptap/suggestion — the core "trigger character -> render menu"
 *                        glue shared by mention, emoji, slash, etc.
 *   tippy.js          — the floating UI anchored to the caret.
 */
import { Extension } from '@tiptap/core'
import Suggestion, { type SuggestionOptions } from '@tiptap/suggestion'
import type { Editor, Range } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import {
  useEffect,
  useImperativeHandle,
  useState,
  forwardRef,
  type Ref,
} from 'react'
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Code2,
  Table as TableIcon,
  Type,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Command catalogue ───────────────────────────────────────────────
// Each command gets a consistent "select keywords + execute" shape so
// the filtering and rendering stay generic.

interface SlashItem {
  title: string
  subtitle: string
  icon: typeof Heading1
  keywords: string[]
  run: (editor: Editor, range: Range) => void
}

const ITEMS: SlashItem[] = [
  {
    title: 'Paragraphe',
    subtitle: 'Texte simple',
    icon: Type,
    keywords: ['paragraph', 'texte', 'p'],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setParagraph().run()
    },
  },
  {
    title: 'Titre 1',
    subtitle: 'Grand titre de section',
    icon: Heading1,
    keywords: ['h1', 'heading', 'titre', 'title'],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
    },
  },
  {
    title: 'Titre 2',
    subtitle: 'Sous-titre',
    icon: Heading2,
    keywords: ['h2', 'heading2', 'sous-titre', 'subtitle'],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
    },
  },
  {
    title: 'Titre 3',
    subtitle: 'Titre de paragraphe',
    icon: Heading3,
    keywords: ['h3', 'heading3'],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
    },
  },
  {
    title: 'Liste à puces',
    subtitle: 'Liste non ordonnée',
    icon: List,
    keywords: ['liste', 'bullet', 'ul', 'puces'],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: 'Liste numérotée',
    subtitle: 'Liste ordonnée 1. 2. 3.',
    icon: ListOrdered,
    keywords: ['numero', 'ordered', 'ol', 'numbered'],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: 'Citation',
    subtitle: 'Bloc de citation',
    icon: Quote,
    keywords: ['citation', 'quote', 'blockquote'],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: 'Tableau',
    subtitle: 'Tableau 3x3 avec en-tête',
    icon: TableIcon,
    keywords: ['table', 'tableau', 'grid'],
    run: (editor, range) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run()
    },
  },
  {
    title: 'Séparateur',
    subtitle: 'Ligne horizontale',
    icon: Minus,
    keywords: ['hr', 'separator', 'rule', 'ligne'],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
  {
    title: 'Code',
    subtitle: 'Bloc de code monospace',
    icon: Code2,
    keywords: ['code', 'codeblock', 'snippet'],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleCode().run()
    },
  },
]

function filterItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return ITEMS
  return ITEMS.filter((item) => {
    const hay = [item.title, item.subtitle, ...item.keywords].join(' ').toLowerCase()
    return hay.includes(q)
  }).slice(0, 10)
}

// ── React menu component ────────────────────────────────────────────

interface SlashMenuProps {
  items: SlashItem[]
  command: (item: SlashItem) => void
}

interface SlashMenuRef {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean
}

const SlashMenu = forwardRef(function SlashMenu(
  { items, command }: SlashMenuProps,
  ref: Ref<SlashMenuRef>,
) {
  const [selected, setSelected] = useState(0)

  // Reset highlight whenever the item list changes (typing narrows).
  useEffect(() => setSelected(0), [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelected((s) => (s - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        const item = items[selected]
        if (item) command(item)
        return true
      }
      return false
    },
  }))

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg">
        Aucune commande trouvée
      </div>
    )
  }

  return (
    <div className="max-h-80 w-64 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-xl">
      {items.map((item, idx) => {
        const Icon = item.icon
        return (
          <button
            key={item.title}
            type="button"
            onClick={() => command(item)}
            onMouseEnter={() => setSelected(idx)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left transition-colors',
              selected === idx
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
            )}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded border border-border bg-background shrink-0">
              <Icon size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-foreground">{item.title}</span>
              <span className="block text-[10px] text-muted-foreground truncate">
                {item.subtitle}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
})

// ── Tiptap extension ───────────────────────────────────────────────

type Options = {
  suggestion: Omit<SuggestionOptions, 'editor'>
}

export const SlashCommands = Extension.create<Options>({
  name: 'slashCommands',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        // Only trigger at the start of a block — matches Notion's UX.
        startOfLine: true,
        command: ({ editor, range, props }) => {
          const item = props as SlashItem
          item.run(editor, range)
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [Suggestion({ editor: this.editor, ...this.options.suggestion })]
  },
})

export const slashCommandsConfig: Options['suggestion'] = {
  char: '/',
  startOfLine: true,

  items: ({ query }) => filterItems(query),

  command: ({ editor, range, props }) => {
    const item = props as SlashItem
    item.run(editor, range)
  },

  render: () => {
    let component: ReactRenderer<SlashMenuRef> | null = null
    let popup: TippyInstance[] | null = null

    return {
      onStart: (props) => {
        component = new ReactRenderer(SlashMenu as unknown as React.ComponentType<SlashMenuProps>, {
          props,
          editor: props.editor,
        })

        if (!props.clientRect) return

        popup = tippy('body', {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: component.element,
          showOnCreate: true,
          interactive: true,
          trigger: 'manual',
          placement: 'bottom-start',
        })
      },

      onUpdate: (props) => {
        component?.updateProps(props)

        if (!props.clientRect || !popup) return
        popup[0].setProps({
          getReferenceClientRect: props.clientRect as () => DOMRect,
        })
      },

      onKeyDown: (props) => {
        if (props.event.key === 'Escape') {
          popup?.[0].hide()
          return true
        }
        return (component?.ref as SlashMenuRef | null)?.onKeyDown(props) ?? false
      },

      onExit: () => {
        popup?.[0].destroy()
        component?.destroy()
      },
    }
  },
}
