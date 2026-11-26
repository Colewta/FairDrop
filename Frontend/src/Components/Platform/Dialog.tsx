import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

export default function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className="workspace-dialog" aria-labelledby={heading} onCancel={e => { e.preventDefault(); onClose(); }}>
    <div className="section-heading"><h2 id={heading}>{title}</h2><button type="button" onClick={onClose} aria-label="Fechar janela">×</button></div>{children}
  </dialog>;
}
