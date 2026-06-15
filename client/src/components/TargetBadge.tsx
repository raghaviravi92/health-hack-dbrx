import { Badge } from "@databricks/appkit-ui/react";
import { fieldLabel } from "../lib/utils";

export function TargetBadge({ target }: { target: string }) {
  return <Badge variant="outline">{fieldLabel(target)}</Badge>;
}
