export class ColorSwap {
  originalRGB: number[];
  replacementRGB: number[];
  constructor(originalRGBValue: number[], replacementRGBValue: number[]) {
    this.originalRGB = originalRGBValue;
    this.replacementRGB = replacementRGBValue;
  }
}
