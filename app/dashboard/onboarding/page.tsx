"use client";

import { FilePlus } from "lucide-react";

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
  <>
    <strong>Scan the SHAW bill of lading</strong> in PaperStream Capture, then{" "}
    <strong>save or download it as a PDF</strong>.
  </>,
  <>
    From the dashboard, select <strong>Create Split</strong>.
  </>,
  <>
    Select <strong>SHAW</strong> as the vendor.
  </>,
  <>
    Select <strong>your name</strong>.
  </>,
  <>
    Turn on <strong>Include Stamp</strong> if you want your name and{" "}
    <strong>today&apos;s date</strong> added to each split document.
  </>,
  <>
    <strong>Review each split document</strong> and make sure the{" "}
    <strong>pages and PO numbers</strong> look correct.
  </>,
  <>
    Select <strong>Print All</strong>. After printing,{" "}
    <strong>scan the documents back into PaperStream Capture</strong> for
    Central Receiving.
  </>,
];

export default function OnboardingPage() {
  return (
    <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-3">
          <h1 className="font-semibold text-3xl leading-tight tracking-tight text-foreground sm:text-4xl">
            How to Use the PO Splitter
          </h1>
          <p className="text-base leading-7 text-muted-foreground">
            Follow these steps to turn one SHAW bill of lading into separate
            split documents for Central Receiving.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Steps</h2>
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={index}>
                <Card className="rounded-lg py-0">
                  <CardContent className="flex gap-3 p-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500 border border-blue-300 text-base font-semibold text-primary-foreground">
                      {index + 1}
                    </span>
                    <p className="pt-0.5 text-base leading-7 text-foreground [&_strong]:font-semibold">
                      {step}
                    </p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>

          <div className="pt-3">
            <NewSplitModal
              receiverNames={receiverNames}
              vendors={vendors}
              trigger={
                <Button size="lg" className="h-11 rounded-md">
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
