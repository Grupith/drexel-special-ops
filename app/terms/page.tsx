import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="flex items-center mb-4">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </a>
      </div>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Terms of Service</h1>

          <p className="text-muted-foreground mt-2">
            Please read these terms carefully before using this tool.
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h2 className="font-semibold text-base mb-1">1. Overview</h2>
            <p>
              This application (“PO Splitter”) is an independent project created
              by employees for internal operational use.
            </p>
            <p className="mt-2">
              The PO Splitter is{" "}
              <strong>not an official product of Drexel Building Supply</strong>{" "}
              and is{" "}
              <strong>not developed, maintained, or endorsed by Drexel</strong>.
              It was built independently during personal time to improve
              workflow efficiency.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">2. Intended Use</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>Used at your own discretion</li>
              <li>
                Designed to assist workflows, not replace official systems
              </li>
              <li>You are responsible for verifying all outputs before use</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">
              3. No Affiliation / Disclaimer
            </h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>Not affiliated with or officially supported by Drexel</li>
              <li>Does not replace official company systems or processes</li>
              <li>May not reflect current or official procedures</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">4. Data & Privacy</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>
                Files may be processed and stored to provide functionality
              </li>
              <li>
                Avoid uploading sensitive or confidential data unless necessary
              </li>
              <li>No guarantee of long-term storage or retention</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">
              5. Accuracy & Reliability
            </h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>Outputs may contain errors</li>
              <li>Always review results before use</li>
              <li>No responsibility for incorrect outputs or missed data</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">6. Availability</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>Provided “as-is” with no guarantees</li>
              <li>May change, break, or be removed at any time</li>
              <li>No guaranteed uptime or support</li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">
              7. Limitation of Liability
            </h2>
            <p>
              By using this Tool, you agree that the creator is not liable for
              any damages, errors, or operational issues. Use is entirely at
              your own risk.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">8. Feedback</h2>
            <p>
              Feedback may be used to improve the Tool, but there is no
              obligation to implement requested changes.
            </p>
          </section>

          <section>
            <h2 className="font-semibold text-base mb-1">9. Acceptance</h2>
            <p>By using this Tool, you acknowledge and agree to these terms.</p>
          </section>
        </div>

        {/* Footer Note */}
        <div className="border-t pt-6 text-xs text-muted-foreground">
          Built independently to improve receiving workflows. Not an official
          Drexel system.
        </div>
      </div>
    </div>
  );
}
