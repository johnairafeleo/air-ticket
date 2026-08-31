"use client";

import { useState } from "react";
import { Menu, TicketCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import type { NavSection } from "@/components/layout/nav-items";

/** Sidebar equivalent for small screens. Closes itself on navigation. */
export function MobileNav({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu aria-hidden />
          <span className="sr-only">Open navigation</span>
        </Button>
      </SheetTrigger>

      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="h-16 border-b px-6">
          <SheetTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <TicketCheck className="size-4" aria-hidden />
            </span>
            Air Ticket
          </SheetTitle>
        </SheetHeader>

        <SidebarNav sections={sections} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
