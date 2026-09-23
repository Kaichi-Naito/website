export const PRACTICE_RATES = Object.freeze([.5,.6,.7,.8,.9,1]);
export function practiceRate(value) {
  const rate=Number(value);
  return PRACTICE_RATES.includes(rate)?rate:1;
}
// Expand chart time to wall-clock seconds. The audio uses the inverse mapping.
// Judgment windows and input latency remain real milliseconds at every speed.
export function practiceChart(chart, rate) {
  rate=practiceRate(rate);
  return {...chart,duration:chart.duration/rate,bpm:chart.bpm*rate,
    notes:chart.notes.map(note=>({...note,t:note.t/rate,
      ...(note.end?{end:note.end/rate}:{}),
      ...(note.ticks?{ticks:note.ticks.map(t=>t/rate)}:{})}))};
}
