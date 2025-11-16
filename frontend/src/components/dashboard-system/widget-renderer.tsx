"use client";

/**
 * Widget Renderer Component
 * Rend un widget en fonction de son type
 */

import { WidgetPublic, WidgetTypeEnum } from "@/types/dashboard-system";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

interface WidgetRendererProps {
  widget: WidgetPublic;
}

export function WidgetRenderer({ widget }: WidgetRendererProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Charger les données du widget
  useEffect(() => {
    loadWidgetData();
  }, [widget.id]);

  const loadWidgetData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Selon le type de source de données
      switch (widget.data_source_type) {
        case "static":
          setData(widget.data_source_config.data || {});
          break;

        case "api":
          const response = await fetch(widget.data_source_config.url, {
            method: widget.data_source_config.method || "GET",
            headers: widget.data_source_config.headers || {},
          });
          const apiData = await response.json();
          setData(apiData);
          break;

        default:
          setData({});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  // Styles personnalisés du widget
  const customStyle = {
    backgroundColor: widget.background_color,
    borderColor: widget.border_color,
  };

  return (
    <Card
      className="h-full flex flex-col"
      style={customStyle}
    >
      <CardHeader>
        <CardTitle>{widget.name}</CardTitle>
        {widget.description && (
          <CardDescription>{widget.description}</CardDescription>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex items-center justify-center">
        {loading && <Loader2 className="w-6 h-6 animate-spin" />}

        {error && (
          <div className="text-center text-destructive">
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <WidgetContent widget={widget} data={data} />
        )}
      </CardContent>
    </Card>
  );
}

// Composant pour rendre le contenu selon le type
function WidgetContent({ widget, data }: { widget: WidgetPublic; data: any }) {
  switch (widget.widget_type) {
    case WidgetTypeEnum.STATS_CARD:
      return <StatsCardWidget data={data} config={widget.widget_config} />;

    case WidgetTypeEnum.METRIC:
      return <MetricWidget data={data} config={widget.widget_config} />;

    case WidgetTypeEnum.PROGRESS_CARD:
      return <ProgressWidget data={data} config={widget.widget_config} />;

    case WidgetTypeEnum.LIST:
      return <ListWidget data={data} config={widget.widget_config} />;

    case WidgetTypeEnum.TABLE:
      return <TableWidget data={data} config={widget.widget_config} />;

    case WidgetTypeEnum.LINE_CHART:
    case WidgetTypeEnum.BAR_CHART:
    case WidgetTypeEnum.PIE_CHART:
    case WidgetTypeEnum.AREA_CHART:
      return <ChartWidget widget={widget} data={data} />;

    default:
      return (
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Widget type: {widget.widget_type}</p>
          <p className="text-xs mt-2">Non implémenté</p>
        </div>
      );
  }
}

// ============================================================================
// WIDGET COMPONENTS
// ============================================================================

function StatsCardWidget({ data, config }: { data: any; config: any }) {
  return (
    <div className="w-full text-center">
      <div className="text-4xl font-bold">{data.value || 0}</div>
      {config.subtitle && (
        <div className="text-sm text-muted-foreground mt-2">{config.subtitle}</div>
      )}
      {data.change && (
        <div className={`text-sm mt-2 ${data.change > 0 ? 'text-green-600' : 'text-red-600'}`}>
          {data.change > 0 ? '+' : ''}{data.change}%
        </div>
      )}
    </div>
  );
}

function MetricWidget({ data, config }: { data: any; config: any }) {
  return (
    <div className="w-full">
      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-bold">{data.value || 0}</span>
        {data.unit && <span className="text-xl text-muted-foreground">{data.unit}</span>}
      </div>
      {config.label && (
        <div className="text-sm text-muted-foreground mt-3">{config.label}</div>
      )}
    </div>
  );
}

function ProgressWidget({ data, config }: { data: any; config: any }) {
  const progress = data.percentage || 0;

  return (
    <div className="w-full space-y-2">
      {config.label && <div className="text-sm font-medium">{config.label}</div>}
      <div className="w-full bg-secondary rounded-full h-2">
        <div
          className="bg-primary h-2 rounded-full transition-all"
          style={{ width: `${Math.min(progress, 100)}%` }}
        />
      </div>
      <div className="text-right text-sm text-muted-foreground">{progress}%</div>
    </div>
  );
}

function ListWidget({ data, config }: { data: any; config: any }) {
  const items = Array.isArray(data) ? data : data.items || [];

  return (
    <div className="w-full space-y-2">
      {items.slice(0, config.maxItems || 10).map((item: any, index: number) => (
        <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
          <span className="text-sm">{item.label || item.name || item}</span>
          {item.value && <span className="text-sm font-medium">{item.value}</span>}
        </div>
      ))}
    </div>
  );
}

function TableWidget({ data, config }: { data: any; config: any }) {
  const rows = Array.isArray(data) ? data : data.rows || [];
  const columns = config.columns || [];

  return (
    <div className="w-full overflow-auto">
      <table className="w-full text-sm">
        {columns.length > 0 && (
          <thead>
            <tr className="border-b">
              {columns.map((col: any, index: number) => (
                <th key={index} className="text-left p-2 font-medium">
                  {col.label || col}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row: any, rowIndex: number) => (
            <tr key={rowIndex} className="border-b last:border-0">
              {columns.map((col: any, colIndex: number) => (
                <td key={colIndex} className="p-2">
                  {row[col.key || col] || '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartWidget({ widget, data }: { widget: WidgetPublic; data: any }) {
  // Placeholder pour les graphiques
  // À implémenter avec une librairie comme recharts, chart.js, etc.
  return (
    <div className="w-full text-center text-muted-foreground">
      <div className="mb-2">{widget.widget_type.replace('_', ' ').toUpperCase()}</div>
      <p className="text-xs">Graphique à implémenter</p>
      <p className="text-xs mt-1">({Object.keys(data).length} points de données)</p>
    </div>
  );
}
