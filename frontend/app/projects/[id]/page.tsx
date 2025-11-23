"use client"

import { useParams, useRouter } from "next/navigation"
import { useProject } from "@/hooks/use-projects"
import { ProjectDetailView } from "@/components/projects/project-detail-view"

export default function ProjectDetailPage() {
  const params = useParams()
  const projectId = params?.id as string

  return <ProjectDetailView projectId={projectId} />
}
