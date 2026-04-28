import Product  from '../models/Product.model.js';
import StockLog from '../models/StockLog.model.js';
import { AppError } from '../middleware/error.middleware.js';

/**
 * Validate a batch of sold/restocked items before touching the DB.
 * Returns enriched items with price snapshots — throws on any failure.
 */
export const validateAndEnrichItems = async (soldItems = [], restockedItems = []) => {
  // Collect all unique product IDs
  const productIds = [
    ...new Set([
      ...soldItems.map((i) => i.product),
      ...restockedItems.map((i) => i.product),
    ]),
  ];

  if (productIds.length === 0) {
    throw new AppError('At least one sold or restocked item is required', 400);
  }

  // Fetch all products in one query
  const products = await Product.find({
    _id:      { $in: productIds },
    isActive: true,
  });

  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  // Validate all products exist
  for (const id of productIds) {
    if (!productMap.has(id.toString())) {
      throw new AppError(`Product ${id} not found or is inactive`, 404);
    }
  }

  // Build net change map: productId → net delta (restock - sold)
  const netChange = new Map();
  for (const id of productIds) netChange.set(id.toString(), 0);

  for (const item of soldItems) {
    const key = item.product.toString();
    netChange.set(key, netChange.get(key) - item.quantity);
  }
  for (const item of restockedItems) {
    const key = item.product.toString();
    netChange.set(key, netChange.get(key) + item.quantity);
  }

  // Prevent negative stock
  const errors = [];
  for (const [id, delta] of netChange.entries()) {
    const product   = productMap.get(id);
    const projected = product.currentStock + delta;
    if (projected < 0) {
      errors.push(
        `"${product.name}": only ${product.currentStock} in stock, ` +
        `cannot sell ${Math.abs(delta) - product.currentStock} more`
      );
    }
  }
  if (errors.length > 0) throw new AppError(errors.join('; '), 422);

  // Enrich sold items with price snapshot + subtotal
  const enrichedSold = soldItems.map((item) => {
    const product = productMap.get(item.product.toString());
    return {
      product:     item.product,
      quantity:    item.quantity,
      priceAtSale: product.price,
      subtotal:    item.quantity * product.price,
    };
  });

  return { enrichedSold, netChange, productMap };
};

/**
 * Apply stock changes to all affected products (bulk write — one DB round trip).
 */
export const applyStockChanges = async (netChange) => {
  const bulkOps = [];

  for (const [productId, delta] of netChange.entries()) {
    if (delta === 0) continue;
    bulkOps.push({
      updateOne: {
        filter: { _id: productId },
        update: { $inc: { currentStock: delta } },
      },
    });
  }

  if (bulkOps.length > 0) {
    await Product.bulkWrite(bulkOps);
  }
};

/**
 * Reverse previously applied stock changes (used when overwriting an existing log).
 */
export const reverseStockChanges = async (existingLog) => {
  const reverseOps = [];

  for (const item of existingLog.soldItems) {
    reverseOps.push({
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { currentStock: item.quantity } }, // add back
      },
    });
  }
  for (const item of existingLog.restockedItems) {
    reverseOps.push({
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { currentStock: -item.quantity } }, // remove restock
      },
    });
  }

  if (reverseOps.length > 0) {
    await Product.bulkWrite(reverseOps);
  }
};