"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import { FloatingMenu } from "@tiptap/react/menus"
import { StarterKit } from "@tiptap/starter-kit"
import { Placeholder } from "@tiptap/extension-placeholder"
import { TextAlign } from "@tiptap/extension-text-align"
import { Underline } from "@tiptap/extension-underline"
import { Link } from "@tiptap/extension-link"
import { Image } from "@tiptap/extension-image"
import { Table } from "@tiptap/extension-table"
import { TableRow } from "@tiptap/extension-table-row"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { TextStyle } from "@tiptap/extension-text-style"
import { Color } from "@tiptap/extension-color"
import { Highlight } from "@tiptap/extension-highlight"
import { Typography } from "@tiptap/extension-typography"
import { TaskList } from "@tiptap/extension-task-list"
import { TaskItem } from "@tiptap/extension-task-item"
import { CharacterCount } from "@tiptap/extension-character-count"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { common, createLowlight } from "lowlight"
import { Button } from "@/components/ui/button"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Highlighter,
  Palette,
  Type,
  ListTodo,
  FileCode,
  MoreHorizontal,
  Pilcrow,
  CheckSquare,
  X,
  Plus,
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useState, useCallback, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const lowlight = createLowlight(common)

interface TiptapEditorProps {
  content?: string
  onChange?: (content: string) => void
  editable?: boolean
  placeholder?: string
  showWordCount?: boolean
}

// Slash command menu items
const slashMenuItems = [
  { title: "Titre 1", description: "Grand titre de section", icon: Heading1, command: "heading1" },
  { title: "Titre 2", description: "Titre moyen", icon: Heading2, command: "heading2" },
  { title: "Titre 3", description: "Petit titre", icon: Heading3, command: "heading3" },
  { title: "Paragraphe", description: "Texte simple", icon: Pilcrow, command: "paragraph" },
  { title: "Liste à puces", description: "Liste non ordonnée", icon: List, command: "bulletList" },
  { title: "Liste numérotée", description: "Liste ordonnée", icon: ListOrdered, command: "orderedList" },
  { title: "Liste de tâches", description: "Checklist interactive", icon: CheckSquare, command: "taskList" },
  { title: "Citation", description: "Bloc de citation", icon: Quote, command: "blockquote" },
  { title: "Code", description: "Bloc de code avec coloration", icon: FileCode, command: "codeBlock" },
  { title: "Séparateur", description: "Ligne horizontale", icon: Minus, command: "horizontalRule" },
  { title: "Tableau", description: "Tableau 3x3", icon: TableIcon, command: "table" },
  { title: "Image", description: "Insérer une image", icon: ImageIcon, command: "image" },
]

