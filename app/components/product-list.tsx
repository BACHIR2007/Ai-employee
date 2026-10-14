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
 */
export default function ProductList() {
  const [items, setItems] = useState<CatalogItem[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch("/api/catalog", { signal: controller.signal });
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
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Loading products...
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No products available.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-300"
        >
          <span>{item.name}</span>
          <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
            {item.price} DA
          </span>
        </li>
      ))}
    </ul>
  );
}