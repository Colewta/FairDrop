import { useRef, useState } from 'react';

export default function FilePicker({ file, onChange, disabled = false }: { file: File | null; onChange: (file: File) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return <div className={`guided-file-picker ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled && event.dataTransfer.files[0]) onChange(event.dataTransfer.files[0]); }}>
    <span className="upload-symbol" aria-hidden="true">↑</span><strong>{file ? file.name : 'Arraste o arquivo ou escolha abaixo'}</strong><p>{file ? `${(file.size / 1024).toFixed(0)} KB · pronto para importar` : 'Formatos aceitos: CSV, Excel, TXT e TSV.'}</p>
    <input ref={input} className="accessible-file-input" aria-label="Arquivo da base" type="file" accept=".csv,.xlsx,.xls,.txt,.tsv,.data" disabled={disabled} onChange={event => { if (event.target.files?.[0]) onChange(event.target.files[0]); }} />
    <button type="button" onClick={() => input.current?.click()} disabled={disabled}>{file ? 'Trocar arquivo' : 'Escolher arquivo'}</button>
  </div>;
}
