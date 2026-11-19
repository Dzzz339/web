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

const CELL_BORDERS_NONE = {
  top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
  right: { style: BorderStyle.NONE, size: 0, color: 'auto' }
};

const CELL_PADDING = {
  top: 100,
  bottom: 100,
  left: 150,
  right: 150
};

export function parseAlignmentFromAttributes(attrStr = '') {
  if (!attrStr) return undefined;
  const styleMatch = attrStr.match(/text-align\s*:\s*(left|right|center|justify)/i);
  if (styleMatch) {
    const val = styleMatch[1].toLowerCase();
    if (val === 'right') return AlignmentType.RIGHT;
    if (val === 'center') return AlignmentType.CENTER;
    if (val === 'justify') return AlignmentType.JUSTIFIED;
    return AlignmentType.LEFT;
  }
  const alignMatch = attrStr.match(/align\s*=\s*["']?(left|right|center|justify)/i);
  if (alignMatch) {
    const val = alignMatch[1].toLowerCase();
    if (val === 'right') return AlignmentType.RIGHT;
    if (val === 'center') return AlignmentType.CENTER;
    if (val === 'justify') return AlignmentType.JUSTIFIED;
    return AlignmentType.LEFT;
  }
  return undefined;
}

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

  // Разворачиваем внешние обертки div, содержащие таблицы или другие блочные элементы,
  // чтобы таблицы не превращались в сплошной текст
  let prevContent;
  do {
    prevContent = content;
    content = content.replace(/<div(?:\s+[^>]*)?>([\s\S]*?)<\/div>/gi, (match, inner) => {
      if (/<(?:table|p|div|h[1-6]|ul|ol|blockquote)[\s>]/i.test(inner)) {
        return '\n' + inner + '\n';
      }
      return match;
    });
  } while (content !== prevContent);

  const docChildren = [];
  const blockRegex = /(?:<table([^>]*)>([\s\S]*?)<\/table>)|(?:<h([1-6])([^>]*)>([\s\S]*?)<\/h\3>)|(?:<p([^>]*)>([\s\S]*?)<\/p>)|(?:<div([^>]*)>([\s\S]*?)<\/div>)|([^<]+)/gi;
  let blockMatch;

  while ((blockMatch = blockRegex.exec(content)) !== null) {
    const tableAttrs = blockMatch[1];
    const tableInner = blockMatch[2];
    const headingLevel = blockMatch[3];
    const headingAttrs = blockMatch[4];
    const headingContent = blockMatch[5];
    const pAttrs = blockMatch[6];
    const pContent = blockMatch[7];
    const divAttrs = blockMatch[8];
    const divContent = blockMatch[9];
    const rawText = blockMatch[10];

    if (tableInner !== undefined) {
      const isSignatureTable = /signature|signatures|border:\s*none|border\s*=\s*["']?0["']?/i.test(tableAttrs || '') ||
                               /подписи\s+сторон|заказчик:[\s\S]*подрядчик:/i.test(tableInner || '');
      const borders = isSignatureTable ? CELL_BORDERS_NONE : CELL_BORDERS_ALL;

      const rows = [];
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      while ((trMatch = trRegex.exec(tableInner)) !== null) {
        const cellRegex = /<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi;
        const cells = [];
        let cellMatch;
        while ((cellMatch = cellRegex.exec(trMatch[1])) !== null) {
          const isTh = cellMatch[1].toLowerCase() === 'th';
          const cellAttrs = cellMatch[2] || '';
          const cellContent = cellMatch[3];
          const cellRuns = parseInlineRuns(cellContent);
          if (isTh) {
            cellRuns.forEach(r => { r.bold = true; });
          }
          const cellAlign = parseAlignmentFromAttributes(cellAttrs) || (isTh ? AlignmentType.CENTER : AlignmentType.LEFT);
          const cellProps = {
            borders,
            margins: CELL_PADDING,
            children: [
              new Paragraph({
                children: cellRuns,
                alignment: cellAlign
              })
            ]
          };
          if (isSignatureTable) {
            cellProps.width = { size: 50, type: WidthType.PERCENTAGE };
          }
          cells.push(new TableCell(cellProps));
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
      const align = parseAlignmentFromAttributes(headingAttrs) || AlignmentType.CENTER;
      docChildren.push(new Paragraph({
        children: runs,
        alignment: align,
        spacing: { before: 200, after: 120 }
      }));
    } else if (pContent !== undefined) {
      const runs = parseInlineRuns(pContent);
      const align = parseAlignmentFromAttributes(pAttrs);
      docChildren.push(new Paragraph({
        children: runs,
        alignment: align,
        spacing: { before: 60, after: 60 }
      }));
    } else if (divContent !== undefined) {
      const runs = parseInlineRuns(divContent);
      const align = parseAlignmentFromAttributes(divAttrs);
      docChildren.push(new Paragraph({
        children: runs,
        alignment: align,
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
