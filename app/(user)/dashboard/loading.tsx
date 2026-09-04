import { PageHeadingSkeleton, KpiRowSkeleton, ChartSkeleton } from "@/components/dashboard/skeletons";

/** Nearest loading boundary for every dashboard route without its own —
 * the sidebar's Link click now paints this immediately instead of leaving
 * the previous page up while the server renders. */
export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <PageHeadingSkeleton />
      <KpiRowSkeleton />
      <ChartSkeleton className="h-80" />
    </div>
  );
}
