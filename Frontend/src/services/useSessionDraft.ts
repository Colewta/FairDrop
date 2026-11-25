import { useEffect, useState } from 'react';

// Apenas preferências e configuração; arquivos e dados dos alunos não entram no storage.
export function useSessionDraft<T>(key: string, initial: T) {
  const storageKey = `fairdrop:workspace:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved === null) return initial;
      const parsed = JSON.parse(saved);
      return initial !== null && typeof initial === 'object' && !Array.isArray(initial)
        ? { ...initial, ...parsed } : parsed;
    } catch { return initial; }
  });
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Storage indisponível: manter a sessão em memória. */ } }, [storageKey, value]);
  return [value, setValue] as const;
}

const files = new Map<string, File>();
export function useMemoryFile(key: string) {
  const [file, setFile] = useState<File | null>(() => files.get(key) ?? null);
  function change(next: File | null) { if (next) files.set(key, next); else files.delete(key); setFile(next); }
  return [file, change] as const;
}
