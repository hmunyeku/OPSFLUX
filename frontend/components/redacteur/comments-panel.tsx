"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, Send, Check, Reply, Trash2 } from "lucide-react"
import type { Comment } from "./extensions/comments-extension"

interface CommentsPanelProps {
  reportId: string
  comments: Comment[]
  activeCommentId?: string
  onAddComment: (text: string) => Promise<void>
  onReplyComment: (commentId: string, text: string) => Promise<void>
  onResolveComment: (commentId: string) => Promise<void>
  onDeleteComment: (commentId: string) => Promise<void>
  onCommentClick: (commentId: string) => void
}

export function CommentsPanel({
  reportId,
  comments,
  activeCommentId,
  onAddComment,
  onReplyComment,
  onResolveComment,
  onDeleteComment,
  onCommentClick,
}: CommentsPanelProps) {
  const [newCommentText, setNewCommentText] = useState("")
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [showResolved, setShowResolved] = useState(false)

  const filteredComments = comments.filter((c) =>
    showResolved ? true : !c.resolved
  )

  const handleAddComment = async () => {
    if (!newCommentText.trim()) return
    await onAddComment(newCommentText)
    setNewCommentText("")
  }

  const handleReply = async (commentId: string) => {
    if (!replyText.trim()) return
    await onReplyComment(commentId, replyText)
    setReplyText("")
    setReplyingTo(null)
  }

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }

  const CommentThread = ({ comment, depth = 0 }: { comment: Comment; depth?: number }) => {
    const isActive = activeCommentId === comment.id

    return (
      <div
        className={`space-y-2 ${depth > 0 ? "ml-8" : ""} ${
          isActive ? "ring-2 ring-primary rounded-lg p-2" : ""
        }`}
      >
        <div
          className={`flex gap-3 p-3 rounded-lg border ${
            comment.resolved
              ? "bg-muted/30 border-muted"
              : "bg-background hover:bg-muted/20 cursor-pointer"
          } transition-colors`}
          onClick={() => !comment.resolved && onCommentClick(comment.id)}
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={comment.userAvatar} />
            <AvatarFallback className="text-xs">
              {getInitials(comment.userName)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{comment.userName}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(comment.createdAt).toLocaleString("fr-FR", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-sm mt-1 whitespace-pre-wrap">{comment.text}</p>
              </div>

              <div className="flex items-center gap-1">
                {comment.resolved && (
                  <Badge variant="secondary" className="text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Résolu
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 mt-2">
              {!comment.resolved && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      setReplyingTo(comment.id)
                    }}
                  >
                    <Reply className="h-3 w-3 mr-1" />
                    Répondre
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      onResolveComment(comment.id)
                    }}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Résoudre
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteComment(comment.id)
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>

            {replyingTo === comment.id && (
              <div className="mt-2 space-y-2">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Votre réponse..."
                  className="min-h-[60px] text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setReplyingTo(null)
                      setReplyText("")
                    }}
                  >
                    Annuler
                  </Button>
                  <Button size="sm" onClick={() => handleReply(comment.id)}>
                    <Send className="h-3 w-3 mr-1" />
                    Envoyer
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Render replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="space-y-2">
            {comment.replies.map((reply) => (
              <CommentThread key={reply.id} comment={reply} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            <CardTitle className="text-base">Commentaires</CardTitle>
            <Badge variant="secondary">{filteredComments.length}</Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowResolved(!showResolved)}
            className="text-xs"
          >
            {showResolved ? "Masquer résolus" : "Afficher résolus"}
          </Button>
        </div>
      </CardHeader>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {filteredComments.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>Aucun commentaire</p>
              <p className="text-xs mt-1">Sélectionnez du texte pour ajouter un commentaire</p>
            </div>
          ) : (
            filteredComments.map((comment) => (
              <CommentThread key={comment.id} comment={comment} />
            ))
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t space-y-2">
        <Textarea
          value={newCommentText}
          onChange={(e) => setNewCommentText(e.target.value)}
          placeholder="Ajouter un commentaire..."
          className="min-h-[80px]"
        />
        <div className="flex justify-end">
          <Button onClick={handleAddComment} disabled={!newCommentText.trim()}>
            <Send className="h-4 w-4 mr-2" />
            Commenter
          </Button>
        </div>
      </div>
    </Card>
  )
}
