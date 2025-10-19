export class PseudoRandom {
  seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }

  next() {
    // Linear Congruential Generator formula
    this.seed = (this.seed * 48271) % 2147483647;
    return this.seed / 2147483647; // Normalize to [0, 1)
  }
}
