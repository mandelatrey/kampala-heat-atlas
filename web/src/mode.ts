import { useEffect, useState } from "react";

/** How the atlas speaks: plain words first ("simple"), or the research write-up ("detailed"). */
export type Mode = "simple" | "detailed";
const KEY = "kha-mode";
const EVENT = "kha-mode";

function read(): Mode {
  try {
    return localStorage.getItem(KEY) === "detailed" ? "detailed" : "simple";
  } catch {
    return "simple";
  }
}

/** The reading mode, shared by every component that asks and remembered per browser (a convenience only). */
export function useMode(): [Mode, (m: Mode) => void] {
  const [mode, setMode] = useState<Mode>(read);
  useEffect(() => {
    const sync = () => setMode(read());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const choose = (m: Mode) => {
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* private mode: this component still switches */
    }
    setMode(m);
    window.dispatchEvent(new Event(EVENT));
  };
  return [mode, choose];
}
