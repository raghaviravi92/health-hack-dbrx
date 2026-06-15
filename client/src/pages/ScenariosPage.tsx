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
import { Plus, Trash2 } from "lucide-react";
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
          : "Assumptions must be valid JSON object",
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

  return (
    <div className="w-full max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Scenarios</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Planning scenarios and assumptions for facility review.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Create Scenario</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Scenario name"
          />
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description"
          />
          <textarea
            value={assumptionsText}
            onChange={(event) => setAssumptionsText(event.target.value)}
            rows={3}
            className="md:col-span-2 flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-mono"
          />
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={createScenario} disabled={submitting || !name.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading &&
          Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        {!loading && scenarios.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              No scenarios yet.
            </CardContent>
          </Card>
        )}
        {!loading &&
          scenarios.map((scenario) => (
            <Card key={scenario.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-sm truncate">
                      {scenario.name}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Updated {formatDate(scenario.updated_at)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => deleteScenario(scenario.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground min-h-10">
                  {scenario.description || "No description."}
                </p>
                <pre className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs overflow-auto">
                  {JSON.stringify(scenario.assumptions ?? {}, null, 2)}
                </pre>
                <p className="text-xs text-muted-foreground">
                  Owner: {scenario.created_by}
                </p>
              </CardContent>
            </Card>
          ))}
      </div>
    </div>
  );
}
