import fs from 'fs';
import { HEARTBEAT_FILE } from '../constants';
import logger from './logger';

// Writes are throttled to one per interval: beat() is called on every connection attempt and every
// keep-alive tick, and the probe that reads the file only needs a resolution of minutes.
export const HEARTBEAT_MIN_INTERVAL_MS = 5_000;

/**
 * A heartbeat file for a liveness probe. While the Agent's connection loop makes progress (a
 * connection attempt starts, the WebSocket opens or answers a keep-alive ping, a long poll
 * returns), beat() writes the current time, in whole seconds since the epoch, to HEARTBEAT_FILE. A
 * probe that finds the time too old restarts the Agent, which recovers a loop that has stopped with
 * nothing left to drive it.
 *
 * A failing connection attempt still counts as progress: restarting the Agent would not bring back
 * Fireblocks or a proxy that is down, it would only add restarts.
 *
 * Off unless HEARTBEAT_FILE is set (the Helm chart sets it), so nothing is written by default.
 * The file is written next to its final name and renamed into place, so a probe never reads it half
 * written. A write that fails is logged once until a later write succeeds, and never throws.
 */
export class Heartbeat {
  private lastWriteMs: number | undefined;
  private failing = false;

  constructor(
    private readonly file: string | undefined,
    private readonly now: () => number = Date.now,
  ) {}

  beat(): void {
    if (!this.file) {
      return;
    }
    const now = this.now();
    if (this.lastWriteMs !== undefined && now - this.lastWriteMs < HEARTBEAT_MIN_INTERVAL_MS) {
      return;
    }
    const staging = `${this.file}.tmp`;
    try {
      fs.writeFileSync(staging, `${Math.floor(now / 1000)}\n`);
      fs.renameSync(staging, this.file);
      this.lastWriteMs = now;
      this.failing = false;
    } catch (e) {
      if (!this.failing) {
        logger.warn(`HEARTBEAT_FILE could not be written (${this.file}): ${e?.code ?? 'error'}`);
        this.failing = true;
      }
    }
  }
}

export default new Heartbeat(HEARTBEAT_FILE);
