import dayjs    from 'dayjs';
import ExcelJS  from 'exceljs';
import PDFDoc   from 'pdfkit';
import StockLog from '../models/StockLog.model.js';
import { AppError } from '../middleware/error.middleware.js';

// ── Query builder ─────────────────────────────────────────────────────────────
const buildDateFilter = ({ type, date, month, year }) => {
  if (type === 'day'   && date)  return { $gte: date,              $lte: date               };
  if (type === 'month' && month) return { $gte: `${month}-01`,     $lte: `${month}-31`      };
  if (type === 'year'  && year)  return { $gte: `${year}-01-01`,   $lte: `${year}-12-31`    };
  // Default: current month
  const m = dayjs().format('YYYY-MM');
  return { $gte: `${m}-01`, $lte: `${m}-31` };
};

// ── Fetch + flatten log data ──────────────────────────────────────────────────
const fetchExportData = async (filter) => {
  const logs = await StockLog.find({ date: filter })
    .populate({
      path:     'soldItems.product',
      select:   'name sku unit price',
      populate: { path: 'category', select: 'name' },
    })
    .populate('restockedItems.product', 'name sku unit')
    .sort({ date: 1 });

  // Flatten into rows
  const rows = [];
  for (const log of logs) {
    for (const item of log.soldItems) {
      rows.push({
        date:         log.date,
        type:         'Sale',
        productName:  item.product?.name    || 'Unknown',
        sku:          item.product?.sku     || '—',
        category:     item.product?.category?.name || '—',
        unit:         item.product?.unit    || 'pcs',
        quantity:     item.quantity,
        priceAtSale:  item.priceAtSale,
        subtotal:     item.subtotal,
        notes:        log.notes || '',
      });
    }
    for (const item of log.restockedItems) {
      rows.push({
        date:         log.date,
        type:         'Restock',
        productName:  item.product?.name || 'Unknown',
        sku:          item.product?.sku  || '—',
        category:     '—',
        unit:         item.product?.unit || 'pcs',
        quantity:     item.quantity,
        priceAtSale:  0,
        subtotal:     0,
        notes:        log.notes || '',
      });
    }
  }

  // Summary totals
  const totals = logs.reduce(
    (acc, l) => ({
      revenue:   acc.revenue   + (l.totalRevenue   || 0),
      itemsSold: acc.itemsSold + (l.totalItemsSold || 0),
      restocked: acc.restocked + (l.totalRestocked || 0),
      days:      acc.days      + 1,
    }),
    { revenue: 0, itemsSold: 0, restocked: 0, days: 0 }
  );

  return { rows, logs, totals };
};

// ── GET /api/export/csv ───────────────────────────────────────────────────────
export const exportCSV = async (req, res, next) => {
  try {
    const filter = buildDateFilter(req.query);
    const { rows, totals } = await fetchExportData(filter);

    if (!rows.length) throw new AppError('No data found for the selected period', 404);

    const headers = [
      'Date', 'Type', 'Product', 'SKU', 'Category',
      'Unit', 'Quantity', 'Price', 'Subtotal', 'Notes',
    ];

    const csvRows = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.date, r.type,
          `"${r.productName}"`, `"${r.sku}"`, `"${r.category}"`,
          r.unit, r.quantity, r.priceAtSale.toFixed(2), r.subtotal.toFixed(2),
          `"${r.notes}"`,
        ].join(',')
      ),
      '',
      `Summary,,,,,,${totals.itemsSold} sold,,₹${totals.revenue.toFixed(2)},`,
      `Active days: ${totals.days}`,
    ];

    const csv      = csvRows.join('\n');
    const filename = `stocksales-${req.query.type || 'month'}-${Date.now()}.csv`;

    res.setHeader('Content-Type',        'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) { next(err); }
};

