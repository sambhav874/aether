import { PageHeadingSkeleton, KpiRowSkeleton, ChartSkeleton, TableSkeleton } from "@/components/dashboard/skeletons";

export default function TradingModuleLoading() {
  return (
    <div className="space-y-4">
      <PageHeadingSkeleton />
      <KpiRowSkeleton />
      <ChartSkeleton className="h-64" />
      <TableSkeleton rows={5} />
    </div>
  );
}
