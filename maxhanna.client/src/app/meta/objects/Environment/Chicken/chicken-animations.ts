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

const makeSideWalkingFrames = (rootFrame = 0) => {
  return {
    duration: 800,
    frames: [
      {
        time: 0,
        frame: rootFrame
      },
      {
        time: 200,
        frame: rootFrame + 1
      },
      {
        time: 400,
        frame: rootFrame + 2
      },
      {
        time: 600,
        frame: rootFrame + 3
      }, 
    ]
  }
}

const makeStandingDownFrames = (rootFrame = 0) => {
  return {
    duration: 4000,
    frames: [
      {
        time: 0,
        frame: rootFrame
      },
      {
        time: 1000,
        frame: rootFrame + 1
      },
      {
        time: 2000,
        frame: rootFrame + 2
      },
      {
        time: 3000,
        frame: rootFrame + 3
      }
    ]
  }
}

const makeStandingFrames = (rootFrame = 0) => {
  return {
    duration: 2000,
    frames: [
      {
        time: 0,
        frame: rootFrame
      },
      {
        time: 500,
        frame: rootFrame + 1
      },
      {
        time: 1000,
        frame: rootFrame + 2
      },
      {
        time: 1500,
        frame: rootFrame + 3
      }
    ]
  }
}

export const WALK_DOWN = makeWalkingFrames(20);
export const WALK_RIGHT = makeSideWalkingFrames(12);
export const WALK_UP = makeWalkingFrames(28);
export const WALK_LEFT = makeSideWalkingFrames(8);

export const STAND_DOWN = makeStandingDownFrames(16);
export const STAND_RIGHT = makeStandingFrames(4);
export const STAND_UP = makeStandingFrames(24);
export const STAND_LEFT = makeStandingFrames(0);

export const PICK_UP_DOWN = { 
  duration: 2500,
  frames: [
    {
      time: 0,
      frame: 16
    },
    {
      time: 400,
      frame: 17
    },
    {
      time: 800,
      frame: 18
    },
  ] 
}
