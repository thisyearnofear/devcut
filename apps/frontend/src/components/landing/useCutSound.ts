"use client";

import { useCallback, useEffect, useState } from "react";
import { bind, play, setEnabled, setVolume } from "cuelume";

const STORAGE_KEY = "devcut-sound";

/**
 * Landing sounds via Cuelume — muted by default.
 * Door clip → tick · hard-cut → page · intro arm → ready
 */
export function useCutSound() {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    setVolume(0.55);
    let on = false;
    try {
      on = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      /* ignore */
    }
    setArmed(on);
    setEnabled(on);
    // Declarative attrs under landing — avoid hover on every link
    bind();
  }, []);

  const toggle = useCallback(() => {
    setArmed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      setEnabled(next);
      if (next) play("toggle");
      return next;
    });
  }, []);

  const playCut = useCallback(() => {
    play("tick");
  }, []);

  const playRec = useCallback(() => {
    play("ready", { volume: 0.35 });
  }, []);

  const playCanvasCut = useCallback(() => {
    play("page");
  }, []);

  return { armed, toggle, playCut, playRec, playCanvasCut };
}
