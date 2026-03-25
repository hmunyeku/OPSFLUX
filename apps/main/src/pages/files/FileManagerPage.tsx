/**
 * FileManagerPage — Professional OpsFlux file manager.
 *
 * Full-featured: preview panel, multi-select, context menu, drag & drop,
 * grid/list views, sort/filter, keyboard navigation, responsive mobile.
 * Permission-gated: requires admin.fs or core.settings.manage.
 */
import { useState, useCallback } from 'react'
import { FolderOpen, Menu, X } from 'lucide-react'
import { PanelHeader } from '@/components/layout/PanelHeader'
import { usePermission } from '@/hooks/usePermission'

// Hooks
import { useFileManager } from './hooks/useFileManager'
import type { FSItem } from './hooks/useFileManager'
import { useFileSelection } from './hooks/useFileSelection'
import { useFileDragDrop } from './hooks/useFileDragDrop'
import { useFileKeyboard } from './hooks/useFileKeyboard'

// Components
import { FileTree } from './components/FileTree'
import { FileBreadcrumbs } from './components/FileBreadcrumbs'
import { FileToolbar } from './components/FileToolbar'
import { FileListView } from './components/FileListView'
import { FileGridView } from './components/FileGridView'
import { FilePreviewPanel } from './components/FilePreviewPanel'
import { FileContextMenu } from './components/FileContextMenu'
import { FileDropZone } from './components/FileDropZone'
import { FileStatusBar } from './components/FileStatusBar'
import { NameDialog } from './components/NameDialog'

