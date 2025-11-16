"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Settings2, Calculator, AlertCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

// Types
interface FormulaConfig {
  formula: string
  variables: Record<string, number>
  format: "number" | "currency" | "percentage"
  decimals: number
  currency?: string
}

interface FormulaAttributes {
  config: FormulaConfig
  result?: number
  error?: string
}

// Simple formula evaluator (sécurisé)
const evaluateFormula = (formula: string, variables: Record<string, number>): number => {
  // Replace variables with values
  let expression = formula
  for (const [key, value] of Object.entries(variables)) {
    expression = expression.replace(new RegExp(`\\b${key}\\b`, "g"), String(value))
  }

  // Security: only allow numbers and basic operators
  if (!/^[\d\s\+\-\*\/\(\)\.\%]+$/.test(expression)) {
    throw new Error("Formule invalide : caractères non autorisés")
  }

  // Evaluate
  try {
    return Function(`"use strict"; return (${expression})`)()
  } catch (e) {
    throw new Error("Erreur d'évaluation de la formule")
  }
}

// Format result
const formatResult = (value: number, format: string, decimals: number, currency?: string): string => {
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: currency || "EUR",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value)

    case "percentage":
      return new Intl.NumberFormat("fr-FR", {
        style: "percent",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value / 100)

    case "number":
    default:
      return new Intl.NumberFormat("fr-FR", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value)
  }
}

