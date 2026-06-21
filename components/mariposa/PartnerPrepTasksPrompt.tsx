import { Card, CardHeader } from "@/components/mariposa/Card";

export function HisPrepTasksSourceNote({ taskCount }: { taskCount: number }) {
  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader
        title="His prep tasks loaded"
        description={`${taskCount} His-column task${taskCount === 1 ? "" : "s"} timed to her fertile window — lifestyle, repeat semen analysis, and urology note.`}
      />
    </Card>
  );
}
