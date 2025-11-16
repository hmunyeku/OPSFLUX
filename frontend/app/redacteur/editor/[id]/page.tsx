import { EditorContent } from "@/components/redacteur/editor-content"

export default function EditorPage({ params }: { params: { id: string } }) {
  return <EditorContent documentId={params.id} />
}
