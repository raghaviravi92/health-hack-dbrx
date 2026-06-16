import { useEffect, useState } from "react";
import {
  GenieChat,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@databricks/appkit-ui/react";
import {
  MessageSquareCode,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
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

interface IndicatorSummary {
  totals: {
    total?: number | string;
    pending?: number | string;
    resolved?: number | string;
    accepted?: number | string;
    ignored?: number | string;
    reopened?: number | string;
    critical?: number | string;
    high?: number | string;
  };
  byIssue: Array<{
    issue_type: string;
    total: number | string;
    pending: number | string;
  }>;
}

const tabClass = (active: boolean) =>
  `px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 border ${
    active
      ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 shadow-lg shadow-purple-500/5"
      : "text-muted-foreground hover:text-foreground dark:hover:text-white border-transparent hover:bg-black/5 dark:hover:bg-white/5"
  }`;

function SummaryCard({
  label,
  value,
  loading,
  colorClass = "text-foreground",
}: {
  label: string;
  value: string | number;
  loading: boolean;
  colorClass?: string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="pt-6">
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {label}
          </p>
          {loading ? (
            <div className="h-8 w-16 bg-secondary/35 rounded animate-pulse" />
          ) : (
            <p className={`text-2xl font-extrabold tracking-tight ${colorClass}`}>{value}</p>
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
  barColor = "bg-purple-500",
}: {
  title: string;
  queues: QueueSummary[];
  valueKey: "remaining" | "resolved";
  barColor?: string;
}) {
  const max = Math.max(1, ...queues.map((queue) => numberValue(queue[valueKey])));

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3 border-b border-border">
        <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {queues.length === 0 && (
          <p className="text-xs text-muted-foreground py-8 text-center">
            No database anomaly statistics found.
          </p>
        )}
        {queues.map((queue) => {
          const value = numberValue(queue[valueKey]);
          const pct = Math.max(4, (value / max) * 100);
          return (
            <div key={queue.field_name} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-foreground">{fieldLabel(queue.field_name)}</span>
                <span className="font-mono text-muted-foreground font-bold">{value}</span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full ${barColor} transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function issueLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function IndicatorIssueBars({
  issues,
}: {
  issues: IndicatorSummary["byIssue"];
}) {
  const max = Math.max(1, ...issues.map((issue) => numberValue(issue.pending)));

  return (
    <Card className="glass-card">
      <CardHeader className="pb-3 border-b border-border">
        <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider">
          Pending Indicator Issues
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {issues.length === 0 && (
          <p className="text-xs text-muted-foreground py-8 text-center">
            No indicator issue statistics found.
          </p>
        )}
        {issues.map((issue) => {
          const pending = numberValue(issue.pending);
          const pct = Math.max(4, (pending / max) * 100);
          return (
            <div key={issue.issue_type} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-foreground">
                  {issueLabel(issue.issue_type)}
                </span>
                <span className="font-mono text-muted-foreground font-bold">
                  {pending}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-400 transition-all duration-500"
                  style={{ width: `${pct}%` }}
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
  const [indicatorSummary, setIndicatorSummary] = useState<IndicatorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/readiness/summary"),
      fetch("/api/indicator-reviews/summary"),
    ])
      .then(async ([readinessRes, indicatorRes]) => {
        if (!readinessRes.ok || !indicatorRes.ok) {
          throw new Error("Failed to load analytics summary");
        }
        setSummary((await readinessRes.json()) as SummaryResponse);
        setIndicatorSummary((await indicatorRes.json()) as IndicatorSummary);
      })
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
  const indicatorTotals = indicatorSummary?.totals ?? {};
  const indicatorPending =
    numberValue(indicatorTotals.pending) + numberValue(indicatorTotals.reopened);
  const indicatorReviewed =
    numberValue(indicatorTotals.resolved) + numberValue(indicatorTotals.accepted);

  return (
    <div className="space-y-8 animate-fade-in-up">
      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive flex items-center gap-2">
          <AlertCircle className="h-4.5 w-4.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total Anomalies"
          value={total}
          loading={loading}
        />
        <SummaryCard
          label="Remaining Issues"
          value={numberValue(totals.pending) + numberValue(totals.reopened)}
          loading={loading}
          colorClass="text-amber-600 dark:text-amber-400"
        />
        <SummaryCard
          label="Resolved Correctly"
          value={numberValue(totals.resolved)}
          loading={loading}
          colorClass="text-success"
        />
        <SummaryCard
          label="Resolution Rate"
          value={`${resolutionRate}%`}
          loading={loading}
          colorClass="text-purple-600 dark:text-purple-400"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Indicator Issues"
          value={numberValue(indicatorTotals.total)}
          loading={loading}
        />
        <SummaryCard
          label="Pending Indicators"
          value={indicatorPending}
          loading={loading}
          colorClass="text-purple-600 dark:text-purple-400"
        />
        <SummaryCard
          label="Critical Indicator Issues"
          value={numberValue(indicatorTotals.critical)}
          loading={loading}
          colorClass="text-destructive"
        />
        <SummaryCard
          label="Reviewed Indicators"
          value={indicatorReviewed}
          loading={loading}
          colorClass="text-success"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <QueueBars
          title="Remaining Anomalies by Queue"
          queues={summary?.queues ?? []}
          valueKey="remaining"
          barColor="bg-gradient-to-r from-amber-500 to-orange-400"
        />
        <QueueBars
          title="Resolved Anomalies by Queue"
          queues={summary?.queues ?? []}
          valueKey="resolved"
          barColor="bg-gradient-to-r from-purple-500 to-indigo-400"
        />
        <IndicatorIssueBars issues={indicatorSummary?.byIssue ?? []} />
      </div>
    </div>
  );
}

function GenieTab() {
  return (
    <Card className="glass-card flex-1 flex flex-col overflow-hidden min-h-[480px]">
      <CardHeader className="shrink-0 pb-3 border-b border-border flex items-center justify-between">
        <div>
          <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider flex items-center gap-2">
            <MessageSquareCode className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            Databricks Genie AI Chat
          </CardTitle>
          <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
            Ask natural language questions about anomalies, pipeline sync, resolved tables, and citation records.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
          <TrendingUp className="h-3 w-3" /> Genie Active
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 bg-secondary/10">
        <GenieChat
          alias="default"
          placeholder="e.g. Which queue has the highest percentage of resolved coordinates?"
          className="h-full"
        />
      </CardContent>
    </Card>
  );
}

export function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("dashboard");

  return (
    <div className="flex flex-col h-full w-full max-w-6xl mx-auto px-6 py-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase tracking-widest bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-full">
            Metrics Desk
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground mt-2">Analytics</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Check summary status charts or run AI-powered analytics with Databricks Genie.
          </p>
        </div>

        {/* Tab Selectors */}
        <div className="flex items-center gap-1.5 bg-secondary/50 p-1 rounded-lg border border-border">
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

      {/* Tab Contents */}
      {tab === "dashboard" && (
        <div className="flex-1">
          <DashboardTab />
        </div>
      )}

      {tab === "genie" && (
        <div className="flex-1 flex flex-col min-h-0">
          <GenieTab />
        </div>
      )}
    </div>
  );
}
