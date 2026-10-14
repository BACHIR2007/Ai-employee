import Chat from "./components/chat";
import ProductList from "./components/product-list";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Boutique elegance
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This is a demo AI Employee that answers questions about the
          shop&apos;s products.
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 md:flex-row">
        <div className="flex min-h-[60vh] flex-1 flex-col rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <Chat />
        </div>

        <aside className="w-full shrink-0 rounded-xl border border-zinc-200 p-3 md:w-56 dark:border-zinc-800">
          <h2 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Products
          </h2>
          <ProductList />
        </aside>
      </div>
    </main>
  );
}