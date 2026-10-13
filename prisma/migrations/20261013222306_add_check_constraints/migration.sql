-- Add named CHECK constraints for spec section 5.6:
-- "Reject negative prices, negative stock, non-integer quantities, and
--  invalid status values at both validation and database/domain boundaries
--  where practical."
--
-- These cannot be expressed in prisma/schema.prisma, so they are authored here
-- as raw SQL. Column names are quoted to match the exact casing created by the
-- init migration.

-- Product price must not be negative.
ALTER TABLE "Product"
  ADD CONSTRAINT "chk_product_price_non_negative"
  CHECK ("price" >= 0);

-- Product stock must not be negative.
ALTER TABLE "Product"
  ADD CONSTRAINT "chk_product_stock_non_negative"
  CHECK ("stockQuantity" >= 0);

-- Order quantity must be a positive integer value (>= 1).
ALTER TABLE "Order"
  ADD CONSTRAINT "chk_order_quantity_positive"
  CHECK ("quantity" >= 1);

-- Order unit price snapshot must not be negative.
ALTER TABLE "Order"
  ADD CONSTRAINT "chk_order_unit_price_non_negative"
  CHECK ("unitPrice" >= 0);

-- Order delivery fee snapshot must not be negative.
ALTER TABLE "Order"
  ADD CONSTRAINT "chk_order_delivery_price_non_negative"
  CHECK ("deliveryPrice" >= 0);