export const hasMembersIntent = flags => (BigInt(flags ?? 0) & ((1n << 14n) | (1n << 15n))) !== 0n;
