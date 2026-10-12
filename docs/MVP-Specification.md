# AI Employee — MVP Specification

**Document status:** Frozen implementation specification, pending one final technical review by Claude  
**Version:** 1.0  
**Created:** October 11, 2026  
**Implementation start:** October 12, 2026  
**Target complete:** October 25, 2026 (Day 14)  
**Fix-only buffer:** October 26–27, 2026 (Days 15–16)  
**Submission deadline:** October 31, 2026 at 23:59 Algiers time

---

## 1. Purpose and authority

This document defines the exact scope and implementation contract for the AI Employee MVP being built for the Thirduni project submission. It converts the agreed product vision into a deliberately small, testable, browser-based product that can be completed by one beginner developer with AI coding assistance under a short deadline.

**For this MVP only, this document overrides any conflicting detail in the long-term architecture, database, API, AI, dashboard, and technology documents in the project folder.** The long-term documents remain valuable as future design context; they are not a requirement to implement every component described there now.

Do not expand the MVP because a long-term document describes a feature. Do not reopen a frozen decision just because another implementation is possible. Change this specification only if implementation reveals a genuine correctness, security, feasibility, or deadline blocker. Record any necessary change here before building around it.

### 1.1 Product promise

AI Employee is a digital worker for repetitive customer conversations and order preparation. In this MVP, a customer can ask about a small store's products, provide order details over multiple messages, review a clear order summary, explicitly confirm it, and create a real persisted order. The store owner can view orders in a protected dashboard and confirm or cancel them. The backend—not the model—is responsible for truth, validation, inventory, prices, and state changes.

### 1.2 What this MVP must prove

A judge should be able to use a public URL and verify this complete path:

1. Open the customer chat simulator.
2. Ask about a seeded product and receive an answer grounded in the actual catalog.
3. Start an order and provide missing details across multiple turns.
4. See a summary containing real product, quantity, options, customer details, delivery method, delivery fee, and total.
5. Confirm the summary and create a real order in PostgreSQL.
6. Open the dashboard with the demo passcode and see that order.
7. Confirm or cancel it and see the order status and stock change correctly.
8. Reset the demo data when needed and repeat the demonstration.

The product must be a real end-to-end workflow, not a static mockup or hardcoded dashboard.

---

## 2. Frozen scope

### 2.1 Included

- One seeded demo business; no business registration flow.
- Four to six seeded products, with real prices, stock quantities, and any supported size/color options.
- One product per order; no cart or multi-item order.
- Browser-based customer chat simulator instead of Instagram integration.
- Persistent conversations and messages in PostgreSQL.
- Gemini through Google's official JavaScript/TypeScript SDK; no LangChain or agent framework.
- Product Q&A grounded in the seeded catalog.
- Multi-turn order-detail collection.
- Backend-computed missing fields and validation.
- Backend-built order summary and explicit customer confirmation gate.
- One order created in a database transaction, with an atomic stock decrement.
- Protected dashboard listing orders and allowing confirm/cancel actions.
- Cancellation that restores stock exactly once.
- Protected reset-demo-data action.
- Delivery method selection (home or office) and a small delivery-fee lookup.
- Short fixed operational messages in Arabic, French, and English.
- Basic database-backed demo abuse limits and friendly quota/error handling.
- Privacy notice: **“Demo only. Don't enter real personal data.”**
- Public deployment, public GitHub repository, README, and 2–4 minute demo video.

### 2.2 Explicitly excluded

Do **not** build these for this MVP:

- Instagram, Facebook Messenger, WhatsApp, TikTok, email, or any live messaging integration.
- Multiple businesses, tenant signup, customer signup, or owner account management.
- A full authentication/authorization system, user table, roles, password reset, or OAuth.
- Customer table, customer CRM, customer history, or customer memory across conversations.
- Human takeover mode, notifications, background jobs, WebSockets, queues, Redis, or analytics.
- Multi-item cart, order editing after creation, shipment tracking, delivery-company APIs, or shipping labels.
- Product-management UI, product creation/editing UI, advanced inventory tools, or advanced reporting.
- RAG, vector databases, embeddings, tools marketplace, or agent frameworks.
- Elaborate design system, Material UI, Zustand, TanStack Query, React Hook Form, Docker, CI/CD, or complex infrastructure.
- Features not needed by the demonstration path in Section 1.2.

If behind schedule, cut visual polish, transcript extras, and polling frequency before cutting persistence, validation, confirmation integrity, stock safety, or the working deployment.

---

## 3. Technology stack and repository

### 3.1 Frozen stack

- **Application:** Next.js with TypeScript, using the simplest suitable App Router setup.
- **UI:** React and Tailwind CSS. Use ordinary React state and `fetch`; do not add state-management libraries.
- **Database:** PostgreSQL hosted on Neon.
- **ORM and migrations:** Prisma.
- **Validation:** Zod for API inputs and Gemini output.
- **AI:** Google's official Gemini JavaScript/TypeScript SDK.
- **Hosting:** Vercel.
- **Repository:** one Git repository containing the application, Prisma schema/migrations, seed script, README, and any public demo assets.

Use current stable compatible versions when creating the project. Do not spend time upgrading dependencies after a working version is established.

### 3.2 Day 1 infrastructure rule

Deploy a tiny working Next.js page to Vercel and connect it to Neon on Day 1. Test one database read/write and one Gemini structured-output request early. This surfaces hosting, environment-variable, quota, and Prisma connection problems before application work accumulates.

Use Neon unless connection setup blocks progress for more than one focused hour. If blocked, diagnose the actual issue and choose the smallest working supported connection configuration; do not casually switch platforms. Follow the provider's current instructions for pooled/direct URLs and serverless connections.

### 3.3 Environment variables

At minimum, keep these server-side values in local `.env` and the hosting environment settings:

- `DATABASE_URL` — the Neon connection URL appropriate for the deployed runtime.
- `GEMINI_API_KEY` — server-only Google AI key.
- `DASHBOARD_PASSCODE` — shared passcode for the public demo dashboard.
- `SESSION_SECRET` — long random secret used to sign/validate the dashboard session cookie.
- `DEMO_AI_CALLS_PER_HOUR` — configurable global hourly AI-call cap; default `120` unless testing establishes a lower safe cap.
- `DEMO_MAX_CUSTOMER_MESSAGES_PER_CONVERSATION` — default `40`.

Never prefix secrets with `NEXT_PUBLIC_`. Never commit `.env`, API keys, passcodes, session secrets, database credentials, or private local configuration. Commit an `.env.example` containing placeholder values only.

Before publishing the repository, inspect `git status`, tracked files, and commit history for accidental secrets. If a secret was ever committed, removing it from the latest file is not enough; rotate it.

### 3.4 Gemini billing and quota

Before using the key in the public demo, verify the current Google AI/Gemini billing and quota behavior for the exact project and service configuration. Do not assume that a key without billing enabled can never incur charges. Configure the account/project to avoid unexpected spend where possible, keep the hourly cap, and make quota exhaustion a normal handled state. If the free quota is exhausted, the chat should show a friendly message such as “The demo is busy right now. Please try again later.” It must not crash or pretend an action succeeded.

