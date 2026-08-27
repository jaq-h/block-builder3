/**
 * Registered subscription **intent**, which is a different thing from live
 * connection state and is deliberately held in a different type.
 *
 * Nothing here knows a socket exists. A key is what the app has asked to be
 * subscribed to; whether a frame has gone out, whether one ever will, and
 * whether the connection carrying it is up are all questions for
 * `SocketLifecycle`. Keeping the two apart is what makes the awkward cases
 * fall out rather than need handling:
 *
 * - A connect that fails keeps the intent, so the replay on the next
 *   successful open establishes the channel. Dropping it is what left the app
 *   connected and subscribed to nothing whenever the very first connect
 *   failed, since no consumer ever asks for a channel a second time.
 * - A key the registry already holds is still a reason to want a connection.
 *   That is the app's only route back from a socket that gave up reconnecting.
 *
 * `refs` counts the consumers that asked for a channel. Two components call
 * `useKrakenAPI` today and both subscribe the same ticker, so an unrefcounted
 * release from either would take the feed away from the other.
 */

interface Registration {
  message: Record<string, unknown>;
  refs: number;
}

export class SubscriptionRegistry {
  private readonly entries = new Map<string, Registration>();

  /**
   * Record one consumer's interest in `key`.
   *
   * Returns whether this registered a channel the app did not already want,
   * which is the only case where a frame may have to be sent by hand: an
   * existing key is already in the replay set.
   */
  acquire(key: string, message: Record<string, unknown>): boolean {
    const existing = this.entries.get(key);
    if (existing) {
      existing.refs += 1;
      return false;
    }
    this.entries.set(key, { message, refs: 1 });
    return true;
  }

  /**
   * Release one consumer's interest.
   *
   * Returns whether that was the last one, meaning the channel is no longer
   * wanted and must not be replayed after a reconnect. An unknown key releases
   * nothing.
   */
  release(key: string): boolean {
    const existing = this.entries.get(key);
    if (!existing) return false;

    existing.refs -= 1;
    if (existing.refs > 0) return false;

    this.entries.delete(key);
    return true;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** Every registered key, in the order it was first asked for. */
  keys(): string[] {
    return [...this.entries.keys()];
  }

  /** Every frame that has to go out to make a fresh socket match the intent. */
  frames(): Record<string, unknown>[] {
    return [...this.entries.values()].map((entry) => entry.message);
  }

  clear(): void {
    this.entries.clear();
  }
}
