import { LoreEntity } from '../types/world';

export const WEASYPRINT_CSS = `
@page { size: A4; margin: 2cm; }
body { font-family: 'Georgia', serif; line-height: 1.6; color: #1a202c; }
h1 { text-align: center; color: #2c3e50; font-size: 26pt; margin-bottom: 1.5cm; }
.pdf-chapter { page-break-inside: avoid; margin-bottom: 2em; border-bottom: 1px solid #ccc; padding-bottom: 1.5em; }
.category-tag { font-size: 0.8em; text-transform: uppercase; color: #7f8c8d; display: block; margin-bottom: 0.3em; letter-spacing: 0.05em; }
h2 { color: #2c3e50; font-size: 16pt; margin-top: 0.2em; margin-bottom: 0.4em; }
p.summary { font-style: italic; color: #4a5568; margin-bottom: 0.8em; }
table { width: 100%; border-collapse: collapse; margin: 1em 0; }
th, td { border: 1px solid #cbd5e0; padding: 6px 10px; text-align: left; font-size: 9pt; }
th { background-color: #f7fafc; }
ul, ol { margin-left: 1.5em; margin-bottom: 1em; }
li { margin-bottom: 0.3em; }
`;

/**
 * Builds standalone HTML that can be rendered directly by WeasyPrint or browser print.
 * Exactly matches the structure in the user's Python core/exporter.py script.
 */
export function buildCompendiumHTML(entities: LoreEntity[]): string {
  // Sort entities by category, matching:
  // session.query(LoreEntity).order_by(LoreEntity.category).all()
  const sortedEntities = [...entities].sort((a, b) => a.category.localeCompare(b.category));

  let chaptersHtml = '';
  for (const e of sortedEntities) {
    const formattedBody = convertMarkdownToHtml(e.body_markdown);
    chaptersHtml += `
    <div class="pdf-chapter">
        <span class="category-tag">${escapeHtml(e.category)}</span>
        <h2>${escapeHtml(e.name)}</h2>
        <p class="summary">${escapeHtml(e.summary)}</p>
        <div class="entity-body">${formattedBody}</div>
    </div>
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Compendium of the Realm</title>
    <style>
${WEASYPRINT_CSS}
    </style>
</head>
<body>
    <h1>Compendium of the Realm</h1>
    ${chaptersHtml}
</body>
</html>`;
}

/**
 * Generates an Obsidian / WorldAnvil compatible Markdown book.
 */
export function buildCompendiumMarkdown(entities: LoreEntity[], currentYear: number): string {
  const sortedEntities = [...entities].sort((a, b) => a.category.localeCompare(b.category));

  let md = `# Compendium of the Realm\n\n`;
  md += `*Compiled in Year ${currentYear} of the Sovereign Era*\n\n`;
  md += `---\n\n`;

  let currentCat = '';
  for (const e of sortedEntities) {
    if (e.category !== currentCat) {
      currentCat = e.category;
      md += `\n# Category: ${currentCat}\n\n`;
    }

    md += `## ${e.name}\n\n`;
    md += `**[${e.category}]** *${e.summary}*\n\n`;
    md += `${e.body_markdown}\n\n`;
    md += `---\n\n`;
  }

  return md;
}

/**
 * Generates a runnable Python script incorporating the user's exporter and the actual generated entities.
 */
export function generatePythonExporterScript(entities: LoreEntity[]): string {
  const jsonPayload = JSON.stringify(entities, null, 2);

  return `# Standalone Python Exporter Script
# Run via: pip install weasyprint
# python export_realm.py

import json
from weasyprint import HTML, CSS

entities = ${jsonPayload}

html_content = "<h1>Compendium of the Realm</h1>"
for e in sorted(entities, key=lambda x: x["category"]):
    html_content += f"""
    <div class="pdf-chapter">
        <span class="category-tag">{e['category']}</span>
        <h2>{e['name']}</h2>
        <p>{e['summary']}</p>
        <div>{e['body_markdown'].replace('\\n', '<br/>')}</div>
    </div>
    """

pdf_css = CSS(string="""
    @page { size: A4; margin: 2cm; }
    body { font-family: 'Georgia', serif; line-height: 1.6; }
    h1 { text-align: center; color: #2c3e50; }
    .pdf-chapter { page-break-inside: avoid; margin-bottom: 2em; border-bottom: 1px solid #ccc; }
    .category-tag { font-size: 0.8em; text-transform: uppercase; color: #7f8c8d; }
""")

HTML(string=html_content).write_pdf("WorldLoreBook.pdf", stylesheets=[pdf_css])
print("Successfully generated WorldLoreBook.pdf matching A4 Compendium format!")
`;
}

export function downloadTextFile(filename: string, content: string, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function convertMarkdownToHtml(md: string): string {
  let html = md;

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');

  // Tables
  if (html.includes('|')) {
    const lines = html.split('\n');
    let inTable = false;
    let tableHtml = '<table>';
    const newLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('|') && line.endsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableHtml = '<table>';
        }
        if (line.includes('---')) {
          continue; // Separator line
        }
        const cells = line
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());
        const tag = tableHtml === '<table>' ? 'th' : 'td';
        tableHtml += `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
      } else {
        if (inTable) {
          inTable = false;
          tableHtml += '</table>';
          newLines.push(tableHtml);
        }
        newLines.push(line);
      }
    }
    if (inTable) {
      tableHtml += '</table>';
      newLines.push(tableHtml);
    }
    html = newLines.join('\n');
  }

  // Unordered list items (group contiguous <li> lines without swallowing intervening blocks)
  html = html.replace(/^(?:- |\* )(.*)$/gim, '<li>$1</li>');
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/gim, '<ul>$1</ul>');

  // Paragraphs
  html = html
    .split('\n\n')
    .map((chunk) => {
      const trimmed = chunk.trim();
      if (
        trimmed.startsWith('<h3>') ||
        trimmed.startsWith('<h2>') ||
        trimmed.startsWith('<h1>') ||
        trimmed.startsWith('<ul>') ||
        trimmed.startsWith('<table>')
      ) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br/>')}</p>`;
    })
    .join('\n');

  return html;
}
