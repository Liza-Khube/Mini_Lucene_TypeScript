export class DuplicateSourceError extends Error {
  constructor(source: string) {
    super(`Document source "${source}" is already indexed`);
    this.name = 'DuplicateSourceError';
  }
}

export class InvalidTokenPositionError extends Error {
  constructor(position: number, previousPosition: number) {
    super(
      `Invalid token position ${position}: positions must be strictly ascending positive integers (previous: ${previousPosition})`,
    );
    this.name = 'InvalidTokenPositionError';
  }
}
