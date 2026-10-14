"use client";

import { useEffect, useState } from "react";

type CatalogItem = {
  id: string;
  name: string;
  price: string;
  available: boolean;
};

/**
 * Spec 14.1: catalog information must be database-backed if displayed.
 *
 * It is fetched from /api/catalog, which reads PostgreSQL on every request
 * with no caching, so the prices shown always match the database.
 *
 * `layout` switches between a horizontally scrollable strip (mobile) and a
 * vertical panel of cards (desktop).
 */
export default function ProductList({
  layout = "panel",
}: {
  layout?: "strip" | "panel";
}) {
  const [items, setItems] = useState<CatalogItem[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch("/api/catalog", {
          signal: controller.signal,
        });
        if (!response.ok) {
          setItems([]);
          return;
        }
        const data = (await response.json()) as { products?: CatalogItem[] };
        setItems(Array.isArray(data.products) ? data.products : []);
      } catch {
        if (!controller.signal.aborted) setItems([]);
      }
    })();

    return () => controller.abort();
  }, []);

  if (items === null) {
    return (
      <p className="px-1 text-sm text-zinc-500 dark:text-zinc-400">
        Loading products...
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="px-1 text-sm text-zinc-500 dark:text-zinc-400">
        No products available.
      </p>
    );
  }

  if (layout === "strip") {
    return (
      <ul className="flex snap-x gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="w-40 shrink-0 snap-start rounded-2xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
              {item.name}
            </p>
            <p className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
              {item.price} DA
            </p>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="rounded-2xl border border-zinc-200 bg-white px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {item.name}
          </p>
          <p className="text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
            {item.price} DA
          </p>
        </li>
      ))}
    </ul>
  );
}