// ── GET /api/export/excel ─────────────────────────────────────────────────────
export const exportExcel = async (req, res, next) => {
  try {
    const filter = buildDateFilter(req.query);
    const { rows, logs, totals } = await fetchExportData(filter);

    if (!rows.length) throw new AppError('No data found for the selected period', 404);

    const wb = new ExcelJS.Workbook();
    wb.creator  = 'StockSales App';
    wb.created  = new Date();

    // ── Sheet 1: Transactions ─────────────────────────────────────────────────
    const ws = wb.addWorksheet('Transactions', {
      views: [{ state: 'frozen', ySplit: 2 }],
    });

    // Title row
    ws.mergeCells('A1:J1');
    const titleCell = ws.getCell('A1');
    titleCell.value = `StockSales Export — ${req.query.month || req.query.year || req.query.date || 'Current Month'}`;
    titleCell.font  = { bold: true, size: 14, color: { argb: 'FF6366F1' } };
    titleCell.alignment = { horizontal: 'center' };
    ws.getRow(1).height = 28;

    // Header row
    const headerRow = ws.addRow([
      'Date', 'Type', 'Product', 'SKU', 'Category',
      'Unit', 'Qty', 'Unit Price (₹)', 'Subtotal (₹)', 'Notes',
    ]);
    headerRow.height = 22;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: 'FF6366F1' },
      };
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border    = {
        bottom: { style: 'thin', color: { argb: 'FF4F46E5' } },
      };
    });

    // Data rows
    rows.forEach((r, i) => {
      const row = ws.addRow([
        r.date, r.type, r.productName, r.sku, r.category,
        r.unit, r.quantity, r.priceAtSale, r.subtotal, r.notes,
      ]);
      // Alternate row tint
      if (i % 2 === 0) {
        row.eachCell((cell) => {
          cell.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: 'FFF8F7FF' },
          };
        });
      }
      // Colour-code type
      const typeCell = row.getCell(2);
      typeCell.font = {
        bold:  true,
        color: { argb: r.type === 'Sale' ? 'FF6366F1' : 'FF22C55E' },
      };
      // Right-align numbers
      row.getCell(7).alignment  = { horizontal: 'right' };
      row.getCell(8).alignment  = { horizontal: 'right' };
      row.getCell(9).alignment  = { horizontal: 'right' };
      row.getCell(8).numFmt     = '₹#,##0.00';
      row.getCell(9).numFmt     = '₹#,##0.00';
    });

    // Totals row
    ws.addRow([]);
    const totalRow = ws.addRow([
      'TOTAL', '', '', '', '',
      '', totals.itemsSold, '', totals.revenue,
    ]);
    totalRow.eachCell((cell, col) => {
      if ([1, 7, 9].includes(col)) {
        cell.font = { bold: true, size: 12, color: { argb: 'FF6366F1' } };
        cell.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: 'FFEEF2FF' },
        };
      }
    });
    totalRow.getCell(9).numFmt = '₹#,##0.00';

    // Column widths
    ws.columns = [
      { width: 14 }, { width: 10 }, { width: 28 }, { width: 14 },
      { width: 16 }, { width: 8  }, { width: 8  }, { width: 16 },
      { width: 16 }, { width: 24 },
    ];

    // ── Sheet 2: Daily Summary ────────────────────────────────────────────────
    const ws2 = wb.addWorksheet('Daily Summary');

    ws2.addRow(['Date', 'Revenue (₹)', 'Items Sold', 'Restocked', 'Notes'])
       .eachCell((c) => {
         c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
         c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6366F1' } };
         c.alignment = { horizontal: 'center' };
       });

    logs.forEach((l, i) => {
      const row = ws2.addRow([
        l.date, l.totalRevenue, l.totalItemsSold, l.totalRestocked, l.notes || '',
      ]);
      if (i % 2 === 0) {
        row.eachCell((c) => {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F7FF' } };
        });
      }
      row.getCell(2).numFmt = '₹#,##0.00';
    });

    ws2.columns = [
      { width: 14 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 24 },
    ];

    // Send the workbook
    const filename = `stocksales-${req.query.type || 'month'}-${Date.now()}.xlsx`;
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) { next(err); }
};

