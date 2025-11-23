import { EditorContent } from "@/components/redacteur/editor-content"
import { use } from "react"

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <EditorContent documentId={id} />
}
