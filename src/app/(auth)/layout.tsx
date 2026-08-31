import Link from "next/link";
import { TicketCheck } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 font-semibold tracking-tight"
        >
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <TicketCheck className="size-5" aria-hidden />
          </span>
          <span className="text-lg">Air Ticket</span>
        </Link>

        {children}

        <p className="text-center text-xs text-muted-foreground">
          Internal support desk. Access is restricted to authorised staff.
        </p>
      </div>
    </div>
  );
}
