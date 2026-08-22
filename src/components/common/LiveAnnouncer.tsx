import type { FC } from "react";
import type { Announcement } from "../../hooks/useAnnouncer";

// =============================================================================
// LIVE ANNOUNCER
// =============================================================================
//
// A screen reader only hears a live region when its *content changes*. Two
// identical announcements in a row - "no cell available in that direction",
// twice - would therefore be silent the second time. So the message alternates
// between two regions: each announcement lands in the region the previous one
// did not occupy, which is always a change.

interface LiveAnnouncerProps {
  announcement: Announcement;
  /**
   * Assertive by default: every announcement here is the direct result of a
   * key the user just pressed, and a queued response would arrive after the
   * next one.
   */
  politeness?: "polite" | "assertive";
}

const LiveAnnouncer: FC<LiveAnnouncerProps> = ({
  announcement,
  politeness = "assertive",
}) => {
  const slot = announcement.sequence % 2;
  return (
    <div className="sr-only">
      <div role="status" aria-live={politeness} aria-atomic="true">
        {slot === 0 ? announcement.text : ""}
      </div>
      <div role="status" aria-live={politeness} aria-atomic="true">
        {slot === 1 ? announcement.text : ""}
      </div>
    </div>
  );
};

export default LiveAnnouncer;
