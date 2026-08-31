"use client";

import Link from "next/link";
import { LogOut, UserCircle } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initialsOf } from "@/lib/users";
import type { Profile } from "@/types/app";

export function UserMenu({ profile }: { profile: Profile }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative size-9 rounded-full p-0">
          <Avatar className="size-9">
            {profile.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt="" />
            ) : null}
            <AvatarFallback>{initialsOf(profile)}</AvatarFallback>
          </Avatar>
          <span className="sr-only">Open account menu</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              {profile.full_name ?? "Unnamed user"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {profile.email}
            </span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserCircle aria-hidden />
            Profile
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/*
          Sign-out is a POST form, not a link. A GET logout can be fired by any
          third-party page embedding an <img> pointing at it.
        */}
        <form action="/auth/signout" method="post" className="w-full">
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer">
              <LogOut aria-hidden />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
