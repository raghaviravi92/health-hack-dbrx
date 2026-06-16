import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
} from "@databricks/appkit-ui/react";
import { Plus, Trash2, Sliders, Info, HelpCircle } from "lucide-react";
import { formatDate } from "../lib/utils";

interface Scenario {
  id: string;
  name: string;
  description: string | null;
  assumptions: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function ScenariosPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assumptionsText, setAssumptionsText] = useState("{}");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/scenarios");
      if (!res.ok) throw new Error("Failed to load scenarios");
      setScenarios((await res.json()) as Scenario[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load scenarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createScenario() {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const assumptions = JSON.parse(assumptionsText) as Record<string, unknown>;
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || undefined,
          assumptions,
        }),
      });
      if (!res.ok) throw new Error("Failed to create scenario");
      setName("");
      setDescription("");
      setAssumptionsText("{}");
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Assumptions must be a valid JSON object",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteScenario(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete scenario");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete scenario");
    }
  }

  function useSampleScenario() {
    setName("Prioritize underserved districts");
    setDescription(
      "Find facilities in districts with high maternal health need and enough data quality to support outreach planning.",
    );
    setAssumptionsText(
      JSON.stringify(
        {
          target_districts: ["high maternal risk", "low facility coverage"],
          require_valid_location: true,
          prefer_reviewed_contacts: true,
          max_open_data_issues_per_facility: 2,
          planning_notes:
            "Use this to shortlist facilities after ZIP, coordinate, phone, and indicator joins are reviewed.",
        },
        null,
        2,
      ),
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-8 space-y-6 animate-fade-in-up">
      {/* Page Header */}
      <div>
        <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold uppercase tracking-widest bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-full">
          Simulation Desk
        </span>
        <h2 className="text-3xl font-extrabold tracking-tight text-foreground mt-2">Scenarios</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define planning scenarios and reference assumptions to validate facility metrics.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive flex items-center gap-2">
          <Info className="h-4.5 w-4.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Scenario Creator Form */}
      <Card className="glass-card">
        <CardHeader className="pb-3 border-b border-border flex items-center gap-2">
          <Sliders className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          <CardTitle className="text-xs text-foreground font-bold uppercase tracking-wider">Create New Scenario</CardTitle>
        </CardHeader>
        <CardContent className="p-5 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Scenario Name</label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Q3 Healthcare Uplift"
              className="bg-card border-border text-xs text-foreground"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Scenario Description</label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Assumptions modeling facility expansion across northern districts."
              className="bg-card border-border text-xs text-foreground"
            />
          </div>
          <div className="md:col-span-2 space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Assumptions Schema (JSON Object)</label>
              <span className="text-[9px] text-muted-foreground font-semibold flex items-center gap-1">
                <HelpCircle className="h-3 w-3" /> Must be key-value JSON
              </span>
            </div>
            <textarea
              value={assumptionsText}
              onChange={(event) => setAssumptionsText(event.target.value)}
              rows={3}
              placeholder='{ "facility_target": 12, "allowed_mismatch_meters": 100 }'
              className="flex w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-mono text-purple-600 dark:text-purple-300 focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <div className="flex gap-2">
              <Button variant="outline" onClick={useSampleScenario} disabled={submitting}>
                Use Sample
              </Button>
              <Button onClick={createScenario} disabled={submitting || !name.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Create Scenario
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scenarios Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading &&
          Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} className="h-44 w-full bg-secondary/20 rounded-xl animate-pulse" />
          ))}
        {!loading && scenarios.length === 0 && (
          <Card className="glass-card md:col-span-2 flex flex-col items-center justify-center py-16 text-center">
            <Sliders className="h-10 w-10 text-muted-foreground opacity-60 mb-2" />
            <p className="text-xs text-muted-foreground font-semibold">No scenarios simulated yet.</p>
          </Card>
        )}
        {!loading &&
          scenarios.map((scenario) => (
            <Card key={scenario.id} className="glass-card">
              <CardHeader className="pb-3 border-b border-border">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-xs text-foreground font-extrabold uppercase tracking-wide truncate">
                      {scenario.name}
                    </CardTitle>
                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                      Updated {formatDate(scenario.updated_at)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => deleteScenario(scenario.id)}
                    className="h-8 w-8 text-destructive border-destructive/20 hover:bg-destructive/10"
                    title="Delete Scenario"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed min-h-8">
                  {scenario.description || "No description provided."}
                </p>
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Assumptions</span>
                  <pre className="rounded-lg border border-border bg-secondary/40 p-3 text-[10px] font-mono text-purple-600 dark:text-purple-300 overflow-x-auto">
                    {JSON.stringify(scenario.assumptions ?? {}, null, 2)}
                  </pre>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-2 text-[10px] text-muted-foreground font-semibold">
                  <span>Author: {scenario.created_by}</span>
                  <span className="bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded border border-purple-500/20 uppercase tracking-widest text-[8px] font-bold">Active Scope</span>
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}
