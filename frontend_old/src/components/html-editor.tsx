"use client"

import { useEffect, useRef } from "react"
import Editor, { OnMount } from "@monaco-editor/react"
import type { editor } from "monaco-editor"

interface HtmlEditorProps {
  value: string
  onChange: (value: string) => void
  height?: string
  readOnly?: boolean
}

export default function HtmlEditor({
  value,
  onChange,
  height = "400px",
  readOnly = false,
}: HtmlEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const handleEditorDidMount: OnMount = (editor) => {
    editorRef.current = editor
    // Configure editor options
    editor.updateOptions({
      minimap: { enabled: false },
      fontSize: 13,
      lineNumbers: "on",
      roundedSelection: true,
      scrollBeyondLastLine: false,
      readOnly,
      automaticLayout: true,
      wordWrap: "on",
      wrappingStrategy: "advanced",
      formatOnPaste: true,
      formatOnType: true,
    })
  }

  const handleChange = (value: string | undefined) => {
    onChange(value || "")
  }

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (editorRef.current) {
        editorRef.current.dispose()
      }
    }
  }, [])

  return (
    <div className="border rounded-lg overflow-hidden">
      <Editor
        height={height}
        defaultLanguage="html"
        value={value}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme="vs-light"
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: "on",
          roundedSelection: true,
          scrollBeyondLastLine: false,
          readOnly,
          automaticLayout: true,
          wordWrap: "on",
          wrappingStrategy: "advanced",
          formatOnPaste: true,
          formatOnType: true,
          tabSize: 2,
          insertSpaces: true,
        }}
        loading={
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">Chargement de l'éditeur...</div>
          </div>
        }
      />
    </div>
  )
}
