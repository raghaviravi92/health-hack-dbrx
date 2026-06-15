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
import { RefreshCw } from "lucide-react";
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

function MetricCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {loading ? (
          <Skeleton className="h-8 w-16 mt-2" />
        ) : (
          <p className="text-2xl font-semibold tracking-tight mt-1">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function ReadinessDashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [syncRun, setSyncRun] = useState<SyncRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [summaryRes, syncRes] = await Promise.all([
        fetch("/api/readiness/summary"),
        fetch("/api/readiness/sync/latest"),
      ]);
      if (!summaryRes.ok) throw new Error("Failed to load summary");
      if (!syncRes.ok) throw new Error("Failed to load sync state");
      setSummary((await summaryRes.json()) as SummaryResponse);
      setSyncRun((await syncRes.json()) as SyncRun | null);
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

  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Data Readiness Desk
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review staged facility anomalies and persist human decisions.
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          <RefreshCw
            className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`}
          />
          {syncing ? "Syncing" : "Sync Data"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total anomalies" value={total} loading={loading} />
        <MetricCard
          label="Pending"
          value={numberValue(totals.pending) + numberValue(totals.reopened)}
          loading={loading}
        />
        <MetricCard label="Reviewed" value={reviewed} loading={loading} />
        <MetricCard
          label="Resolution rate"
          value={resolutionRate}
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Latest Sync</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-12 w-full" />
          ) : syncRun ? (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <StatusBadge status={syncRun.status} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Finished</p>
                <p>{formatDate(syncRun.finished_at ?? syncRun.started_at)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Scanned</p>
                <p>{numberValue(syncRun.records_scanned)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Upserted</p>
                <p>{numberValue(syncRun.records_upserted)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Source</p>
                <p className="truncate">{syncRun.source_description}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No sync has run. Use Sync Data to load the demo anomaly fixture.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {READINESS_FIELDS.map((field) => {
          const queue = queueByField.get(field.value);
          const remaining = numberValue(queue?.remaining);
          return (
            <button
              key={field.value}
              type="button"
              onClick={() => navigate(`/queue/${field.value}`)}
              className="text-left rounded-lg border border-border/60 p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <TargetBadge target={field.value} />
                <span className="text-xs text-muted-foreground">
                  {numberValue(queue?.total)} total
                </span>
              </div>
              <p className="text-3xl font-semibold mt-4">{remaining}</p>
              <p className="text-sm text-muted-foreground">
                remaining for review
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
