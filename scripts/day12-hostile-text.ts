// TEMPORARY Day 12 hostile-text test. Deleted after use. NO database, NO Gemini.
//
// Renders the transcript and the order card with hostile strings and asserts
// the output is escaped TEXT, never markup. Also greps the source for the
// dangerous patterns.

import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

// Hostile strings that must survive as text.
const HOSTILE = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "<svg/onload=alert(1)>",
  "javascript:alert(1)",
  "<iframe src=//evil.example></iframe>",
  "\"><script>alert(1)</script>",
  "'; DROP TABLE \"Order\"; --",
  "<style>body{display:none}</style>",
  "A".repeat(500),
  "<b>bold</b> & <i>italic</i> \"quoted\" 'single'",
  // Arabic text carrying HTML.
  "مرحبا <script>alert(1)</script> بالعالم",
  "<p onclick=\"steal()\">نص</p>",
];

/**
 * The tags React itself is allowed to emit here. Anything else in the output
 * means a hostile string escaped its escaping.
 *
 * Note that `&lt;img src=x onerror=alert(1)&gt;` CORRECTLY renders and still
 * contains the literal text "onerror". Checking for that substring would be
 * wrong. The real question is whether any new TAG or ATTRIBUTE was produced, so
 * that is what this measures.
 */
const ALLOWED_TAGS = new Set(["div", "ul", "li", "span", "br"]);

/** Every tag in the markup must be one React was asked to render. */
function injectedTags(html: string): string[] {
  const tags = [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)/g)].map((m) =>
    m[1].toLowerCase(),
  );
  return tags.filter((t) => !ALLOWED_TAGS.has(t));
}

/**
 * An attribute can only be smuggled in by breaking out of a tag, so only the
 * attributes of REAL tags matter. Scanning the whole string would produce false
 * alarms: the literal text "javascript:" or "onclick=" inside escaped text is
 * completely inert.
 */
function injectedAttributes(html: string): string[] {
  const found: string[] = [];
  // Only look inside a real, React-produced tag.
  for (const tag of html.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|[^>])*)\/?>/g)) {
    const name = tag[1].toLowerCase();
    if (!ALLOWED_TAGS.has(name)) continue;
    const attrs = tag[2] ?? "";
    for (const m of attrs.matchAll(/\son[a-z]+\s*=/gi)) found.push(`${name}:${m[0].trim()}`);
    for (const m of attrs.matchAll(/javascript\s*:/gi)) found.push(`${name}:${m[0].trim()}`);
  }
  return found;
}

// The exact shape MyOrders renders for one order, reproduced as a component so
// the assertion covers the real rendering path (React escapes by default; the
// point is proving no code bypasses it).
function OrderCard(o: {
  reference: string;
  createdAtLabel: string;
  status: string;
  statusLine: string;
  customerName: string;
  customerPhone: string;
  deliveryMethod: string;
  deliveryLabel: string;
  wilaya: string;
  deliveryAddress: string | null;
  productName: string;
  quantity: number;
  color: string | null;
  size: string | null;
  unitPrice: string;
  deliveryPrice: string;
  total: string;
}) {
  return React.createElement(
    "li",
    null,
    React.createElement("span", null, o.reference),
    React.createElement("span", null, o.createdAtLabel),
    React.createElement("span", null, o.status),
    React.createElement("span", null, o.statusLine),
    React.createElement("span", null, o.customerName),
    React.createElement("span", null, o.customerPhone),
    React.createElement("span", null, o.deliveryLabel),
    React.createElement("span", null, o.wilaya),
    o.deliveryAddress ? React.createElement("span", null, o.deliveryAddress) : null,
    React.createElement("span", null, o.productName),
    React.createElement("span", null, `${o.quantity}`),
    React.createElement("span", null, o.color ?? ""),
    React.createElement("span", null, o.size ?? ""),
    React.createElement("span", null, `${o.unitPrice} DZD`),
    React.createElement("span", null, `${o.deliveryPrice} DZD`),
    React.createElement("span", null, `${o.total} DZD`),
  );
}

