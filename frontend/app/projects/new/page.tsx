import { ProjectForm } from "@/components/projects/project-form"

export default function CreateProjectPage() {
  return (
    <div className="container max-w-4xl py-6">
      <ProjectForm mode="create" />
    </div>
  )
}
