/**
 * World ID signal hashing.
 *
 * `hashToField(x) = keccak256(x) >> 8` — the shift keeps the digest inside the
 * BN254 scalar field the circuit works over.
 *
 * The input encoding is the part that is easy to get wrong. IDKit's own
 * implementation (`idkit-core/build/chunk-*.js`, `src/lib/hashing.ts`) branches:
 *
 *     hashToField(input) =
 *       Bytes.validate(input) || Hex.validate(input)  ->  hash the RAW BYTES
 *       otherwise                                     ->  hash the UTF-8 string
 *
 * A wallet address is valid hex, so the signal is hashed as **20 raw bytes**, not
 * as its 42-character text form. Hashing the string instead produces a different
 * field element, the proof fails to verify, and the error surfaces as a generic
 * verification failure with nothing pointing at the encoding.
 *
 * `idkit-core@1.5.0` does not re-export `hashToField` from the package root, so it
 * is reimplemented here rather than reached into via a deep import.
 *
 * Verified against the documented default for an empty signal:
 *   hashToField("") === 0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4
 */
import { getBytes, keccak256, toUtf8Bytes } from "ethers";

/** Documented default when no signal is bound to the proof. */
export const EMPTY_SIGNAL_HASH =
  "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4";

const HEX = /^0x[0-9a-fA-F]*$/;

/** True when IDKit would take the raw-bytes branch for this input. */
export function isHexInput(input: string): boolean {
  return HEX.test(input) && input.length % 2 === 0;
}

/**
 * Compute `signal_hash` exactly as IDKit does client-side.
 *
 * Must match the value baked into the proof, or verification fails.
 */
export function hashSignal(signal: string | undefined | null): string {
  if (signal === undefined || signal === null || signal === "") {
    return EMPTY_SIGNAL_HASH;
  }
  const bytes = isHexInput(signal) ? getBytes(signal) : toUtf8Bytes(signal);
  const shifted = BigInt(keccak256(bytes)) >> 8n;
  return `0x${shifted.toString(16).padStart(64, "0")}`;
}
