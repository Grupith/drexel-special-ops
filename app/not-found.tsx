"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Construction } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="flex flex-col items-center gap-4 max-w-md">
        <Construction className="h-12 w-12 text-muted-foreground" />

        <h1 className="text-3xl font-semibold tracking-tight">
          Page Under Construction
        </h1>

        <p className="text-muted-foreground">
          This page isn&apos;t ready yet — we&apos;re still building it.
        </p>

        <Button asChild className="mt-4">
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