export default function FileManagerPage() {
  const { hasPermission } = usePermission()
  const canManage = hasPermission('admin.fs') || hasPermission('core.settings.manage')

  const fm = useFileManager()
  const selection = useFileSelection(fm.items)
  const [focusedIndex, setFocusedIndex] = useState(0)

  const dragDrop = useFileDragDrop(fm.handleUpload, fm.setIsDragging)

  const keyboardRef = useFileKeyboard({
    items: fm.items,
    focusedIndex,
    setFocusedIndex,
    openItem: fm.openItem,
    toggleSelect: selection.toggleSelect,
    selectAll: selection.selectAll,
    clearSelection: selection.clearSelection,
    handleDelete: fm.handleDelete,
    setNameDialog: fm.setNameDialog,
    navigateUp: fm.navigateUp,
    setPreviewItem: fm.setPreviewItem,
    setContextMenu: fm.setContextMenu,
  })

  const handleContextMenu = useCallback((e: React.MouseEvent, item: FSItem) => {
    fm.setContextMenu({ x: e.clientX, y: e.clientY, item })
  }, [fm])

  const apiBase = import.meta.env.VITE_API_URL || ''

  // ── Permission gate ──
  if (!canManage) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <FolderOpen size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">Accès non autorisé</p>
          <p className="text-xs mt-1">Vous n'avez pas la permission d'accéder au gestionnaire de fichiers.</p>
        </div>
      </div>
    )
  }

  const allSelected = fm.items.length > 0 && selection.selectedItems.size === fm.items.length

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden" ref={keyboardRef} tabIndex={0}>
      {/* Header */}
      <PanelHeader icon={FolderOpen} title="Gestionnaire de fichiers" subtitle="Documents, pièces jointes et médias">
        <button onClick={() => fm.setSidebarOpen(!fm.sidebarOpen)} className="p-1.5 rounded hover:bg-accent text-muted-foreground lg:hidden">
          {fm.sidebarOpen ? <X size={14} /> : <Menu size={14} />}
        </button>
      </PanelHeader>

      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Sidebar — desktop */}
        <div className="w-48 shrink-0 border-r border-border overflow-y-auto bg-muted/20 hidden lg:block">
          <FileTree
            rootDirs={fm.rootDirs}
            currentPath={fm.currentPath}
            expandedDirs={fm.expandedDirs}
            getChildren={fm.getChildren}
            onNavigate={fm.loadDir}
            onToggleExpand={fm.toggleExpand}
          />
        </div>

        {/* Sidebar — mobile slide-over */}
        {fm.sidebarOpen && (
          <div className="fixed inset-0 z-[200] lg:hidden" onClick={() => fm.setSidebarOpen(false)}>
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute inset-y-0 left-0 w-64 bg-background border-r border-border shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-sm font-semibold">Navigation</span>
                <button onClick={() => fm.setSidebarOpen(false)} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
              </div>
              <FileTree
                rootDirs={fm.rootDirs}
                currentPath={fm.currentPath}
                expandedDirs={fm.expandedDirs}
                getChildren={fm.getChildren}
                onNavigate={fm.loadDir}
                onToggleExpand={fm.toggleExpand}
              />
            </div>
          </div>
        )}

        {/* Content area */}
        <div
          className="flex-1 flex flex-col min-w-0 overflow-hidden relative"
          {...dragDrop}
        >
          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
            <FileBreadcrumbs
              breadcrumbs={fm.breadcrumbs}
              currentPath={fm.currentPath}
              onNavigate={fm.loadDir}
              onNavigateUp={fm.navigateUp}
            />
          </div>

          {/* Toolbar */}
          <FileToolbar
            search={fm.search}
            onSearchChange={fm.setSearch}
            viewMode={fm.viewMode}
            onViewModeChange={fm.changeViewMode}
            filterType={fm.filterType}
            onFilterChange={fm.setFilterType}
            selectedCount={selection.selectedItems.size}
            onBatchDelete={() => fm.handleBatchDelete(selection.selectedItems).then(() => selection.clearSelection())}
            onCreateFolder={() => fm.setNameDialog({ mode: 'create' })}
            onUpload={fm.handleUpload}
            onRefresh={fm.refresh}
          />

          {/* File list/grid */}
          <div className="flex-1 overflow-y-auto">
            {fm.viewMode === 'list' ? (
              <FileListView
                items={fm.items}
                loading={fm.loading}
                search={fm.search}
                isSelected={selection.isSelected}
                allSelected={allSelected}
                focusedIndex={focusedIndex}
                sortBy={fm.sortBy}
                sortDir={fm.sortDir}
                onToggleSort={fm.toggleSort}
                onSelectAll={selection.selectAll}
                onClearSelection={selection.clearSelection}
                onToggleSelect={selection.toggleSelect}
                onOpen={fm.openItem}
                onContextMenu={handleContextMenu}
              />
            ) : (
              <FileGridView
                items={fm.items}
                loading={fm.loading}
                search={fm.search}
                isSelected={selection.isSelected}
                focusedIndex={focusedIndex}
                apiBase={apiBase}
                onToggleSelect={selection.toggleSelect}
                onOpen={fm.openItem}
                onContextMenu={handleContextMenu}
              />
            )}
          </div>

          {/* Drop zone overlay */}
          <FileDropZone active={fm.isDragging} />

          {/* Status bar */}
          <FileStatusBar
            stats={fm.stats}
            currentPath={fm.currentPath}
            selectedCount={selection.selectedItems.size}
          />
        </div>

        {/* Preview panel */}
        {fm.previewItem && !fm.previewItem.isDirectory && (
          <FilePreviewPanel
            item={fm.previewItem}
            apiBase={apiBase}
            onClose={() => fm.setPreviewItem(null)}
            onDownload={fm.getDownloadUrl}
            onRename={(item) => fm.setNameDialog({ mode: 'rename', item })}
            onDelete={fm.handleDelete}
          />
        )}
      </div>

      {/* Context menu */}
      {fm.contextMenu && (
        <FileContextMenu
          position={{ x: fm.contextMenu.x, y: fm.contextMenu.y }}
          item={fm.contextMenu.item}
          downloadUrl={fm.getDownloadUrl(fm.contextMenu.item.path)}
          onClose={() => fm.setContextMenu(null)}
          onOpen={fm.openItem}
          onRename={(item) => fm.setNameDialog({ mode: 'rename', item })}
          onDelete={fm.handleDelete}
          onCopyPath={fm.copyPath}
        />
      )}

      {/* Name dialog */}
      {fm.nameDialog && (
        <NameDialog
          title={fm.nameDialog.mode === 'create' ? 'Nouveau dossier' : `Renommer "${fm.nameDialog.item?.name}"`}
          defaultValue={fm.nameDialog.mode === 'rename' ? fm.nameDialog.item?.name : ''}
          onCancel={() => fm.setNameDialog(null)}
          onConfirm={(name) => {
            if (fm.nameDialog?.mode === 'create') fm.handleCreateFolder(name)
            else if (fm.nameDialog?.item) fm.handleRename(fm.nameDialog.item, name)
          }}
        />
      )}
    </div>
  )
}
