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
import { ArrowLeft, BookmarkPlus, Sparkles } from "lucide-react";
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
  { value: "pending", label: "Pending" },
  { value: "reopened", label: "Reopened" },
  { value: "resolved", label: "Resolved" },
  { value: "rejected", label: "Rejected" },
  { value: "nullified", label: "Nullified" },
  { value: "stale", label: "Stale" },
];

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
      await load();
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

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </Link>
        <Separator orientation="vertical" className="h-4" />
        <h2 className="text-xl font-semibold">{fieldLabel(validField)}</h2>
        <TargetBadge target={validField} />
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter facilities"
          className="max-w-sm"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Queue Records</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading &&
              Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            {!loading && records.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No records match this queue and filter.
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
                    {record.anomaly_type.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {record.original_value ?? "NULL"} {"->"}{" "}
                    {record.suggested_value ?? "NULL"}
                  </p>
                </button>
              ))}
          </CardContent>
        </Card>

        {selected ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Original Record</CardTitle>
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
                    <p>{selected.state_context ?? "Unknown"}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      District
                    </p>
                    <p>{selected.district_context ?? "Unknown"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Original value
                  </p>
                  <p className="rounded-md border border-border/60 bg-muted/20 p-3 font-mono text-sm mt-1">
                    {selected.original_value ?? "NULL"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Source
                  </p>
                  <p className="text-sm">
                    {[selected.source_catalog, selected.source_schema, selected.source_table]
                      .filter(Boolean)
                      .join(".") || "Pending source mapping"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selected.source_column ?? "Unknown column"} &middot;{" "}
                    {selected.source_record_id ?? "Unknown row"}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                    Citations
                  </p>
                  <CitationBlock citation={selected.citation} />
                </div>
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
                        Suggested value
                      </p>
                      <p className="font-mono">{selected.suggested_value ?? "NULL"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground">
                        Validation
                      </p>
                      <StatusBadge status={selected.validation_state} />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {selected.suggestion_explanation}
                  </p>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">
                      Corrected value
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
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => saveReview("resolved")} disabled={busy}>
                      Save resolved
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => saveReview("nullified")}
                      disabled={busy}
                    >
                      Force NULL
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => saveReview("rejected")}
                      disabled={busy}
                    >
                      Reject
                    </Button>
                    <Button variant="outline" onClick={addShortlist} disabled={busy}>
                      <BookmarkPlus className="h-4 w-4 mr-2" />
                      Shortlist
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
                  <CardTitle className="text-sm">AI Assist</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <textarea
                    value={assistInstruction}
                    onChange={(event) => setAssistInstruction(event.target.value)}
                    rows={3}
                    placeholder="Instruct AI to assist with this correction"
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  />
                  <Button
                    variant="secondary"
                    onClick={requestAssist}
                    disabled={busy || !assistInstruction.trim()}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Get suggestion
                  </Button>
                  {assist && (
                    <div className="rounded-md border border-border/60 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-mono text-sm">
                          {assist.suggested_value ?? "NULL"}
                        </p>
                        <ScoreBadge score={assist.confidence} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {assist.explanation}
                      </p>
                      <StatusBadge status={assist.validation_state} />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              Select a queue record to review.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
