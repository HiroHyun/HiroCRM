"use client";

import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { strings } from "../lib/strings";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setFailed(false);
    const res = await signIn("credentials", {
      redirect: false,
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    // Bad credentials come back as { ok: false, error: "CredentialsSignin" };
    // branch on error, never on ok alone.
    if (res?.error) {
      setFailed(true);
      setPending(false);
      return;
    }
    router.replace("/");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1.5 text-dense text-muted">
        {strings.auth.username}
        <Input name="username" autoComplete="username" autoFocus required />
      </label>
      <label className="flex flex-col gap-1.5 text-dense text-muted">
        {strings.auth.password}
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {failed && (
        <p aria-live="polite" className="text-dense text-danger-fg">
          {strings.auth.invalidCredentials}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={pending}>
        {strings.auth.signIn}
      </Button>
    </form>
  );
}
