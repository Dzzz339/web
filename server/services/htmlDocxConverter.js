// server/services/htmlDocxConverter.js
import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Packer,
  BorderStyle,
  WidthType,
  AlignmentType
} from 'docx';

const CELL_BORDERS_ALL = {
  top: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
  left: { style: BorderStyle.SINGLE, size: 1, color: '999999' },
  right: { style: BorderStyle.SINGLE, size: 1, color: '999999' }
};

const CELL_PADDING = {
  top: 100,
  bottom: 100,
  left: 150,
  right: 150
};

export function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&nbsp;/g, ' ')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

export function parseInlineRuns(htmlSnippet) {
  if (!htmlSnippet) return [new TextRun('')];
  const runs = [];
  const tagRegex = /<(\/)?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let match;
  let bold = false;
  let italics = false;
  let underline = false;

  while ((match = tagRegex.exec(htmlSnippet)) !== null) {
    const isClosing = Boolean(match[1]);
    const tagName = match[2] ? match[2].toLowerCase() : null;
    const textContent = match[4];

    if (tagName) {
      if (tagName === 'b' || tagName === 'strong') {
        bold = !isClosing;
      } else if (tagName === 'i' || tagName === 'em') {
        italics = !isClosing;
      } else if (tagName === 'u') {
        underline = !isClosing;
      } else if (tagName === 'br') {
        runs.push(new TextRun({ break: 1 }));
      }
    } else if (textContent) {
      const clean = decodeHtmlEntities(textContent);
      if (clean) {
        runs.push(new TextRun({
          text: clean,
          bold: bold || undefined,
          italics: italics || undefined,
          underline: underline ? {} : undefined,
          font: 'Times New Roman',
          size: 22
        }));
      }
    }
  }

  return runs.length ? runs : [new TextRun('')];
}

export async function htmlToDocxBuffer(htmlString, title = 'Документ') {
  if (!htmlString || typeof htmlString !== 'string') {
    const emptyDoc = new Document({
      sections: [{
        children: [new Paragraph({ text: title || 'Документ', bold: true })]
      }]
    });
    return await Packer.toBuffer(emptyDoc);
  }

  let content = htmlString
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '');

  const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) content = bodyMatch[1];

  const docChildren = [];
  const blockRegex = /<table[^>]*>([\s\S]*?)<\/table>|<h([1-6])[^>]*>([\s\S]*?)<\/h\2>|<p[^>]*>([\s\S]*?)<\/p>|<div[^>]*>([\s\S]*?)<\/div>|([^<]+)/gi;
  let blockMatch;

  while ((blockMatch = blockRegex.exec(content)) !== null) {
    const tableInner = blockMatch[1];
    const headingLevel = blockMatch[2];
    const headingContent = blockMatch[3];
    const pContent = blockMatch[4];
    const divContent = blockMatch[5];
    const rawText = blockMatch[6];

    if (tableInner !== undefined) {
      const rows = [];
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      while ((trMatch = trRegex.exec(tableInner)) !== null) {
        const cellRegex = /<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi;
        const cells = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(trMatch[1])) !== null) {
          const isTh = cellMatch[1].toLowerCase() === 'th';
          const cellContent = cellMatch[2];
          const cellRuns = parseInlineRuns(cellContent);
          if (isTh) {
            cellRuns.forEach(r => { r.bold = true; });
          }
          cells.push(new TableCell({
            borders: CELL_BORDERS_ALL,
            margins: CELL_PADDING,
            children: [
              new Paragraph({
                children: cellRuns,
                alignment: isTh ? AlignmentType.CENTER : AlignmentType.LEFT
              })
            ]
          }));
        }
        if (cells.length > 0) {
          rows.push(new TableRow({ children: cells }));
        }
      }
      if (rows.length > 0) {
        docChildren.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows
        }));
        docChildren.push(new Paragraph({ text: '' }));
      }
    } else if (headingContent !== undefined) {
      const runs = parseInlineRuns(headingContent);
      runs.forEach(r => {
        r.bold = true;
        r.size = 28;
      });
      docChildren.push(new Paragraph({
        children: runs,
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 120 }
      }));
    } else if (pContent !== undefined) {
      const runs = parseInlineRuns(pContent);
      docChildren.push(new Paragraph({
        children: runs,
        spacing: { before: 60, after: 60 }
      }));
    } else if (divContent !== undefined) {
      const runs = parseInlineRuns(divContent);
      docChildren.push(new Paragraph({
        children: runs,
        spacing: { before: 60, after: 60 }
      }));
    } else if (rawText) {
      const text = decodeHtmlEntities(rawText).trim();
      if (text) {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text, font: 'Times New Roman', size: 22 })],
          spacing: { before: 60, after: 60 }
        }));
      }
    }
  }

  if (docChildren.length === 0) {
    docChildren.push(new Paragraph({
      children: [new TextRun({ text: title || 'Документ', font: 'Times New Roman', size: 24, bold: true })]
    }));
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1134, right: 850, bottom: 1134, left: 1134 }
        }
      },
      children: docChildren
    }]
  });

  return await Packer.toBuffer(doc);
}
