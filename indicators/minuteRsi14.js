'use strict';

// oldest ticks in the beginning
function minuteRsi14(ticks) {

  // construct minute array with 30 ticks (for smoothing)
  const minuteTicks = [ticks[ticks.length - 1]];
  let currentTickPos = ticks.length - 2;

  while(minuteTicks.length < 30 && currentTickPos > -1) {
    const currentTick = ticks[currentTickPos];
    const lastMinuteTick = minuteTicks[0];

    const nextMinuteTickTimestamp = lastMinuteTick.timestamp - 60 * 1000;
    if(currentTick.timestamp < nextMinuteTickTimestamp) {
      minuteTicks.unshift(currentTick);
    }

    currentTickPos--;
  }

  // initial averages
  let initialTotalGains = 0;
  let initialTotalLosses = 0;

  minuteTicks.slice(0,15)
    .forEach((t, i, arr) => {
      if(i === arr.length - 1) return;

      const avg1 = (t.bid + t.ask) / 2;
      const avg2 = (arr[i+1].bid + arr[i+1].ask) / 2;

      const currentGain = Math.max(avg2 - avg1, 0);
      const currentLoss = Math.max(avg1 - avg2, 0);

      initialTotalGains += currentGain;
      initialTotalLosses += currentLoss;
    });

  let averageGain = initialTotalGains / 14;
  let averageLoss = initialTotalLosses / 14;

  // subsequent averages if there are more than 15 minutes of ticks
  for(let i = 16; i < minuteTicks.length; i++) {
    const lastTick = minuteTicks[i-1];
    const currentTick = minuteTicks[i];

    const avg1 = (lastTick.bid + lastTick.ask) / 2;
    const avg2 = (currentTick.bid + currentTick.ask) / 2;

    const currentGain = Math.max(avg2 - avg1, 0);
    const currentLoss = Math.max(avg1 - avg2, 0);

    averageGain = ((averageGain * 13) + currentGain) / 14;
    averageLoss = ((averageLoss * 13) + currentLoss) / 14;
  }

  return 100 - 100 / (1 + averageGain / averageLoss);
}

module.exports = minuteRsi14;
