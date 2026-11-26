export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadJson(value: unknown, filename: string) {
  saveBlob(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), filename);
}
