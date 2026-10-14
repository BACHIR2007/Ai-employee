import Chat from "./components/chat";
import ProductList from "./components/product-list";

export default function Home() {
  return (
    <div className="h-dvh bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto flex h-dvh w-full max-w-5xl flex-col gap-3 px-3 py-3 md:px-6 md:py-5">
        {/* Mobile: horizontal product strip above the chat. */}
        <div className="shrink-0 md:hidden">
          <ProductList layout="strip" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
          <section className="flex min-h-0 flex-1 flex-col">
            <Chat />
          </section>

          {/* Desktop: side panel of product cards. */}
          <aside className="hidden w-64 shrink-0 flex-col gap-2 overflow-y-auto md:flex">
            <h2 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
              Products
            </h2>
            <ProductList layout="panel" />
          </aside>
        </div>
      </main>
    </div>
  );
}