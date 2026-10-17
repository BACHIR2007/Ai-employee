import { Suspense } from "react";
import { io } from "next/cache";
import { prisma } from "@/lib/prisma";

/*
 * Spec 14.1: catalog information must be database-backed, so this reads
 * PostgreSQL. It is never cached: `io()` suspends during prerendering, so the
 * strip is filled in at request time and the prices always match the database.
 *
 * No images and no invented products. The swatch dots are only drawn when a
 * product's real `options` list actually names colours.
 */

const SWATCHES: Record<string, string> = {
  noir: "#1F1E1D",
  black: "#1F1E1D",
  blanc: "#FFFFFF",
  white: "#FFFFFF",
  gris: "#9A968F",
  grey: "#9A968F",
  gray: "#9A968F",
  beige: "#E4D8C6",
  creme: "#F0E9DC",
  marine: "#2B3A55",
  bleu: "#2B3A55",
  blue: "#2B3A55",
  rouge: "#8E2B34",
  red: "#8E2B34",
  vert: "#3F6B4F",
  green: "#3F6B4F",
  marron: "#6B4A32",
  brown: "#6B4A32",
  brun: "#6B4A32",
  jaune: "#D8B33C",
  yellow: "#D8B33C",
  orange: "#C96A2B",
  rose: "#C9788C",
  pink: "#C9788C",
  violet: "#6B5B8E",
  purple: "#6B5B8E",
};

/** Groups digits so a price reads like money instead of a database decimal. */
function formatDzd(price: string): string {
  const n = Number(price);
  if (!Number.isFinite(n)) return `${price} DZD`;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} DZD`;
}

/** Only real colours named in the product's own options. */
function swatchesFor(options: string | null): Array<{ name: string; hex: string }> {
  if (!options) return [];
  const out: Array<{ name: string; hex: string }> = [];
  const seen = new Set<string>();
  try {
    const parsed = JSON.parse(options) as { colors?: unknown };
    const list = Array.isArray(parsed.colors) ? parsed.colors : [];
    for (const c of list) {
      if (typeof c !== "string") continue;
      const name = c.trim();
      const key = name.toLowerCase().replace(/[\s-]/g, "_");
      const hex = SWATCHES[key];
      if (!hex || seen.has(key)) continue;
      seen.add(key);
      out.push({ name, hex });
      if (out.length === 4) break;
    }
  } catch {
    // A product whose options are not JSON simply shows no swatches.
  }
  return out;
}

async function CatalogItems() {
  // Keeps this read out of the static shell, so it happens on every request.
  await io();

  const products = await prisma.product.findMany({
    select: { id: true, name: true, price: true, options: true },
    orderBy: { name: "asc" },
  });

  if (products.length === 0) {
    return (
      <p className="text-sm text-ash">The catalog is empty right now.</p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {products.map((p) => {
        const swatches = swatchesFor(typeof p.options === "string" ? p.options : null);
        return (
          <li
            key={p.id}
            className="flex min-h-11 items-center gap-2 rounded-full border border-hairline bg-white px-3 py-1.5"
          >
            {swatches.length > 0 ? (
              <span className="flex shrink-0 gap-0.5" aria-hidden="true">
                {swatches.map((s) => (
                  <span
                    key={s.name}
                    title={s.name}
                    className="h-2.5 w-2.5 rounded-full border border-hairline"
                    style={{ backgroundColor: s.hex }}
                  />
                ))}
              </span>
            ) : null}
            <span className="truncate text-sm font-medium text-charcoal">
              {p.name}
            </span>
            <span className="text-sm tabular-nums text-brass">
              {formatDzd(p.price.toString())}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CatalogSkeleton() {
  return (
    <p className="text-sm text-ash">Loading the catalog…</p>
  );
}

/** Compact catalog strip, rendered on the server from the real database. */
export default function CatalogStrip() {
  return (
    <section aria-labelledby="catalog-heading" className="shrink-0">
      <h2
        id="catalog-heading"
        className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-brass uppercase"
      >
        In stock now
      </h2>
      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogItems />
      </Suspense>
    </section>
  );
}
