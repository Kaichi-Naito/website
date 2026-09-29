import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const file = name => readFileSync(new URL(name, import.meta.url));
function engineHarness() {
    const context = vm.createContext({
        window: { addEventListener() {} },
        document: { getElementById() { return null; }, querySelectorAll() { return []; } },
        console
    });
    // Expose the unmodified engine implementation only inside the test sandbox.
    vm.runInContext(file('snap-web.js').toString().replace('window.SnapWebParams = P;',
        'window.SnapWebParams = P; window.TestEngine = SnapWebEngine;'), context);
    const engine = new context.window.TestEngine(null);
    engine.context = { currentTime: 0 };
    function gain() {
        return { gain: { value:0, cancelScheduledValues() {}, setValueAtTime(value) { this.value=value; },
            linearRampToValueAtTime(value) { this.value=value; } } };
    }
    engine.dryGain=gain(); engine.cabAGain=gain(); engine.cabBGain=gain();
    return engine;
}

test('CAB detents drive the existing OFF/A/B/C/D mix routing', () => {
    const e=engineHarness();
    const wet=10 ** (-15.5/20), blend=10 ** (-.5/20), cab=10 ** (-12/20);
    const expected=[[1,0,0],[0,wet,0],[0,0,wet],[.25*blend,.75*cab*blend,0],[.25*blend,0,.75*cab*blend]];
    for(let mode=0;mode<5;mode++) {
        e.setParam('cabMode',mode);
        assert.equal(e.params.cabMode,mode);
        [e.dryGain,e.cabAGain,e.cabBGain].forEach((node,i)=>assert.ok(Math.abs(node.gain.value-expected[mode][i])<1e-12));
    }
    for(const [input,expectedMode] of [[-1,0],[1.4,1],[2.7,3],[9,4],[NaN,0]]) {
        e.setParam('cabMode',input); assert.equal(e.params.cabMode,expectedMode);
    }
    e.setParam('signalMode',1); e.setParam('driveCpuHigh',1);
    assert.equal(e.params.signalMode,0); assert.equal(e.params.driveCpuHigh,0);
});

test('EQ drag follows visible track at different sizes and preserves thumb grab offset', () => {
    for (const height of [50, 100, 220]) {
        const handlers = {};
        let captured = null, inputs = 0;
        const fader = { getBoundingClientRect:() => ({top:100,bottom:100+height,height}),
            querySelector:() => ({getBoundingClientRect:() => ({height:12})}) };
        const el = { min:'-12', max:'12', step:'0.1', value:'0', closest:() => fader,
            addEventListener:(name,fn) => { handlers[name]=fn; }, focus() {},
            setPointerCapture:id => {captured=id;}, hasPointerCapture:id => captured===id,
            releasePointerCapture:() => {captured=null;}, dispatchEvent:() => {inputs++;} };
        const context=vm.createContext({window:{addEventListener(){}},
            document:{querySelectorAll:() => [el]}, Event:class {}, console});
        vm.runInContext(file('snap-web.js').toString().replace('window.SnapWebParams = P;',
            'window.TestEqDragging = setupEqDragging;'),context);
        context.window.TestEqDragging();
        const event = y => ({clientY:y,button:0,pointerId:1,preventDefault(){}});
        handlers.pointerdown(event(100+height/2+3));
        assert.equal(Number(el.value),0); // Grabbing off-centre must not jump.
        handlers.pointermove(event(100+height/4+3));
        assert.ok(Math.abs(Number(el.value)-6)<1e-9);
        handlers.pointermove(event(80)); assert.equal(Number(el.value),12);
        handlers.pointermove(event(130+height)); assert.equal(Number(el.value),-12);
        handlers.pointerup(event(130+height));
        handlers.pointermove(event(100)); assert.equal(Number(el.value),-12);
        handlers.pointerdown(event(100+height/2)); assert.equal(Number(el.value),0);
        handlers.pointercancel(event(100)); assert.equal(captured,null);
        assert.ok(inputs>=4);
    }
});

test('startup selects and applies Snap + CAB before audio initialization', () => {
    let start, initialized;
    const presetSelect = { value:'default', addEventListener() {} };
    const dirty = { textContent:'*' };
    const context = vm.createContext({
        window: { addEventListener(name, callback) { if (name === 'DOMContentLoaded') start = callback; } },
        document: {
            getElementById(id) { return ({ 'snap-sample-audio':{}, 'web-preset-select':presetSelect, 'web-preset-dirty':dirty })[id] || null; },
            querySelector() { return null; }, querySelectorAll() { return []; }
        }, console
    });
    vm.runInContext(file('snap-web.js').toString().replace('window.SnapWebParams = P;',
        'window.SnapWebParams = P; window.TestEngine = SnapWebEngine;'), context);
    context.window.TestEngine.prototype.init = function () { initialized = { ...this.params }; return Promise.resolve(); };
    start();
    assert.equal(presetSelect.value, 'Snap + CAB');
    assert.equal(initialized.cabMode, 3);
    assert.equal(initialized.eqOn, 1);
    assert.equal(initialized.gate, 3);
    assert.ok(Math.abs(initialized.drive - 5.77) < .001);
    assert.ok(Math.abs(initialized.eq31 + 2.83) < .001);
    assert.equal(initialized.signalMode, 0);
    assert.equal(initialized.driveCpuHigh, 0);
    assert.equal(dirty.textContent, '');
});

test('real AudioWorklet and WASM produce finite non-silent audio with control changes', async () => {
    let Processor;
    const messages=[];
    const context=vm.createContext({
        AudioWorkletProcessor: class { constructor(){ this.port={ postMessage:data=>messages.push(data) }; } },
        sampleRate:48000, WebAssembly, Float32Array, Math, console,
        registerProcessor(name, type) { assert.equal(name,'snap-web-processor'); Processor=type; }
    });
    vm.runInContext(file('snap-worklet.js').toString(),context);
    const processor=new Processor();
    await processor.port.onmessage({data:{type:'init',wasmBytes:file('snap_dsp.wasm')}});
    assert.equal(processor.ready,true);
    assert.ok(messages.some(message=>message.type==='ready'));
    let energy=0;
    for(let block=0;block<120;block++) {
        if(block===40) await processor.port.onmessage({data:{type:'param',id:6,value:8}});
        if(block===80) await processor.port.onmessage({data:{type:'param',id:11,value:1}});
        const input=Float32Array.from({length:128},(_,i)=>.15*Math.sin((block*128+i)*2*Math.PI*220/48000));
        const output=[new Float32Array(128),new Float32Array(128)];
        assert.equal(processor.process([[input]],[output]),true);
        for(const channel of output) for(const sample of channel) { assert.ok(Number.isFinite(sample)); energy+=sample*sample; }
    }
    assert.ok(energy>.01);
    assert.ok(messages.some(message=>message.type==='meter' && Number.isFinite(message.db)));
});
