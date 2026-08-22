import { useCallback, useState } from "react";

// =============================================================================
// USE ANNOUNCER - the message half of a live region
// =============================================================================
//
// Paired with `LiveAnnouncer`, which renders the message. The sequence number
// is what lets the same text be announced twice: see the note there.

export interface Announcement {
  text: string;
  /** Increments on every announcement, including a repeat of the same text. */
  sequence: number;
}

export const EMPTY_ANNOUNCEMENT: Announcement = { text: "", sequence: 0 };

export interface UseAnnouncerReturn {
  announcement: Announcement;
  announce: (text: string) => void;
}

export const useAnnouncer = (): UseAnnouncerReturn => {
  const [announcement, setAnnouncement] =
    useState<Announcement>(EMPTY_ANNOUNCEMENT);

  const announce = useCallback((text: string) => {
    setAnnouncement((prev) => ({ text, sequence: prev.sequence + 1 }));
  }, []);

  return { announcement, announce };
};
