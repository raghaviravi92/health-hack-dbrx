import { Badge } from "@databricks/appkit-ui/react";

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "secondary",
  resolved: "default",
  rejected: "destructive",
  nullified: "outline",
  reopened: "secondary",
  stale: "outline",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANTS[status] ?? "outline";
  const label = status.replace(/_/g, " ");
  return <Badge variant={variant}>{label}</Badge>;
}
