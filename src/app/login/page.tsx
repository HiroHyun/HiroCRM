// Login. A quiet surface panel rather than a hero page.

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { LoginForm } from "../../components/login-form";
import { Wordmark } from "../../components/wordmark";
import { strings } from "../../lib/strings";
import { authOptions } from "../../server/auth";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-md border border-border bg-surface p-8">
        <Wordmark />
        <h1 className="mt-6 font-display font-semibold text-title">
          {strings.auth.signIn}
        </h1>
        <div className="mt-4">
          <LoginForm />
        </div>
        <p className="mt-4 text-caption text-muted">
          {strings.auth.sharedNotice}
        </p>
      </div>
    </main>
  );
}
