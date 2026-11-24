// MUST be imported first in main.tsx, before any module that (transitively)
// imports @solana/web3.js — web3.js 1.x touches the Node `Buffer` global at
// module-evaluation time, and browsers don't have it.
import { Buffer } from "buffer";

(window as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