export function TiptapEditor({
  content = "",
  onChange,
  editable = true,
  placeholder = "Tapez '/' pour les commandes...",
  showWordCount = true,
}: TiptapEditorProps) {
  const [linkUrl, setLinkUrl] = useState("")
  const [showLinkPopover, setShowLinkPopover] = useState(false)
  const [slashMenuOpen, setSlashMenuOpen] = useState(false)
  const [slashMenuFilter, setSlashMenuFilter] = useState("")
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0)
  const slashMenuRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: false, // We use CodeBlockLowlight instead
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline decoration-primary/50 hover:decoration-primary cursor-pointer",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full h-auto rounded-lg shadow-sm border",
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "border-collapse table-auto w-full my-4",
        },
      }),
      TableRow,
      TableHeader.configure({
        HTMLAttributes: {
          class: "border border-border p-2 bg-muted font-semibold text-left",
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: "border border-border p-2",
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
      Typography,
      TaskList.configure({
        HTMLAttributes: {
          class: "not-prose",
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: "flex items-start gap-2 my-1",
        },
      }),
      CharacterCount,
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: "rounded-lg bg-muted p-4 font-mono text-sm overflow-x-auto",
        },
      }),
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[400px] px-6 py-4",
      },
      handleKeyDown: (view, event) => {
        // Handle slash command
        if (event.key === "/" && !slashMenuOpen) {
          setSlashMenuOpen(true)
          setSlashMenuFilter("")
          setSelectedSlashIndex(0)
          return false
        }

        // Handle slash menu navigation
        if (slashMenuOpen) {
          const filteredItems = slashMenuItems.filter(item =>
            item.title.toLowerCase().includes(slashMenuFilter.toLowerCase()) ||
            item.description.toLowerCase().includes(slashMenuFilter.toLowerCase())
          )

          if (event.key === "ArrowDown") {
            event.preventDefault()
            setSelectedSlashIndex(prev => Math.min(prev + 1, filteredItems.length - 1))
            return true
          }
          if (event.key === "ArrowUp") {
            event.preventDefault()
            setSelectedSlashIndex(prev => Math.max(prev - 1, 0))
            return true
          }
          if (event.key === "Enter" && filteredItems.length > 0) {
            event.preventDefault()
            executeSlashCommand(filteredItems[selectedSlashIndex].command)
            return true
          }
          if (event.key === "Escape") {
            setSlashMenuOpen(false)
            return true
          }
          if (event.key === "Backspace" && slashMenuFilter === "") {
            setSlashMenuOpen(false)
            return false
          }
          if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            setSlashMenuFilter(prev => prev + event.key)
            setSelectedSlashIndex(0)
          }
          if (event.key === "Backspace" && slashMenuFilter.length > 0) {
            setSlashMenuFilter(prev => prev.slice(0, -1))
          }
        }

        return false
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
      // Close slash menu when content changes significantly
      if (slashMenuOpen) {
        const text = editor.state.doc.textBetween(
          Math.max(0, editor.state.selection.from - 10),
          editor.state.selection.from
        )
        if (!text.includes("/")) {
          setSlashMenuOpen(false)
        }
      }
    },
    immediatelyRender: false,
  })

  const executeSlashCommand = useCallback((command: string) => {
    if (!editor) return

    // Delete the slash character
    editor.chain().focus().deleteRange({
      from: editor.state.selection.from - slashMenuFilter.length - 1,
      to: editor.state.selection.from,
    }).run()

    switch (command) {
      case "heading1":
        editor.chain().focus().toggleHeading({ level: 1 }).run()
        break
      case "heading2":
        editor.chain().focus().toggleHeading({ level: 2 }).run()
        break
      case "heading3":
        editor.chain().focus().toggleHeading({ level: 3 }).run()
        break
      case "paragraph":
        editor.chain().focus().setParagraph().run()
        break
      case "bulletList":
        editor.chain().focus().toggleBulletList().run()
        break
      case "orderedList":
        editor.chain().focus().toggleOrderedList().run()
        break
      case "taskList":
        editor.chain().focus().toggleTaskList().run()
        break
      case "blockquote":
        editor.chain().focus().toggleBlockquote().run()
        break
      case "codeBlock":
        editor.chain().focus().toggleCodeBlock().run()
        break
      case "horizontalRule":
        editor.chain().focus().setHorizontalRule().run()
        break
      case "table":
        editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        break
      case "image":
        const url = window.prompt("URL de l'image")
        if (url) {
          editor.chain().focus().setImage({ src: url }).run()
        }
        break
    }

    setSlashMenuOpen(false)
    setSlashMenuFilter("")
  }, [editor, slashMenuFilter])

  const addLink = useCallback(() => {
    if (!editor || !linkUrl) return

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: linkUrl })
      .run()
    setLinkUrl("")
    setShowLinkPopover(false)
  }, [editor, linkUrl])

  const removeLink = useCallback(() => {
    if (!editor) return
    editor.chain().focus().unsetLink().run()
    setShowLinkPopover(false)
  }, [editor])

  if (!editor) {
    return (
      <div className="flex flex-col border rounded-lg bg-background">
        <div className="h-12 border-b bg-muted/30 animate-pulse" />
        <div className="min-h-[400px] p-6 animate-pulse">
          <div className="h-4 bg-muted rounded w-3/4 mb-4" />
          <div className="h-4 bg-muted rounded w-1/2 mb-4" />
          <div className="h-4 bg-muted rounded w-2/3" />
        </div>
      </div>
    )
  }

  const filteredSlashItems = slashMenuItems.filter(item =>
    item.title.toLowerCase().includes(slashMenuFilter.toLowerCase()) ||
    item.description.toLowerCase().includes(slashMenuFilter.toLowerCase())
  )

  const wordCount = editor.storage.characterCount.words()
  const charCount = editor.storage.characterCount.characters()

  return (
    <div className="flex flex-col border rounded-lg bg-background shadow-sm">
      {/* Professional Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/20 p-1.5 sticky top-0 z-10">
        {/* Add Block Button */}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2 text-xs font-medium bg-primary/10 hover:bg-primary/20 border-primary/30"
          onClick={() => {
            editor.chain().focus().run()
            setSlashMenuOpen(true)
            setSlashMenuFilter("")
            setSelectedSlashIndex(0)
          }}
          title="Ajouter un bloc (ou tapez /)"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Bloc</span>
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* History */}
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Annuler (Ctrl+Z)"
          >
            <Undo className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Rétablir (Ctrl+Y)"
          >
            <Redo className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Block Type Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs font-normal">
              <Type className="h-4 w-4" />
              <span className="hidden sm:inline">
                {editor.isActive("heading", { level: 1 }) ? "Titre 1" :
                 editor.isActive("heading", { level: 2 }) ? "Titre 2" :
                 editor.isActive("heading", { level: 3 }) ? "Titre 3" :
                 editor.isActive("bulletList") ? "Liste" :
                 editor.isActive("orderedList") ? "Liste num." :
                 editor.isActive("taskList") ? "Tâches" :
                 editor.isActive("blockquote") ? "Citation" :
                 editor.isActive("codeBlock") ? "Code" : "Paragraphe"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Blocs de texte</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>
              <Pilcrow className="mr-2 h-4 w-4" />
              Paragraphe
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
              <Heading1 className="mr-2 h-4 w-4" />
              Titre 1
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
              <Heading2 className="mr-2 h-4 w-4" />
              Titre 2
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
              <Heading3 className="mr-2 h-4 w-4" />
              Titre 3
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Listes</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleBulletList().run()}>
              <List className="mr-2 h-4 w-4" />
              Liste à puces
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered className="mr-2 h-4 w-4" />
              Liste numérotée
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleTaskList().run()}>
              <CheckSquare className="mr-2 h-4 w-4" />
              Liste de tâches
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Autres</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleBlockquote().run()}>
              <Quote className="mr-2 h-4 w-4" />
              Citation
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
              <FileCode className="mr-2 h-4 w-4" />
              Bloc de code
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Text Formatting */}
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editor.isActive("bold") && "bg-muted")}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Gras (Ctrl+B)"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editor.isActive("italic") && "bg-muted")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italique (Ctrl+I)"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editor.isActive("underline") && "bg-muted")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Souligné (Ctrl+U)"
          >
            <UnderlineIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editor.isActive("strike") && "bg-muted")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Barré"
          >
            <Strikethrough className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editor.isActive("code") && "bg-muted")}
            onClick={() => editor.chain().focus().toggleCode().run()}
            title="Code inline"
          >
            <Code className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Alignment */}
        <div className="hidden sm:flex items-center">
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editor.isActive({ textAlign: "left" }) && "bg-muted")}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            title="Aligner à gauche"
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editor.isActive({ textAlign: "center" }) && "bg-muted")}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            title="Centrer"
          >
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editor.isActive({ textAlign: "right" }) && "bg-muted")}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            title="Aligner à droite"
          >
            <AlignRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 w-8 p-0", editor.isActive({ textAlign: "justify" }) && "bg-muted")}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            title="Justifier"
          >
            <AlignJustify className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="mx-1 h-6 hidden sm:block" />

        {/* Insert */}
        <div className="flex items-center">
          <Popover open={showLinkPopover} onOpenChange={setShowLinkPopover}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-8 w-8 p-0", editor.isActive("link") && "bg-muted")}
                title="Lien"
              >
                <LinkIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-3" align="start">
              <div className="space-y-2">
                <p className="text-sm font-medium">Insérer un lien</p>
                <Input
                  type="url"
                  placeholder="https://exemple.com"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addLink()}
                  className="h-8 text-sm"
                />
                <div className="flex gap-2">
                  <Button size="sm" className="h-7 text-xs" onClick={addLink}>
                    Appliquer
                  </Button>
                  {editor.isActive("link") && (
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={removeLink}>
                      Supprimer
                    </Button>
                  )}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => {
              const url = window.prompt("URL de l'image")
              if (url) editor.chain().focus().setImage({ src: url }).run()
            }}
            title="Image"
          >
            <ImageIcon className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            title="Tableau"
          >
            <TableIcon className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            title="Séparateur"
          >
            <Minus className="h-4 w-4" />
          </Button>
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Colors */}
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Couleur du texte">
                <Palette className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="p-2">
                <p className="text-xs text-muted-foreground mb-2">Couleur du texte</p>
                <div className="grid grid-cols-6 gap-1">
                  {["#000000", "#374151", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#9ca3af"].map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={`Couleur ${color}`}
                      className={`h-6 w-6 rounded border hover:scale-110 transition-transform bg-[${color}]`}
                      style={{ backgroundColor: color }}
                      onClick={() => editor.chain().focus().setColor(color).run()}
                    />
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 h-7 text-xs"
                  onClick={() => editor.chain().focus().unsetColor().run()}
                >
                  Réinitialiser
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Surlignage">
                <Highlighter className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="p-2">
                <p className="text-xs text-muted-foreground mb-2">Surlignage</p>
                <div className="grid grid-cols-5 gap-1">
                  {["#fef08a", "#bef264", "#a7f3d0", "#a5f3fc", "#bfdbfe", "#ddd6fe", "#f9a8d4", "#fecaca", "#fed7aa"].map((color) => (
                    <button
                      key={color}
                      type="button"
                      title={`Surlignage ${color}`}
                      className="h-6 w-6 rounded border hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      onClick={() => editor.chain().focus().toggleHighlight({ color }).run()}
                    />
                  ))}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 h-7 text-xs"
                  onClick={() => editor.chain().focus().unsetHighlight().run()}
                >
                  Supprimer
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Word count - pushed to right */}
        {showWordCount && (
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground px-2">
            <span>{wordCount} mots</span>
            <span className="text-muted-foreground/50">|</span>
            <span>{charCount} caractères</span>
          </div>
        )}
      </div>

      {/* Bubble Menu for text selection */}
      {editor && (
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-lg"
        >
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 w-7 p-0", editor.isActive("bold") && "bg-muted")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 w-7 p-0", editor.isActive("italic") && "bg-muted")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 w-7 p-0", editor.isActive("underline") && "bg-muted")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 w-7 p-0", editor.isActive("strike") && "bg-muted")}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </Button>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 w-7 p-0", editor.isActive("link") && "bg-muted")}
            onClick={() => setShowLinkPopover(true)}
          >
            <LinkIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 w-7 p-0", editor.isActive("code") && "bg-muted")}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code className="h-3.5 w-3.5" />
          </Button>
        </BubbleMenu>
      )}

      {/* Floating Menu for empty lines */}
      {editor && (
        <FloatingMenu
          editor={editor}
          className="flex items-center gap-0.5 rounded-lg border bg-background p-1 shadow-lg"
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <CheckSquare className="h-3.5 w-3.5" />
          </Button>
        </FloatingMenu>
      )}

      {/* Slash Command Menu */}
      {slashMenuOpen && (
        <div
          ref={slashMenuRef}
          className="absolute z-50 w-80 max-h-96 overflow-y-auto rounded-lg border bg-background shadow-xl"
          style={{
            top: "60px",
            left: "16px",
          }}
        >
          <div className="p-2 border-b">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">/</span>
              <span>{slashMenuFilter || "Rechercher un bloc..."}</span>
            </div>
          </div>
          <div className="p-1">
            {filteredSlashItems.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Aucun résultat
              </div>
            ) : (
              filteredSlashItems.map((item, index) => (
                <button
                  key={item.command}
                  type="button"
                  title={item.description}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-md p-2 text-left transition-colors",
                    index === selectedSlashIndex ? "bg-muted" : "hover:bg-muted/50"
                  )}
                  onClick={() => executeSlashCommand(item.command)}
                  onMouseEnter={() => setSelectedSlashIndex(index)}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="p-2 border-t">
            <p className="text-xs text-muted-foreground text-center">
              ↑↓ naviguer • Entrée sélectionner • Échap fermer
            </p>
          </div>
        </div>
      )}

      {/* Editor Content */}
      <div className="relative">
        <EditorContent editor={editor} className="min-h-[400px]" />

        {/* Click outside to close slash menu */}
        {slashMenuOpen && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setSlashMenuOpen(false)}
          />
        )}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Tapez <kbd className="px-1.5 py-0.5 bg-muted rounded font-mono text-[10px]">/</kbd> pour les commandes</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{editor.isEditable ? "Édition" : "Lecture seule"}</span>
        </div>
      </div>
    </div>
  )
}
