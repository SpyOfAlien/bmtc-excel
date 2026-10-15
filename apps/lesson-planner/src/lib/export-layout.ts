const columnBounds: ReadonlyArray<readonly [number, number]> = [[8, 12], [18, 30], [26, 38], [28, 48], [12, 14], [22, 34], [16, 28]];

function textWidth(text: string, fontSize: number): number {
  return Array.from(text.normalize("NFD").replace(/\p{M}/gu, "")).reduce((width, char) => {
    const weight = /[ilI.,'!:;|\s]/.test(char) ? 0.28 : /[MW@%]/.test(char) ? 0.9 : /[^\u0000-\u024f]/.test(char) ? 1 : 0.52;
    return width + weight * fontSize * 4 / 3;
  }, 0);
}

/** Excel widths use the width of a digit, approximately seven pixels at the default font. */
export function exportColumnWidths(rows: (string | number | boolean)[][]): number[] {
  return columnBounds.map(([minimum, maximum], column) => {
    const longest = Math.max(0, ...rows.map(row => Math.max(0, ...String(row[column] ?? "").split(/\r?\n/).map(line => textWidth(line, 10)))));
    return Math.min(maximum, Math.max(minimum, Math.ceil((longest + 12) / 7)));
  });
}

export function wrappedCellHeight(value: string | number | boolean, width: number, fontSize: number): number {
  const available = Math.max(7, width * 7 - 12);
  let lines = 0;
  for (const paragraph of String(value).split(/\r?\n/)) {
    let used = 0;
    lines++;
    for (const word of paragraph.split(/(\s+)/).filter(Boolean)) {
      const size = textWidth(word, fontSize);
      if (used && used + size > available) { lines++; used = 0; }
      if (!used && !word.trim()) continue;
      if (size > available) {
        const chunks = Math.ceil(size / available);
        lines += chunks - 1;
        used = size - (chunks - 1) * available;
      } else used += size;
    }
  }
  return Math.max(24, Math.ceil(lines * fontSize * 1.3 + 8));
}
