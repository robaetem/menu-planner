import Link from "next/link";
import { SignOutButton } from "@clerk/nextjs";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEV_BYPASS } from "@/lib/supabase/server";

export default function Unauthorized() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
          <Lock className="size-7" />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Geen toegang</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Dit is een privé-app voor Robin &amp; Amber. Je account staat niet op de
          gastenlijst. Denk je dat dit een vergissing is? Vraag dan om je e-mailadres toe te voegen.
        </p>
        <div className="mt-6">
          {DEV_BYPASS ? (
            <Button render={<Link href="/" />}>Terug naar de app</Button>
          ) : (
            <SignOutButton>
              <Button variant="outline">Uitloggen</Button>
            </SignOutButton>
          )}
        </div>
      </div>
    </div>
  );
}
