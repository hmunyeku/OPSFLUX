"use client"

import { useEditor, EditorContent } from "@tiptap/react"
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
} from "lucide-react"
import { Separator } from "@/components/ui/separator"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useState } from "react"

interface TiptapEditorProps {
  content?: string
  onChange?: (content: string) => void
  editable?: boolean
  placeholder?: string
}

export function TiptapEditor({
  content = "",
  onChange,
  editable = true,
  placeholder = "Commencez à écrire...",
}: TiptapEditorProps) {
  const [linkUrl, setLinkUrl] = useState("")
  const [showLinkInput, setShowLinkInput] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline hover:text-primary/80",
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: "max-w-full h-auto rounded",
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "border-collapse table-auto w-full",
        },
      }),
      TableRow,
      TableHeader.configure({
        HTMLAttributes: {
          class: "border border-muted p-2 bg-muted font-semibold text-left",
        },
      }),
      TableCell.configure({
        HTMLAttributes: {
          class: "border border-muted p-2",
        },
      }),
      TextStyle,
      Color,
      Highlight.configure({
        multicolor: true,
      }),
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        class: "prose prose-sm sm:prose lg:prose-lg xl:prose-xl max-w-none focus:outline-none min-h-[500px] px-4 py-3",
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
  })

  if (!editor) {
    return null
  }

  const addLink = () => {
    if (linkUrl) {
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: linkUrl })
        .run()
      setLinkUrl("")
      setShowLinkInput(false)
    }
  }

  const addImage = () => {
    const url = window.prompt("URL de l'image")
    if (url) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }

  const addTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  return (
    <div className="flex flex-col border rounded-md">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 p-2">
        {/* Undo/Redo */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            type="button"
          >
            <Undo className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            type="button"
          >
            <Redo className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Text Styles */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              Titre
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>
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
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-6" />

        {/* Formatting */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("bold") ? "bg-muted" : ""}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            type="button"
          >
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("italic") ? "bg-muted" : ""}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            type="button"
          >
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("underline") ? "bg-muted" : ""}`}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            type="button"
          >
            <UnderlineIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("strike") ? "bg-muted" : ""}`}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            type="button"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("code") ? "bg-muted" : ""}`}
            onClick={() => editor.chain().focus().toggleCode().run()}
            type="button"
          >
            <Code className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Alignment */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive({ textAlign: "left" }) ? "bg-muted" : ""}`}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            type="button"
          >
            <AlignLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive({ textAlign: "center" }) ? "bg-muted" : ""}`}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            type="button"
          >
            <AlignCenter className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive({ textAlign: "right" }) ? "bg-muted" : ""}`}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            type="button"
          >
            <AlignRight className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive({ textAlign: "justify" }) ? "bg-muted" : ""}`}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            type="button"
          >
            <AlignJustify className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Lists */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("bulletList") ? "bg-muted" : ""}`}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            type="button"
          >
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("orderedList") ? "bg-muted" : ""}`}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            type="button"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`h-7 w-7 p-0 ${editor.isActive("blockquote") ? "bg-muted" : ""}`}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            type="button"
          >
            <Quote className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Insert */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
            type="button"
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>

          {showLinkInput ? (
            <div className="flex items-center gap-1 ml-2">
              <Input
                type="url"
                placeholder="https://..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="h-7 w-48 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    addLink()
                  }
                }}
              />
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={addLink}
                type="button"
              >
                OK
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setShowLinkInput(false)
                  setLinkUrl("")
                }}
                type="button"
              >
                ✕
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 w-7 p-0 ${editor.isActive("link") ? "bg-muted" : ""}`}
              onClick={() => {
                if (editor.isActive("link")) {
                  editor.chain().focus().unsetLink().run()
                } else {
                  setShowLinkInput(true)
                }
              }}
              type="button"
            >
              <LinkIcon className="h-3.5 w-3.5" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={addImage}
            type="button"
          >
            <ImageIcon className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={addTable}
            type="button"
          >
            <TableIcon className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Separator orientation="vertical" className="h-6" />

        {/* Colors */}
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" type="button">
                <Palette className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="grid grid-cols-5 gap-1 p-2">
                {["#000000", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"].map(
                  (color) => (
                    <button
                      key={color}
                      className="h-6 w-6 rounded border"
                      style={{ backgroundColor: color }}
                      onClick={() => editor.chain().focus().setColor(color).run()}
                      type="button"
                    />
                  )
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" type="button">
                <Highlighter className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="grid grid-cols-5 gap-1 p-2">
                {["#fef08a", "#bef264", "#a7f3d0", "#a5f3fc", "#bfdbfe", "#ddd6fe", "#f9a8d4"].map((color) => (
                  <button
                    key={color}
                    className="h-6 w-6 rounded border"
                    style={{ backgroundColor: color }}
                    onClick={() => editor.chain().focus().toggleHighlight({ color }).run()}
                    type="button"
                  />
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} className="flex-1" />
    </div>
  )
}
