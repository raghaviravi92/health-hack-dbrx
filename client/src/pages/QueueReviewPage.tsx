import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
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
  ArrowLeft,
  BookmarkPlus,
  Sparkles,
  ChevronRight,
  Check,
  AlertTriangle,
  ArrowRightLeft,
  Lightbulb,
  CornerDownRight,
  Smile,
} from "lucide-react";
import { ScoreBadge } from "../components/ScoreBadge";
import { StatusBadge } from "../components/StatusBadge";
import { TargetBadge } from "../components/TargetBadge";
import { READINESS_FIELDS, fieldLabel, formatDate } from "../lib/utils";

interface ReadinessRecord {
  id: string;
  facility_id: string;
  facility_name: string;
  field_name: string;
  anomaly_type: string;
  source_catalog: string | null;
  source_schema: string | null;
  source_table: string | null;
  source_column: string | null;
  source_record_id: string | null;
  original_value: string | null;
  suggested_value: string | null;
  suggestion_method: string | null;
  suggestion_explanation: string | null;
  validation_state: string;
  state_context: string | null;
  district_context: string | null;
  citation: Record<string, unknown>;
  status: string;
  corrected_value: string | null;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  updated_at: string;
}

interface AssistResponse {
  suggested_value: string | null;
  should_nullify: boolean;
  confidence: number;
  explanation: string;
  validation_notes: string[];
  validation_state: string;
}

const statusOptions = [
  { value: "pending", label: "Pending Issues" },
  { value: "reopened", label: "Reopened Issues" },
  { value: "resolved", label: "Resolved" },
  { value: "rejected", label: "Rejected" },
  { value: "nullified", label: "Nullified" },
  { value: "stale", label: "Stale" },
];

