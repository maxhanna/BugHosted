export interface Scenario {
  string: string;
  requires?: string[]; // Flags that are required
  bypass?: string[];   // Flags that can skip conditions
  addsFlag?: string;   // Flag to be added when this scenario is used
}

class StoryFlags {
  flags: Map<string, boolean> = new Map();
  constructor() { 
  }

  add(flag: string) {
    this.flags.set(flag, true);
  }

  getRelevantScenario(scenarios: Scenario[]) {
    return scenarios.find(scenario => {
      //disqualify when any bypass flags are present
      const bypassFlags = scenario.bypass ?? [];
      for (let i = 0; i < bypassFlags.length; i++) {
        const thisFlag = bypassFlags[i];
        if (this.flags.has(thisFlag)) {
          return false;
        }
      }
      //disqualify if we find a missing required flag
      const requiredFlags = scenario.requires ?? [];
      for (let i = 0; i < requiredFlags.length; i++) {
        const thisFlag = requiredFlags[i];
        if (!this.flags.has(thisFlag)) {
          return false;
        }
      }

      //if we made it this far, this scenario is relevant.
      return true;
    });
  }
}

export const TALKED_TO_A = 'TALKED_TO_A';
export const TALKED_TO_B = 'TALKED_TO_B';
export const storyFlags = new StoryFlags();
