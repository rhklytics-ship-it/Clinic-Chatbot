/*
  Builds a formatted Excel workbook of bookings (used by admin.html).
  Sheet 1 "Bookings": one row per booking, grouped by date, with filters.
  Sheet 2 "Summary": confirmed bookings and booked hours per day and per service.
*/
(function (root) {
  const TEAL = "FF0F7C78", INK = "FF1D2430", MUTED = "FF6B7380", BAND = "FFF2F7F6", LINE = "FFD9E2E0", GOLD = "FFFFF3D6";

  const day = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const longDate = (d) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const hhmm = (n) => String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
  const excelDate = (d) => new Date(d + "T00:00:00Z");

  function build(ExcelJS, opts) {
    const { businessName, staffLabel = "Staff", from, to, bookings } = opts;
    const wb = new ExcelJS.Workbook();
    wb.creator = "RHKLytics clinic assistant";
    wb.created = new Date();

    // ---------- Bookings sheet ----------
    const ws = wb.addWorksheet("Bookings", {
      views: [{ state: "frozen", ySplit: 4 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 }, printTitlesRow: "4:4" },
      headerFooter: { oddFooter: "&L" + businessName + " appointments&RPage &P of &N" },
    });
    const cols = [
      { header: "Date", key: "date", width: 13 }, { header: "Day", key: "day", width: 6 },
      { header: "Start", key: "start", width: 8 }, { header: "End", key: "end", width: 8 },
      { header: "Service", key: "service", width: 26 }, { header: "Mins", key: "minutes", width: 7 },
      { header: "Patient", key: "name", width: 22 }, { header: "Mobile", key: "phone", width: 16 },
      { header: staffLabel, key: "staff", width: 18 }, { header: "Ref", key: "ref", width: 10 },
      { header: "Booked via", key: "source", width: 12 }, { header: "Status", key: "status", width: 20 },
    ];
    ws.columns = cols.map(c => ({ key: c.key, width: c.width }));

    ws.mergeCells(1, 1, 1, cols.length);
    ws.getCell("A1").value = businessName + " appointments";
    ws.getCell("A1").font = { name: "Calibri", size: 16, bold: true, color: { argb: INK } };
    ws.mergeCells(2, 1, 2, cols.length);
    const confirmed = bookings.filter(b => b.status !== "cancelled");
    ws.getCell("A2").value = `${longDate(from)} to ${longDate(to)}  ·  ${confirmed.length} confirmed, ${bookings.length - confirmed.length} cancelled  ·  exported ${new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}`;
    ws.getCell("A2").font = { name: "Calibri", size: 10, color: { argb: MUTED } };
    ws.getRow(1).height = 24;

    const head = ws.getRow(4);
    cols.forEach((c, i) => { head.getCell(i + 1).value = c.header; });
    head.height = 20;
    head.eachCell(cell => {
      cell.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });

    const sorted = [...bookings].sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.staff - b.staff);
    let band = false, lastDate = null;
    sorted.forEach(b => {
      if (b.date !== lastDate) { band = !band; lastDate = b.date; }
      const row = ws.addRow({
        date: excelDate(b.date), day: day(b.date), start: b.time, end: hhmm(toMin(b.time) + b.minutes),
        service: b.service, minutes: b.minutes, name: b.name, phone: String(b.phone),
        staff: b.staffName || (staffLabel + " " + (b.staff + 1)), ref: b.id,
        source: b.source === "owner" ? "Front desk" : "Online",
        status: b.status === "cancelled" ? (b.cancelledBy === "patient" ? "Cancelled by patient" : "Cancelled") : "Confirmed",
      });
      row.getCell("date").numFmt = "dd mmm yyyy";
      row.getCell("phone").numFmt = "@";
      row.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: "Calibri", size: 11, color: { argb: INK } };
        cell.alignment = { vertical: "middle", horizontal: "left" };
        cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
        if (band) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
      });
      if (b.status === "cancelled") {
        row.eachCell({ includeEmpty: true }, cell => { cell.font = { name: "Calibri", size: 11, italic: true, strike: true, color: { argb: "FF9AA1AA" } }; });
        row.getCell("status").font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF9B1C1C" } };
      } else if (b.source === "owner") {
        row.getCell("source").fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
      }
    });
    if (!sorted.length) {
      ws.mergeCells(5, 1, 5, cols.length);
      ws.getCell("A5").value = "No appointments in this period.";
      ws.getCell("A5").font = { name: "Calibri", italic: true, color: { argb: MUTED } };
    } else {
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + sorted.length, column: cols.length } };
    }

    // ---------- Summary sheet ----------
    const sm = wb.addWorksheet("Summary", { pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });
    sm.columns = [{ width: 28 }, { width: 14 }, { width: 14 }, { width: 4 }, { width: 28 }, { width: 14 }, { width: 14 }];
    sm.getCell("A1").value = businessName + " summary";
    sm.getCell("A1").font = { name: "Calibri", size: 16, bold: true, color: { argb: INK } };
    sm.getCell("A2").value = `${longDate(from)} to ${longDate(to)} · confirmed bookings only`;
    sm.getCell("A2").font = { name: "Calibri", size: 10, color: { argb: MUTED } };

    const table = (startCol, title, rows) => {
      const hdr = [title, "Bookings", "Hours"];
      hdr.forEach((h, i) => {
        const c = sm.getCell(4, startCol + i);
        c.value = h;
        c.font = { name: "Calibri", bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
        c.alignment = { horizontal: i ? "right" : "left" };
      });
      rows.forEach((r, i) => {
        const rr = 5 + i;
        sm.getCell(rr, startCol).value = r[0];
        sm.getCell(rr, startCol + 1).value = r[1];
        sm.getCell(rr, startCol + 2).value = r[2];
        sm.getCell(rr, startCol + 2).numFmt = "0.0";
        for (let k = 0; k < 3; k++) {
          const c = sm.getCell(rr, startCol + k);
          c.font = { name: "Calibri", color: { argb: INK } };
          c.border = { bottom: { style: "thin", color: { argb: LINE } } };
        }
      });
      const tr = 5 + rows.length;
      const colL = String.fromCharCode(64 + startCol + 1), colH = String.fromCharCode(64 + startCol + 2);
      sm.getCell(tr, startCol).value = "Total";
      sm.getCell(tr, startCol + 1).value = rows.length ? { formula: `SUM(${colL}5:${colL}${tr - 1})` } : 0;
      sm.getCell(tr, startCol + 2).value = rows.length ? { formula: `SUM(${colH}5:${colH}${tr - 1})` } : 0;
      sm.getCell(tr, startCol + 2).numFmt = "0.0";
      for (let k = 0; k < 3; k++) {
        const c = sm.getCell(tr, startCol + k);
        c.font = { name: "Calibri", bold: true, color: { argb: INK } };
        c.border = { top: { style: "thin", color: { argb: INK } } };
      }
    };

    const byDay = new Map(), bySvc = new Map();
    confirmed.forEach(b => {
      const dk = b.date, sk = b.service;
      byDay.set(dk, [(byDay.get(dk)?.[0] || 0) + 1, (byDay.get(dk)?.[1] || 0) + b.minutes]);
      bySvc.set(sk, [(bySvc.get(sk)?.[0] || 0) + 1, (bySvc.get(sk)?.[1] || 0) + b.minutes]);
    });
    table(1, "Day", [...byDay.entries()].sort().map(([d, v]) => [day(d) + " " + longDate(d), v[0], Math.round(v[1] / 6) / 10]));
    table(5, "Service", [...bySvc.entries()].sort((a, b) => b[1][0] - a[1][0]).map(([s, v]) => [s, v[0], Math.round(v[1] / 6) / 10]));

    return wb;
  }

  if (typeof module !== "undefined" && module.exports) module.exports = build;
  else root.buildBookingsWorkbook = build;
})(this);
