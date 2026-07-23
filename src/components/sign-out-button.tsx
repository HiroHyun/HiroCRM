"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { strings } from "../lib/strings";
import { Button } from "./ui/button";

export function SignOutButton() {
  return (
    <Button variant="ghost" onClick={() => signOut({ callbackUrl: "/login" })}>
      <LogOut size={16} aria-hidden />
      {strings.auth.signOut}
    </Button>
  );
}
