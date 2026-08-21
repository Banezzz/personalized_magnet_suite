/**
 * Timing helpers with optional jitter.
 */

import { DEFAULTS } from './constants.js';

export function delay(ms, { jitterRatio = DEFAULTS.jitterRatio } = {}) {
  const jitter = (Math.random() - 0.5) * 2 * jitterRatio;
  const actual = Math.max(0, ms * (1 + jitter));
  return new Promise((resolve) => setTimeout(resolve, actual));
}

export function randomBetween(minMs, maxMs) {
  const min = Number(minMs);
  const max = Number(maxMs);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return Math.max(0, min || 0);
  }
  return min + Math.random() * (max - min);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
