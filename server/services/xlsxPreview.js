import * as XLSX from 'xlsx';

/**
 * Преобразует XLSX/XLS файл в HTML таблицы по листам
 */
export function convertXlsxToHtml(buffer, maxRows = 200) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheets = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    // Ограничиваем количество строк для мгновенного рендеринга
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    const totalRows = range.e.r - range.s.r + 1;
    const isTruncated = totalRows > maxRows;

    if (isTruncated) {
      range.e.r = Math.min(range.e.r, range.s.r + maxRows - 1);
      ws['!ref'] = XLSX.utils.encode_range(range);
    }

    const tableHtml = XLSX.utils.sheet_to_html(ws, {
      id: 'preview_table_' + encodeURIComponent(sheetName),
      editable: false
    });

    sheets.push({
      name: sheetName,
      html: tableHtml,
      totalRows: totalRows,
      displayedRows: Math.min(totalRows, maxRows),
      isTruncated: isTruncated
    });
  }

  return sheets;
}