---

## 4. System architecture

```text
Customer browser                         Owner browser
      |                                       |
      v                                       v
  Chat page                              Dashboard page
      |                                       |
      +--------------- Next.js ---------------+
                      server routes
                           |
           +---------------+----------------+
           |                                |
           v                                v
    Gemini service                    Domain/business rules
    - prompt/context                   - validate action
    - structured JSON                  - merge draft
    - no direct DB writes              - compute missing fields
                                       - build summary/hash
                                       - create/cancel order
                                       - update stock transactionally
           |                                |
           +---------------+----------------+
                           |
                           v
                    Prisma + Neon
            Business / Product / Conversation
                    Message / Order
```

The model proposes a reply and a possible action. Server-side code validates that output, checks the current conversation state, validates any fields, and decides whether the action is allowed. Only server-side domain code may write business data to the database. Gemini must never receive database credentials or direct database access.

### 4.1 Core request flow

For each customer message:

1. Validate the request body and message length with Zod.
2. Create a conversation if no valid conversation ID was supplied; otherwise load the existing conversation belonging to the single seeded business.
3. Enforce the per-conversation customer-message limit and the global hourly AI-call limit.
4. Save the customer message.
5. Load the current conversation phase/draft, a bounded recent message history (last 12 messages), the seeded catalog, delivery configuration, and backend-computed missing fields.
6. Create an AI-call log row before calling Gemini so failed calls are counted against the hourly limit too.
7. Call Gemini once for a structured response; validate the response with Zod. If output is invalid, permit one small repair/retry attempt only if time/quota permits. If still invalid, return a safe fallback without executing an action.
8. Validate and execute any proposed action using server-side rules.
9. If a critical operation or proposed field is rejected, replace the model's reply with a localized backend-generated message; never append a contradictory message.
10. Persist the final customer-visible AI response and call outcome, then return the conversation ID, reply, and safe UI state.

Never tell the customer that an order was created, stock changed, or a field was accepted until the corresponding server operation has succeeded.

---

## 5. Database model

Use exactly these five application tables for the MVP: `Business`, `Product`, `Conversation`, `Message`, and `Order`. Prisma may create its own migration/metadata tables as normal. Do not add a `Customer`, `User`, `Integration`, `Notification`, or delivery-fee table.

Use UUID primary keys unless Prisma/provider constraints require a documented equivalent. Use timestamps in UTC. Monetary values should use PostgreSQL `Decimal`/numeric types rather than floating-point numbers. Use foreign keys and indexes for all relationships used in queries.

### 5.1 Business

One seeded row only.

- `id`: UUID primary key.
- `name`: required string.
- `createdAt`: timestamp.

Do not build business creation, business selection, or multi-tenant administration. Keep `businessId` on business-owned records so the data ownership boundary is explicit and future extension remains possible.

### 5.2 Product

- `id`: UUID primary key.
- `businessId`: required foreign key to Business.
- `name`: required string.
- `description`: required short text.
- `price`: required non-negative decimal in DZD.
- `stockQuantity`: required integer, minimum zero.
- `options`: JSON object containing supported sizes/colors, for example `{ "sizes": ["S", "M", "L"], "colors": ["Black", "White"] }`. Empty arrays are allowed when that option does not apply.
- `createdAt`, `updatedAt`: timestamps.

Seed four to six believable products. Product data in the database is the source of truth. The model must not invent a product, price, size, color, or stock count.

### 5.3 Conversation

- `id`: UUID primary key.
- `businessId`: required foreign key to Business.
- `phase`: enum `IDLE | ORDER_COLLECTION | AWAITING_CONFIRMATION`.
- `orderDraft`: nullable JSON object holding the current uncommitted single-product order draft.
- `confirmationHash`: nullable string holding the hash of the exact normalized draft shown in the latest summary.
- `createdAt`, `updatedAt`: timestamps.

The draft may contain only allowlisted fields such as `productId`, `quantity`, `size`, `color`, `customerName`, `customerPhone`, `deliveryMethod`, `wilaya`, and `deliveryAddress`. It must not be treated as trusted merely because it is in the database: validate it again before order creation.

No customer profile or memory across separate conversations is stored. Customer details belong to the draft and, after order creation, to the Order row.

### 5.4 Message

- `id`: UUID primary key.
- `conversationId`: required foreign key to Conversation.
- `senderType`: enum `CUSTOMER | AI`.
- `content`: nullable text while an AI call is pending; required for completed customer messages and completed customer-visible AI replies.
- `rawAiOutput`: nullable JSON, used to inspect structured Gemini output during debugging.
- `aiCallStatus`: nullable enum `PENDING | SUCCEEDED | FAILED`; null for customer messages.
- `createdAt`: timestamp.

A row with `senderType=AI` represents one attempted AI call and its final customer-visible response, including a friendly fallback on failure. Create it before the call with status `PENDING`, then update it to `SUCCEEDED` or `FAILED`. This lets the application count attempted AI calls in the previous hour from Message records, including failed calls. Do not expose raw AI output in public API responses or the dashboard.

Indexes: `(conversationId, createdAt)` and `(senderType, createdAt)`.

### 5.5 Order

- `id`: UUID primary key.
- `businessId`: required foreign key to Business.
- `conversationId`: required foreign key to Conversation.
- `productId`: required foreign key to Product.
- `quantity`: positive integer.
- `size`: nullable string.
- `color`: nullable string.
- `customerName`: required string.
- `customerPhone`: required normalized Algerian phone string.
- `unitPrice`: required decimal snapshot taken from Product at order creation.
- `deliveryMethod`: enum `HOME | OFFICE`.
- `wilaya`: required canonical wilaya name/code from the supported list.
- `deliveryAddress`: required for `HOME`; nullable for `OFFICE` unless the demo's office-delivery workflow explicitly requires a pickup office note.
- `deliveryPrice`: required decimal snapshot of the configured delivery fee.
- `status`: enum `NOT_YET_CONFIRMED | CONFIRMED | CANCELLED`.
- `createdAt`, `updatedAt`: timestamps.

Store unit and delivery price snapshots on the Order so later catalog/config changes do not rewrite historical totals. Total is `unitPrice * quantity + deliveryPrice`; calculate it server-side using decimal-safe arithmetic. A `total` column is optional; do not store it unless the implementation has a clear reason. If stored, calculate it in the same server transaction and never trust a client/model-supplied value.

Indexes: `(businessId, createdAt)`, `(businessId, status, createdAt)`, and `conversationId`.

### 5.6 Relationships and constraints

- One Business has many Products, Conversations, and Orders.
- One Conversation has many Messages and may have multiple historical Orders, though a normal demo conversation should create at most one order before it returns to `IDLE`.
- Each Order belongs to one Product and one Conversation.
- No separate Customer table and no cross-conversation customer lookup.
- Every Product/Conversation/Order query must be scoped to the seeded `businessId` on the server, even though the MVP has only one business.
- Reject negative prices, negative stock, non-integer quantities, and invalid status values at both validation and database/domain boundaries where practical.

