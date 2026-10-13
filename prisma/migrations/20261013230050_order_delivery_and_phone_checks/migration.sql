-- Spec section 9.4 and addendum A-07: deliveryAddress is REQUIRED for HOME and
-- must be NULL for OFFICE. Enforced here as a named CHECK constraint so an
-- invalid order can never be persisted, whatever the calling code does.

ALTER TABLE "Order"
  ADD CONSTRAINT "chk_order_delivery_address_matches_method"
  CHECK (
    ("deliveryMethod" = 'HOME' AND "deliveryAddress" IS NOT NULL)
    OR ("deliveryMethod" = 'OFFICE' AND "deliveryAddress" IS NULL)
  );

-- Spec section 9.3 and addendum A-02: customerPhone must be a normalized
-- Algerian mobile number matching ^0[567][0-9]{8}$. The stored value is
-- already normalized, so the column itself must conform.

ALTER TABLE "Order"
  ADD CONSTRAINT "chk_order_customer_phone_format"
  CHECK ("customerPhone" ~ '^0[567][0-9]{8}$');