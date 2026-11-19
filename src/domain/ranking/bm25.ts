export const DEFAULT_K1 = 1.2;
export const DEFAULT_B = 0.75;

export function validateBm25Parameters(k1: number, b: number): void {
  if (!Number.isFinite(k1) || k1 < 0) {
    throw new RangeError(`k1 must be a non-negative finite number, got ${k1}`);
  }
  if (!Number.isFinite(b) || b < 0 || b > 1) {
    throw new RangeError(`b must be a finite number between 0 and 1, got ${b}`);
  }
}

export function computeIdf(documentCount: number, documentFrequency: number): number {
  return Math.log(1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5));
}

export function computeLengthNorm(docLength: number, avgDocLength: number, b: number): number {
  return 1 - b + b * (docLength / avgDocLength);
}

export function computeTermScore(
  tf: number,
  lengthNorm: number,
  termIdf: number,
  k1: number,
): number {
  if (tf === 0) {
    return 0;
  }

  const numerator = tf * (k1 + 1);
  const denominator = tf + k1 * lengthNorm;
  return termIdf * (numerator / denominator);
}
