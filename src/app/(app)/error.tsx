"use client";

import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with a real reporter (Sentry et al.) when one is set up.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-12">
      <Alert variant="destructive">
        <TriangleAlert aria-hidden />
        <AlertTitle>Something went wrong</AlertTitle>
        <AlertDescription>
          {/* Never render error.message: it can carry server detail. The digest
              is a safe, non-identifying handle for finding it in the logs. */}
          <p>
            We could not load this page. Try again — if it keeps happening,
            contact an administrator.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs">Reference: {error.digest}</p>
          ) : null}
        </AlertDescription>
      </Alert>

      <Button onClick={reset} className="mt-4">
        <RotateCw aria-hidden />
        Try again
      </Button>
    </div>
  );
}
