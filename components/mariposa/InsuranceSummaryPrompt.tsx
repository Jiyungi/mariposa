import Link from "next/link";

import { Card, CardHeader } from "@/components/mariposa/Card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function InsuranceSummaryEmptyPrompt() {
  return (
    <Card className="mb-4 border-dashed">
      <CardHeader
        title="Coverage not verified in summary yet"
        description="Run the Mariposa insurance demo to populate verified benefit facts here."
      />
      <div className="mt-4">
        <Link
          href="/demo/insurance-flow"
          className={cn(buttonVariants({ variant: "primary", size: "sm" }))}
        >
          Run insurance flow demo
        </Link>
      </div>
    </Card>
  );
}

export function InsuranceSummarySourceNote() {
  return (
    <Card className="mb-4 border-primary/20 bg-primary/5">
      <CardHeader
        title="Verified coverage loaded"
        description="Benefit facts below come from the Mariposa insurance flow."
        action={
          <Link
            href="/demo/insurance-flow"
            className="text-sm font-medium text-primary hover:underline"
          >
            Re-run demo
          </Link>
        }
      />
    </Card>
  );
}
