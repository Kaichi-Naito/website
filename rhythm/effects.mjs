// Visual-only rhythm game effects. This module must not affect timing, scoring, or input handling.
if (typeof document !== 'undefined') initRhythmEffects();

function initRhythmEffects() {
  const stage = document.getElementById('stage');
  const combo = document.getElementById('combo');
  const judgment = document.getElementById('judgment');
  if (!stage || !combo || !judgment || document.getElementById('rhythm-effects-style')) return;

  const style = document.createElement('style');
  style.id = 'rhythm-effects-style';
  style.textContent = `
    .combo{transform-origin:50% 55%;will-change:transform,filter,color}
    .combo.rhythm-combo-pop{animation:rhythm-combo-pop .18s ease-out}
    .combo.rhythm-combo-milestone{animation:rhythm-combo-milestone .36s cubic-bezier(.2,.85,.25,1.25);color:#ffe37a;filter:drop-shadow(0 0 12px #ffe37a88)}
    .combo.rhythm-combo-major{animation:rhythm-combo-major .48s cubic-bezier(.15,.9,.2,1.2);color:#fff3ad;filter:drop-shadow(0 0 18px #ffe37acc) drop-shadow(0 0 28px #ff8dda66)}
    @keyframes rhythm-combo-pop{0%{transform:scale(.9)}55%{transform:scale(1.1)}100%{transform:scale(1)}}
    @keyframes rhythm-combo-milestone{0%{transform:scale(.78)}45%{transform:scale(1.28)}72%{transform:scale(.98)}100%{transform:scale(1)}}
    @keyframes rhythm-combo-major{0%{transform:scale(.68)}40%{transform:scale(1.42)}68%{transform:scale(.94)}100%{transform:scale(1)}}

    .rhythm-judge-line-fx{position:absolute;left:8%;top:82.2%;width:84%;height:10px;z-index:1;pointer-events:none;opacity:0;transform:scaleX(.25);transform-origin:center;background:linear-gradient(90deg,transparent 0%,var(--judge-color,#fff) 15%,var(--judge-color,#fff) 85%,transparent 100%);box-shadow:0 0 10px var(--judge-color,#fff),0 0 24px var(--judge-color,#fff)}
    .rhythm-judge-line-fx.hit{animation:rhythm-judge-hit .28s ease-out}
    .rhythm-judge-line-fx.miss{animation:rhythm-judge-miss .34s ease-out}
    @keyframes rhythm-judge-hit{0%{opacity:.95;transform:scaleX(.18) scaleY(1.7)}55%{opacity:.72;transform:scaleX(1) scaleY(1)}100%{opacity:0;transform:scaleX(1.08) scaleY(.35)}}
    @keyframes rhythm-judge-miss{0%{opacity:.9;transform:scaleX(.28) scaleY(1.9)}55%{opacity:.55;transform:scaleX(.95) scaleY(.8)}100%{opacity:0;transform:scaleX(1.04) scaleY(.2)}}

    .rhythm-lane-pulse{position:absolute;top:67%;height:16.5%;width:21%;z-index:1;pointer-events:none;opacity:0;clip-path:polygon(16% 0,84% 0,100% 100%,0 100%);background:linear-gradient(180deg,transparent 0%,color-mix(in srgb,var(--lane-color) 16%,transparent) 35%,color-mix(in srgb,var(--lane-color) 58%,transparent) 100%);filter:drop-shadow(0 0 10px var(--lane-color));transform-origin:50% 100%}
    .rhythm-lane-pulse.press{animation:rhythm-lane-press .2s ease-out}
    .rhythm-lane-pulse.judge{animation:rhythm-lane-judge .3s ease-out}
    @keyframes rhythm-lane-press{0%{opacity:.62;transform:scaleY(.65)}100%{opacity:0;transform:scaleY(1)}}
    @keyframes rhythm-lane-judge{0%{opacity:.88;transform:scaleY(.55)}55%{opacity:.45;transform:scaleY(1.05)}100%{opacity:0;transform:scaleY(1.16)}}

    @media(prefers-reduced-motion:reduce){
      .combo.rhythm-combo-pop,.combo.rhythm-combo-milestone,.combo.rhythm-combo-major{animation:none;filter:none}
      .rhythm-judge-line-fx.hit,.rhythm-judge-line-fx.miss,.rhythm-lane-pulse.press,.rhythm-lane-pulse.judge{animation:none}
    }
  `;
  document.head.append(style);

  const lineFx = document.createElement('div');
  lineFx.className = 'rhythm-judge-line-fx';
  lineFx.setAttribute('aria-hidden', 'true');
  stage.append(lineFx);

  const laneFx = Array.from({length:4}, (_,lane) => {
    const el = document.createElement('div');
    el.className = 'rhythm-lane-pulse';
    el.setAttribute('aria-hidden', 'true');
    el.style.left = `${8 + lane * 21}%`;
    el.style.setProperty('--lane-color', lane < 2 ? '#7deaff' : '#ff8dda');
    stage.append(el);
    return el;
  });

  const restart = (element, className) => {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  };

  let lastCombo = -1;
  const animateCombo = () => {
    const value = Number(combo.dataset.value || 0);
    if (!Number.isFinite(value) || value === lastCombo) return;
    lastCombo = value;
    combo.classList.remove('rhythm-combo-pop','rhythm-combo-milestone','rhythm-combo-major');
    if (value < 2) return;
    void combo.offsetWidth;
    combo.classList.add(value % 50 === 0 ? 'rhythm-combo-major' : value % 10 === 0 ? 'rhythm-combo-milestone' : 'rhythm-combo-pop');
  };
  new MutationObserver(animateCombo).observe(combo,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-value']});
  combo.addEventListener('animationend',()=>combo.classList.remove('rhythm-combo-pop','rhythm-combo-milestone','rhythm-combo-major'));

  let lastLane = -1;
  let lastInputAt = -Infinity;
  const noteInput = lane => {
    if (lane < 0 || lane > 3) return;
    lastLane = lane;
    lastInputAt = performance.now();
    laneFx[lane].style.setProperty('--lane-color', lane < 2 ? '#7deaff' : '#ff8dda');
    restart(laneFx[lane], 'press');
  };

  window.addEventListener('keydown',event=>{
    if(event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.isComposing)return;
    const lane=['KeyQ','KeyW','KeyE','KeyR'].indexOf(event.code);
    if(lane>=0)noteInput(lane);
  },true);
  stage.addEventListener('pointerdown',event=>{
    const button=event.target.closest?.('[data-lane]');
    if(!button)return;
    const lane=Number(button.dataset.lane);
    if(Number.isInteger(lane))noteInput(lane);
  },true);

  const judgeColors={PERFECT:'#ffe37a',GREAT:'#c4a2ff',GOOD:'#80e5b0',MISS:'#ff6f8a'};
  const animateJudgment = () => {
    const label=(judgment.firstChild?.textContent || judgment.textContent || '').trim().toUpperCase();
    const color=judgeColors[label];
    if(!color)return;
    lineFx.style.setProperty('--judge-color',color);
    lineFx.classList.remove('hit','miss');
    void lineFx.offsetWidth;
    lineFx.classList.add(label==='MISS'?'miss':'hit');

    if(performance.now()-lastInputAt<260 && lastLane>=0){
      laneFx[lastLane].style.setProperty('--lane-color',color);
      laneFx[lastLane].classList.remove('press','judge');
      void laneFx[lastLane].offsetWidth;
      laneFx[lastLane].classList.add('judge');
    }
  };
  new MutationObserver(animateJudgment).observe(judgment,{childList:true,subtree:true,characterData:true});
  lineFx.addEventListener('animationend',()=>lineFx.classList.remove('hit','miss'));
  laneFx.forEach(el=>el.addEventListener('animationend',()=>el.classList.remove('press','judge')));
}
