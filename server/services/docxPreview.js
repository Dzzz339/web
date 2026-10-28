import JSZip from 'jszip';

/**
 * Преобразует XML Word-документа (word/document.xml) в форматированный HTML
 */
export async function convertDocxToHtml(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('Файл не содержит word/document.xml');
  }

  const xml = await docXmlFile.async('string');
  
  // Простой и надежный парсер абзацев и таблиц DOCX
  let html = '<div class="docx-doc-body" style="font-family:\'Golos Text\',Segoe UI,Arial,sans-serif; font-size:.9rem; line-height:1.5; color:#1e293b; max-width:850px; margin:0 auto; padding:20px; background:#fff; border-radius:8px; box-shadow:0 1px 4px rgba(0,0,0,0.06)">';

  // Извлекаем элементы: абзацы <w:p> и таблицы <w:tbl>
  // Регулярное выражение для поиска блоков параграфов и таблиц
  const blockRegex = /<w:(p|tbl)[\s>][\s\S]*?<\/w:\1>/g;
  let match;

  while ((match = blockRegex.exec(xml)) !== null) {
    const blockType = match[1];
    const blockContent = match[0];

    if (blockType === 'tbl') {
      html += parseTable(blockContent);
    } else if (blockType === 'p') {
      const pText = parseParagraph(blockContent);
      if (pText.trim()) {
        html += `<p style="margin:0 0 8px 0; text-align:justify">${pText}</p>`;
      } else {
        html += '<p style="margin:0 0 4px 0">&nbsp;</p>';
      }
    }
  }

  html += '</div>';
  return html;
}

function parseParagraph(pXml) {
  // Проверяем выравнивание
  let align = '';
  if (pXml.includes('<w:jc w:val="center"/>')) align = 'text-align:center; ';
  else if (pXml.includes('<w:jc w:val="right"/>')) align = 'text-align:right; ';

  // Извлекаем прогоны текста <w:r>
  const rRegex = /<w:r[\s>][\s\S]*?<\/w:\1>|<w:r\/>/g;
  let res = '';
  let rMatch;

  while ((rMatch = rRegex.exec(pXml)) !== null) {
    const rXml = rMatch[0];
    const isBold = /<w:b(\/>|\s[^>]*\/>)/.test(rXml);
    const isItalic = /<w:i(\/>|\s[^>]*\/>)/.test(rXml);
    const isUnderline = /<w:u(\/>|\s[^>]*\/>)/.test(rXml);

    // Извлекаем все <w:t>
    const tRegex = /<w:t[\s>]([\s\S]*?)<\/w:t>|<w:t\/>/g;
    let tMatch;
    let rText = '';
    while ((tMatch = tRegex.exec(rXml)) !== null) {
      rText += tMatch[1] || '';
    }

    if (rText) {
      let formatted = escapeHtml(rText);
      if (isBold) formatted = `<strong>${formatted}</strong>`;
      if (isItalic) formatted = `<em>${formatted}</em>`;
      if (isUnderline) formatted = `<u>${formatted}</u>`;
      res += formatted;
    }
  }

  if (align && res) {
    return `<span style="${align}">${res}</span>`;
  }
  return res;
}

function parseTable(tblXml) {
  let tblHtml = '<div style="overflow-x:auto; margin:12px 0"><table style="width:100%; border-collapse:collapse; font-size:.82rem; border:1px solid #cbd5e1">';
  const trRegex = /<w:tr[\s>][\s\S]*?<\/w:\1>/g;
  let trMatch;
  let isFirstRow = true;

  while ((trMatch = trRegex.exec(tblXml)) !== null) {
    const trXml = trMatch[0];
    tblHtml += `<tr style="${isFirstRow ? 'background:#f8fafc; font-weight:700;' : 'background:#fff;'} border-bottom:1px solid #cbd5e1">`;

    const tcRegex = /<w:tc[\s>][\s\S]*?<\/w:\1>/g;
    let tcMatch;
    while ((tcMatch = tcRegex.exec(trXml)) !== null) {
      const tcXml = tcMatch[0];
      // Извлекаем текст ячейки из параграфов
      const pInCell = tcXml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
      const cellText = pInCell.map(parseParagraph).join('<br/>');
      tblHtml += `<td style="padding:6px 10px; border:1px solid #cbd5e1; vertical-align:top">${cellText || '&nbsp;'}</td>`;
    }

    tblHtml += '</tr>';
    isFirstRow = false;
  }

  tblHtml += '</table></div>';
  return tblHtml;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
