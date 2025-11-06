import { createContext } from "react";

export type ToastCtx = { push: (msg: string, type?: "success" | "error") => void };

export const ToastContext = createContext<ToastCtx | null>(null);
