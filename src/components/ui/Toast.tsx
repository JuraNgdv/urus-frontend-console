"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type FlashFn = (message: string) => void;

const ToastContext = createContext<FlashFn | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback<FlashFn>((msg) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(msg);
    timer.current = setTimeout(() => setMessage(""), 2200);
  }, []);

  return (
    <ToastContext.Provider value={flash}>
      {children}
      {message && <div className="urus-toast">{message}</div>}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
