"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import LongText from "@/components/long-text"
import { getLevelVariant } from "../data/data"
import { getAuditLogs, type AuditLog } from "../data/audit-api"

interface Props {
  searchVal: string
}

export default function LogsTable({ searchVal }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true)
      try {
        const response = await getAuditLogs({
          skip: 0,
          limit: 100,
          search: searchVal || undefined,
        })
        setLogs(response.data)
        setTotal(response.total)
      } catch (error) {
        console.error("Error fetching audit logs:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchLogs()
  }, [searchVal])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Chargement des logs...</p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[180px] pl-4">Timestamp</TableHead>
          <TableHead className="w-[100px]">Level</TableHead>
          <TableHead>Message</TableHead>
          <TableHead className="w-[150px]">Source</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-center p-8 text-muted-foreground">
              Aucun log trouvé
            </TableCell>
          </TableRow>
        ) : (
          logs.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="pl-4 font-medium">
                <LongText>{new Date(entry.timestamp).toLocaleString()}</LongText>
              </TableCell>
              <TableCell>
                <Badge variant={getLevelVariant(entry.level)}>
                  {entry.level}
                </Badge>
              </TableCell>
              <TableCell>
                <LongText>{entry.message}</LongText>
              </TableCell>
              <TableCell>{entry.source}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="pl-4" colSpan={3}>
            Total
          </TableCell>
          <TableCell className="text-start">{total} logs</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}
