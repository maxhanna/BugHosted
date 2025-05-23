import { FrameIndexPattern } from "./frame-index-pattern";

export class Animations {
  patterns: Record<string, FrameIndexPattern>;
  activeKey: string;

  constructor(patterns: Record<string, FrameIndexPattern>) {
    this.patterns = patterns;
    this.activeKey = Object.keys(this.patterns)[0];

  }
  get frame() {
    if (this.patterns[this.activeKey]) { 
      return this.patterns[this.activeKey].frame;
    }
    return 0;
  }

  play(key: string, startAtTime = 0) {
    if (this.activeKey === key) {
      return;
    }
    this.activeKey = key;
    if (this.patterns[this.activeKey]) {
      this.patterns[this.activeKey].currentTime = startAtTime;
    }  
  }
  
  step(delta: number) {
    if (this.patterns[this.activeKey]) { 
      this.patterns[this.activeKey].step(delta);
    }
  }
}
