import { useCallback, useState } from "react";
import { ToastContext } from "./ToastContext";
import { XMarkIcon, CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

type ToastItem = { id: number; msg: string; type: "success" | "error" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((msg: string, type: "success" | "error" = "success") => {
    const id = Date.now() + Math.random();
    setItems(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const close = (id: number) => setItems(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-4 right-4 space-y-2 z-50">
        {items.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm border shadow-lg
              ${t.type === "success"
                ? "bg-white dark:bg-slate-900 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300"
                : "bg-white dark:bg-slate-900 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"}`}>
            {t.type === "success" ? (
              <CheckCircleIcon className="h-4 w-4" />
            ) : (
              <ExclamationTriangleIcon className="h-4 w-4" />
            )}
            <div>{t.msg}</div>
            <button onClick={() => close(t.id)} className="ml-2 opacity-70 hover:opacity-100">
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