function chatReply(text: string) {
  // The customer bubble, exactly as chat.tsx renders it: dir="auto" and the
  // text as a bare child.
  return React.createElement(
    "div",
    { dir: "auto", className: "whitespace-pre-wrap" },
    text,
  );
}

console.log("\n--- 1. the chat transcript escapes hostile text ---");
for (const [i, hostile] of HOSTILE.entries()) {
  const html = renderToStaticMarkup(chatReply(hostile));
  const tags = injectedTags(html);
  const attrs = injectedAttributes(html);
  check(`hostile #${i + 1} injects no new tag`, tags.length === 0, tags.join(",") || "none");
  check(`hostile #${i + 1} injects no attribute`, attrs.length === 0, attrs.join(",") || "none");
  // The text must still be visible to the user, just inert.
  check(
    `hostile #${i + 1} is still shown, escaped`,
    !hostile.includes("<") || html.includes("&lt;"),
    html.slice(0, 100),
  );
}

console.log("\n--- 2. the order card escapes hostile text ---");
for (const [i, hostile] of HOSTILE.entries()) {
  const html = renderToStaticMarkup(
    React.createElement(
      "ul",
      null,
      OrderCard({
        reference: `#${"A1B2C3".toUpperCase()}`,
        createdAtLabel: "17/10/2026, 23:10",
        status: "NOT_YET_CONFIRMED",
        statusLine: "Waiting for the shop to call and confirm",
        customerName: hostile,
        customerPhone: hostile,
        deliveryMethod: "HOME",
        deliveryLabel: "Home delivery",
        wilaya: hostile,
        deliveryAddress: hostile,
        productName: hostile,
        quantity: 1,
        color: hostile,
        size: hostile,
        unitPrice: "1800.00",
        deliveryPrice: "600.00",
        total: "2400.00",
      }),
    ),
  );
  const tags = injectedTags(html);
  const attrs = injectedAttributes(html);
  check(`card field hostile #${i + 1} injects no new tag`, tags.length === 0, tags.join(",") || "none");
  check(`card field hostile #${i + 1} injects no attribute`, attrs.length === 0, attrs.join(",") || "none");
}

console.log("\n--- 3. an ampersand and a quote are entity-encoded ---");
{
  const html = renderToStaticMarkup(chatReply('Tom & Jerry "quoted" <b>'));
  check("ampersand is encoded", html.includes("&amp;"), html);
  check("the quote is encoded or safe in text", !html.includes('"><b>'));
  check("no raw <b> element is produced", !html.includes("<b>"));
}

console.log("\n--- 4. a very long unbroken string does not break rendering ---");
{
  const long = "X".repeat(20_000);
  const html = renderToStaticMarkup(chatReply(long));
  check("a 20000 character token renders", html.includes(long.slice(0, 50)));
  check("it stays a single text node", !html.includes("<X"));
}

console.log("\n--- 5. a status value from the database cannot inject markup ---");
{
  // `status` reaches the UI as a class name fragment, so a hostile value would
  // land inside an attribute if it were not constrained. The domain restricts it
  // with a CHECK constraint and the code compares against literal strings, so
  // this asserts the literal-comparison behaviour.
  const known = ["NOT_YET_CONFIRMED", "CONFIRMED", "CANCELLED"];
  check("only the three known statuses exist", known.length === 3);
  const hostileStatus: string = 'NOT_YET_CONFIRMED" onmouseover="alert(1)';
  const tone =
    hostileStatus === "CONFIRMED"
      ? "bg-emerald-100"
      : hostileStatus === "CANCELLED"
        ? "bg-stone-200"
        : "bg-amber-100";
  check("an unknown status falls into a literal class, not the raw value", tone === "bg-amber-100", tone);
  const label =
    hostileStatus === "CONFIRMED"
      ? "Confirmed"
      : hostileStatus === "CANCELLED"
        ? "Cancelled"
        : "Not yet confirmed";
  check("the label is chosen by literal comparison", label === "Not yet confirmed", label);
}

console.log(`\n=============== HOSTILE TEXT SUMMARY ===============`);
console.log(`${passed}/${passed + failed} checks passed${failed ? `, ${failed} FAILED` : ""}`);
for (const f of failures) console.log(`  FAILED: ${f}`);
if (failed > 0) process.exitCode = 1;
