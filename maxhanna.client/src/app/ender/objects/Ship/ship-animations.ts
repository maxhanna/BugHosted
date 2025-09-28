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
    duration: 500,
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
    duration: 6000,
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
        time: 5000,
        frame: rootFrame + 1
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

export const WALK_DOWN = makeWalkingFrames(4);
export const WALK_RIGHT = makeSideWalkingFrames(10);
export const WALK_UP = makeWalkingFrames(12);
export const WALK_LEFT = makeSideWalkingFrames(8);

export const STAND_DOWN = makeStandingDownFrames(1);
export const STAND_RIGHT = makeStandingFrames(10);
export const STAND_UP = makeStandingFrames(12);
export const STAND_LEFT = makeStandingFrames(8);

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

export const ATTACK_LEFT = {
  duration: 1000,
  frames: [
    {
      time: 0,
      frame: 18
    },
  ]
}
export const ATTACK_RIGHT = {
  duration: 1000,
  frames: [
    {
      time: 0,
      frame: 17
    },
  ]
}
export const ATTACK_DOWN = {
  duration: 1000,
  frames: [
    {
      time: 0,
      frame: 16
    },
  ]
}

export const ATTACK_UP = {
  duration: 1000,
  frames: [
    {
      time: 0,
      frame: 19
    },
  ]
}
