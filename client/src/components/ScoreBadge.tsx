export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        No confidence
      </span>
    );
  }

  const normalized = score <= 1 ? Math.round(score * 100) : Math.round(score);
  const color =
    normalized >= 80
      ? "text-success"
      : normalized >= 50
        ? "text-warning"
        : "text-destructive";

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-sm font-mono font-medium ${color}`}
    >
      {normalized}
      <span className="text-xs text-muted-foreground font-normal">%</span>
    </span>
  );
}
