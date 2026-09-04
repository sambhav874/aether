import { PageHeadingSkeleton, KpiRowSkeleton, TableSkeleton } from "@/components/dashboard/skeletons";

export default function StrategiesLoading() {
  return (
    <div className="space-y-4">
      <PageHeadingSkeleton />
      <KpiRowSkeleton count={3} />
      <TableSkeleton rows={6} />
    </div>
  );
}
