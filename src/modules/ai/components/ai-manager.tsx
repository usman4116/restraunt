"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TrendingUp, Package, Calendar, Search, AlertTriangle, TrendingDown, Minus } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import type {
  SalesForecastResult,
  InventoryPredictionResult,
  DailyDigest,
  NlQueryResult,
} from "../dto/ai.dto";

// ─── Shared UI primitives ─────────────────────────────────────────────────────

const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-gray-200 bg-white p-6 shadow-sm ${className}`}>{children}</div>
);

const Badge = ({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "warning" | "critical" }) => {
  const colors = {
    default: "bg-blue-100 text-blue-800",
    warning: "bg-yellow-100 text-yellow-800",
    critical: "bg-red-100 text-red-800",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[variant]}`}>{children}</span>;
};

// ─── Stat tile ────────────────────────────────────────────────────────────────

interface StatTileProps {
  title: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  trend?: "up" | "down" | "flat";
  severity?: "info" | "warning" | "critical";
  icon: React.ComponentType<{ className?: string }>;
}

function StatTile({ title, value, delta, deltaLabel, trend, severity, icon: Icon }: StatTileProps) {
  const trendIcon = trend === "up" ? <TrendingUp className="h-4 w-4" /> : trend === "down" ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />;
  const trendColor = trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-gray-500";
  const severityColor = severity === "critical" ? "border-red-300 bg-red-50" : severity === "warning" ? "border-yellow-300 bg-yellow-50" : "";

  return (
    <Card className={severityColor}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="mt-2 text-3xl font-semibold">{value}</p>
          {delta !== undefined && (
            <p className={`mt-2 flex items-center gap-1 text-sm ${trendColor}`}>
              {trendIcon}
              <span>{delta > 0 ? "+" : ""}{delta}%</span>
              {deltaLabel && <span className="text-gray-500">{deltaLabel}</span>}
            </p>
          )}
        </div>
        <Icon className="h-12 w-12 text-gray-400" />
      </div>
    </Card>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  forecast: SalesForecastResult | null;
  inventoryPredictions: InventoryPredictionResult | null;
  digest: DailyDigest | null;
  nlQuery: NlQueryResult | null;
}

export function AiManager({ forecast, inventoryPredictions, digest, nlQuery }: Props) {
  const [activeTab, setActiveTab] = useState("digest");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Insights</h1>
          <p className="mt-1 text-sm text-gray-600">
            Sales forecasts, inventory predictions, and daily insights powered by statistical models.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v ?? "digest")}>
        <TabsList className="flex gap-2 border-b border-gray-200">
          <TabsTrigger
            value="digest"
            className="cursor-pointer border-b-2 border-transparent px-4 py-2 font-medium text-gray-600 hover:text-gray-900 data-[selected]:border-blue-500 data-[selected]:text-blue-600"
          >
            <Calendar className="mr-2 inline-block h-4 w-4" />
            Daily Digest
          </TabsTrigger>
          <TabsTrigger
            value="forecast"
            className="cursor-pointer border-b-2 border-transparent px-4 py-2 font-medium text-gray-600 hover:text-gray-900 data-[selected]:border-blue-500 data-[selected]:text-blue-600"
          >
            <TrendingUp className="mr-2 inline-block h-4 w-4" />
            Sales Forecast
          </TabsTrigger>
          <TabsTrigger
            value="inventory"
            className="cursor-pointer border-b-2 border-transparent px-4 py-2 font-medium text-gray-600 hover:text-gray-900 data-[selected]:border-blue-500 data-[selected]:text-blue-600"
          >
            <Package className="mr-2 inline-block h-4 w-4" />
            Inventory Predictions
          </TabsTrigger>
          <TabsTrigger
            value="nlquery"
            className="cursor-pointer border-b-2 border-transparent px-4 py-2 font-medium text-gray-600 hover:text-gray-900 data-[selected]:border-blue-500 data-[selected]:text-blue-600"
          >
            <Search className="mr-2 inline-block h-4 w-4" />
            Natural Language Query
          </TabsTrigger>
        </TabsList>

        {/* ── Daily Digest ─────────────────────────────────────────────────── */}
        <TabsContent value="digest" className="mt-6">
          {digest ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Daily Digest — {digest.date}</h2>
              </div>

              {digest.alerts.length > 0 && (
                <Card className="border-yellow-300 bg-yellow-50">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-yellow-900">Alerts</h3>
                      <ul className="mt-2 space-y-1 text-sm text-yellow-800">
                        {digest.alerts.map((alert, i) => (
                          <li key={i}>• {alert.message}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Card>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {digest.insights.map((insight, i) => (
                  <StatTile
                    key={i}
                    title={insight.title}
                    value={insight.value}
                    delta={insight.delta}
                    deltaLabel={insight.deltaLabel}
                    trend={insight.trend}
                    severity={insight.severity}
                    icon={TrendingUp}
                  />
                ))}
              </div>

              {digest.topProducts.length > 0 && (
                <Card>
                  <h3 className="font-semibold">Top Products Yesterday</h3>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Product</th>
                          <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Category</th>
                          <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Qty</th>
                          <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {digest.topProducts.map((p, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm font-medium">{p.name}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{p.category}</td>
                            <td className="px-3 py-2 text-right text-sm">{p.qty}</td>
                            <td className="px-3 py-2 text-right text-sm font-medium">
                              ${p.revenue.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          ) : (
            <Card><p className="text-gray-500">No digest data available.</p></Card>
          )}
        </TabsContent>

        {/* ── Sales Forecast ───────────────────────────────────────────────── */}
        <TabsContent value="forecast" className="mt-6">
          {forecast ? (
            <div className="space-y-6">
              <Card>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">7-Day Sales Forecast</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {forecast.method} {forecast.mape !== undefined && `· MAPE: ${forecast.mape}%`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Predicted Total</p>
                    <p className="text-2xl font-semibold">${forecast.totalPredicted.toLocaleString()}</p>
                  </div>
                </div>

                <div className="mt-6 h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={forecast.points}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="predicted" stroke="#3b82f6" strokeWidth={2} name="Predicted" />
                      <Line type="monotone" dataKey="lower" stroke="#9ca3af" strokeDasharray="5 5" name="Lower 90%" />
                      <Line type="monotone" dataKey="upper" stroke="#9ca3af" strokeDasharray="5 5" name="Upper 90%" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card>
                <h3 className="font-semibold">Forecast Details</h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Date</th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Predicted</th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Lower</th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Upper</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {forecast.points.map((p, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-sm">{p.date}</td>
                          <td className="px-3 py-2 text-right text-sm font-medium">${p.predicted.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-sm text-gray-600">${p.lower.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right text-sm text-gray-600">${p.upper.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ) : (
            <Card><p className="text-gray-500">No forecast data available.</p></Card>
          )}
        </TabsContent>

        {/* ── Inventory Predictions ────────────────────────────────────────── */}
        <TabsContent value="inventory" className="mt-6">
          {inventoryPredictions ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Card>
                  <p className="text-sm text-gray-600">Critical (≤1 day)</p>
                  <p className="mt-2 text-3xl font-semibold text-red-600">{inventoryPredictions.criticalCount}</p>
                </Card>
                <Card>
                  <p className="text-sm text-gray-600">Warning (2-7 days)</p>
                  <p className="mt-2 text-3xl font-semibold text-yellow-600">{inventoryPredictions.warningCount}</p>
                </Card>
                <Card>
                  <p className="text-sm text-gray-600">Total Items</p>
                  <p className="mt-2 text-3xl font-semibold">{inventoryPredictions.predictions.length}</p>
                </Card>
              </div>

              <Card>
                <h3 className="font-semibold">Inventory Predictions</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Based on 30-day average consumption. Items are sorted by urgency.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Item</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">SKU</th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Stock</th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Daily Use</th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">Days Left</th>
                        <th className="px-3 py-2 text-center text-xs font-medium uppercase text-gray-500">Reorder?</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {inventoryPredictions.predictions.slice(0, 50).map((p, i) => {
                        const daysColor = p.daysUntilStockout <= 1 ? "text-red-600" : p.daysUntilStockout <= 7 ? "text-yellow-600" : "text-gray-900";
                        const daysDisplay = p.daysUntilStockout >= 999 ? "∞" : p.daysUntilStockout.toFixed(1);
                        return (
                          <tr key={i} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-sm font-medium">{p.name}</td>
                            <td className="px-3 py-2 text-sm text-gray-600">{p.sku}</td>
                            <td className="px-3 py-2 text-right text-sm">{p.currentStock.toFixed(2)} {p.unit}</td>
                            <td className="px-3 py-2 text-right text-sm">{p.avgDailyUse.toFixed(2)}</td>
                            <td className={`px-3 py-2 text-right text-sm font-medium ${daysColor}`}>{daysDisplay}</td>
                            <td className="px-3 py-2 text-center">
                              {p.reorderSuggested && <Badge variant={p.daysUntilStockout <= 1 ? "critical" : "warning"}>Reorder</Badge>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ) : (
            <Card><p className="text-gray-500">No inventory predictions available.</p></Card>
          )}
        </TabsContent>

        {/* ── Natural Language Query ───────────────────────────────────────── */}
        <TabsContent value="nlquery" className="mt-6">
          <Card>
            <h2 className="text-xl font-semibold">Natural Language Query</h2>
            <p className="mt-1 text-sm text-gray-600">
              Ask questions in plain English like &quot;revenue last week&quot; or &quot;top products this month&quot;.
            </p>
            <form action="/ai" method="GET" className="mt-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  name="q"
                  placeholder="e.g. revenue last week, low stock items, top products today"
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  defaultValue=""
                />
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Ask
                </button>
              </div>
            </form>

            {nlQuery && (
              <div className="mt-6 space-y-4">
                <div className="rounded-md bg-blue-50 p-4">
                  <p className="text-sm font-medium text-blue-900">Interpreted as:</p>
                  <p className="mt-1 text-sm text-blue-700">{nlQuery.interpreted}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-blue-600">
                    <span>Metric: {nlQuery.metric}</span>
                    <span>•</span>
                    <span>Period: {nlQuery.from} to {nlQuery.to}</span>
                    {nlQuery.granularity && (
                      <>
                        <span>•</span>
                        <span>Granularity: {nlQuery.granularity}</span>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  Redirect to <a href={`/reports?from=${nlQuery.from}&to=${nlQuery.to}&granularity=${nlQuery.granularity ?? "day"}`} className="text-blue-600 hover:underline">/reports</a> to view the full report.
                </p>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
