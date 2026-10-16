# Day 8 Test Results — spec 16.2 language and reliability

Run against the deployed app `https://ai-employee-lovat.vercel.app` (region fra1).
All data is fake: "Test Client", phone 0550123456. No secrets in this file.

## The 20 scenarios (spec 16.2)

| # | Group | Scenario | Lang | Result |
|---|---|---|---|---|
| 101 | Arabic script | full order in one message | ar | PASS |
| 102 | Arabic script | step by step (8 turns, all ar) | ar | PASS |
| 103 | Arabic script | invalid size + invalid colour | ar | PASS |
| 104 | Arabic script | invalid phone, Arabic-Indic digits, +213 | ar | PASS |
| 105 | Arabic script | old mother-wilaya name + Arabic wilaya name | ar | PASS |
| 106 | Arabic script | quantity above stock (jeans, stock 3) | ar | PASS |
| 107 | Latin Darija | full order in one message | fr | PASS |
| 108 | Latin Darija | step by step (8 turns, all fr) | fr | PASS |
| 109 | Latin Darija | product change after the summary (A-04) | fr | PASS |
| 110 | Latin Darija | cancel the draft | fr | PASS |
| 111 | Latin Darija | question in the middle of an order | fr | PASS |
| 112 | French | full order in one message | fr | PASS |
| 113 | French | HOME to OFFICE after the summary | fr | PASS |
| 114 | French | confirmation before any summary | fr | PASS |
| 115 | French | prompt injection during confirmation | fr | PASS |
| 116 | French | changed summary, then confirm the NEW summary | fr | PASS |
| 117 | English | full order in one message | en | PASS |
| 118 | English | repeat confirmation creates no second order | en | PASS |
| 119 | English | invalid phone, Arabic-Indic digits, +213 | en | PASS |
| 120 | English | step by step (8 turns, all en) | en | PASS |

Scenarios 102, 108 and 120 assert that **every** turn uses the expected language,
not only the final one. Checking only the last turn hid the Darija regression
described below.

## Coverage of the required behaviours

| Behaviour | Scenario |
|---|---|
| full order in one message | 101, 107, 112, 117 |
| step by step | 102, 108, 120 |
| invalid size / colour | 103 |
| invalid phone, Arabic-Indic digits, +213 | 104, 119 |
| old mother-wilaya name (Djelfa) and Arabic wilaya name | 105 |
| quantity above stock | 106 |
| product change after the summary (A-04) | 109 |
| HOME to OFFICE change | 113 |
| question in the middle of an order | 111 |
| cancel draft | 110 |
| repeat confirmation creates nothing | 118 |
| confirmation before any summary | 114 |
| prompt injection during confirmation | 115 |
| changed summary, then confirm the NEW summary | 116 |

## Out-of-stock race (scenario 121)

Two conversations each summarise quantity 2 of jeans homme (stock 3).

- Both reached `AWAITING_CONFIRMATION` with a stored hash.
- Conversation A confirmed: **one** Order created, template 13.2, stock 3 → 1.
- Conversation B confirmed: **no** Order, backend replied with template 13.3
  (*"La commande n'a pas été enregistrée"*), `gate=out-of-stock`, and its draft,
  phase and hash were **preserved** so the customer can lower the quantity.

## Gemini failure while awaiting confirmation (local, 1 call)

The server was restarted with `GEMINI_MODEL` pointing at a model that does not
exist, then the customer confirmed.

- Reply: template 13.8 in French — *"Aucune action n'a été effectuée."*
- Phase `AWAITING_CONFIRMATION` → `AWAITING_CONFIRMATION` (unchanged).
- Hash preserved, draft preserved, Orders 33 → 33 (unchanged).

## Four bugs found and fixed on Day 8

1. **English could never be answered in English.** The backend derived the reply
   language from script alone, which can only yield `ar` or `fr`, then told the
   model `Reply in: fr`. Fixed: the backend decides only Arabic from script; for
   Latin script the model is asked to mirror the customer's language and its
   returned language is used.
2. **Latin-script Darija came back as English** after fix 1, because the model
   now decides. Fixed with explicit rules, worked Darija examples, and a rule
   that one short turn does not switch an established conversation language.
3. **Arabic-Indic digits forced Arabic.** `phone ٠٥٥٠١٢٣٤٥٦` is in the Arabic
   Unicode block, so the script count pushed an English sentence into Arabic.
   Digits are now skipped by the script count.
4. **`جلفة` was rejected** while `الجلفة` resolved (and the reverse for
   `مسعد`). A bounded fallback strips a leading `ال`. Verified safe: 138
   distinct keys from 138 names, 0 collisions.

## Known limitations

- **A short English-looking turn inside a Darija conversation** can still be
  ambiguous. The conversation-language rule resolves it, but the model decides,
  so it is not guaranteed on every phrasing.
- **Stock and Orders are not visible over HTTP.** The runner asserts phase, hash,
  `orderCreated` and `orderId`; stock movement is verified separately through the
  database and by the integration suite.
- **Scenario 13.3** cannot be produced without another writer taking the stock
  first, so it is asserted by the race rather than by an isolated scenario.
- **The local app and the deployed app share one Neon database**, so local runs
  spend the deployed hourly allowance. Run them an hour apart.
- **3 of the 8 turns in the original 108 run came back as English** before fix 2;
  the numbers in the table above are from the final build.

## Budget

124 Gemini calls used of the 160 allowed. 46 were wasted by a driver bug that
passed the scenario list as one argument, which made the runner ignore the filter
and run every scenario. Pacing held at ≥5 s between calls and ≤12 per minute
throughout. No provider 429 and no RESOURCE_EXHAUSTED at any point; the two
`limited:true` responses were our own hourly cap.