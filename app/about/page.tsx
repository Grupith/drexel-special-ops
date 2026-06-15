import React from "react";
import {
  Pencil,
  Sparkles,
  Workflow,
  ListChecks,
  Rocket,
  ArrowLeft,
} from "lucide-react";

const featureCards = [
  {
    title: "Built for Receiving",
    description:
      "Designed around the real workflow used by the Kewaskum receiving team and Central Receiving.",
  },
  {
    title: "Saves Time",
    description:
      "Turns manual document splitting into a faster review-and-print process.",
  },
  {
    title: "Vendor Expansion",
    description:
      "Currently supports SHAW, with more vendor formats planned next.",
  },
];

const workflowSteps = ["Upload", "Detect", "Split", "Review & Print"];

const features = [
  "Upload master vendor documents",
  "Automatic PO detection using OCR",
  "Generate individual PO split images",
  "Preserve headers, footers, and notes",
  "Print individual or all splits",
  "Smart Search bar to quickly find specific POs",
];

const nextSteps = [
  "SFI BOL support",
  "Multi page document support",
  "Additional vendor formats",
];

const AboutPage: React.FC = () => {
  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
      <div className="flex items-center">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </a>
      </div>
      {/* Hero */}
      <section className="rounded-2xl border bg-card p-8 md:p-10 shadow-sm">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Supported Vendors:
                </span>
                <span className="inline-flex items-center rounded-full border bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                  SHAW
                </span>
              </div>
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              <span className="text-foreground">Drexel</span>{" "}
              <span className="text-blue-600">PO Splitter</span>
            </h1>

            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
              A simple internal tool that helps Drexel split vendor packing
              slips into individual Purchase Order documents for receiving.
            </p>

            <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
              Built for the Kewaskum receiving team, this tool reflects Drexel's{" "}
              <span className="font-semibold text-foreground">
                2-second lean
              </span>{" "}
              mindset by turning manual PO splitting into a faster, simpler
              workflow.
            </p>
          </div>

          <div className="flex justify-start lg:justify-end">
            <img
              src="https://www.drexelteam.com/wp-content/uploads/Drexel_Rev.jpg"
              alt="Drexel Building Supply logo"
              className="h-auto w-full max-w-65 object-contain rounded-lg shadow-sm"
            />
          </div>
        </div>
      </section>

      {/* Before / After */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <Pencil className="h-5 w-5 text-muted-foreground" />
            Before
          </h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Printing copies of vendor paperwork, manually scribbling out POs
            that don't belong to each job, then scanning everything into Central
            Receiving.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              Spending{" "}
              <span className="font-semibold text-foreground">
                10 - 20 minutes
              </span>{" "}
              coloring out POs with a sharpie
            </li>
            <li>Wasting time on repetitive manual work</li>
            <li>Going through markers quickly (constant replacements)</li>
            <li>Slowing down the receiving and scanning process</li>
          </ul>

          <img
            src="/images/manual-split.jpeg"
            alt="Manual PO splitting example"
            className="mt-4 rounded-lg border shadow-sm"
          />
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <Sparkles className="h-5 w-5 text-blue-600" />
            After
          </h2>
          <p className="mt-3 leading-relaxed text-muted-foreground">
            Automatically splits each PO for you—just upload, review in the app,
            and print what you need.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Splits POs instantly with no manual work</li>
            <li>No more sharpies or wasted supplies</li>
            <li>Faster turnaround from receiving to scanning</li>
            <li>Clean, organized documents ready to print</li>
          </ul>

          <img
            src="/images/splitter-preview.png"
            alt="PO Splitter app preview"
            className="mt-4 rounded-lg border shadow-sm"
          />
        </div>
      </section>

      {/* Workflow */}
      <section className="rounded-2xl border bg-card p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
          <Workflow className="h-5 w-5 text-muted-foreground" />
          How it Works
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {workflowSteps.map((step, index) => (
            <div
              key={step}
              className="rounded-xl border bg-background p-4 text-center"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-blue-600">
                Step {index + 1}
              </div>
              <div className="mt-2 text-base font-semibold">{step}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features + What's Next */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <ListChecks className="h-5 w-5 text-muted-foreground" />
            Features
          </h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm space-y-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-foreground">
            <Rocket className="h-5 w-5 text-muted-foreground" />
            What's Next
          </h2>
          <p className="leading-relaxed text-muted-foreground">
            Currently built for SHAW paperwork, with more vendor support
            planned.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Footer */}
      <section className="border-t pt-6 space-y-2">
        <p className="text-sm text-muted-foreground">
          Built and developed by{" "}
          <span className="font-medium text-foreground">Dylan Koss</span>,
          Kewaskum Receiving Team
        </p>

        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500"></span>
          </span>
          Version 1.0
        </p>

        <p className="text-sm text-muted-foreground">
          Feedback or ideas? Let Dylan know.
        </p>
      </section>
    </div>
  );
};

export default AboutPage;
