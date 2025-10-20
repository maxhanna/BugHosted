const makeWalkingFrames = (rootFrame = 0) => {
  return {
    duration: 400,
    frames: [
      {
        time: 0,
        frame: rootFrame + 1
      },
      {
        time: 100,
        frame: rootFrame
      },
      {
        time: 200,
        frame: rootFrame + 1
      },
      {
        time: 300,
        frame: rootFrame + 2
      }
    ]
  }
}

const makeSideWalkingFrames = (rootFrame = 0) => {
  return {
    duration: 400,
    frames: [
      {
        time: 0,
        frame: rootFrame + 1
      },
      {
        time: 200,
        frame: rootFrame
      }, 
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


const makeAttackFrames = (rootFrame = 0, standing = 0) => {
  return {
    duration: 4000,
    frames: [
      {
        time: 0,
        frame: standing
      }, 
      {
        time: 2000,
        frame: rootFrame
      }, 
      {
        time: 4000,
        frame: standing
      }, 
    ]
  }
}

export const WALK_DOWN = makeWalkingFrames(5);
export const WALK_RIGHT = makeSideWalkingFrames(10);
export const WALK_UP = makeWalkingFrames(13);
export const WALK_LEFT = makeSideWalkingFrames(8);

export const STAND_DOWN = makeStandingDownFrames(1);
export const STAND_RIGHT = makeStandingFrames(11);
export const STAND_UP = makeStandingFrames(12);
export const STAND_LEFT = makeStandingFrames(9);  

export const ATTACK_LEFT = makeAttackFrames(17, 9);
export const ATTACK_DOWN = makeAttackFrames(18, 1);
export const ATTACK_RIGHT = makeAttackFrames(19, 11);
export const ATTACK_UP = makeAttackFrames(20, 12);

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
