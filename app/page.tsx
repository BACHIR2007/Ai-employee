import CatalogStrip from "./components/catalog-strip";
import DemoShell from "./components/demo-shell";

// Everything a judge needs is on this one page: the idea in three steps, the
// real catalog, the conversation, and the order the shop owner would act on.
// No password, no second screen.

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: "A customer writes in the shop's Instagram DMs.",
    body: "Arabic, Darija, French or English.",
  },
  {
    title: "The AI collects the order; the backend validates it.",
    body: "Every price and fee is computed by the backend.",
  },
  {
    title: "The owner sees the ready order and confirms it by phone.",
    body: "The order is only final once the shop calls.",
  },
];

export default function Home() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ivory">
      <header className="shrink-0 border-b border-hairline px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wine font-display text-sm font-semibold text-white"
          >
            BE
          </span>
          <h1 className="truncate font-display text-xl font-semibold text-charcoal">
            Boutique Elegance
          </h1>
          <span className="ml-auto shrink-0 rounded-full border border-brass/40 bg-linen px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-brass uppercase">
            AI Employee demo
          </span>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
        <section
          aria-labelledby="how-it-works"
          className="shrink-0 rounded-2xl border border-hairline bg-white px-4 py-4 shadow-paper"
        >
          <h2
            id="how-it-works"
            className="text-[11px] font-semibold tracking-[0.14em] text-brass uppercase"
          >
            How this works
          </h2>
          <ol className="mt-2.5 grid gap-3 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-wine text-xs font-semibold text-white tabular-nums"
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-charcoal">
                    {step.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-ash">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 border-t border-hairline pt-2.5 text-xs text-ash">
            In the real product this chat lives inside the shop&apos;s Instagram
            account. This panel simulates it.
          </p>
        </section>

        <CatalogStrip />

        <DemoShell />
      </main>
    </div>
  );
}
