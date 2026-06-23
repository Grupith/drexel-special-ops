"use client";

import {
  Building2,
  ClipboardCheck,
  FilePlus,
  Printer,
  ScanLine,
  Stamp,
  UserRound,
} from "lucide-react";

import { NewSplitModal } from "@/components/NewSplitModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const receiverNames = [
  "Ashley Helgerson",
  "Dylan Koss",
  "Mike Santacroche",
  "AJ Klotz",
  "Chris Roeske",
  "Bryce Vogt",
  "Brad Drobka",
  "Bob Kurtz",
];

const vendors = [
  { id: "SHAW", name: "SHAW" },
  { id: "SFI", name: "SFI (coming soon)", disabled: true },
];

const steps = [
  {
    title: "Scan the SHAW bill of lading",
    description:
      "Use PaperStream Capture, then save or download the scan as a PDF.",
    icon: ScanLine,
  },
  {
    title: "Create a split",
    description: "From the dashboard, select Create Split.",
    icon: FilePlus,
  },
  {
    title: "Choose SHAW",
    description: "Select SHAW as the vendor.",
    icon: Building2,
  },
  {
    title: "Pick your name",
    description: "Select your name so the split is assigned correctly.",
    icon: UserRound,
  },
  {
    title: "Add a stamp if needed",
    description:
      "Turn on Include Stamp to add your name and today's date to each split document.",
    icon: Stamp,
  },
  {
    title: "Review the split documents",
    description: "Make sure the pages and PO numbers look correct.",
    icon: ClipboardCheck,
  },
  {
    title: "Print and scan back",
    description:
      "Select Print All, then scan the printed documents back into PaperStream Capture for Central Receiving.",
    icon: Printer,
  },
];

export default function OnboardingPage() {
  return (
    <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="border-b border-border/70 pb-5">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Quick guide
          </p>
          <h1 className="font-semibold text-2xl leading-tight tracking-tight text-foreground sm:text-3xl">
            How to Use the PO Splitter
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Follow these steps to turn one SHAW bill of lading into separate
            split documents for Central Receiving.
          </p>
        </header>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Steps</h2>
              <p className="text-sm text-muted-foreground">
                Work through the list from top to bottom.
              </p>
            </div>
            <span className="rounded-md border border-border bg-secondary/70 px-2.5 py-1 text-xs font-medium text-secondary-foreground">
              {steps.length} steps
            </span>
          </div>

          <ol className="space-y-2">
            {steps.map(({ title, description, icon: Icon }, index) => (
              <li key={index}>
                <Card className="rounded-lg border-border/80 py-0 shadow-xs transition-colors hover:border-ring/35 hover:bg-accent/45">
                  <CardContent className="flex items-start gap-3 p-3 sm:p-3.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-xs font-semibold text-secondary-foreground">
                      {index + 1}
                    </span>
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 hidden h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground sm:flex">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-semibold leading-5 text-foreground">
                          {title}
                        </p>
                        <p className="text-sm leading-5 text-muted-foreground">
                          {description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>

          <div className="flex justify-end pt-2">
            <NewSplitModal
              receiverNames={receiverNames}
              vendors={vendors}
              trigger={
                <Button size="lg" className="h-10 rounded-md">
                  <FilePlus className="mr-2 h-5 w-5" />
                  Create Split
                </Button>
              }
            />
          </div>
        </section>
      </div>
    </main>
  );
}