---

## 6. Delivery configuration

Delivery fees must be small and predictable. Do not create a delivery-company integration or a management UI.

- Maintain a canonical allowlist of all supported Algerian wilayas in one server-side constants module. Do not ask Gemini to validate wilaya names.
- Maintain explicit delivery fees for approximately five or six demo wilayas, plus a default fee for any other valid wilaya. This is a configuration object in code, not a new database table.
- Use DZD consistently in UI, summaries, and README examples.
- `HOME` requires a delivery address. `OFFICE` does not require a home address; if an office pickup label is needed for the demo, keep it a short string field rather than integrating a delivery service.
- The backend selects the fee from configuration. The AI may not choose or override the fee.
- Time-box fee lookup implementation to about two focused hours. If the lookup takes longer, use one flat delivery fee for every valid wilaya and document the simplification. Do not let this delay the order workflow.
- Reject a wilaya not in the canonical allowlist with the localized fixed message. For a valid wilaya without an explicit fee, use the default fee.

---

## 7. Conversation state machine

The backend owns the phase. Gemini can suggest an action, but it cannot set the phase directly.

### 7.1 `IDLE`

- Normal product questions are answered using the seeded catalog.
- When the customer clearly expresses an intention to order, the model may propose `UPDATE_ORDER_DRAFT` with the information explicitly supplied in the current message and the conversation may move to `ORDER_COLLECTION`.
- Do not assume a purchase merely because the customer asks about price or availability.

### 7.2 `ORDER_COLLECTION`

- Collect the details needed for one product order across multiple turns.
- The backend computes missing fields deterministically; Gemini is told which fields remain missing.
- Ask at most one clear question at a time.
- Only merge allowlisted fields that are supported by the current customer message or a previously validated draft. Never let the model overwrite unrelated fields without the customer asking to change them.
- If a field is rejected (invalid option, invalid phone, unknown wilaya, quantity beyond stock, or invalid product), do not silently accept it. Preserve valid draft fields, reject the invalid field, and replace the model reply with the relevant localized backend template.
- When all required fields are valid, calculate the summary from the draft plus current database/config values, set phase to `AWAITING_CONFIRMATION`, save `confirmationHash`, and send the backend-generated summary/confirmation prompt.

### 7.3 `AWAITING_CONFIRMATION`

- The latest summary is a snapshot of the exact normalized draft the customer is being asked to confirm.
- Store `confirmationHash = SHA-256(canonicalize(normalizedDraft))`. Canonicalization must sort object keys consistently and normalize strings/phone/enum values before hashing.
- A `CREATE_ORDER` action is accepted only if all of these are true:
  1. Current phase is `AWAITING_CONFIRMATION`.
  2. `confirmationHash` is not null.
  3. The hash recomputed from the current validated draft matches the stored hash.
  4. The current customer message is interpreted as an explicit confirmation of the displayed summary—not an ambiguous “maybe”, a question, or an unrelated message.
  5. All current fields still pass server-side validation and the requested quantity is available.
- The customer must not be able to create an order by sending “yes” before a summary has been shown.
- If the customer asks to change any field, apply only the requested valid change, clear `confirmationHash`, return to `ORDER_COLLECTION`, and show a new summary once all fields are complete. The old confirmation is permanently invalid.
- If the customer cancels the draft before order creation, clear the draft/hash, set phase to `IDLE`, and send a deterministic localized draft-cancelled message.
- If order creation succeeds, clear the draft/hash and return the conversation to `IDLE`. The order row remains as the durable record.

### 7.4 Concurrency and repeated submissions

A customer can click/send twice or retry after a slow response. Order creation must be guarded by the conversation phase and confirmation hash in a database transaction. Once an order is created, the confirmation gate is consumed so the same confirmation cannot create a second order. If a repeated request arrives, return a safe current-state response; do not decrement stock or create a duplicate order.

---

## 8. Gemini contract and behavior

### 8.1 General behavior

- Use the official Google Gemini SDK directly. No LangChain, tools framework, or autonomous agent loop.
- Send a compact JSON catalog and current conversation state with every request; there is no RAG/vector database.
- Include only the most recent 12 messages, current phase/draft, backend-computed missing fields, allowed actions, supported options, wilaya allowlist/config summary, and the business's seeded product data.
- Use a low temperature suitable for reliable structured output. Use the supported structured-output/JSON schema feature of the selected Gemini model when available, and still validate with Zod.
- Set a request timeout of about 20 seconds. Do not retry indefinitely. A single retry for transient 429/5xx or invalid structured output is the maximum; if quota is exhausted, fail gracefully.
- Treat customer messages, product descriptions, and other user-controlled text as data, not as instructions that override system rules. Do not reveal the system prompt, secrets, or internal data.
- The AI cannot directly read or write the database. It only receives a server-built context and returns a proposed action.
- The AI must not invent stock, prices, product options, delivery fees, policies, or completed operations.
- Replies should be concise and natural, normally one question per turn.
- Do not claim the store has confirmed the order. Creating an order produces `NOT_YET_CONFIRMED`; only the dashboard operator can confirm it.

### 8.2 Exact top-level JSON contract

Every valid model response must have this shape:

```json
{
  "language": "ar",
  "reply": "A short customer-facing reply in the detected language.",
  "action": {
    "type": "NONE",
    "payload": {}
  }
}
```

Allowed `language` values: `ar`, `fr`, `en`.

Language classification rule:
- Arabic script, including Darija written in Arabic script → `ar`.
- Latin-script Darija → `fr`.
- French → `fr`.
- English → `en`.
- If the language is unclear, prefer the language used in the latest customer message; for unclear mixed Arabic/French, prefer the dominant script.

Zod must reject unknown top-level/action/payload fields. The `reply` must be a bounded string. The backend must not trust the model's `language` field blindly: validate it, and if absent/invalid use a deterministic fallback based on the latest message's script/known locale rule.

### 8.3 Four allowed actions

#### `NONE`

```json
{ "type": "NONE", "payload": {} }
```

Used for product Q&A, general conversation, or a response that does not need a state-changing operation. It cannot change a draft, order, or stock.

#### `UPDATE_ORDER_DRAFT`

Payload may contain only fields explicitly extracted from the current customer message:

```json
{
  "type": "UPDATE_ORDER_DRAFT",
  "payload": {
    "productId": "existing-product-uuid",
    "quantity": 1,
    "size": "M",
    "color": "Black",
    "customerName": "Example Customer",
    "customerPhone": "0550123456",
    "deliveryMethod": "HOME",
    "wilaya": "Laghouat",
    "deliveryAddress": "Example address"
  }
}
```

