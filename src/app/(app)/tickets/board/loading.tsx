import { Skeleton } from "@/components/ui/skeleton";

export default function BoardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>

      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }, (_, column) => (
          <div key={column} className="w-72 shrink-0 space-y-2 rounded-lg border p-2">
            <Skeleton className="h-6 w-28" />
            {Array.from({ length: 3 }, (_, card) => (
              <Skeleton key={card} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
