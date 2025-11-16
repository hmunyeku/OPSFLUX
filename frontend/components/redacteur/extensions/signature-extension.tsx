"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react"
import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Settings2, PenTool, Trash2, Upload } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Types
interface SignatureConfig {
  signatory: string
  role: string
  location?: string
  required: boolean
}

interface SignatureAttributes {
  config: SignatureConfig
  signature?: string // Base64 image
  signedAt?: string
  ipAddress?: string
}

// Composant de rendu
const SignatureBlockComponent = ({ node, updateAttributes, deleteNode, editor }: any) => {
  const { config, signature, signedAt, ipAddress } = node.attrs as SignatureAttributes
  const [showConfig, setShowConfig] = useState(false)
  const [editConfig, setEditConfig] = useState<SignatureConfig>(config || {
    signatory: "",
    role: "",
    location: "",
    required: false,
  })
  const [isDrawing, setIsDrawing] = useState(false)
  const [showDrawPad, setShowDrawPad] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null)

  useEffect(() => {
    if (canvasRef.current) {
      const context = canvasRef.current.getContext("2d")
      if (context) {
        context.strokeStyle = "#000"
        context.lineWidth = 2
        context.lineCap = "round"
        context.lineJoin = "round"
        setCtx(context)
      }
    }
  }, [showDrawPad])

  const handleSaveConfig = () => {
    updateAttributes({ config: editConfig })
    setShowConfig(false)
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!ctx || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !ctx || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    if (ctx) {
      ctx.closePath()
    }
    setIsDrawing(false)
  }

  const clearCanvas = () => {
    if (ctx && canvasRef.current) {
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    }
  }

  const saveSignature = () => {
    if (canvasRef.current) {
      const signatureData = canvasRef.current.toDataURL("image/png")
      const now = new Date().toISOString()

      updateAttributes({
        signature: signatureData,
        signedAt: now,
        ipAddress: "Client IP" // À récupérer côté serveur
      })

      setShowDrawPad(false)
    }
  }

  const handleUploadSignature = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const signatureData = event.target?.result as string
        const now = new Date().toISOString()

        updateAttributes({
          signature: signatureData,
          signedAt: now,
          ipAddress: "Client IP"
        })
      }
      reader.readAsDataURL(file)
    }
  }

  const removeSignature = () => {
    updateAttributes({
      signature: undefined,
      signedAt: undefined,
      ipAddress: undefined
    })
  }

  return (
    <NodeViewWrapper className="signature-block my-4">
      <Card className={`${config?.required && !signature ? "border-yellow-500" : "border-primary/20"}`}>
        <CardHeader className="p-3 bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PenTool className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Signature Électronique</CardTitle>
              {config?.required && (
                <Badge variant="destructive" className="text-xs">
                  Requis
                </Badge>
              )}
              {signature && (
                <Badge variant="default" className="text-xs">
                  Signé
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Dialog open={showConfig} onOpenChange={setShowConfig}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Configuration de la Signature</DialogTitle>
                    <DialogDescription>
                      Définissez les informations du signataire
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signatory">Nom du signataire</Label>
                      <Input
                        id="signatory"
                        value={editConfig.signatory}
                        onChange={(e) =>
                          setEditConfig({ ...editConfig, signatory: e.target.value })
                        }
                        placeholder="Jean Dupont"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="role">Rôle/Fonction</Label>
                      <Input
                        id="role"
                        value={editConfig.role}
                        onChange={(e) =>
                          setEditConfig({ ...editConfig, role: e.target.value })
                        }
                        placeholder="Directeur"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">Lieu (optionnel)</Label>
                      <Input
                        id="location"
                        value={editConfig.location || ""}
                        onChange={(e) =>
                          setEditConfig({ ...editConfig, location: e.target.value })
                        }
                        placeholder="Paris, France"
                      />
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="required"
                        checked={editConfig.required}
                        onChange={(e) =>
                          setEditConfig({ ...editConfig, required: e.target.checked })
                        }
                        className="rounded"
                      />
                      <Label htmlFor="required" className="cursor-pointer">
                        Signature obligatoire
                      </Label>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-4 border-t">
                      <Button variant="outline" onClick={() => setShowConfig(false)}>
                        Annuler
                      </Button>
                      <Button onClick={handleSaveConfig}>Enregistrer</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {editor.isEditable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={deleteNode}
                >
                  ×
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          <div className="space-y-4">
            {/* Informations signataire */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="font-medium text-muted-foreground">Signataire:</span>
                <p className="font-medium">{config?.signatory || "Non défini"}</p>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Rôle:</span>
                <p className="font-medium">{config?.role || "Non défini"}</p>
              </div>
              {config?.location && (
                <div className="col-span-2">
                  <span className="font-medium text-muted-foreground">Lieu:</span>
                  <p className="font-medium">{config.location}</p>
                </div>
              )}
            </div>

            {/* Zone de signature */}
            <div className="border-2 border-dashed rounded-lg p-4 bg-muted/20">
              {signature ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center">
                    <img
                      src={signature}
                      alt="Signature"
                      className="max-h-32 border bg-white p-2 rounded"
                    />
                  </div>
                  <div className="text-xs text-center text-muted-foreground space-y-1">
                    <p>Signé le {signedAt ? new Date(signedAt).toLocaleString("fr-FR") : "N/A"}</p>
                    {ipAddress && <p>IP: {ipAddress}</p>}
                  </div>
                  {editor.isEditable && (
                    <div className="flex justify-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={removeSignature}
                        className="text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Supprimer la signature
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {!showDrawPad ? (
                    <>
                      <p className="text-center text-sm text-muted-foreground">
                        Aucune signature
                      </p>
                      {editor.isEditable && (
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowDrawPad(true)}
                            className="w-full"
                          >
                            <PenTool className="h-3.5 w-3.5 mr-2" />
                            Dessiner ma signature
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => document.getElementById("signature-upload")?.click()}
                          >
                            <Upload className="h-3.5 w-3.5 mr-2" />
                            Importer une signature
                          </Button>
                          <input
                            id="signature-upload"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleUploadSignature}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Dessinez votre signature</Label>
                        <Button variant="ghost" size="sm" onClick={clearCanvas}>
                          Effacer
                        </Button>
                      </div>
                      <canvas
                        ref={canvasRef}
                        width={400}
                        height={150}
                        className="border-2 border-primary/20 rounded bg-white cursor-crosshair w-full"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDrawPad(false)}
                          className="flex-1"
                        >
                          Annuler
                        </Button>
                        <Button
                          size="sm"
                          onClick={saveSignature}
                          className="flex-1"
                        >
                          Enregistrer
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Warning si requis mais pas signé */}
            {config?.required && !signature && (
              <div className="flex items-center gap-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded text-xs text-yellow-700 dark:text-yellow-400">
                <span className="font-medium">⚠️ Signature obligatoire pour ce document</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </NodeViewWrapper>
  )
}

// Extension Tiptap
export const SignatureExtension = Node.create({
  name: "signature",

  group: "block",

  atom: true,

  addAttributes() {
    return {
      config: {
        default: {
          signatory: "",
          role: "",
          location: "",
          required: false,
        },
      },
      signature: {
        default: null,
      },
      signedAt: {
        default: null,
      },
      ipAddress: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='signature']",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "signature" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SignatureBlockComponent)
  },

  addCommands() {
    return {
      setSignature:
        (attributes: Partial<SignatureAttributes>) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          })
        },
    }
  },
})
