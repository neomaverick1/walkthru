// Short messages at the bottom of the screen.

type Toast = { id: number; text: string };
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
let toastId = 0;
export function toast(text: string) {
  const t = { id: ++toastId, text };
  toasts = [...toasts, t];
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    toastListeners.forEach((l) => l());
  }, 2600);
}
export const subscribeToasts = (l: () => void) => {
  toastListeners.add(l);
  return () => toastListeners.delete(l);
};
export const getToasts = () => toasts;