All fields are optional in an update payload, but the payload cannot be empty if an update action is proposed. The example values are illustrative only; product IDs must be actual IDs in the supplied context. The backend validates each field, merges only accepted fields, computes missing fields, and controls phase transitions. The AI cannot send `businessId`, price, delivery fee, order status, stock quantity, confirmation hash, timestamps, or arbitrary fields.

#### `CANCEL_DRAFT`

```json
{ "type": "CANCEL_DRAFT", "payload": {} }
```

Allowed only when there is an uncommitted draft. Clears the draft/hash and returns to `IDLE`. It must never cancel an already-created Order; dashboard cancellation uses a separate protected API.

#### `CREATE_ORDER`

```json
{ "type": "CREATE_ORDER", "payload": {} }
```

The payload must be empty. It is only a proposal that the customer confirmed. The backend independently enforces the phase, hash, explicit-confirmation, field-validation, stock, and transaction rules in Section 7. Gemini never supplies an order ID or decides the final price/total/status.

### 8.4 Backend action execution order

1. Parse and validate the full Gemini response.
2. Validate action type and payload schema.
3. Check phase and customer intent.
4. For draft updates, validate every provided field independently, accept valid fields, and reject invalid ones without overwriting the last valid values.
5. Recompute missing fields on the backend.
6. If a field/action is rejected, use the relevant fixed localized message instead of Gemini's reply.
7. If the draft becomes complete, backend builds the summary and stores the confirmation hash.
8. For `CREATE_ORDER`, revalidate the entire draft and current stock, then create the order and decrement stock atomically.
9. If creation succeeds, use the localized order-created template. If it fails, use the appropriate localized failure template.
10. Persist the final customer-visible response and outcome.

**Critical messaging rule:** when the backend rejects an action or field, or successfully creates an order, it replaces Gemini's reply entirely with its own localized message. It never appends a second message to Gemini's reply. This prevents contradictory text such as “Your order is complete” followed by “the product is out of stock.” Apply the same replacement rule to a rejected draft field.

### 8.5 Backend-computed missing fields

For a one-product order, required fields are:

- `productId`
- `quantity`
- Any size/color option that the selected product actually requires
- `customerName`
- `customerPhone`
- `deliveryMethod`
- `wilaya`
- `deliveryAddress` only when `deliveryMethod=HOME`

If a product has no sizes or colors, those fields are not required. The backend computes this list; Gemini must not decide that an incomplete order is complete.

---

## 9. Validation rules

Validate all external request bodies and all model-proposed actions server-side. UI validation is helpful but never sufficient.

### 9.1 Chat input

- `message`: trimmed string, 1–500 characters.
- `conversationId`: optional valid UUID. If present, it must exist and belong to the single seeded business.
- Reject malformed JSON, oversized requests, unsupported fields, and invalid IDs with safe responses.
- Limit each conversation to 40 customer messages by default. The limit is configurable but should not be raised without a reason.
- Apply a global hourly AI-call cap using AI rows in the Message table; default 120 attempts/hour unless testing establishes a lower safe cap. Count failed attempts too. If the cap is reached, return a friendly “demo is busy” message without calling Gemini.
- Use bounded history (last 12 messages) and a bounded prompt/catalog so token usage cannot grow without limit.

### 9.2 Product and quantity

- `productId` must identify a product belonging to the seeded business.
- `quantity` must be an integer greater than zero.
- `quantity` must not exceed current available stock.
- A quantity exceeding available stock is rejected; do not silently reduce it.
- `size` and `color` must match the selected product's allowed options exactly after safe normalization. Do not invent options.
- Product price comes only from Product in the database.
- If stock is zero, do not allow order creation.

### 9.3 Customer details

- `customerName`: trimmed, 2–80 characters, no control characters.
- `customerPhone`: normalize whitespace and common separators, then validate with the Algerian mobile format `^0[567][0-9]{8}$`. Store the normalized value.
- Do not collect or request real personal data for the public demo. The UI must display the privacy notice before/near the chat input.

### 9.4 Delivery

- `deliveryMethod` must be `HOME` or `OFFICE`.
- `wilaya` must resolve to one canonical entry in the server-side Algerian wilaya allowlist. Use one normalization function for common casing/spacing variants; do not let the model invent a new wilaya.
- `deliveryAddress` is required for `HOME` and must be trimmed/bounded (for example, 5–200 characters). It may be null for `OFFICE`.
- Delivery fee is selected by backend configuration for the validated wilaya; use the default fee for a valid wilaya without a special fee.
- Never accept price/total/delivery fee supplied by the client or Gemini.

### 9.5 Order confirmation and state

- Only accept `CREATE_ORDER` in `AWAITING_CONFIRMATION` with a non-null matching draft hash and an explicit confirmation of the latest summary.
- Revalidate the full draft at creation time; availability may have changed after the summary was displayed.
- A changed draft clears the confirmation hash and requires a new summary/confirmation.
- A repeated request cannot create a second order from the same confirmation.
- `PATCH /api/orders/:id` accepts only the permitted status action; reject unknown fields.
- Confirm only `NOT_YET_CONFIRMED → CONFIRMED`.
- Cancel only `NOT_YET_CONFIRMED → CANCELLED` or `CONFIRMED → CANCELLED`.
- Never transition `CANCELLED` back to an active status.

---

## 10. Transactional inventory and order rules

Inventory correctness is more important than convenience. All stock and order status operations must be transaction-safe.

### 10.1 Create order

Within one PostgreSQL transaction:

1. Lock/check the Conversation state and verify `AWAITING_CONFIRMATION` plus matching confirmation hash.
2. Revalidate product, options, quantity, phone, delivery, and required fields.
3. Decrement stock atomically only if sufficient stock remains, using a conditional update equivalent to `UPDATE Product SET stockQuantity = stockQuantity - quantity WHERE id = productId AND stockQuantity >= quantity`.
4. If zero rows are updated, roll back and return the localized out-of-stock/quantity-too-high message. Do not create an order.
5. Create the Order with database-derived unit price and delivery fee snapshots, status `NOT_YET_CONFIRMED`.
6. Clear the Conversation draft and confirmation hash and return its phase to `IDLE`.
7. Commit the transaction.

If any step fails, roll back the whole transaction. Do not decrement stock without a corresponding order, and do not create an order without the corresponding stock decrement.

### 10.2 Confirm order

- Only the protected dashboard can request confirmation.
- Atomically update status from `NOT_YET_CONFIRMED` to `CONFIRMED`.
- Confirmation does not decrement stock again.
- A repeated click must not repeat any inventory side effect. If already confirmed, return the current status or a safe conflict response.

### 10.3 Cancel order and restore stock

Within one transaction:

1. Atomically update the Order to `CANCELLED` only if its current status is `NOT_YET_CONFIRMED` or `CONFIRMED`.
2. Restore the order quantity to Product stock only if the order status transition actually changed one row.
3. Commit both changes together.

The conditional status update is the guard against double-click/double-request stock restoration. The stock restore must be coupled to the successful status transition in the same transaction. If the order is already `CANCELLED`, do not restore stock again.

