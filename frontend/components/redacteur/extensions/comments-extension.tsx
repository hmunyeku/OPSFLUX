"use client"

import { Mark, mergeAttributes } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

// Types
export interface Comment {
  id: string
  text: string
  userId: string
  userName: string
  userAvatar?: string
  createdAt: string
  resolved: boolean
  replies?: Comment[]
}

interface CommentAttributes {
  commentId: string
}

// Extension mark pour les commentaires
export const CommentsExtension = Mark.create({
  name: "comment",

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes) => {
          if (!attributes.commentId) {
            return {}
          }
          return {
            "data-comment-id": attributes.commentId,
            class: "comment-highlight",
          }
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "span[data-comment-id]",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "comment-highlight" }), 0]
  },

  addCommands() {
    return {
      setComment:
        (commentId: string) =>
        ({ commands }: any) => {
          return commands.setMark(this.name, { commentId })
        },
      unsetComment:
        () =>
        ({ commands }: any) => {
          return commands.unsetMark(this.name)
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("commentDecorations"),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = []
            const { doc } = state

            doc.descendants((node, pos) => {
              if (node.marks) {
                node.marks.forEach((mark) => {
                  if (mark.type.name === "comment") {
                    const from = pos
                    const to = pos + node.nodeSize
                    decorations.push(
                      Decoration.inline(from, to, {
                        class: "comment-highlight bg-yellow-200/50 dark:bg-yellow-500/20 cursor-pointer",
                        "data-comment-id": mark.attrs.commentId,
                      })
                    )
                  }
                })
              }
            })

            return DecorationSet.create(doc, decorations)
          },
        },
      }),
    ]
  },
})

// Note: Le composant UI pour afficher/gérer les commentaires sera dans un fichier séparé
// components/redacteur/comments-panel.tsx