// Composant de rendu
const FormulaBlockComponent = ({ node, updateAttributes, deleteNode, editor }: any) => {
  const { config, result, error } = node.attrs as FormulaAttributes
  const [showConfig, setShowConfig] = useState(false)
  const [editConfig, setEditConfig] = useState<FormulaConfig>(config || {
    formula: "",
    variables: {},
    format: "number",
    decimals: 2,
    currency: "EUR",
  })
  const [localResult, setLocalResult] = useState<number | null>(result ?? null)
  const [localError, setLocalError] = useState<string | undefined>(error)

  // Calculate result
  const calculate = () => {
    try {
      const calculatedResult = evaluateFormula(config.formula, config.variables)
      setLocalResult(calculatedResult)
      setLocalError(undefined)
      updateAttributes({ result: calculatedResult, error: undefined })
    } catch (err: any) {
      setLocalError(err.message)
      setLocalResult(null)
      updateAttributes({ result: null, error: err.message })
    }
  }

  // Auto-calculate on mount if formula exists
  useEffect(() => {
    if (config?.formula && !result && !error) {
      calculate()
    }
  }, [])

  // Handle save config
  const handleSaveConfig = () => {
    updateAttributes({ config: editConfig })
    setShowConfig(false)

    // Recalculate with new config
    try {
      const calculatedResult = evaluateFormula(editConfig.formula, editConfig.variables)
      setLocalResult(calculatedResult)
      setLocalError(undefined)
      updateAttributes({ config: editConfig, result: calculatedResult, error: undefined })
    } catch (err: any) {
      setLocalError(err.message)
      setLocalResult(null)
      updateAttributes({ config: editConfig, result: null, error: err.message })
    }
  }

  // Handle variable change
  const handleVariableChange = (key: string, value: string) => {
    const numValue = parseFloat(value) || 0
    setEditConfig({
      ...editConfig,
      variables: { ...editConfig.variables, [key]: numValue },
    })
  }

  const handleAddVariable = () => {
    const varName = prompt("Nom de la variable (ex: A, prix, quantite)")
    if (varName && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) {
      setEditConfig({
        ...editConfig,
        variables: { ...editConfig.variables, [varName]: 0 },
      })
    }
  }

  const handleRemoveVariable = (key: string) => {
    const newVars = { ...editConfig.variables }
    delete newVars[key]
    setEditConfig({ ...editConfig, variables: newVars })
  }

  return (
    <NodeViewWrapper className="formula-block my-4">
      <Card className="border-primary/20">
        <CardHeader className="p-3 bg-primary/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm">Formule de Calcul</CardTitle>
              <Badge variant="outline" className="text-xs">
                {config?.format}
              </Badge>
            </div>
            <div className="flex items-center gap-1">
              <Dialog open={showConfig} onOpenChange={setShowConfig}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Configuration de la Formule</DialogTitle>
                    <DialogDescription>
                      Définissez votre formule et les variables
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="formula">Formule</Label>
                      <Textarea
                        id="formula"
                        value={editConfig.formula}
                        onChange={(e) =>
                          setEditConfig({ ...editConfig, formula: e.target.value })
                        }
                        placeholder="A + B * 1.2"
                        className="font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Opérateurs disponibles: +, -, *, /, %, ( )
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Variables</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAddVariable}
                          type="button"
                        >
                          + Ajouter
                        </Button>
                      </div>

                      <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded p-2">
                        {Object.entries(editConfig.variables).length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Aucune variable définie
                          </p>
                        ) : (
                          Object.entries(editConfig.variables).map(([key, value]) => (
                            <div key={key} className="flex items-center gap-2">
                              <Label className="w-24">{key}</Label>
                              <Input
                                type="number"
                                value={value}
                                onChange={(e) => handleVariableChange(key, e.target.value)}
                                className="flex-1"
                                step="any"
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveVariable(key)}
                                className="text-destructive"
                              >
                                ×
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="format">Format</Label>
                        <Select
                          value={editConfig.format}
                          onValueChange={(value: any) =>
                            setEditConfig({ ...editConfig, format: value })
                          }
                        >
                          <SelectTrigger id="format">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="number">Nombre</SelectItem>
                            <SelectItem value="currency">Devise</SelectItem>
                            <SelectItem value="percentage">Pourcentage</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="decimals">Décimales</Label>
                        <Input
                          id="decimals"
                          type="number"
                          min="0"
                          max="10"
                          value={editConfig.decimals}
                          onChange={(e) =>
                            setEditConfig({ ...editConfig, decimals: parseInt(e.target.value) || 0 })
                          }
                        />
                      </div>
                    </div>

                    {editConfig.format === "currency" && (
                      <div className="space-y-2">
                        <Label htmlFor="currency">Devise</Label>
                        <Select
                          value={editConfig.currency}
                          onValueChange={(value: string) =>
                            setEditConfig({ ...editConfig, currency: value })
                          }
                        >
                          <SelectTrigger id="currency">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="EUR">Euro (€)</SelectItem>
                            <SelectItem value="USD">Dollar ($)</SelectItem>
                            <SelectItem value="GBP">Livre Sterling (£)</SelectItem>
                            <SelectItem value="JPY">Yen (¥)</SelectItem>
                            <SelectItem value="XAF">Franc CFA (FCFA)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

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
          {localError ? (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <span className="text-sm text-destructive">{localError}</span>
            </div>
          ) : (
            <div className="space-y-3">
              {config?.formula && (
                <div className="p-2 bg-muted/30 rounded font-mono text-sm">
                  {config.formula}
                </div>
              )}

              {localResult !== null && (
                <div className="flex items-center justify-between p-4 bg-primary/10 border border-primary/20 rounded">
                  <span className="text-sm font-medium">Résultat:</span>
                  <span className="text-2xl font-bold text-primary">
                    {formatResult(localResult, config?.format, config?.decimals, config?.currency)}
                  </span>
                </div>
              )}

              {Object.keys(config?.variables || {}).length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Variables: {Object.entries(config.variables).map(([k, v]) => `${k}=${v}`).join(", ")}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </NodeViewWrapper>
  )
}

// Extension Tiptap
export const FormulaExtension = Node.create({
  name: "formula",

  group: "block",

  atom: true,

  addAttributes() {
    return {
      config: {
        default: {
          formula: "",
          variables: {},
          format: "number",
          decimals: 2,
          currency: "EUR",
        },
      },
      result: {
        default: null,
      },
      error: {
        default: null,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: "div[data-type='formula']",
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "formula" })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(FormulaBlockComponent)
  },

  addCommands() {
    return {
      setFormula:
        (attributes: Partial<FormulaAttributes>) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          })
        },
    }
  },
})