### 10.4 Demo reset

The reset endpoint must be protected and require a confirmation step in the UI. It should restore the seeded demo state: reset seeded product stock to the configured starting quantities, remove demo-created orders/conversations/messages as appropriate, and leave the single Business row and seed catalog intact. Use a transaction where practical. The UI must clearly warn that reset deletes demo conversations/orders and restores inventory. Reset must never be callable by an unauthenticated visitor.

---

## 11. Dashboard protection and demo security

This is a public demo, not production authentication. The goal is to prevent casual public access to order names/phone numbers and prevent visitors from modifying/resetting the demo without the passcode.

### 11.1 Shared passcode

- Add a simple dashboard unlock screen.
- `POST /api/admin/login` validates the submitted passcode on the server against `DASHBOARD_PASSCODE` using a timing-safe comparison where available.
- On success, issue a signed/session token cookie using `SESSION_SECRET`; do not store the raw passcode in client code or the cookie.
- Cookie must be `HttpOnly`, `Secure` in production, `SameSite=Lax` or stricter, and scoped to `/`. Set a reasonable expiry (for example, 12 hours).
- Validate the cookie on the server for every protected page and API request.
- `POST /api/admin/logout` clears the cookie.
- Do not hardcode the passcode in React components, public environment variables, README, or GitHub.
- Include the demo passcode in the Thirduni submission description and demo video so judges can access the dashboard without requesting access. Do not include it in the public repository.

### 11.2 Protected resources

Protect all of the following server-side:

- The entire `/dashboard` route and its order details.
- `GET /api/orders`.
- `PATCH /api/orders/[id]`.
- `POST /api/admin/reset`.
- Any future endpoint that returns private order information or modifies business state.

Hiding a link or disabling a button in the UI is not protection. API handlers must independently verify the session. Use same-origin checks for state-changing requests where practical; `SameSite` cookie settings are not a substitute for server authorization.

### 11.3 Public chat protections

- The customer chat simulator remains public.
- Do not return order lists, customer details, raw AI output, database errors, environment values, or stack traces through the chat API.
- Enforce message length, per-conversation cap, global hourly AI-call cap, timeout, and bounded context.
- Escape/render customer and AI text safely; do not inject raw HTML.
- Do not store real customer information for the demo. Add the privacy notice to the chat and README.
- A simple global database-backed hourly cap is acceptable for the MVP; if multiple simultaneous requests occasionally race at the cap, prefer a short, understandable PostgreSQL transaction/locking solution only if needed. Do not add Redis or another infrastructure service.

### 11.4 Demo passcode disclosure

Generate a non-sensitive demo-only passcode, configure it as an environment variable in Vercel, and include it in the submission description and video. The repository contains only a placeholder. Never reuse a personal password.

---

## 12. API contract

Keep the API small. All request/response JSON shapes should be defined in TypeScript and validated with Zod where external input is involved. Return clear status codes, but do not expose internal exception text.

### 12.1 `POST /api/chat` — public

**Request:**

```json
{
  "conversationId": null,
  "message": "Hi, can I order the black shirt in size M?"
}
```

`conversationId` is optional/null for a new conversation. `message` is required and 1–500 trimmed characters.

**Success response shape:**

```json
{
  "conversationId": "uuid",
  "reply": "Customer-facing response",
  "phase": "ORDER_COLLECTION",
  "missingFields": ["quantity", "customerName", "customerPhone"],
  "orderCreated": false
}
```

Only return safe UI state. Do not return `rawAiOutput`, prompt text, private business configuration, database records not needed by the chat, or internal errors. `missingFields` should use safe field labels or stable keys; the UI should not expose implementation details.

On invalid input, conversation limit, hourly cap, Gemini timeout, or quota exhaustion, return a controlled response and friendly localized message where possible. Do not mark an action successful unless the database confirms it.

### 12.2 `GET /api/catalog` — public, optional/simple

Returns only public product information needed to help the customer browse: ID, name, short description, price, available option labels, and a safe availability indicator. Do not expose private fields. This endpoint may be omitted if the chat context and a short static-looking-but-database-backed product list in the chat page are enough; if included, its data must come from the database.

### 12.3 `POST /api/admin/login` — public endpoint, protected result

Accepts a passcode. Validate server-side. On success, set the signed HttpOnly cookie and return `{ "authenticated": true }`; never return the passcode. On failure, return a generic unauthorized response without revealing which part failed.

### 12.4 `POST /api/admin/logout` — session-aware

Clears the session cookie and returns a success response. It must not return sensitive data.

### 12.5 `GET /api/admin/session` — session-aware

Returns only `{ "authenticated": true|false }`, so the UI can decide whether to show the dashboard or unlock form. It must not expose session secrets.

### 12.6 `GET /api/orders` — protected

Returns orders for the seeded business, newest first, with only dashboard-needed fields: order ID, created time, product name, quantity, size/color, customer name/phone, delivery method/wilaya/address, unit price, delivery fee, calculated total, and status. Require a valid session on the server.

### 12.7 `PATCH /api/orders/[id]` — protected

Request should accept a narrow action such as:

```json
{ "action": "CONFIRM" }
```

or

```json
{ "action": "CANCEL" }
```

Do not accept arbitrary status strings, price, stock, or order-field changes. Execute the transaction rules in Section 10 and return the updated safe order state. Repeated or invalid transitions must not create duplicate side effects.

### 12.8 `POST /api/admin/reset` — protected

Requires a valid dashboard session. The UI must show a confirmation dialog before sending the request. Reset the demo seed state transactionally where practical. Return a small success response; never reveal database details.

---

## 13. Fixed localized message templates

Critical operation outcomes must be generated by the backend and replace the model reply entirely. Keep templates in one module with placeholder substitution. All monetary values and summary fields must be passed from validated server data, not copied from Gemini.

Use the correct locale from the validated `language` field. If the field is invalid, infer a fallback from the latest customer message: Arabic script → `ar`; Latin-script Darija/French → `fr`; English → `en`. The exact wording may be made more natural during implementation, but each template must retain the same meaning.

### 13.1 Summary and confirmation prompt

**Arabic (`ar`):**

> راجع طلبك من فضلك: {product}، الكمية {quantity}، المقاس {size}، اللون {color}. الاسم: {customerName}، الهاتف: {customerPhone}، التوصيل: {deliveryMethod} إلى {wilaya}{addressLine}. سعر المنتجات: {itemsTotal} دج، التوصيل: {deliveryPrice} دج، المجموع: {total} دج. إذا كان كل شيء صحيحًا، أكّد الطلب. إذا أردت تغيير شيء، أخبرني.

**French (`fr`):**

> Vérifiez votre commande : {product}, quantité {quantity}, taille {size}, couleur {color}. Nom : {customerName}, téléphone : {customerPhone}, livraison : {deliveryMethod} à {wilaya}{addressLine}. Produits : {itemsTotal} DA, livraison : {deliveryPrice} DA, total : {total} DA. Si tout est correct, confirmez la commande. Pour modifier un détail, dites-le-moi.

