// Adapted from MagicBlock's official roll-dice example
// (https://github.com/magicblock-labs/magicblock-engine-examples/tree/main/roll-dice/anchor/app)
// MIT-licensed example code, adapted for Pack Blitz (Solana Blitz v10).
export type RollEntry = {
  value: number | null;
  startTime: number;
  endTime: number | null;
  isPending: boolean;
  timedOut?: boolean;
  signature?: string;
};

export type CachedBlockhash = {
  blockhash: string;
  lastValidBlockHeight: number;
  timestamp: number;
  endpoint: string;
};
