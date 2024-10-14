const makeWaterFrames = (rootFrame = 0) => {
  return {
    duration: 1700,
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
      },
      {
        time: 400,
        frame: rootFrame + 4
      },
      {
        time: 500,
        frame: rootFrame + 5
      },
      {
        time: 600,
        frame: rootFrame + 6
      },
      {
        time: 700,
        frame: rootFrame + 7
      },
      {
        time: 800,
        frame: rootFrame + 8
      },
      {
        time: 900,
        frame: rootFrame + 9
      },
      {
        time: 1000,
        frame: rootFrame + 10
      },
      {
        time: 1100,
        frame: rootFrame + 11
      },
      {
        time: 1200,
        frame: rootFrame + 12
      },
      {
        time: 1300,
        frame: rootFrame + 13
      },
      {
        time: 1400,
        frame: rootFrame + 14
      },
      {
        time: 1500,
        frame: rootFrame + 15
      },
      {
        time: 1600,
        frame: rootFrame + 16
      }
    ]
  }
}
 
export const WATER_STILL = makeWaterFrames(0); 
