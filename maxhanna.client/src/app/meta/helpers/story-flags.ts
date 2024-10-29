import { events } from "./events";

export interface Scenario {
  string: string[];
  requires?: string[]; // Flags that are required
  bypass?: string[];   // Flags that can skip conditions
  addsFlag?: string;   // Flag to be added when this scenario is used
  canSelectItems?: boolean; //can select the menu items passed in
}

class StoryFlags {
  flags: Map<string, boolean> = new Map();
  constructor() { 
  }

  add(flag: string) {
    this.flags.set(flag, true);
  }

  contains(flag: string): boolean {
    return this.flags.has(flag);
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


export const CHARACTER_CREATE_STORY_TEXT_1 = "CHARACTER_CREATE_STORY_TEXT_1";
export const CHARACTER_CREATE_STORY_TEXT_2 = "CHARACTER_CREATE_STORY_TEXT_2";
export const CHARACTER_CREATE_STORY_TEXT_3 = "CHARACTER_CREATE_STORY_TEXT_3";
export const CHARACTER_CREATE_STORY_TEXT_4 = "CHARACTER_CREATE_STORY_TEXT_4";
export const CHARACTER_CREATE_STORY_TEXT_5 = "CHARACTER_CREATE_STORY_TEXT_5";
export const CHARACTER_CREATE_STORY_TEXT_6 = "CHARACTER_CREATE_STORY_TEXT_6";
export const CHARACTER_CREATE_STORY_TEXT_7 = "CHARACTER_CREATE_STORY_TEXT_7"; 
export const CHARACTER_CREATE_STORY_TEXT_8 = "CHARACTER_CREATE_STORY_TEXT_8"; 
export const GOT_FIRST_METABOT = "GOT_FIRST_METABOT"
export const GOT_WATCH = "GOT_WATCH"; 
export const TALKED_TO_A = 'TALKED_TO_A';
export const TALKED_TO_B = 'TALKED_TO_B';
export const TALKED_TO_BRUSH_SHOP_OWNER0 = "TALKED_TO_BRUSH_SHOP_OWNER0";
export const TALKED_TO_BRUSH_SHOP_OWNER1 = "TALKED_TO_BRUSH_SHOP_OWNER1";
export const TALKED_TO_BRUSH_SHOP_OWNER2 = "TALKED_TO_BRUSH_SHOP_OWNER2";
export const TALKED_TO_MOM_ABOUT_DAD = "TALKED_TO_MOM_ABOUT_DAD";
export const TALKED_TO_MOM_ABOUT_WATCH = "TALKED_TO_MOM_ABOUT_WATCH";
export const TALKED_TO_MOM = "TALKED_TO_MOM";
export const START_FIGHT = "START_FIGHT"; 

export const storyFlags = new StoryFlags();
