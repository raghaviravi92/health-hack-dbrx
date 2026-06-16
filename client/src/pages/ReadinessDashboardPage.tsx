import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@databricks/appkit-ui/react";
import {
  RefreshCw,
  CheckCircle2,
  Database,
  ArrowRight,
  Sparkles,
  BarChart3,
  AlertCircle,
  HelpCircle,
  FileSpreadsheet,
} from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import { TargetBadge } from "../components/TargetBadge";
import { READINESS_FIELDS, formatDate } from "../lib/utils";

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
    total: number | string;
    pending: number | string;
    resolved: number | string;
    accepted: number | string;
    ignored: number | string;
    reopened: number | string;
    critical: number | string;
    high: number | string;
  };
}

interface SyncRun {
  id: string;
  status: string;
  source_description: string;
  started_by: string;
  started_at: string;
  finished_at: string | null;
  records_scanned: number | string;
  records_upserted: number | string;
  error_message: string | null;
}

function numberValue(value: number | string | undefined): number {
  return Number(value ?? 0);
}

export function ReadinessDashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [syncRun, setSyncRun] = useState<SyncRun | null>(null);
  const [indicatorSummary, setIndicatorSummary] = useState<IndicatorSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [summaryRes, syncRes, indicatorRes] = await Promise.all([
        fetch("/api/readiness/summary"),
        fetch("/api/readiness/sync/latest"),
        fetch("/api/indicator-reviews/summary"),
      ]);
      if (!summaryRes.ok) throw new Error("Failed to load summary");
      if (!syncRes.ok) throw new Error("Failed to load sync state");
      if (!indicatorRes.ok) throw new Error("Failed to load indicator metrics");

      setSummary((await summaryRes.json()) as SummaryResponse);
      setSyncRun((await syncRes.json()) as SyncRun | null);
      setIndicatorSummary((await indicatorRes.json()) as IndicatorSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/readiness/sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      window.dispatchEvent(new Event("review-saved"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const queueByField = useMemo(() => {
    const map = new Map<string, QueueSummary>();
    for (const queue of summary?.queues ?? []) map.set(queue.field_name, queue);
    return map;
  }, [summary]);

  const totals = summary?.totals ?? {};
  const reviewed =
    numberValue(totals.resolved) +
    numberValue(totals.rejected) +
    numberValue(totals.nullified);
  const total = numberValue(totals.total);
  const resolutionRate = total > 0 ? Math.round((reviewed / total) * 100) : 0;

  // Onboarding Step Checklist States
  const hasRealCompletedSync =
    syncRun?.status === "completed" &&
    !syncRun.source_description.toLowerCase().includes("demo") &&
    numberValue(syncRun.records_scanned) > 0;
  const hasReviewData =
    total > 0 || numberValue(indicatorSummary?.totals?.total) > 0;
  const step1Done = hasRealCompletedSync || hasReviewData;
  const step2PendingCount = numberValue(totals.pending) + numberValue(totals.reopened);
  const step2Done = step1Done && step2PendingCount === 0 && total > 0;
  
  const indicatorPendingCount = numberValue(indicatorSummary?.totals?.pending) + numberValue(indicatorSummary?.totals?.reopened);
  const step3Done = step1Done && indicatorPendingCount === 0 && numberValue(indicatorSummary?.totals?.total) > 0;

  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-8 space-y-8 animate-fade-in-up">
      {/* 1. Header / Action Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase tracking-widest bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-full">
            Workspace Hub
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground mt-2">
            Data Readiness Desk
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review staging anomalies, persist decisions, and align master datasets.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSync} disabled={syncing} size="lg" className="shadow-lg shadow-purple-500/5 dark:shadow-purple-500/15">
            <RefreshCw className={`h-4.5 w-4.5 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing Database..." : "Sync Source Data"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Stunning Landing Hero Banner (Background Info) */}
      <div className="relative rounded-2xl overflow-hidden glass-card glass-card-primary p-6 md:p-8 flex flex-col md:flex-row gap-6 items-center">
        <div className="flex-1 space-y-4">
          <h3 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            What is the Data Readiness Desk?
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
            This workspace monitors health facility master records to ensure data pipelines ingest clean data. 
            We review coordinates, check zip code validity, parse contact info, and align joins between facility directories and clinical indicator databases. 
            Your reviews maintain the golden facility registry.
          </p>
          <div className="flex flex-wrap gap-4 text-xs font-semibold text-purple-700 dark:text-purple-300">
            <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-success" /> Location Integrity</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-success" /> Correct Contact Rules</span>
            <span className="flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-success" /> Valid Join Indicators</span>
          </div>
        </div>
        <div className="shrink-0 flex items-center justify-center h-24 w-24 rounded-2xl bg-secondary/30 border border-border shadow-inner">
          <Database className="h-10 w-10 text-purple-600 dark:text-purple-400" />
        </div>
      </div>

      {/* 3. Interactive Quick Start Guided Checklist */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4.5 w-4.5 text-purple-600 dark:text-purple-400" />
          <h3 className="text-base font-bold text-foreground tracking-tight">Guided Starting Steps</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Step 1 */}
          <Card className={`glass-card ${step1Done ? "border-success/30 bg-success/5" : "border-purple-500/20 bg-purple-500/[0.02]"}`}>
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Step 1</span>
                  {step1Done ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Synced</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500"><span className="pulse-indicator bg-amber-500" /> Ready</span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-foreground mt-2">Sync Source Data</h4>
                <p className="text-xs text-muted-foreground mt-1">Load baseline data anomalies and records from Lakebase.</p>
              </div>
              <Button
                variant={step1Done ? "outline" : "default"}
                size="sm"
                onClick={handleSync}
                disabled={syncing}
                className="w-full mt-2"
              >
                {step1Done ? "Sync Again" : "Run Sync Now"}
              </Button>
            </CardContent>
          </Card>

          {/* Step 2 */}
          <Card className={`glass-card ${step2Done ? "border-success/30 bg-success/5" : step1Done && step2PendingCount > 0 ? "border-amber-500/30" : "opacity-80"}`}>
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Step 2</span>
                  {step2Done ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Clean</span>
                  ) : step1Done && step2PendingCount > 0 ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-500">{step2PendingCount} Pending</span>
                  ) : (
                    <span className="text-[10px] font-bold text-muted-foreground">Locked</span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-foreground mt-2">Anomaly Review</h4>
                <p className="text-xs text-muted-foreground mt-1">Audit coordinates, emails, zip codes, districts, and phones.</p>
              </div>
              <Button
                variant={step1Done ? "default" : "outline"}
                size="sm"
                disabled={!step1Done}
                onClick={() => navigate("/queue/zip")}
                className="w-full mt-2"
              >
                Start Review <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardContent>
          </Card>

          {/* Step 3 */}
          <Card className={`glass-card ${step3Done ? "border-success/30 bg-success/5" : step1Done && indicatorPendingCount > 0 ? "border-purple-500/30" : "opacity-80"}`}>
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Step 3</span>
                  {step3Done ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Audited</span>
                  ) : step1Done && indicatorPendingCount > 0 ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400">{indicatorPendingCount} Issues</span>
                  ) : (
                    <span className="text-[10px] font-bold text-muted-foreground">Locked</span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-foreground mt-2">Indicator Review</h4>
                <p className="text-xs text-muted-foreground mt-1">Check joins between facility tables and health indicators.</p>
              </div>
              <Button
                variant={step1Done ? "default" : "outline"}
                size="sm"
                disabled={!step1Done}
                onClick={() => navigate("/indicators")}
                className="w-full mt-2"
              >
                Audit Mappings <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardContent>
          </Card>

          {/* Step 4 */}
          <Card className="glass-card opacity-90">
            <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">Step 4</span>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-purple-600 dark:text-purple-400"><Sparkles className="h-3 w-3" /> Genie AI</span>
                </div>
                <h4 className="text-sm font-bold text-foreground mt-2">Genie Insights</h4>
                <p className="text-xs text-muted-foreground mt-1">Type natural language queries to discover hidden anomalies.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!step1Done}
                onClick={() => navigate("/analytics")}
                className="w-full mt-2"
              >
                Ask Genie <BarChart3 className="h-3 w-3 ml-1" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 4. Global KPIs Section */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-card">
          <CardContent className="pt-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Total anomalies</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-2" />
            ) : (
              <p className="text-2xl font-extrabold tracking-tight mt-1 text-foreground">{total}</p>
            )}
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Pending Review</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-2" />
            ) : (
              <p className="text-2xl font-extrabold tracking-tight mt-1 text-amber-600 dark:text-amber-400">{step2PendingCount}</p>
            )}
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Reviewed Decisions</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-2" />
            ) : (
              <p className="text-2xl font-extrabold tracking-tight mt-1 text-success">{reviewed}</p>
            )}
          </CardContent>
        </Card>
        <Card className="glass-card">
          <CardContent className="pt-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Resolution Rate</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-2" />
            ) : (
              <div className="flex items-baseline gap-1 mt-1">
                <p className="text-2xl font-extrabold tracking-tight text-foreground">{resolutionRate}%</p>
                <span className="text-xs text-muted-foreground">completed</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 5. Anomaly Queues (With Progress Bars) */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4.5 w-4.5 text-purple-600 dark:text-purple-400" />
          <h3 className="text-base font-bold text-foreground tracking-tight">Review Category Queues</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {READINESS_FIELDS.map((field) => {
            const queue = queueByField.get(field.value);
            const remaining = numberValue(queue?.remaining);
            const queueTotal = numberValue(queue?.total);
            const queueResolved = numberValue(queue?.resolved);
            const percent = queueTotal > 0 ? Math.round((queueResolved / queueTotal) * 100) : 100;

            return (
              <button
                key={field.value}
                type="button"
                onClick={() => navigate(`/queue/${field.value}`)}
                className="text-left rounded-xl border border-border bg-card p-5 hover:bg-secondary/40 hover:border-purple-500/30 transition-all duration-300 group shadow-lg"
              >
                <div className="flex items-center justify-between gap-3">
                  <TargetBadge target={field.value} />
                  <span className="text-xs text-muted-foreground font-medium group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors">
                    {queueTotal} total
                  </span>
                </div>
                
                <div className="mt-4 flex items-baseline gap-1">
                  <p className="text-3xl font-extrabold text-foreground tracking-tight">{remaining}</p>
                  <span className="text-xs text-muted-foreground">remaining</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-secondary rounded-full h-1.5 mt-4 overflow-hidden">
                  <div 
                    className="bg-purple-500 h-1.5 rounded-full transition-all duration-500" 
                    style={{ width: `${percent}%` }} 
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-2 font-medium">
                  <span>{percent}% Resolved</span>
                  <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Open Queue <ArrowRight className="h-2.5 w-2.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 6. Latest Sync Card */}
      <Card className="glass-card">
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-sm text-foreground font-bold flex items-center gap-2">
            <Database className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            Workspace Data Sync Status
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <Skeleton className="h-12 w-full" />
          ) : syncRun ? (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-sm">
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Status</p>
                <div className="mt-1">
                  <StatusBadge status={syncRun.status} />
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Sync Finished</p>
                <p className="mt-1 text-foreground font-medium">
                  {formatDate(syncRun.finished_at ?? syncRun.started_at)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Records Scanned</p>
                <p className="mt-1 text-foreground font-medium">{numberValue(syncRun.records_scanned)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Upserted Anomalies</p>
                <p className="mt-1 text-foreground font-medium">{numberValue(syncRun.records_upserted)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Source Table Context</p>
                <p className="mt-1 text-foreground font-medium truncate" title={syncRun.source_description}>
                  {syncRun.source_description}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <p className="text-sm text-muted-foreground max-w-md">
                No sync has run in this workspace. Trigger "Sync Source Data" above to load default records.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
