const makeWalkingFrames = (rootFrame = 0) => {
  return {
    duration: 400,
    frames: [
      {
        time: 0,
        frame: rootFrame
      },
      {
        time: 100,
        frame: rootFrame + 1
      },
      {
        time: 200,
        frame: rootFrame + 2
      },
      {
        time: 300,
        frame: rootFrame + 3
      }
    ]
  }
}
 
const makeStandingDownFrames = (rootFrame = 0) => {
  return {
    duration: 2200,
    frames: [
      {
        time: 0,
        frame: rootFrame
      },
      {
        time: 725,
        frame: rootFrame + 1
      },
      {
        time: 1450,
        frame: rootFrame + 2
      },
      {
        time: 2200,
        frame: rootFrame + 3
      }
    ]
  }
}

const makeStandingFrames = (rootFrame = 0) => {
  return {
    duration: 400,
    frames: [
      {
        time: 0,
        frame: rootFrame
      }, 
    ]
  }
}


const makeAttackFrames = (rootFrame = 0) => {
  return {
    duration: 400,
    frames: [
      {
        time: 0,
        frame: rootFrame
      },  
      {
        time: 200,
        frame: rootFrame + 1
      },  
    ]
  }
}

export const WALK_DOWN = makeWalkingFrames(4);
export const WALK_RIGHT = makeWalkingFrames(16);
export const WALK_UP = makeWalkingFrames(8);
export const WALK_LEFT = makeWalkingFrames(12);

export const STAND_DOWN = makeWalkingFrames(24);
export const STAND_RIGHT = makeStandingFrames(17);
export const STAND_UP = makeStandingFrames(8);
export const STAND_LEFT = makeStandingFrames(12);  

export const ATTACK_LEFT = makeAttackFrames(22);
export const ATTACK_DOWN = makeAttackFrames(22);
export const ATTACK_RIGHT = makeAttackFrames(20);
export const ATTACK_UP = makeAttackFrames(20);

export const PICK_UP_DOWN = { 
  duration: 2500,
  frames: [
    {
      time: 0,
      frame: 21
    },
    {
      time: 400,
      frame: 22
    },
    {
      time: 800,
      frame: 23
    },
  ] 
}
