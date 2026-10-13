export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        AI Employee
      </h1>
      <p className="max-w-md text-base leading-7 text-zinc-600 dark:text-zinc-400">
        This is a demo of an AI Employee for a small store.
      </p>
      <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
        Demo only. Don&apos;t enter real personal data.
      </p>
    </main>
  );
}