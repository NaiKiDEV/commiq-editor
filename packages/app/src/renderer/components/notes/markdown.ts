// Lightweight, dependency-free Markdown -> HTML renderer for the Notes panel.
// Output is injected via dangerouslySetInnerHTML, so every value that
// originates from note content is escaped before it reaches the DOM.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const html: string[] = [];
  let inCodeBlock = false;
  let codeLang = '';
  let codeLines: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let tableRows: string[] = [];

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const parseRow = (row: string) => row.split('|').slice(1, -1).map((c) => c.trim());
    const headers = parseRow(tableRows[0]);
    // Determine alignment from separator row (row index 1)
    const aligns: ('left' | 'center' | 'right' | null)[] = headers.map(() => null);
    if (tableRows.length > 1) {
      const sepCells = parseRow(tableRows[1]);
      sepCells.forEach((cell, i) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        if (left && right) aligns[i] = 'center';
        else if (right) aligns[i] = 'right';
        else if (left) aligns[i] = 'left';
      });
    }
    const alignAttr = (i: number) => aligns[i] ? ` style="text-align:${aligns[i]}"` : '';
    let t = '<table class="my-3 w-full text-sm border border-border/60 rounded-md overflow-hidden border-collapse">';
    t += '<thead><tr class="bg-muted/40 border-b border-border">';
    headers.forEach((h, i) => { t += `<th class="px-2.5 py-1.5 text-left font-semibold text-foreground/80"${alignAttr(i)}>${inline(h)}</th>`; });
    t += '</tr></thead><tbody>';
    const dataRows = tableRows.slice(2); // skip header + separator
    dataRows.forEach((row) => {
      const cells = parseRow(row);
      t += '<tr class="border-b border-border/40 last:border-0">';
      headers.forEach((_, i) => { t += `<td class="px-2.5 py-1.5"${alignAttr(i)}>${inline(cells[i] ?? '')}</td>`; });
      t += '</tr>';
    });
    t += '</tbody></table>';
    html.push(t);
    tableRows = [];
  };

  const flushList = () => {
    if (inList) { html.push(inList === 'ul' ? '</ul>' : '</ol>'); inList = null; }
  };

  const flushAll = () => { flushList(); flushTable(); };

  const inline = (text: string): string => {
    let result = escapeHtml(text);
    result = result.replace(/`([^`]+)`/g, '<code class="bg-muted/60 px-1 py-0.5 rounded text-[0.85em] font-mono text-foreground/90">$1</code>');
    result = result.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*(.+?)\*/g, '<em>$1</em>');
    result = result.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // only allow safe URL schemes to prevent javascript: injection
    const safeHref = (url: string) => /^(https?:|mailto:)/i.test(url) ? url : '#';
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) =>
      `<a href="${safeHref(url)}" class="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary">${text}</a>`,
    );
    result = result.replace(/(^|[^"=])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" class="text-primary underline underline-offset-2 decoration-primary/40 hover:decoration-primary">$2</a>');
    return result;
  };

  const renderCodeBlock = (): string => {
    const langBadge = codeLang
      ? `<span class="absolute top-1.5 right-2.5 text-[10px] text-muted-foreground/40 uppercase tracking-wide select-none">${escapeHtml(codeLang)}</span>`
      : '';
    return `<pre class="relative bg-muted/40 border border-border/60 rounded-lg p-3 pr-12 my-3 overflow-x-auto font-mono text-xs leading-relaxed">${langBadge}<code>${escapeHtml(codeLines.join('\n'))}</code></pre>`;
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        html.push(renderCodeBlock());
        inCodeBlock = false;
        codeLines = [];
      } else {
        flushAll();
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }
    if (inCodeBlock) { codeLines.push(line); continue; }

    if (!line.trim()) { flushAll(); html.push(''); continue; }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      const sizes = [
        'text-xl font-bold mt-5 mb-2 pb-1 border-b border-border/50',
        'text-lg font-bold mt-4 mb-1.5',
        'text-base font-semibold mt-3 mb-1',
        'text-sm font-semibold mt-3 mb-1',
        'text-sm font-medium mt-2 mb-1 text-foreground/90',
        'text-xs font-medium mt-2 mb-1 text-muted-foreground uppercase tracking-wide',
      ];
      html.push(`<h${level} class="${sizes[level - 1]}">${inline(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      flushAll();
      html.push('<hr class="border-border my-4" />');
      continue;
    }

    if (line.startsWith('> ')) {
      flushAll();
      html.push(`<blockquote class="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground italic">${inline(line.slice(2))}</blockquote>`);
      continue;
    }

    const cbMatch = line.match(/^- \[([ xX])\]\s+(.+)/);
    if (cbMatch) {
      flushAll();
      const checked = cbMatch[1] !== ' ';
      const box = checked
        ? '<span class="mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-[5px] bg-primary border border-primary text-primary-foreground"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></span>'
        : '<span class="mt-[3px] flex size-4 shrink-0 rounded-[5px] border border-muted-foreground/40 bg-background"></span>';
      html.push(`<div class="flex items-start gap-2 my-1">${box}<span class="${checked ? 'line-through text-muted-foreground' : 'text-foreground/90'}">${inline(cbMatch[2])}</span></div>`);
      continue;
    }

    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)/);
    if (ulMatch) {
      if (inList !== 'ul') { flushAll(); html.push('<ul class="list-disc list-outside space-y-0.5 my-2 ml-5">'); inList = 'ul'; }
      html.push(`<li class="pl-0.5">${inline(ulMatch[2])}</li>`);
      continue;
    }

    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)/);
    if (olMatch) {
      if (inList !== 'ol') { flushAll(); html.push('<ol class="list-decimal list-outside space-y-0.5 my-2 ml-5">'); inList = 'ol'; }
      html.push(`<li class="pl-0.5">${inline(olMatch[2])}</li>`);
      continue;
    }

    if (line.trimStart().startsWith('|') && line.trimEnd().endsWith('|')) {
      flushList();
      tableRows.push(line);
      continue;
    }

    flushAll();
    html.push(`<p class="my-2 leading-relaxed">${inline(line)}</p>`);
  }

  flushAll();
  if (inCodeBlock) html.push(renderCodeBlock());
  return html.join('\n');
}
