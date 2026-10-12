export function toSafeNumber(value: number | bigint | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const converted = typeof value === "bigint" ? Number(value) : value;
  return Number.isFinite(converted) && Number.isSafeInteger(converted) ? converted : null;
}

export function toSafeBigInt(value: number): bigint | null {
  return Number.isSafeInteger(value) ? BigInt(value) : null;
}
