import Product  from '../models/Product.model.js';
import Category from '../models/Category.model.js';
import { AppError } from '../middleware/error.middleware.js';
import { audit } from '../services/audit.service.js';

/**
 * POST /api/import/products
 * Body: { rows: [{ name, category, price, baseStock, sku?, unit?, lowStockThreshold? }] }
 * Accepts parsed CSV rows — parsing happens on the frontend.
 */
export const bulkImportProducts = async (req, res, next) => {
  try {
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0)
      throw new AppError('No rows provided', 400);

    if (rows.length > 500)
      throw new AppError('Maximum 500 rows per import', 400);

    // ── Step 1: Resolve category names → IDs ─────────────────────────────────
    const uniqueCatNames = [...new Set(rows.map((r) => r.category?.trim()).filter(Boolean))];
    const existingCats   = await Category.find({
      name: { $in: uniqueCatNames.map((n) => new RegExp(`^${n}$`, 'i')) },
    });
    const catMap = new Map(existingCats.map((c) => [c.name.toLowerCase(), c._id]));

    // Auto-create missing categories
    const missingCats = uniqueCatNames.filter((n) => !catMap.has(n.toLowerCase()));
    if (missingCats.length > 0) {
      const created = await Category.insertMany(
        missingCats.map((name) => ({ name, createdBy: req.user._id }))
      );
      created.forEach((c) => catMap.set(c.name.toLowerCase(), c._id));
    }

    // ── Step 2: Validate + build product docs ─────────────────────────────────
    const errors  = [];
    const valid   = [];

    rows.forEach((row, i) => {
      const rowNum = i + 2; // +2 because row 1 is the header
      const name   = row.name?.trim();
      const catKey = row.category?.trim()?.toLowerCase();
      const price  = Number(row.price);
      const stock  = Number(row.baseStock ?? row.base_stock ?? 0);

      if (!name)        { errors.push(`Row ${rowNum}: name is required`);             return; }
      if (!catKey)      { errors.push(`Row ${rowNum}: category is required`);         return; }
      if (isNaN(price) || price < 0) { errors.push(`Row ${rowNum}: invalid price`); return; }
      if (isNaN(stock) || stock < 0) { errors.push(`Row ${rowNum}: invalid stock`); return; }

      const validUnits = ['pcs','kg','g','ltr','ml','box','pack'];
      const unit = validUnits.includes(row.unit) ? row.unit : 'pcs';

      valid.push({
        name,
        category:          catMap.get(catKey),
        price,
        baseStock:         stock,
        currentStock:      stock,
        sku:               row.sku?.trim()     || undefined,
        description:       row.description?.trim() || '',
        unit,
        lowStockThreshold: Number(row.lowStockThreshold ?? row.low_stock_threshold ?? 10),
        createdBy:         req.user._id,
      });
    });

    // Return validation errors without importing anything
    if (errors.length > 0 && valid.length === 0)
      throw new AppError(`Validation failed:\n${errors.join('\n')}`, 422);

    // ── Step 3: Upsert — update existing by name, insert new ─────────────────
    const results = { created: 0, updated: 0, skipped: errors.length, errors };

    for (const doc of valid) {
      try {
        const existing = await Product.findOne({
          name:     new RegExp(`^${doc.name}$`, 'i'),
          isActive: true,
        });

        if (existing) {
          // Update price + thresholds but keep current stock intact
          await Product.findByIdAndUpdate(existing._id, {
            price:             doc.price,
            lowStockThreshold: doc.lowStockThreshold,
            category:          doc.category,
            unit:              doc.unit,
            description:       doc.description,
          });
          results.updated++;
        } else {
          await Product.create(doc);
          results.created++;
        }
      } catch (err) {
        if (err.code === 11000) {
          results.errors.push(`"${doc.name}": SKU already exists`);
          results.skipped++;
        } else {
          results.errors.push(`"${doc.name}": ${err.message}`);
          results.skipped++;
        }
      }
    }

    res.status(201).json({
      success: true,
      message: `Import complete: ${results.created} created, ${results.updated} updated, ${results.skipped} skipped`,
      data:    results,
    });
    
    audit({ action: 'BULK_IMPORT', entity: 'Product',
        meta: { created: results.created, updated: results.updated,
                skipped: results.skipped, total: rows.length },
        user: req.user, ip: req.ip });
  } catch (err) { next(err); }
};

// GET /api/import/template — returns CSV template headers
export const getImportTemplate = (req, res) => {
  const headers = 'name,category,price,baseStock,sku,unit,description,lowStockThreshold';
  const example = 'Basmati Rice 1kg,Grains,120,50,RICE-001,kg,Premium quality,10';
  const csv     = `${headers}\n${example}\n`;

  res.setHeader('Content-Type',        'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="import-template.csv"');
  res.send(csv);
};