**English (`en`):**

> Please review your order: {product}, quantity {quantity}, size {size}, color {color}. Name: {customerName}, phone: {customerPhone}, delivery: {deliveryMethod} to {wilaya}{addressLine}. Items: {itemsTotal} DZD, delivery: {deliveryPrice} DZD, total: {total} DZD. If everything is correct, confirm the order. If you want to change something, tell me.

For options that do not apply, omit the size/color label rather than displaying `null`, `undefined`, or a blank value. For office delivery, omit the home address line. The summary must be built from the validated draft and current database/config values.

### 13.2 Order created — status is not yet confirmed by the business

- `ar`: تم تسجيل طلبك بنجاح. الطلب الآن في انتظار تأكيد المتجر.
- `fr`: Votre commande a bien été enregistrée. Elle attend maintenant la confirmation du magasin.
- `en`: Your order has been recorded successfully. It is now waiting for the store to confirm it.

### 13.3 Out of stock / unavailable quantity

- `ar`: عذرًا، الكمية المطلوبة لم تعد متوفرة. لم يتم تسجيل الطلب. يمكنك اختيار كمية أقل أو منتج آخر.
- `fr`: Désolé, la quantité demandée n’est plus disponible. La commande n’a pas été enregistrée. Vous pouvez choisir une quantité plus petite ou un autre produit.
- `en`: Sorry, the requested quantity is no longer available. The order was not created. You can choose a smaller quantity or another product.

### 13.4 Invalid size or color

- `ar`: عذرًا، هذا المقاس أو اللون غير متوفر لهذا المنتج. اختر من الخيارات المتاحة من فضلك.
- `fr`: Désolé, cette taille ou cette couleur n’est pas disponible pour ce produit. Choisissez parmi les options proposées.
- `en`: Sorry, that size or color is not available for this product. Please choose one of the available options.

### 13.5 Invalid phone number

- `ar`: رقم الهاتف غير صحيح. أدخل رقم هاتف محمول جزائريًا يبدأ بـ 05 أو 06 أو 07 ويتكوّن من 10 أرقام.
- `fr`: Le numéro semble invalide. Entrez un numéro mobile algérien de 10 chiffres commençant par 05, 06 ou 07.
- `en`: That phone number doesn't look valid. Enter a 10-digit Algerian mobile number starting with 05, 06, or 07.

### 13.6 Unknown wilaya

- `ar`: لم أتعرف على الولاية. اختر ولاية جزائرية صحيحة من فضلك.
- `fr`: Je n’ai pas reconnu cette wilaya. Veuillez choisir une wilaya algérienne valide.
- `en`: I couldn't recognize that wilaya. Please provide a valid Algerian wilaya.

### 13.7 Quantity too high

- `ar`: الكمية المطلوبة أكبر من الكمية المتوفرة حاليًا. لدينا {stockQuantity} فقط. ما الكمية التي تريدها؟
- `fr`: La quantité demandée dépasse le stock disponible. Il en reste {stockQuantity}. Quelle quantité souhaitez-vous ?
- `en`: The requested quantity is higher than the available stock. We have {stockQuantity} left. What quantity would you like?

Use this template when stock is known and the draft quantity exceeds it; use the out-of-stock template when a previously valid quantity becomes unavailable at final creation time.

### 13.8 Generic error / AI unavailable

- `ar`: عذرًا، حدث خلل مؤقت. لم يتم تنفيذ أي إجراء. حاول مرة أخرى بعد قليل.
- `fr`: Désolé, un problème temporaire est survenu. Aucune action n’a été effectuée. Réessayez dans un instant.
- `en`: Sorry, something went wrong temporarily. No action was completed. Please try again shortly.

For quota/rate limit, prefer a friendlier specific message if available:
- `ar`: العرض التجريبي مشغول حاليًا. حاول مرة أخرى لاحقًا.
- `fr`: La démo est très sollicitée pour le moment. Réessayez un peu plus tard.
- `en`: The demo is busy right now. Please try again later.

### 13.9 Draft cancelled

- `ar`: تم إلغاء الطلب قبل تسجيله. يمكنك طرح سؤال آخر أو البدء بطلب جديد.
- `fr`: Le brouillon de commande a été annulé. Vous pouvez poser une autre question ou commencer une nouvelle commande.
- `en`: The draft order was cancelled. You can ask another question or start a new order.

### 13.10 Product not found / not orderable

- `ar`: عذرًا، لم أتمكن من العثور على هذا المنتج في الكتالوج الحالي. اختر منتجًا من المنتجات المتاحة.
- `fr`: Désolé, je ne trouve pas ce produit dans le catalogue actuel. Choisissez un produit disponible.
- `en`: Sorry, I couldn't find that product in the current catalog. Please choose an available product.

---

## 14. Customer and dashboard UI requirements

### 14.1 Chat page (`/`)

- Clear product name/branding and a short sentence explaining this is a demo AI Employee.
- Privacy notice visible before/near the input: **“Demo only. Don't enter real personal data.”**
- Product catalog information must be database-backed if displayed.
- Chat transcript with customer and AI messages.
- Text input and send button; disable send while a request is pending.
- Keep the conversation ID in React state for the active browser session; no persistent cross-customer memory is required. Do not put private data in URL query strings.
- Show a loading indicator and friendly error/quota state. Let the user retry a failed send without falsely displaying a successful operation.
- Render text safely; do not use `dangerouslySetInnerHTML` for messages.
- Use a readable mobile and desktop layout; polish only after the full order workflow works.

### 14.2 Dashboard (`/dashboard`)

- If unauthenticated, show the unlock screen and no order data.
- If authenticated, show a simple list/table of orders, newest first.
- Show order ID or short reference, date/time, product, quantity/options, customer name/phone, delivery details, total, and status.
- Provide Confirm for `NOT_YET_CONFIRMED` and Cancel for active statuses (`NOT_YET_CONFIRMED` and `CONFIRMED`). Do not show invalid actions for `CANCELLED` orders.
- Show loading, empty, error, and mutation-pending states.
- Disable an action while its request is pending to reduce accidental double clicks, while still relying on backend guards for correctness.
- Refresh after a successful mutation. Simple manual refresh or polling every 10–15 seconds is enough; do not build WebSockets.
- Include logout and a clearly labeled reset demo data control with a confirmation dialog.
- Never expose raw Gemini output or server stack traces.

### 14.3 Visual design

Use Tailwind with simple, consistent spacing, legible typography, and clear status labels. The application must look intentional, but a polished visual system is lower priority than correctness and a reliable live demo. Do not add UI libraries solely for appearance.

---

## 15. Error handling, logs, and reliability

