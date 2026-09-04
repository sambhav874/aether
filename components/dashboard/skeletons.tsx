import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shapes for the route-level `loading.tsx` files and the streamed panels on
 * the overview page. Every dashboard route renders on demand against a
 * database in another region, so without these a click sat on the previous
 * page with no feedback until the whole payload landed.
 */

export function PageHeadingSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
    </div>
  );
}

export function KpiRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-28" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y rounded-lg border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-4 w-4 shrink-0 rounded" />
          <Skeleton className="h-4 flex-1" style={{ maxWidth: `${55 + ((i * 13) % 35)}%` }} />
          <Skeleton className="ml-auto h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ className = "h-64" }: { className?: string }) {
  return <Skeleton className={`w-full ${className}`} />;
}

export function WatchlistSkeleton() {
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Skeleton className="h-4 w-24" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-2 py-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function HeadlinesSkeleton() {
  return (
    <div className="h-[420px] space-y-2 overflow-hidden rounded-lg border p-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="space-y-1.5 p-2">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}
