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

const makeStandingDownFrames = (rootFrame = 0) => {
  return {
    duration: 1200,
    frames: [
      {
        time: 0,
        frame: rootFrame
      },
      {
        time: 300,
        frame: rootFrame + 1
      },
      {
        time: 600,
        frame: rootFrame + 2
      },
      {
        time: 900,
        frame: rootFrame + 3
      }, 
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

export const WALK_DOWN = makeWalkingFrames(4);
export const WALK_RIGHT = makeSideWalkingFrames(10);
export const WALK_UP = makeWalkingFrames(12);
export const WALK_LEFT = makeSideWalkingFrames(8);

export const STAND_DOWN = makeStandingDownFrames(0);
export const STAND_RIGHT = makeStandingFrames(11);
export const STAND_UP = makeStandingFrames(12);
export const STAND_LEFT = makeStandingFrames(9);
