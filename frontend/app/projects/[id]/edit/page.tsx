"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ProjectForm } from "@/components/projects/project-form"
import { mockProjects } from "@/lib/project-mock-data"
import type { Project } from "@/lib/projects-api"
import { RefreshCw, AlertCircle, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function EditProjectPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params?.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Load project from mock data
    const found = mockProjects.find((p) => p.id === projectId)
    if (found) {
      // Convert mock project to full Project type
      setProject({
        ...found,
        currency: "EUR",
        team: (found.team || []).map((m: any) => ({
          ...m,
          userId: m.id,
          email: `${m.name?.toLowerCase().replace(" ", ".")}@example.com`,
          permissions: [],
          joinedAt: new Date(),
        })),
        tags: found.tags || [],
        isFavorite: found.isFavorite || false,
        isArchived: false,
        createdBy: "admin",
      } as Project)
    }
    setIsLoading(false)
  }, [projectId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
        <AlertCircle className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Projet non trouve</h2>
        <p className="text-muted-foreground">Le projet demande n'existe pas ou a ete supprime.</p>
        <Button onClick={() => router.push("/projects/list")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux projets
        </Button>
      </div>
    )
  }

  return (
    <div className="container max-w-4xl py-6">
      <ProjectForm mode="edit" project={project} />
    </div>
  )
}
