import Link from "next/link";

import { Card, CardHeader } from "@/components/mariposa/Card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function InsuranceTasksEmptyPrompt() {
  return (
    <Card className="border-dashed">
      <CardHeader
        title="No insurance follow-ups yet"
        description="Run the Mariposa insurance demo to extract coverage and create Together tasks."
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

export function InsuranceTasksSourceNote({ taskCount }: { taskCount: number }) {
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader
        title="Insurance follow-ups loaded"
        description={`${taskCount} Together task${taskCount === 1 ? "" : "s"} from the Mariposa insurance flow.`}
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
