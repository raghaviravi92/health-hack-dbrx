import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Separator,
} from "@databricks/appkit-ui/react";
import { CheckCircle2, DatabaseZap, RotateCw, ShieldCheck } from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import { formatDate } from "../lib/utils";

interface IndicatorIssue {
  id: string;
  issue_key: string;
  facility_id: string;
  facility_name: string;
  state: string | null;
  district: string | null;
  indicator_table: string;
  indicator_name: string | null;
  issue_type: string;
  severity: string;
  current_value: string | null;
  suggested_value: string | null;
  suggestion_explanation: string;
  source_record_id: string | null;
  reference_record_id: string | null;
  citation: Record<string, unknown>;
  status: string;
  corrected_value: string | null;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

interface IndicatorResponse {
  rows: IndicatorIssue[];
  total: number | string;
  limit: number;
  offset: number;
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
  byIssue: Array<{
    issue_type: string;
    total: number | string;
    pending: number | string;
  }>;
}

const issueTypes = [
  "missing_indicator_join",
  "district_mapping_needed",
  "missing_metric_value",
  "invalid_metric_value",
  "metric_outlier",
  "duplicate_indicator_row",
  "stale_indicator_period",
];

function numberValue(value: number | string | undefined): number {
  if (value === undefined) return 0;
  return typeof value === "number" ? value : Number(value);
}

function issueLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function CitationBlock({ citation }: { citation: Record<string, unknown> }) {
  const entries = Object.entries(citation ?? {});
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No citation metadata.</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-2">
      {entries.map(([key, value]) => (
        <div key={key} className="text-sm">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {key.replace(/_/g, " ")}
          </span>
          <p className="break-words">
            {Array.isArray(value) ? value.join(", ") : String(value)}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ShortlistPage() {
  const [records, setRecords] = useState<IndicatorIssue[]>([]);
  const [summary, setSummary] = useState<IndicatorSummary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [issueTypeFilter, setIssueTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctedValue, setCorrectedValue] = useState("");
  const [notes, setNotes] = useState("");

  const limit = 100;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        severity: severityFilter,
        issueType: issueTypeFilter,
        limit: String(limit),
        offset: String(offset),
      });
      if (search.trim()) params.set("search", search.trim());
      const [recordsRes, summaryRes] = await Promise.all([
        fetch(`/api/indicator-reviews?${params}`),
        fetch("/api/indicator-reviews/summary"),
      ]);
      if (!recordsRes.ok) throw new Error("Failed to load indicator issues");
      if (!summaryRes.ok) throw new Error("Failed to load indicator summary");
      const payload = (await recordsRes.json()) as IndicatorResponse;
      setRecords(payload.rows);
      setTotal(numberValue(payload.total));
      setSummary((await summaryRes.json()) as IndicatorSummary);
      setSelectedId((current) => {
        if (current && payload.rows.some((row) => row.id === current)) return current;
        return payload.rows[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load indicators");
    } finally {
      setLoading(false);
    }
  }, [issueTypeFilter, offset, search, severityFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setOffset(0);
  }, [issueTypeFilter, search, severityFilter, statusFilter]);

  const selected = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId],
  );

  useEffect(() => {
    setCorrectedValue(selected?.corrected_value ?? selected?.suggested_value ?? "");
    setNotes(selected?.notes ?? "");
  }, [selected]);

  async function syncDemoIssues() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/indicator-reviews/sync", { method: "POST" });
      if (!res.ok) throw new Error("Failed to sync indicator issues");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sync indicators");
    } finally {
      setSyncing(false);
    }
  }

  async function saveReview(decision: "resolved" | "accepted" | "ignored") {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/indicator-reviews/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: selected.id,
          decision,
          correctedValue,
          notes,
        }),
      });
      if (!res.ok) throw new Error("Failed to save indicator review");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review");
    } finally {
      setBusy(false);
    }
  }

  const rangeEnd = Math.min(offset + records.length, total);
  const totals = summary?.totals;

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Indicator Review</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review facility-to-health-indicator joins, mappings, missing values, and outliers.
          </p>
        </div>
        <Button onClick={syncDemoIssues} disabled={syncing}>
          <RotateCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing" : "Sync Issues"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Pending", totals?.pending],
          ["Critical", totals?.critical],
          ["High", totals?.high],
          ["Reviewed", numberValue(totals?.resolved) + numberValue(totals?.accepted)],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardContent className="py-4">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <p className="text-2xl font-semibold mt-1">{numberValue(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="reopened">Reopened</option>
          <option value="resolved">Resolved</option>
          <option value="accepted">Accepted</option>
          <option value="ignored">Ignored</option>
        </select>
        <select
          value={severityFilter}
          onChange={(event) => setSeverityFilter(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={issueTypeFilter}
          onChange={(event) => setIssueTypeFilter(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All issue types</option>
          {issueTypes.map((type) => (
            <option key={type} value={type}>
              {issueLabel(type)}
            </option>
          ))}
        </select>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search facility, location, indicator"
          className="max-w-sm"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[390px_1fr] gap-6">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Indicator Issues {total > 0 ? `(${offset + 1}-${rangeEnd} of ${total})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading &&
              Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            {!loading && records.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No indicator issues match this filter.
              </p>
            )}
            {!loading &&
              records.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => setSelectedId(record.id)}
                  className={`w-full text-left rounded-md border p-3 transition-colors ${
                    selectedId === record.id
                      ? "border-foreground/40 bg-muted/40"
                      : "border-border/50 hover:bg-muted/30"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate">{record.facility_name}</p>
                    <StatusBadge status={record.status} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-1">
                    {issueLabel(record.issue_type)}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {record.severity.toUpperCase()} · {record.indicator_name ?? "Join coverage"}
                  </p>
                </button>
              ))}
            <div className="flex items-center justify-between pt-3">
              <Button
                variant="outline"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={offset + limit >= total || loading}
                onClick={() => setOffset(offset + limit)}
              >
                Next
              </Button>
            </div>
          </CardContent>
        </Card>

        {selected ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Indicator Problem</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Facility
                  </p>
                  <p className="text-lg font-semibold">{selected.facility_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selected.facility_id}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      State
                    </p>
                    <p>{selected.state ?? "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      District
                    </p>
                    <p>{selected.district ?? "Unknown"}</p>
                  </div>
                </div>
                <Separator />
                <div className="space-y-3">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Issue
                    </p>
                    <p className="font-medium">{issueLabel(selected.issue_type)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Indicator
                    </p>
                    <p>{selected.indicator_name ?? "District indicator join"}</p>
                    <p className="text-xs text-muted-foreground break-words">
                      {selected.indicator_table}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Current value
                    </p>
                    <p className="rounded-md border border-border/60 bg-muted/20 p-3 font-mono text-sm mt-1">
                      {selected.current_value ?? "NULL"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Suggested value
                    </p>
                    <p className="rounded-md border border-border/60 bg-muted/20 p-3 font-mono text-sm mt-1">
                      {selected.suggested_value ?? "NULL"}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selected.suggestion_explanation}
                  </p>
                </div>
                <Separator />
                <CitationBlock citation={selected.citation} />
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Review Decision</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Severity
                      </p>
                      <p className="font-medium">{selected.severity.toUpperCase()}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Status
                      </p>
                      <StatusBadge status={selected.status} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      Corrected value or mapping
                    </label>
                    <Input
                      value={correctedValue}
                      onChange={(event) => setCorrectedValue(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Notes</label>
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      rows={4}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => saveReview("resolved")} disabled={busy}>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Resolve
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => saveReview("accepted")}
                      disabled={busy}
                    >
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Accept source
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => saveReview("ignored")}
                      disabled={busy}
                    >
                      Ignore
                    </Button>
                  </div>
                  {selected.reviewed_by && (
                    <p className="text-xs text-muted-foreground">
                      Reviewed by {selected.reviewed_by} on{" "}
                      {formatDate(selected.reviewed_at)}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Coverage By Issue Type</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(summary?.byIssue ?? []).map((item) => (
                    <div key={item.issue_type} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{issueLabel(item.issue_type)}</span>
                        <span className="text-muted-foreground">
                          {numberValue(item.pending)} pending / {numberValue(item.total)} total
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-foreground"
                          style={{
                            width: `${Math.min(
                              100,
                              (numberValue(item.pending) /
                                Math.max(1, numberValue(item.total))) *
                                100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {summary?.byIssue.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <DatabaseZap className="h-4 w-4" />
                      Sync issues to populate indicator coverage.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              Select an indicator issue to review.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
