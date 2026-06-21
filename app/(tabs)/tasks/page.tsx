import { getTasks } from "@/lib/db";
import { buildSeedCouple, SEED_COUPLE_ID } from "@/lib/db/seed";
import {
  hasHisPrepTasks,
  hisPrepTaskPrefix,
  persistHisPrepTasks,
} from "@/lib/calendar/persist-his-prep-tasks";
import {
  InsuranceTasksEmptyPrompt,
  InsuranceTasksSourceNote,
} from "@/components/mariposa/InsuranceTasksPrompt";
import { HisPrepTasksSourceNote } from "@/components/mariposa/PartnerPrepTasksPrompt";
import { TaskBoard } from "@/components/mariposa/TaskBoard";
import {
  hasMariposaInsuranceFlowTasks,
  mariposaInsuranceFlowTaskPrefix,
} from "@/lib/orkes/persist-insurance-flow";

/**
 * Tasks tab — reads persisted tasks from the in-memory data layer so insurance
 * follow-ups from the Mariposa demo appear in the Together column after
 * `/demo/insurance-flow` runs.
 */
export default async function TasksPage() {
  await persistHisPrepTasks(SEED_COUPLE_ID);
  const workspace = buildSeedCouple();
  const tasks = await getTasks(SEED_COUPLE_ID);
  const insuranceTasksPresent = hasMariposaInsuranceFlowTasks(
    SEED_COUPLE_ID,
    tasks,
  );
  const hisPrepPresent = hasHisPrepTasks(SEED_COUPLE_ID, tasks);
  const insuranceTaskCount = insuranceTasksPresent
    ? tasks.filter((task) =>
        task.id.startsWith(mariposaInsuranceFlowTaskPrefix(SEED_COUPLE_ID)),
      ).length
    : 0;
  const hisPrepTaskCount = hisPrepPresent
    ? tasks.filter((task) => task.id.startsWith(hisPrepTaskPrefix(SEED_COUPLE_ID))).length
    : 0;

  return (
    <div className="space-y-4">
      {insuranceTasksPresent ? (
        <InsuranceTasksSourceNote taskCount={insuranceTaskCount} />
      ) : (
        <InsuranceTasksEmptyPrompt />
      )}
      {hisPrepPresent ? <HisPrepTasksSourceNote taskCount={hisPrepTaskCount} /> : null}
      <TaskBoard
        tasks={tasks}
        readinessScore={workspace.himProfile.readiness_score ?? 0}
      />
    </div>
  );
}
