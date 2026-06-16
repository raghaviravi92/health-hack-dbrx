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
import {
  RotateCw,
  ShieldCheck,
  ArrowRightLeft,
  ChevronRight,
  CornerDownRight,
  Smile,
  AlertTriangle,
  Lightbulb,
  Activity,
  Check,
  ShieldAlert,
} from "lucide-react";
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

const severityOptions = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
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

function issueValueLabel(issueType: string): string {
  if (issueType === "missing_indicator_join") return "Join Problem";
  if (issueType === "district_mapping_needed") return "District Mapping";
  if (issueType === "duplicate_indicator_row") return "Duplicate Reference";
  return "Current Indicator Value";
}

function suggestedLabel(issue: IndicatorIssue): string {
  if (issue.suggested_value) return issue.suggested_value;
  if (issue.issue_type === "missing_indicator_join") return "Review facility PIN or district mapping";
  if (issue.issue_type === "missing_metric_value") return "Confirm null metric or exclude from scoring";
  if (issue.issue_type === "metric_outlier") return "Validate against NFHS source";
  return "Human review required";
}

function indicatorLabel(issue: IndicatorIssue): string {
  return issue.indicator_name ?? issueLabel(issue.issue_type);
}

function CitationBlock({ citation }: { citation: Record<string, unknown> }) {
  const entries = Object.entries(citation ?? {});
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No citation metadata available.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-secondary/30 border border-border/50 rounded-lg p-3">
      {entries.map(([key, value]) => (
        <div key={key} className="text-xs">
          <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-wider block">
            {key.replace(/_/g, " ")}
          </span>
          <p className="text-foreground mt-0.5 break-all font-medium">
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
  const [autoAdvance, setAutoAdvance] = useState(true);

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

  // Index and navigation helpers
  const activeIndex = useMemo(
    () => records.findIndex((r) => r.id === selectedId),
    [records, selectedId],
  );

  const nextRecord = useMemo(() => {
    if (activeIndex !== -1 && activeIndex < records.length - 1) {
      return records[activeIndex + 1];
    }
    return null;
  }, [records, activeIndex]);

  const prevRecord = useMemo(() => {
    if (activeIndex > 0) {
      return records[activeIndex - 1];
    }
    return null;
  }, [records, activeIndex]);

  async function syncDemoIssues() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/indicator-reviews/sync", { method: "POST" });
      if (!res.ok) throw new Error("Failed to sync indicator issues");
      
      // Dispatch layout reload counter
      window.dispatchEvent(new Event("review-saved"));
      
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
      
      // Notify layout parent to fetch counts
      window.dispatchEvent(new Event("review-saved"));

      // Cache next ID to select before list updates
      const nextId = nextRecord?.id ?? prevRecord?.id ?? null;

      await load();

      if (autoAdvance && nextId) {
        setSelectedId(nextId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save review");
    } finally {
      setBusy(false);
    }
  }

  const handleSkip = () => {
    if (nextRecord) {
      setSelectedId(nextRecord.id);
    } else if (records.length > 0) {
      setSelectedId(records[0].id);
    }
  };

  const rangeEnd = Math.min(offset + records.length, total);
  const totals = summary?.totals;

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-6 space-y-6 flex-1 flex flex-col min-h-0">
      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase tracking-widest bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-full">
            Database Coverage
          </span>
          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-2">Indicator Review</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Audit facility mapping joins, mismatching districts, outliers, and indicator values.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={syncDemoIssues} disabled={syncing} variant="outline" className="h-9">
            <RotateCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing Workspace..." : "Sync Issues"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive flex items-center gap-2 shrink-0">
          <AlertTriangle className="h-4.5 w-4.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Global KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 shrink-0">
        {[
          ["Pending Audits", totals?.pending, "text-amber-600 dark:text-amber-400"],
          ["Critical Issues", totals?.critical, "text-destructive"],
          ["High Severity", totals?.high, "text-purple-600 dark:text-purple-400"],
          ["Resolved", numberValue(totals?.resolved) + numberValue(totals?.accepted), "text-success"],
        ].map(([label, value, colorClass]) => (
          <Card key={label} className="glass-card">
            <CardContent className="py-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
              <p className={`text-2xl font-extrabold mt-1.5 ${colorClass}`}>{numberValue(value)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 3. Filters Toolbar */}
      <div className="flex flex-wrap items-center gap-3 shrink-0">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground focus:outline-none focus:border-purple-500 transition-colors"
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
          className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground focus:outline-none focus:border-purple-500 transition-colors"
        >
          <option value="all">All severities</option>
          {severityOptions.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-popover text-foreground">
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={issueTypeFilter}
          onChange={(event) => setIssueTypeFilter(event.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground focus:outline-none focus:border-purple-500 transition-colors"
        >
          <option value="all">All issue types</option>
          {issueTypes.map((type) => (
            <option key={type} value={type} className="bg-popover text-foreground">
              {issueLabel(type)}
            </option>
          ))}
        </select>

        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search facility, location, indicator..."
          className="max-w-xs h-9 bg-card border-border placeholder-muted-foreground text-xs"
        />
      </div>

      {/* 4. Main Grid Section */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6 min-h-0">
        
        {/* Sidebar Record List */}
        <Card className="glass-card flex flex-col h-full overflow-hidden">
          <CardHeader className="pb-3 border-b border-border flex items-center justify-between shrink-0">
            <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider">
              Indicator Issues {total > 0 ? `(${offset + 1}-${rangeEnd} of ${total})` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading &&
              Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-20 w-full bg-secondary/20 rounded-lg" />
              ))}
            {!loading && records.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-xs">
                No indicator issues match criteria.
              </div>
            )}
            {!loading &&
              records.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => setSelectedId(record.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-all duration-200 ${
                    selectedId === record.id
                      ? "border-purple-500/40 bg-purple-500/10 shadow-lg"
                      : "border-border hover:bg-secondary/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-xs text-foreground truncate">{record.facility_name}</p>
                    <StatusBadge status={record.status} />
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate mt-1">
                    {issueLabel(record.issue_type)}
                  </p>
                  <div className="flex justify-between items-center text-[9px] text-muted-foreground mt-1 font-medium">
                    <span className="uppercase tracking-wider font-bold text-purple-600 dark:text-purple-400">{record.severity}</span>
                    <span className="truncate max-w-[140px]">{indicatorLabel(record)}</span>
                  </div>
                </button>
              ))}
          </CardContent>
          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border p-3 shrink-0">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="text-xs"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + limit >= total || loading}
              onClick={() => setOffset(offset + limit)}
              className="text-xs"
            >
              Next
            </Button>
          </div>
        </Card>

        {/* Right workspace details */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-6">
          {selected ? (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
              
              {/* Left Column: Visual Diff & Context metadata */}
              <div className="space-y-6">
                
                {/* Visual side-by-side mismatch card */}
                <Card className="glass-card overflow-hidden">
                  <CardHeader className="pb-3 border-b border-border flex items-center justify-between">
                    <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <ArrowRightLeft className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                      Visual Comparison
                    </CardTitle>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoAdvance}
                        onChange={(e) => setAutoAdvance(e.target.checked)}
                        className="rounded border-border bg-card text-purple-500 focus:ring-0"
                      />
                      Auto-Advance
                    </label>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Current value */}
                      <div className="rounded-xl border border-destructive/20 bg-destructive/[0.03] p-4 flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-destructive block font-bold">{issueValueLabel(selected.issue_type)}</span>
                          <p className="text-lg font-mono font-bold text-foreground mt-2 break-all">
                            {selected.current_value !== null ? selected.current_value : <span className="italic text-muted-foreground text-sm font-sans">[NULL / Missing]</span>}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium mt-4">
                          Table: <span className="text-foreground font-mono break-all text-[10px] block mt-0.5">{selected.indicator_table}</span>
                        </span>
                      </div>

                      {/* Suggested correction */}
                      <div className="rounded-xl border border-success/20 bg-success/[0.03] p-4 flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-success block font-bold">Recommended Action</span>
                          <p className="text-lg font-mono font-bold text-foreground mt-2 break-all">
                            {suggestedLabel(selected)}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium mt-4">
                          Indicator: <span className="text-foreground font-mono block text-[10px] mt-0.5">{indicatorLabel(selected)}</span>
                        </span>
                      </div>
                    </div>

                    {selected.suggestion_explanation && (
                      <div className="bg-secondary/20 border border-border/60 rounded-lg p-3 flex gap-2.5 items-start mt-2">
                        <Lightbulb className="h-4.5 w-4.5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] font-bold text-foreground uppercase tracking-wider block">Review Guidance</span>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{selected.suggestion_explanation}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Facility context */}
                <Card className="glass-card">
                  <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider">
                      Facility & Join Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Facility Name</span>
                        <p className="text-foreground font-bold text-sm mt-0.5">{selected.facility_name}</p>
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{selected.facility_id}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Mapped District</span>
                        <p className="text-foreground font-semibold mt-0.5">{selected.district ?? "Unknown"}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Mapped State</span>
                        <p className="text-foreground font-semibold mt-0.5">{selected.state ?? "Unknown"}</p>
                      </div>
                    </div>

                    <Separator className="bg-border/60" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block font-sans">Source Record Join Key</span>
                        <p className="text-purple-600 dark:text-purple-300 mt-0.5 break-all">{selected.source_record_id ?? "—"}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block font-sans">Reference Record Join Key</span>
                        <p className="text-purple-600 dark:text-purple-300 mt-0.5 break-all">{selected.reference_record_id ?? "—"}</p>
                      </div>
                    </div>

                    <Separator className="bg-border/60" />

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Citation References</span>
                      <CitationBlock citation={selected.citation} />
                    </div>
                  </CardContent>
                </Card>

              </div>

              {/* Right Column: Decisions & Statistics */}
              <div className="space-y-6">
                {/* Decision Action panel */}
                <Card className="glass-card border-purple-500/20 bg-purple-500/[0.01]">
                  <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider">
                      Audit Review Decision
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Severity</span>
                        <p className="font-bold text-purple-600 dark:text-purple-400 uppercase mt-0.5">{selected.severity}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Audit Status</span>
                        <p className="mt-0.5"><StatusBadge status={selected.status} /></p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Final Corrected Value / Mappings
                      </label>
                      <Input
                        value={correctedValue}
                        onChange={(event) => setCorrectedValue(event.target.value)}
                        placeholder="Type or select resolved value..."
                        className="bg-card border-border text-xs text-foreground"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Audit Resolution Notes
                      </label>
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={3}
                        placeholder="Explain resolution details..."
                        className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground focus:outline-none focus:border-purple-500 transition-colors"
                      />
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                      <Button onClick={() => saveReview("resolved")} disabled={busy} className="w-full">
                        <Check className="h-4 w-4 mr-2" /> Resolve Mismatch
                      </Button>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => saveReview("accepted")}
                          disabled={busy}
                          className="text-xs"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Accept Source
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => saveReview("ignored")}
                          disabled={busy}
                          className="text-xs"
                        >
                          Ignore Issue
                        </Button>
                      </div>
                      <Button variant="outline" onClick={handleSkip} className="w-full text-xs">
                        Skip Record
                      </Button>
                    </div>

                    {selected.reviewed_by && (
                      <div className="pt-2 text-[10px] text-muted-foreground border-t border-border">
                        Audited by <span className="text-foreground font-semibold">{selected.reviewed_by}</span> on{" "}
                        {formatDate(selected.reviewed_at)}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Progress bars by Category */}
                <Card className="glass-card">
                  <CardHeader className="pb-3 border-b border-border flex items-center gap-2">
                    <Activity className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider">
                      Issue Coverage Stats
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    {(summary?.byIssue ?? []).map((item) => {
                      const itemTotal = numberValue(item.total);
                      const itemPending = numberValue(item.pending);
                      const pct = itemTotal > 0 ? Math.round(((itemTotal - itemPending) / itemTotal) * 100) : 100;
                      return (
                        <div key={item.issue_type} className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
                            <span>{issueLabel(item.issue_type)}</span>
                            <span className="text-muted-foreground font-mono text-[10px]">
                              {itemTotal - itemPending} / {itemTotal}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full bg-purple-500 transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    {summary?.byIssue.length === 0 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center py-4">
                        <ShieldAlert className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        Sync database issues to see statistics.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

            </div>
          ) : (
            <Card className="glass-card flex-1 flex flex-col items-center justify-center py-24 text-center">
              <Smile className="h-12 w-12 text-success mb-3 animate-bounce" />
              <h3 className="text-base font-bold text-foreground">All Caught Up!</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                No pending indicator issues remain in this workspace. Click "Overview" or check other review tabs to continue auditing.
              </p>
            </Card>
          )}

          {/* 5. Up Next continuous preview banner */}
          {selected && nextRecord && (
            <div className="glass-card p-4 flex items-center justify-between border-l-4 border-l-purple-500 shrink-0">
              <div className="flex items-center gap-3">
                <CornerDownRight className="h-5 w-5 text-purple-600 dark:text-purple-400 animate-pulse" />
                <div>
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-purple-600 dark:text-purple-400 block">Up Next in Queue</span>
                  <p className="text-xs font-bold text-foreground mt-0.5">
                    {nextRecord.facility_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    Issue: {issueLabel(nextRecord.issue_type)} &middot; Severity: <span className="uppercase font-bold text-purple-600 dark:text-purple-300">{nextRecord.severity}</span>
                  </p>
                </div>
              </div>
              <Button onClick={handleSkip} variant="outline" size="sm" className="text-xs">
                Skip to Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
