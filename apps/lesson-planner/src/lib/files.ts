export function validPeriod(month: number, year: number) {
  return Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year) && year >= 1900 && year <= 9999;
}

export function nextFilename(base: string, existingNames: Iterable<string>, originalName: string): string {
  const occupied = new Set(Array.from(existingNames, name => name.toLocaleLowerCase()));
  occupied.add(originalName.toLocaleLowerCase());
  let candidate = base, version = 2;
  while (occupied.has(candidate.toLocaleLowerCase())) candidate = base.replace(/\.xlsx$/i, `_v${version++}.xlsx`);
  return candidate;
}

export async function saveInDirectory({ directory, bytes, filename, originalName }: {
  directory: FileSystemDirectoryHandle; bytes: Uint8Array; filename: string; originalName: string;
}) {
  const names: string[] = [];
  for await (const entry of directory.values()) names.push(entry.name);
  const name = nextFilename(filename, names, originalName);
  const handle = await directory.getFileHandle(name, { create: true });
  if ((await handle.getFile()).size) throw new Error("File vừa được tạo bởi ứng dụng khác. Hãy nhấn lưu lại để chọn tên mới.");
  const writer = await handle.createWritable();
  try { await writer.write(new Uint8Array(bytes)); await writer.close(); }
  catch (error) { await writer.abort().catch(() => undefined); throw error; }
  return name;
}

export function workbookDownloadUrl(bytes: Uint8Array) {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  return URL.createObjectURL(blob);
}
