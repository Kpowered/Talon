import { useCallback, useEffect, useState } from "react";
import type { ActionNotice } from "../types/app";

export function useActionNotice() {
  const [notice, setNotice] = useState<ActionNotice | null>(null);

  const clearNotice = useCallback(() => {
    setNotice(null);
  }, []);

  useEffect(() => {
    if (!notice) return;

    const timeout = window.setTimeout(() => {
      setNotice((current) => (current === notice ? null : current));
    }, notice.kind === "error" ? 6500 : 4200);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [notice]);

  return {
    notice,
    setNotice,
    clearNotice,
  };
}
