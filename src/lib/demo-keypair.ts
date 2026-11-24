// Shared demo player wallet — INTENTIONALLY PUBLIC.
// Devnet only, holds ~1 worthless test SOL. Every visitor to the public
// demo plays as this one player, so packs open instantly with no faucet
// step (the public devnet faucet is closed). Anyone can drain the test
// SOL; worst case the demo stops opening packs until it is refilled from
// the test wallet (scripts/setup-demo-wallet.ts). NEVER put mainnet or
// funded keys in a file like this.
export const DEMO_SECRET: number[] = [75,36,185,244,218,188,244,58,19,10,175,83,161,179,56,24,184,23,48,29,252,51,209,137,158,226,20,29,233,230,139,255,109,89,227,66,206,102,244,123,119,32,27,0,32,117,3,129,218,191,180,60,33,166,251,179,131,39,169,152,118,131,117,142];
export const DEMO_ADDRESS = "8MrwJUAzchgzRsw1xRgeNNvW3yr9u8fwRcA8o5qwixmK";
