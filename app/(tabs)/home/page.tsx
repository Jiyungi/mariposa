import { AlertTriangle } from "lucide-react";

import { EmptyState } from "@/components/mariposa/EmptyState";
import { WorkspaceTabs } from "@/components/mariposa/WorkspaceTabs";
import { ProgressJourney } from "@/components/mariposa/ProgressJourney";
import { BookingApprovalCard } from "@/components/mariposa/BookingApprovalCard";
import { buildSeedCouple } from "@/lib/db/seed";
import type { CoupleWorkspace } from "@/lib/db/types";

/**
 * Home — the couple's workspace from the signed-in partner's perspective plus a
 * plain-language progress strip and the human-in-the-loop booking approval card
 * (Req 1, 17, 20). The technical Inngest graph is abstracted away: couples see a
 * swipeable ProgressJourney, not workflow internals. Data comes from the seeded
 * couple via the pure `buildSeedCouple` builder so the screen renders
 * standalone; the live status and the real `couple.booking.approved` emit are
 * wired by Person B (Tasks 24, 25).
 *
 * If the seed cannot be built the workspace refuses to render partially and
 * shows a load-error indication instead (Req 1.7).
 */
export default function HomePage() {
  let workspace: CoupleWorkspace;
  try {
    workspace = buildSeedCouple();
  } catch {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Workspace can't be loaded"
        description="Your couple data couldn't be read. Reload to try again — Mariposa won't show a partial workspace."
      />
    );
  }

  return (
    <div className="space-y-5">
      <WorkspaceTabs workspace={workspace} />
      {/* Plain-language progress — the workflow internals are abstracted away. */}
      <ProgressJourney />
      {/* Human-in-the-loop pause made actionable. SEAM: Person B passes an
          emitter that calls inngest.send("couple.booking.approved") (Task 25). */}
      <BookingApprovalCard coupleId={workspace.couple.id} />
    </div>
  );
}
