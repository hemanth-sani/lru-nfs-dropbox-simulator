// import { useContext } from "react";
// import { ToastContext } from "./ToastContext";

// export function useToast() {
//   const ctx = useContext(ToastContext);
//   if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
//   return ctx;
// }
export function useToast() {
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    push: (..._args: unknown[]) => {
      // Disabled for cleaner UI
    },
  };
}