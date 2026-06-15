import { useEffect, useState } from "react";
import {
  GenieChat,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@databricks/appkit-ui/react";
import { fieldLabel } from "../lib/utils";

type Tab = "dashboard" | "genie";

interface SummaryTotals {
  total?: number | string;
  pending?: number | string;
  resolved?: number | string;
  rejected?: number | string;
  nullified?: number | string;
  reopened?: number | string;
  stale?: number | string;
}

interface QueueSummary {
  field_name: string;
  total: number | string;
  remaining: number | string;
  resolved: number | string;
}

interface SummaryResponse {
  totals: SummaryTotals;
  queues: QueueSummary[];
}

const tabClass = (active: boolean) =>
  `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
    active
      ? "border-foreground text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
  }`;

function SummaryCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | number;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          {loading ? (
            <div className="h-8 w-16 bg-muted/30 rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold tracking-tight">{value}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function numberValue(value: number | string | undefined): number {
  return Number(value ?? 0);
}

function QueueBars({
  title,
  queues,
  valueKey,
}: {
  title: string;
  queues: QueueSummary[];
  valueKey: "remaining" | "resolved";
}) {
  const max = Math.max(1, ...queues.map((queue) => numberValue(queue[valueKey])));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {queues.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No anomaly data yet.
          </p>
        )}
        {queues.map((queue) => {
          const value = numberValue(queue[valueKey]);
          return (
            <div key={queue.field_name} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span>{fieldLabel(queue.field_name)}</span>
                <span className="font-mono">{value}</span>
              </div>
              <div className="h-2 rounded bg-muted/40 overflow-hidden">
                <div
                  className="h-full bg-foreground/80"
                  style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function DashboardTab() {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/readiness/summary")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load analytics summary");
        return res.json() as Promise<SummaryResponse>;
      })
      .then(setSummary)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load summary"),
      )
      .finally(() => setLoading(false));
  }, []);

  const totals = summary?.totals ?? {};
  const reviewed =
    numberValue(totals.resolved) +
    numberValue(totals.rejected) +
    numberValue(totals.nullified);
  const total = numberValue(totals.total);
  const resolutionRate = total > 0 ? Math.round((reviewed / total) * 100) : 0;

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Anomalies"
          value={total}
          loading={loading}
        />
        <SummaryCard
          label="Remaining"
          value={numberValue(totals.pending) + numberValue(totals.reopened)}
          loading={loading}
        />
        <SummaryCard
          label="Resolved"
          value={numberValue(totals.resolved)}
          loading={loading}
        />
        <SummaryCard
          label="Resolution Rate"
          value={`${resolutionRate}%`}
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <QueueBars
          title="Remaining by Queue"
          queues={summary?.queues ?? []}
          valueKey="remaining"
        />
        <QueueBars
          title="Resolved by Queue"
          queues={summary?.queues ?? []}
          valueKey="resolved"
        />
      </div>
    </div>
  );
}

function GenieTab() {
  return (
    <Card className="flex-1 flex flex-col overflow-hidden">
      <CardHeader className="shrink-0 pb-2">
        <CardTitle className="text-sm">Ask Genie</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ask questions about staged anomalies, queue progress, review outcomes,
          and source citations.
        </p>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <GenieChat
          alias="default"
          placeholder="e.g. Which anomaly queue has the most pending records?"
          className="h-full"
        />
      </CardContent>
    </Card>
  );
}

export function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="flex flex-col h-full">
      <div className="max-w-5xl mx-auto w-full px-6 pt-6 pb-2 flex items-center justify-between">
        <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
        <div className="flex gap-1">
          <button
            type="button"
            className={tabClass(tab === "dashboard")}
            onClick={() => setTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={tabClass(tab === "genie")}
            onClick={() => setTab("genie")}
          >
            Ask Genie
          </button>
        </div>
      </div>

      {tab === "dashboard" && (
        <div className="max-w-5xl mx-auto w-full px-6 py-6">
          <DashboardTab />
        </div>
      )}

      {tab === "genie" && (
        <div className="max-w-5xl mx-auto w-full px-6 py-4 flex-1 flex flex-col min-h-0">
          <GenieTab />
        </div>
      )}
    </div>
  );
}