// ── GET /api/export/pdf ───────────────────────────────────────────────────────
export const exportPDF = async (req, res, next) => {
  try {
    const filter = buildDateFilter(req.query);
    const { rows, logs, totals } = await fetchExportData(filter);

    if (!rows.length) throw new AppError('No data found for the selected period', 404);

    const doc      = new PDFDoc({ margin: 40, size: 'A4' });
    const filename = `stocksales-${req.query.type || 'month'}-${Date.now()}.pdf`;

    res.setHeader('Content-Type',        'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    const W        = doc.page.width  - 80;   // usable width
    const INDIGO   = '#6366f1';
    const GRAY     = '#6b7280';
    const LIGHT    = '#f3f4f6';

    // ── Header ────────────────────────────────────────────────────────────────
    doc.rect(40, 40, W, 56).fill(INDIGO);
    doc.fillColor('#ffffff')
       .fontSize(18).font('Helvetica-Bold')
       .text('StockSales', 56, 52);
    doc.fontSize(10).font('Helvetica')
       .text(`Export Report — ${req.query.month || req.query.year || req.query.date || 'Current Month'}`,
             56, 75);
    doc.text(`Generated: ${dayjs().format('DD MMM YYYY, h:mm A')}`,
             W - 80, 75, { align: 'right' });

    // ── Summary strip ─────────────────────────────────────────────────────────
    const stripY = 110;
    doc.rect(40, stripY, W, 52).fill(LIGHT);

    const summaryItems = [
      { label: 'Total Revenue',  value: `Rs.${totals.revenue.toLocaleString()}` },
      { label: 'Items Sold',     value: totals.itemsSold.toString()              },
      { label: 'Restocked',      value: totals.restocked.toString()              },
      { label: 'Active Days',    value: totals.days.toString()                   },
    ];
    summaryItems.forEach((item, i) => {
      const x = 56 + i * (W / 4);
      doc.fillColor(INDIGO).fontSize(16).font('Helvetica-Bold')
         .text(item.value, x, stripY + 8, { width: W / 4, align: 'center' });
      doc.fillColor(GRAY).fontSize(8).font('Helvetica')
         .text(item.label, x, stripY + 32, { width: W / 4, align: 'center' });
    });

    // ── Daily breakdown ───────────────────────────────────────────────────────
    let y = 178;
    doc.fillColor('#111827').fontSize(12).font('Helvetica-Bold')
       .text('Daily Breakdown', 40, y);
    y += 18;

    for (const log of logs) {
      if (y > doc.page.height - 140) {
        doc.addPage();
        y = 40;
      }

      // Day header
      doc.rect(40, y, W, 22).fill('#eef2ff');
      doc.fillColor(INDIGO).fontSize(10).font('Helvetica-Bold')
         .text(dayjs(log.date).format('dddd, DD MMMM YYYY'), 48, y + 6);
      doc.fillColor(GRAY).fontSize(9).font('Helvetica')
         .text(`Rev: Rs.${log.totalRevenue?.toLocaleString()} | Sold: ${log.totalItemsSold} | Restocked: ${log.totalRestocked}`,
               48, y + 6, { align: 'right', width: W - 16 });
      y += 26;

      // Items
      for (const item of log.soldItems) {
        if (y > doc.page.height - 60) { doc.addPage(); y = 40; }

        doc.fillColor('#374151').fontSize(9).font('Helvetica')
           .text(`• ${item.product?.name || 'Unknown'}`, 56, y, { width: W * 0.5 });
        doc.fillColor(GRAY)
           .text(`×${item.quantity} @ Rs.${item.priceAtSale}`, 56 + W * 0.5, y, { width: W * 0.22, align: 'right' });
        doc.fillColor('#111827').font('Helvetica-Bold')
           .text(`Rs.${item.subtotal?.toLocaleString()}`, 56 + W * 0.74, y, { width: W * 0.22, align: 'right' });
        y += 15;
      }

      // Restock items
      for (const item of log.restockedItems) {
        if (y > doc.page.height - 60) { doc.addPage(); y = 40; }
        doc.fillColor('#22c55e').fontSize(9).font('Helvetica')
           .text(`↑ ${item.product?.name || 'Unknown'} +${item.quantity}`, 56, y);
        y += 15;
      }

      // Day total line
      doc.moveTo(40, y).lineTo(40 + W, y)
         .strokeColor('#e5e7eb').lineWidth(0.5).stroke();
      y += 8;
    }

    // ── Grand total footer ────────────────────────────────────────────────────
    if (y > doc.page.height - 80) { doc.addPage(); y = 40; }
    y += 8;
    doc.rect(40, y, W, 36).fill('#eef2ff');
    doc.fillColor(INDIGO).fontSize(13).font('Helvetica-Bold')
       .text('Grand Total', 56, y + 10);
    doc.text(`Rs.${totals.revenue.toLocaleString()}`, 56, y + 10,
             { align: 'right', width: W - 16 });

    // ── Footer on every page ──────────────────────────────────────────────────
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fillColor(GRAY).fontSize(8).font('Helvetica')
         .text(
           `StockSales  •  Page ${i + 1} of ${pageCount}  •  ${dayjs().format('DD MMM YYYY')}`,
           40, doc.page.height - 30, { align: 'center', width: W }
         );
    }

    doc.end();
  } catch (err) { next(err); }
};

// ── GET /api/export/preview ───────────────────────────────────────────────────
// Returns JSON preview before downloading
export const getExportPreview = async (req, res, next) => {
  try {
    const filter = buildDateFilter(req.query);
    const { rows, totals } = await fetchExportData(filter);

    res.json({
      success: true,
      data: {
        rowCount:  rows.length,
        totals,
        dateRange: { from: filter.$gte, to: filter.$lte },
      },
    });
  } catch (err) { next(err); }
};