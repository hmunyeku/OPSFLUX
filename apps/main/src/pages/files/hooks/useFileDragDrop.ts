/**
 * useFileDragDrop — HTML5 drag & drop upload.
 */
import { useCallback, useRef } from 'react'

export function useFileDragDrop(onUpload: (files: FileList) => void, setIsDragging: (v: boolean) => void) {
  const dragCounter = useRef(0)

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer?.types.includes('Files')) setIsDragging(true)
  }, [setIsDragging])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }, [setIsDragging])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)
    if (e.dataTransfer?.files?.length) onUpload(e.dataTransfer.files)
  }, [onUpload, setIsDragging])

  return { onDragEnter, onDragLeave, onDragOver, onDrop }
}
