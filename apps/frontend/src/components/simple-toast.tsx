'use client';

import { useEffect, useState } from 'react';

const TOAST_EVENT = 'app-toast';

/**
 * 全局轻提示（自实现极简 toast，零依赖）。
 * 调用：showToast('消息') —— 任意组件/函数内可用，无需 Context。
 */
export function showToast(message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: message }));
}

export default function SimpleToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail;
      setMessage(msg);
      setVisible(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 3000);
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => {
      window.removeEventListener(TOAST_EVENT, handler);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visible || !message) return null;

  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[100] -translate-x-1/2">
      <div className="animate-[toastIn_0.2s_ease-out] rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white shadow-lg">
        {message}
      </div>
      <style>{`@keyframes toastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}
