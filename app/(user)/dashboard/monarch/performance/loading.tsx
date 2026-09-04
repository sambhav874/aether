import { PageHeadingSkeleton, KpiRowSkeleton, ChartSkeleton } from "@/components/dashboard/skeletons";

export default function PerformanceLoading() {
  return (
    <div className="space-y-4">
      <PageHeadingSkeleton />
      <KpiRowSkeleton />
      <ChartSkeleton className="h-72" />
      <ChartSkeleton className="h-40" />
    </div>
  );
}