- Set a Gemini request timeout around 20 seconds.
- Retry at most once for an eligible transient error (for example, a temporary 429/5xx) only if the retry is appropriate and within quota/time limits.
- On quota exhaustion, show the localized friendly “demo is busy” response.
- On invalid model JSON/schema, do not execute the action. One repair attempt is acceptable; otherwise use the generic error template.
- On database failure, return a safe generic message and log details server-side. Never return SQL errors, connection strings, environment values, or stack traces to the browser.
- On stock race or a failed conditional update, roll back the order transaction and return the out-of-stock/quantity-too-high template.
- On dashboard authorization failure, return 401/403 and no order data.
- On invalid order transition, do not mutate stock; return a controlled conflict response.
- Log enough server-side context to debug: request/conversation ID, AI call outcome, model output validation result, action type, and a safe error category. Avoid logging full phone/address values unless absolutely necessary; use redacted values in logs.
- Store raw Gemini output in `Message.rawAiOutput` for development/debugging only; never return it through public APIs. If it contains personal data entered by a demo user, it must still be treated as sensitive and removable by reset.
- Never trust a UI success toast; show success only after the server reports the committed operation.

---

## 16. Testing plan and acceptance criteria

Test manually throughout development. A large automated test suite is not required, but critical domain logic should have small tests if straightforward to write. Use fake/demo data only.

### 16.1 Core end-to-end tests

- Product question receives answer grounded in seeded product data.
- AI does not invent an unseeded product, price, option, or stock quantity.
- Customer can start an order and supply fields over multiple turns.
- Backend asks for missing fields one at a time.
- Valid complete draft produces a backend-generated summary with correct total.
- “Yes” before the summary does not create an order.
- Explicit confirmation after the summary creates exactly one order.
- Changing any field after summary invalidates the old confirmation and requires a new summary.
- A repeated confirmation request cannot create a duplicate order.
- Product/size/color/phone/wilaya/quantity invalid cases are rejected.
- Stock is decremented exactly once on successful order creation.
- Stock is not decremented when creation fails.
- Dashboard shows the created order and the correct status.
- Confirm changes only `NOT_YET_CONFIRMED` to `CONFIRMED` and does not change stock.
- Cancel changes an active order to `CANCELLED` and restores stock exactly once.
- Double-click/repeated cancellation does not restore stock twice.
- Cancelled order cannot be reconfirmed.
- Reset restores starting stock and removes demo orders/conversations/messages.

### 16.2 Language tests

Run at least 20 realistic conversation scenarios across:
- Algerian Arabic/Darija written in Arabic script.
- Darija written in Latin script.
- French.
- English.

Check that normal Gemini replies use the customer's language and every fixed critical message uses the expected template language. Specifically test rejected draft updates and order creation so the backend message replaces—not appends to—the model reply.

### 16.3 Security and reliability tests

- Unauthenticated visitors cannot open the dashboard or call `GET /api/orders`.
- Invalid passcode does not set an authenticated cookie.
- Correct passcode sets a Secure/HttpOnly production cookie.
- Protected order/reset APIs reject missing/invalid sessions.
- Passcode and API key are absent from browser bundles, public env variables, README, and repository history.
- Malformed request, invalid UUID, oversized message, 40-message cap, hourly AI-call cap, Gemini timeout, invalid structured output, and quota exhaustion all fail safely.
- The privacy notice is visible.
- Public deployment works in a fresh browser without local development state.

### 16.4 Demo readiness gate

Do not consider the MVP done until:
- The complete order path works on the deployed URL, not only localhost.
- Dashboard access works using the demo passcode.
- Reset works and the full demo can be repeated from a clean state.
- README setup instructions work from a fresh clone.
- No secret is committed.
- Demo video has been recorded, checked, and made accessible without an access request.

---

## 17. Day-by-day execution plan

The day numbers start Monday, October 12, 2026. Work in small verified steps and commit frequently. The dates are targets, not reasons to hide broken functionality. At the end of each day, spend about 10 minutes explaining to yourself what was built, what is working, and what remains.

### Day 1 — Monday, October 12: project and deployment foundation

- Install/check Node.js, package manager, Git, and editor.
- Create Next.js + TypeScript + Tailwind application.
- Create public GitHub repository and initial README.
- Create Neon database and configure environment variables locally and in Vercel.
- Deploy a minimal working page to Vercel.
- Verify a simple database read/write from the deployed app.
- Verify one Gemini structured JSON response and inspect the project's quota/billing setup.
- **Exit criterion:** deployed page works, database connection works, Gemini can be called server-side, secrets remain private.

### Day 2 — Tuesday, October 13: database schema and seed data

- Implement the five Prisma models and enums.
- Create and apply the first migration.
- Seed one Business, 4–6 Products, and starting stock values.
- Add wilaya allowlist and simple delivery fee configuration; time-box fee work to about two hours.
- Implement a reset seed function or establish the safe reset transaction design.
- **Exit criterion:** seeded catalog can be queried from the deployed app; schema is stable enough to build on.

### Day 3 — Wednesday, October 14: Gemini service and product Q&A API

- Implement server-only Gemini client and structured response schema.
- Implement prompt/context builder using catalog, phase, bounded history, and missing fields.
- Implement Message logging before/after AI calls.
- Implement `POST /api/chat` for ordinary product Q&A and safe fallback errors.
- **Exit criterion:** chat API saves messages and answers a product question using real database data.

### Day 4 — Thursday, October 15: chat UI end-to-end

- Build the chat page, transcript, input, pending state, error state, and privacy notice.
- Connect UI to `POST /api/chat` and maintain conversation ID in active session state.
- Add a simple database-backed catalog display only if it helps the demo.
- Test the deployed chat from a fresh browser.
- **Exit criterion:** public deployed chat supports repeated product Q&A and conversation history persists.

### Day 5 — Friday, October 16: draft and field validation

- Implement `IDLE`, `ORDER_COLLECTION`, and `AWAITING_CONFIRMATION` handling.
- Implement draft merge and allowlisted field extraction.
- Implement product/option/quantity/phone/name/delivery/wilaya validation.
- Compute missing fields in backend code and ask one question at a time.
- Add `language` to the Zod response schema and start the localized template module.
- **Exit criterion:** a conversation can collect valid order details over several turns without creating an order prematurely.

### Day 6 — Saturday, October 17: summary and confirmation integrity

- Implement canonical draft normalization and SHA-256 confirmation hash.
- Build localized summary from server-side product/fee values.
- Store hash when summary is displayed.
- Invalidate hash whenever the draft changes.
- Ensure a confirmation before a summary is rejected.
- **Exit criterion:** complete draft produces correct summary; changes require a new summary and confirmation.

### Day 7 — Sunday, October 18: transactional order creation

- Implement order creation transaction and conditional stock decrement.
- Implement `CREATE_ORDER` gate and duplicate-submission protection.
- Complete localized critical templates: summary, order created, stock/quantity, invalid size/color, phone, wilaya, generic error, draft cancelled, product not found.
- Ensure backend replaces Gemini's reply on rejected fields/actions and successful order creation.
- **Exit criterion:** one explicit confirmation creates exactly one persisted order and stock decreases correctly.

