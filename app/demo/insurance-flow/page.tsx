import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/mariposa/EmptyState";
import { InsuranceFlowDeepgramUpload } from "@/components/mariposa/InsuranceFlowDeepgramUpload";
import {
  InsuranceFlowDemo,
  InsuranceFlowDemoChrome,
} from "@/components/mariposa/InsuranceFlowDemo";
import { runInsuranceFlow } from "@/lib/orkes/insurance-flow";

export const metadata = {
  title: "Mariposa — Insurance flow demo",
};

export default async function InsuranceFlowDemoPage() {
  try {
    const result = await runInsuranceFlow();

    return (
      <InsuranceFlowDemoChrome>
        <div className="space-y-4">
          <InsuranceFlowDemo result={result} />
          <InsuranceFlowDeepgramUpload />
        </div>
      </InsuranceFlowDemoChrome>
    );
  } catch {
    return (
      <InsuranceFlowDemoChrome>
        <EmptyState
          icon={AlertTriangle}
          title="Insurance flow unavailable"
          description="The local insurance workflow could not run. Check server logs and try again."
        />
      </InsuranceFlowDemoChrome>
    );
  }
}