function CitationBlock({ citation }: { citation: Record<string, unknown> }) {
  const entries = Object.entries(citation ?? {});
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No citation metadata available.</p>;
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

export function QueueReviewPage() {
  const { fieldName = "zip" } = useParams<{ fieldName: string }>();
  const [records, setRecords] = useState<ReadinessRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [correctedValue, setCorrectedValue] = useState("");
  const [notes, setNotes] = useState("");
  const [assistInstruction, setAssistInstruction] = useState("");
  const [assist, setAssist] = useState<AssistResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);

  const validField = READINESS_FIELDS.some((field) => field.value === fieldName)
    ? fieldName
    : "zip";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        limit: "100",
      });
      if (search.trim()) params.set("facilityName", search.trim());
      const res = await fetch(`/api/readiness/queue/${validField}?${params}`);
      if (!res.ok) throw new Error("Failed to load queue");
      const rows = (await res.json()) as ReadinessRecord[];
      setRecords(rows);
      
      setSelectedId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load queue");
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, validField]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      setCorrectedValue("");
      setNotes("");
      setAssist(null);
      return;
    }
    setCorrectedValue(selected.corrected_value ?? selected.suggested_value ?? "");
    setNotes(selected.notes ?? "");
    setAssist(null);
  }, [selected]);

  // Index and queue helpers
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

  async function saveReview(decision: "resolved" | "rejected" | "nullified") {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/readiness/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: selected.id,
          decision,
          correctedValue,
          notes,
        }),
      });
      if (!res.ok) throw new Error("Failed to save review");
      
      // Notify parent to fetch counts
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

  async function requestAssist() {
    if (!selected || !assistInstruction.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/readiness/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordId: selected.id,
          instruction: assistInstruction,
        }),
      });
      if (!res.ok) throw new Error("AI assist failed");
      const result = (await res.json()) as AssistResponse;
      setAssist(result);
      if (result.suggested_value !== null) setCorrectedValue(result.suggested_value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI assist failed");
    } finally {
      setBusy(false);
    }
  }

  async function addShortlist() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/shortlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facility_id: selected.facility_id,
          facility_name: selected.facility_name,
          state: selected.state_context ?? undefined,
          district: selected.district_context ?? undefined,
          notes: `Shortlisted from ${fieldLabel(selected.field_name)} queue`,
        }),
      });
      if (!res.ok) throw new Error("Failed to add shortlist entry");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to shortlist");
    } finally {
      setBusy(false);
    }
  }

  async function bulkAcceptSimilar() {
    if (!selected) return;
    const decision = selected.suggested_value === null ? "nullified" : "resolved";
    const matchSuggestedValue = selected.anomaly_type !== "latitude_longitude_swapped";
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/readiness/review/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fieldName: selected.field_name,
          anomalyType: selected.anomaly_type,
          suggestedValue: selected.suggested_value,
          decision,
          correctedValue: matchSuggestedValue ? (selected.suggested_value ?? undefined) : undefined,
          matchSuggestedValue,
          notes: `Bulk ${decision} for repeated ${selected.anomaly_type.replace(/_/g, " ")} pattern`,
          limit: 500,
        }),
      });
      if (!res.ok) throw new Error("Failed to bulk accept similar records");
      window.dispatchEvent(new Event("review-saved"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to bulk accept");
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

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-6 space-y-6 flex-1 flex flex-col min-h-0">
      {/* 1. Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center justify-center h-8 w-8 rounded-lg bg-secondary/30 border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-foreground tracking-tight">{fieldLabel(validField)} Review</h2>
              <TargetBadge target={validField} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review and correct invalid facility attributes in this queue.
            </p>
          </div>
        </div>

        {/* Action Controls & Filters */}
        <div className="flex items-center flex-wrap gap-2.5">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground focus:outline-none focus:border-purple-500 transition-colors"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value} className="bg-popover text-foreground">
                {option.label}
              </option>
            ))}
          </select>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by facility name..."
            className="max-w-xs h-9 bg-card border-border placeholder-muted-foreground text-xs"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive flex items-center gap-2 shrink-0">
          <AlertTriangle className="h-4.5 w-4.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Main Grid Layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[330px_1fr] gap-6 min-h-0">
        {/* Left Sidebar List */}
        <Card className="glass-card flex flex-col h-full overflow-hidden">
          <CardHeader className="pb-3 border-b border-border flex items-center justify-between shrink-0">
            <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider">
              Records List ({records.length})
            </CardTitle>
            {records.length > 0 && activeIndex !== -1 && (
              <span className="text-[10px] text-muted-foreground font-semibold">
                {activeIndex + 1} of {records.length}
              </span>
            )}
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading &&
              Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-lg bg-secondary/20" />
              ))}
            {!loading && records.length === 0 && (
              <div className="py-12 text-center">
                <Smile className="h-8 w-8 text-success mx-auto mb-2 opacity-60" />
                <p className="text-xs text-muted-foreground font-medium">No records matching filters.</p>
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
                  <div className="flex justify-between items-center mt-1.5 text-[10px] text-muted-foreground">
                    <span className="font-mono truncate max-w-[150px]">
                      {record.original_value ?? "NULL"} {"→"} {record.suggested_value ?? "NULL"}
                    </span>
                    <span className="text-[9px] uppercase tracking-widest font-bold">
                      {record.anomaly_type.replace(/_/g, " ")}
                    </span>
                  </div>
                </button>
              ))}
          </CardContent>
        </Card>

        {/* Right Workspace Panel */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-6">
          {selected ? (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
              
              {/* Left Column: Original Details & Citations */}
              <div className="space-y-6">
                {/* Visual Side-by-Side Diff Widget */}
                <Card className="glass-card overflow-hidden">
                  <CardHeader className="pb-3 border-b border-border flex items-center justify-between">
                    <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <ArrowRightLeft className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                      Visual Comparison
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoAdvance}
                          onChange={(e) => setAutoAdvance(e.target.checked)}
                          className="rounded border-border bg-card text-purple-500 focus:ring-0"
                        />
                        Auto-Advance
                      </label>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Original Value Card */}
                      <div className="rounded-xl border border-destructive/20 bg-destructive/[0.03] p-4 flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-destructive block">Original Value</span>
                          <p className="text-lg font-mono font-bold text-foreground mt-2 break-all">
                            {selected.original_value !== null ? selected.original_value : <span className="italic text-muted-foreground text-sm font-sans">[Empty/NULL]</span>}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium mt-4">
                          Anomaly Type: <span className="text-foreground font-semibold">{selected.anomaly_type.replace(/_/g, " ")}</span>
                        </span>
                      </div>

                      {/* Suggested Value Card */}
                      <div className="rounded-xl border border-success/20 bg-success/[0.03] p-4 flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] font-extrabold uppercase tracking-widest text-success block">Suggested Correction</span>
                          <p className="text-lg font-mono font-bold text-foreground mt-2 break-all">
                            {selected.suggested_value !== null ? selected.suggested_value : <span className="italic text-muted-foreground text-sm font-sans">[NULL]</span>}
                          </p>
                        </div>
                        <div className="flex justify-between items-center mt-4">
                          <span className="text-[10px] text-muted-foreground font-medium">
                            Method: <span className="text-foreground font-semibold">{selected.suggestion_method ?? "System Rule"}</span>
                          </span>
                          <span className="text-[10px] bg-success/10 border border-success/20 text-success px-2 py-0.5 rounded font-bold">
                            Valid
                          </span>
                        </div>
                      </div>
                    </div>

                    {selected.suggestion_explanation && (
                      <div className="bg-secondary/20 border border-border/60 rounded-lg p-3 flex gap-2.5 items-start">
                        <Lightbulb className="h-4.5 w-4.5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[10px] font-bold text-foreground uppercase tracking-wider block">Suggestion Explanation</span>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{selected.suggestion_explanation}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Original Record Card (Metadata & Context) */}
                <Card className="glass-card">
                  <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider">
                      Record Context Metadata
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
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">District</span>
                        <p className="text-foreground font-semibold mt-0.5">{selected.district_context ?? "Unknown"}</p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">State</span>
                        <p className="text-foreground font-semibold mt-0.5">{selected.state_context ?? "Unknown"}</p>
                      </div>
                    </div>

                    <Separator className="bg-border/60" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block font-sans">Lakehouse Source Table</span>
                        <p className="text-foreground break-all mt-0.5">
                          {[selected.source_catalog, selected.source_schema, selected.source_table]
                            .filter(Boolean)
                            .join(".") || "Pending source mapping"}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block font-sans">Source Coordinates</span>
                        <p className="text-foreground mt-0.5">
                          Column: <span className="font-mono text-purple-600 dark:text-purple-300">{selected.source_column ?? "—"}</span> &middot; Row: <span className="font-mono text-purple-600 dark:text-purple-300">{selected.source_record_id ?? "—"}</span>
                        </p>
                      </div>
                    </div>

                    <Separator className="bg-border/60" />

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Source Citations</span>
                      <CitationBlock citation={selected.citation} />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Review Action Forms & AI Assist */}
              <div className="space-y-6">
                {/* Decision Panel */}
                <Card className="glass-card border-purple-500/20 bg-purple-500/[0.01]">
                  <CardHeader className="pb-3 border-b border-border flex items-center justify-between">
                    <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider">
                      Review Decision Action
                    </CardTitle>
                    <StatusBadge status={selected.validation_state} />
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                        Final Corrected Value
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
                        Audit & Resolution Notes
                      </label>
                      <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={3}
                        placeholder="Add details for the review audit logs..."
                        className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground focus:outline-none focus:border-purple-500 transition-colors"
                      />
                    </div>

	                    <div className="flex flex-col gap-2 pt-2">
	                      <Button onClick={() => saveReview("resolved")} disabled={busy} className="w-full">
	                        <Check className="h-4 w-4 mr-2" /> Save Resolved Suggestion
	                      </Button>
	                      <Button
	                        variant="outline"
	                        onClick={bulkAcceptSimilar}
	                        disabled={busy}
	                        className="w-full text-xs"
	                      >
	                        Accept same pattern in this queue
	                      </Button>
	                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="secondary"
                          onClick={() => saveReview("nullified")}
                          disabled={busy}
                          className="text-xs"
                        >
                          Force NULL
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => saveReview("rejected")}
                          disabled={busy}
                          className="text-xs"
                        >
                          Reject
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" onClick={addShortlist} disabled={busy} className="text-xs">
                          <BookmarkPlus className="h-3.5 w-3.5 mr-1.5" /> Shortlist
                        </Button>
                        <Button variant="outline" onClick={handleSkip} className="text-xs">
                          Skip Record
                        </Button>
                      </div>
                    </div>

                    {selected.reviewed_by && (
                      <div className="pt-2 text-[10px] text-muted-foreground border-t border-border">
                        Reviewed by <span className="text-foreground font-semibold">{selected.reviewed_by}</span> on{" "}
                        {formatDate(selected.reviewed_at)}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* AI Assist Panel */}
                <Card className="glass-card">
                  <CardHeader className="pb-3 border-b border-border">
                    <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                      LLM AI Assistance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-4">
                    <textarea
                      value={assistInstruction}
                      onChange={(event) => setAssistInstruction(event.target.value)}
                      rows={3}
                      placeholder="e.g. Find coordinates matching district master database."
                      className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground focus:outline-none focus:border-purple-500 transition-colors"
                    />
                    <Button
                      variant="secondary"
                      onClick={requestAssist}
                      disabled={busy || !assistInstruction.trim()}
                      className="w-full"
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Get AI Suggestion
                    </Button>
                    
                    {assist && (
                      <div className="rounded-xl border border-border bg-secondary/10 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold block">AI Suggested Value</span>
                            <p className="font-mono text-sm text-foreground mt-0.5">{assist.suggested_value ?? "NULL"}</p>
                          </div>
                          <ScoreBadge score={assist.confidence} />
                        </div>
                        <div>
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold block">Reasoning Explanation</span>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{assist.explanation}</p>
                        </div>
                        <div className="flex items-center justify-between border-t border-border pt-2 text-[10px]">
                          <span className="text-muted-foreground font-semibold">Validation:</span>
                          <StatusBadge status={assist.validation_state} />
                        </div>
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
                No pending anomalies left in this queue. Click "Overview" or check other review tabs to continue auditing.
              </p>
            </Card>
          )}

          {/* 3. Up Next continuous preview banner */}
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
                    Anomaly Type: {nextRecord.anomaly_type.replace(/_/g, " ")} &middot; Val: {nextRecord.original_value ?? "NULL"}
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