### Day 8 — Monday, October 19: full workflow and language tests

- Test complete order workflow on the deployed URL.
- Test 20 scenarios across Arabic-script Darija, Latin-script Darija, French, and English.
- Test invalid fields, out-of-stock race, changed summary, repeat confirmation, and Gemini failure/quota fallback.
- Fix core bugs only; keep styling minimal.
- **Hard milestone:** the complete customer-to-order path works on the live deployment by the end of Day 8.

### Day 9 — Tuesday, October 20: dashboard passcode and order list

- Implement server-side passcode login and signed HttpOnly session cookie.
- Implement logout/session check.
- Protect the full dashboard and `GET /api/orders`.
- Build a simple order list with details/status and loading/empty/error states.
- **Exit criterion:** judges can unlock the deployed dashboard and see a created order; unauthenticated users cannot fetch order data.

### Day 10 — Wednesday, October 21: confirm/cancel and inventory restore

- Implement protected `PATCH /api/orders/[id]` for confirm/cancel only.
- Implement conditional status updates and cancellation stock restore in one transaction.
- Add pending states and refresh after action.
- Test repeated clicks and invalid transitions.
- **Exit criterion:** confirm/cancel work and stock is restored exactly once.

### Day 11 — Thursday, October 22: reset, limits, and reliability

- Implement protected reset endpoint and confirmation dialog.
- Implement per-conversation cap and database-backed global hourly AI-call cap.
- Test timeout, invalid model JSON, rate limit, quota exhaustion, and safe fallback.
- Add concise server-side diagnostic logs without exposing private data.
- **Exit criterion:** demo can be reset and repeated safely; common failures are graceful.

### Day 12 — Friday, October 23: production hardening and README

- Test fresh deployment and environment configuration.
- Check responsive layout, text rendering, and no raw HTML injection.
- Review all protected routes and API responses for private data leaks.
- Write README: product purpose, features, architecture, stack, setup, environment variables, seed/reset, limitations, and demo URL.
- Add a simple architecture diagram if time permits.
- **Exit criterion:** a reviewer can understand and run the project from README without access to private files.

### Day 13 — Saturday, October 24: demo preparation and cleanup

- Write a concise demo script that follows the acceptance path.
- Rehearse using the deployed site and reset function.
- Clean up repo, remove unused code, inspect commits for secrets, and verify public access.
- Prepare submission description, team names/roles, tech stack, next steps, and optional deck.
- **Exit criterion:** demo flow is repeatable and submission details are drafted.

### Day 14 — Sunday, October 25: record and freeze MVP

- Record a 2–4 minute demo video showing the real deployed workflow.
- Show the chat order, confirmation summary, resulting dashboard order, status action, and reset if time permits.
- Include the demo passcode in the submission description and video, not the public repository.
- Check the video link in a private/logged-out browser and ensure no access request is required.
- Run one final regression on the live URL and make a stable commit/tag.
- **Exit criterion:** MVP and evidence are ready; only critical fixes remain.

### Days 15–16 — Monday–Tuesday, October 26–27: fix-only buffer

- Fix only defects that block the demo, compromise correctness/security, or prevent submission.
- Do not add features or redesign the architecture.
- Re-record the video only if the existing one is materially incorrect or broken.

### October 28–31: submission window

Use this period for final submission checks, not planned development. Submit before October 31 at 23:59 Algiers time. Verify every link and the public repository/video access from a logged-out browser.

---

## 18. Submission requirements checklist

The Thirduni submission must include:

- [ ] Project name.
- [ ] One-line summary of 20 words or fewer.
- [ ] Description of 150 words or fewer.
- [ ] Public live demo URL usable in a browser.
- [ ] Public GitHub repository and a useful README.
- [ ] Public 2–4 minute demo video (YouTube or Google Drive) that does not request access.
- [ ] Full team member names and roles; if solo, state the role clearly.
- [ ] Technology stack.
- [ ] “What happens next” section of 100 words or fewer.
- [ ] Optional pitch deck PDF, maximum 8 slides, if included.
- [ ] Demo dashboard passcode included in the submission description/video, never in the repository.
- [ ] All links tested from a logged-out browser.

Do not claim Instagram integration or other features that are not implemented. Clearly describe the product as a chat simulator MVP demonstrating the core workflow.

---

## 19. Working rules for AI-assisted development

These rules apply when working with ChatGPT, Claude, or any other coding assistant.

1. **This file is the shared source of truth.** At the start of a coding session, provide the relevant sections and ask the assistant to follow them.
2. **One owner per module.** Avoid asking two AIs to independently generate the same module and then merging competing implementations. One assistant may implement; another may review the resulting code or a small diff.
3. **Small changes only.** Build one working slice at a time. Ask for exact file paths, purpose, code, and a simple verification step. Do not accept huge unreviewed rewrites.
4. **Understand what is built.** Spend about 10 minutes at the end of each day explaining the data flow and decisions in your own words. Ask for clarification when needed; do not pretend to understand code you cannot explain.
5. **Time-box debugging.** If blocked for roughly 60 focused minutes, reduce the issue to a minimal reproduction, share the exact error and relevant code, and ask for the smallest diagnosis. Do not rewrite the whole app impulsively.
6. **Verify every slice.** Run it locally, inspect errors, test the success path and one failure path, then commit.
7. **No silent scope creep.** If a feature is not required by this spec or needed to make an existing required feature correct, do not build it.
8. **Only escalate real blockers.** Reopen a frozen decision only for a concrete technical contradiction, security problem, correctness risk, or a deadline-threatening issue. Record the resolution in this document.
9. **Never expose secrets.** Do not paste real keys/passcodes into prompts, screenshots, public issues, or committed files.
10. **Protect the deadline.** The live end-to-end workflow by Day 8 and submission evidence by Day 14 matter more than visual polish.

---

## 20. Final definition of done

The MVP is done when all of the following are true:

- [ ] A public browser URL loads reliably.
- [ ] Customer chat answers from the real seeded catalog.
- [ ] The customer can build a one-product order over multiple turns.
- [ ] The backend validates every order field and computes price/delivery.
- [ ] A backend-generated summary is shown before order creation.
- [ ] Confirmation is bound to a hash of the exact draft; edits invalidate it.
- [ ] A confirmed order is persisted once and stock is decremented transactionally.
- [ ] The dashboard is protected by a server-validated passcode session.
- [ ] `GET /api/orders` and all management/reset endpoints are protected.
- [ ] Confirm/cancel transitions are guarded; cancellation restores stock once.
- [ ] Demo reset restores the seed state.
- [ ] Critical backend outcomes replace Gemini replies and are localized.
- [ ] Message/hourly limits and Gemini failure/quota paths are handled gracefully.
- [ ] The privacy notice is visible in chat and README.
- [ ] The repository contains no secrets and includes setup instructions.
- [ ] The demo video and submission links are public and verified.

**Final rule:** If a feature does not help prove the core idea to the judges, and is not necessary for correctness or safety, it does not get built for this MVP.
