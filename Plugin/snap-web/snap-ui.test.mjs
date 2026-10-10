import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import createSnapDsp from './snap-runtime.mjs';

const file = name => readFileSync(new URL(name, import.meta.url));

test('resume unlocks a suspended context before waiting for worklet readiness', async () => {
    const e = engineHarness();
    let completeInit, activated = false;
    e._init = () => {
        e.context = { state:'suspended', resume() { activated = true; this.state = 'running'; return Promise.resolve(); } };
        return new Promise(resolve => { completeInit = resolve; });
    };
    const start = e.resume();
    assert.equal(activated, true); // Still in the synchronous user gesture.
    completeInit();
    await start;
});

test('failed initialization disconnects its graph and permits another attempt', async () => {
    const e = engineHarness();
    let attempts = 0, disconnected = 0, closed = 0;
    e._init = async () => {
        attempts++;
        if (attempts === 1) {
            e.ready = true;
            e.dryGain = e.cabAGain = e.cabBGain = null;
            e.mediaSource = { disconnect() { disconnected++; } };
            e.worklet = { disconnect() { disconnected++; }, port:{ close() { closed++; } } };
            throw new Error('IR HTTP 503');
        }
        e.ready = true;
        return true;
    };
    await assert.rejects(e.init(), /IR HTTP 503/);
    assert.equal(e.initPromise, null);
    assert.equal(e.ready, false);
    assert.equal(disconnected, 2);
    assert.equal(closed, 1);
    await e.init();
    assert.equal(attempts, 2);
    assert.equal(e.ready, true);
});

test('sample click requests both audio permissions before asynchronous initialization', async () => {
    const html = file('../../Plugin.html').toString();
    const code = html.slice(html.indexOf('        if (samplePlayBtn && sampleAudio) {'), html.indexOf('        loadSampleList();'));
    let click, finishDsp;
    const requests = [];
    const button = { disabled:false, addEventListener(name, handler) { click = handler; } };
    const select = { value:'SNAP_sample_01_Strum.wav', disabled:false };
    const audio = { paused:true, currentTime:10, play() { requests.push('media'); this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } };
    const status = { textContent:'' };
    const context = vm.createContext({ samplePlayBtn:button, sampleSelect:select, sampleAudio:audio, sampleEngineStatus:status,
        window:{snapWebEngine:{resume() { requests.push('context'); return new Promise(resolve => { finishDsp = resolve; }); }}},
        setSampleUi(playing) { status.textContent = playing ? 'PLAYING' : 'STOPPED'; }, getSelectedSampleName() { return '01_Strum.wav'; }, console });
    vm.runInContext(code, context);
    const pending = click();
    assert.deepEqual(requests, ['context', 'media']);
    assert.equal(button.disabled, true);
    finishDsp(); await pending;
    assert.equal(status.textContent, 'PLAYING');
    assert.equal(audio.currentTime, 0);
    assert.equal(button.disabled, false);
    await click();
    assert.equal(audio.paused, true);
    assert.equal(audio.currentTime, 0);
});
function engineHarness() {
    const context = vm.createContext({
        window: { addEventListener() {} },
        document: { getElementById() { return null; }, querySelectorAll() { return []; } },
        console
    });
    // Expose the unmodified engine implementation only inside the test sandbox.
    vm.runInContext(file('snap-web.js').toString().replace('window.SnapWebParams = P;',
        'window.SnapWebParams = P; window.TestEngine = SnapWebEngine; window.TestPresets = PRESETS;'), context);
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
        for (const value of [-12, -2.8, 7.7, 12]) {
            el.value = String(value);
            const previousInputs = inputs;
            handlers.dblclick(event(100));
            assert.equal(Number(el.value), 0);
            assert.equal(inputs, previousInputs + 1); // Notify DSP and visual bindings.
        }
        assert.ok(inputs>=4);
    }
});

test('startup applies Snap + CAB but waits for user input to initialize audio', () => {
    let start, initialized, selected;
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
        'window.SnapWebParams = P; window.TestEngine = SnapWebEngine; window.TestPresets = PRESETS;'), context);
    context.window.TestEngine.prototype.init = function () { initialized = true; return Promise.resolve(); };
    context.window.TestEngine.prototype.setStatus = function () { selected = { ...this.params }; };
    start();
    assert.equal(presetSelect.value, 'Snap + CAB');
    assert.equal(initialized, undefined);
    assert.equal(context.window.snapWebEngine.context, null);
    assert.equal(selected.cabMode, 3);
    assert.equal(selected.eqOn, 1);
    assert.ok(Math.abs(selected.gate - 1.05) < .001);
    assert.equal(selected.inputLowCut, 2);
    assert.ok(Math.abs(selected.comp - 7.03) < .001);
    assert.ok(Math.abs(selected.drive - 6.12) < .001);
    assert.ok(Math.abs(selected.eq31 + 2.83) < .001);
    assert.equal(selected.signalMode, 0);
    assert.equal(selected.driveCpuHigh, 0);
    assert.equal(dirty.textContent, '');
});

test('real AudioWorklet and WASM produce finite non-silent audio with control changes', async () => {
    let Processor;
    const messages=[];
    const context=vm.createContext({
        AudioWorkletProcessor: class { constructor(){ this.port={ postMessage:data=>messages.push(data) }; } },
        sampleRate:48000, WebAssembly, Float32Array, Math, console, createSnapDsp,
        registerProcessor(name, type) { assert.equal(name,'snap-web-processor'); Processor=type; }
    });
    vm.runInContext(file('snap-worklet.js').toString().replace(/^import.*\n/, ''),context);
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


test('all seven v1.2.4 presets retain native values and separate DRIVE CPU preference', () => {
    const context=vm.createContext({window:{addEventListener(){}},document:{getElementById(){return null;}},console});
    vm.runInContext(file('snap-web.js').toString().replace('window.SnapWebParams = P;',
        'window.SnapWebParams = P; window.TestPresets = PRESETS;'),context);
    const names=['01_Snap','02_Snap + CAB','03_Clean','04_Clean + CAB','05_CleanShred','06_Dist','07_Dist + CAB'];
    const map={attack:'snap',boostEnabled:'boost',compressorAmount:'comp',compressorEnabled:'compOn',
        compressorTone:'compTone',compressorVolume:'compVol',enabled:'driveOn',eqEnabled:'eqOn',eqOutputGain:'eqOut'};
    for(const name of names){
        const preset=context.window.TestPresets[name.slice(3)];
        const xml=file('native/presets/'+name+'.snappreset').toString();
        for(const match of xml.matchAll(/<PARAM id="([^"]+)" value="([^"]+)"/g)){
            const key=map[match[1]]||match[1];
            if(key==='cabEnabled'||key.startsWith('dev'))continue;
            assert.equal(preset[key],Number(match[2]),name+': '+key);
        }
        assert.equal(preset.inputLowCut,2);
        assert.equal(preset.driveCpuHigh,0);
    }
});

test('real WASM LOW CUT provides the native 12 dB/oct filter and true OFF response', async () => {
    const rate=48000, frequencies=[60,100,150,1000], cutoffs=[0,60,100,150];
    for(let choice=0;choice<4;choice++){
        for(const frequency of frequencies){
            const m=await createSnapDsp({wasmBinary:file('snap_dsp.wasm')});m._snap_init(rate);
            m._snap_set_param(1,0);m._snap_set_param(5,0);m._snap_set_param(10,0);m._snap_set_param(34,choice);
            const input=new Float32Array(m.HEAPF32.buffer,m._snap_get_input_l(),128);
            const right=new Float32Array(m.HEAPF32.buffer,m._snap_get_input_r(),128);
            const output=new Float32Array(m.HEAPF32.buffer,m._snap_get_output_l(),128);
            let dry=0,wet=0;
            for(let block=0;block<750;block++){
                for(let i=0;i<128;i++)input[i]=right[i]=.1*Math.sin((block*128+i)*2*Math.PI*frequency/rate);
                m._snap_process(128);
                if(block>=375)for(let i=0;i<128;i++){dry+=input[i]**2;wet+=output[i]**2;}
            }
            const db=10*Math.log10(wet/dry);
            const ratio=choice ? Math.tan(Math.PI*cutoffs[choice]/rate)/Math.tan(Math.PI*frequency/rate) : 0;
            const expected=-10*Math.log10(1+ratio**4);
            assert.ok(Math.abs(db-expected)<.01,`${choice}/${frequency} Hz: ${db} vs ${expected}`);
        }
    }
});

test('AudioWorklet reports initialization errors and preserves queued controls', async () => {
    let Processor;
    const messages=[];
    const context=vm.createContext({
        AudioWorkletProcessor:class {constructor(){this.port={postMessage:x=>messages.push(x)};}},
        sampleRate:48000,Float32Array,Math,console,createSnapDsp,
        registerProcessor(name,type){Processor=type;}
    });
    vm.runInContext(file('snap-worklet.js').toString().replace(/^import.*\n/,''),context);
    const processor=new Processor();
    await processor.port.onmessage({data:{type:'param',id:34,value:3}});
    await processor.port.onmessage({data:{type:'param',id:10,value:0}});
    await processor.port.onmessage({data:{type:'init',wasmBytes:file('snap_dsp.wasm')}});
    assert.equal(processor.ready,true);assert.equal(processor.pendingParams.length,0);
    // An unavailable runtime must report an error instead of falsely enabling Play.
    context.createSnapDsp=async()=>{throw new Error('runtime unavailable');};
    const failed=new Processor();
    await failed.port.onmessage({data:{type:'init',wasmBytes:file('snap_dsp.wasm')}});
    assert.equal(failed.ready,false);
    assert.ok(messages.some(x=>x.type==='error'&&x.message==='runtime unavailable'));
});


test('native runtime initializes in AudioWorklet scope without URL, fetch or document', async () => {
    let Processor;
    const messages=[];
    const context=vm.createContext({console,WebAssembly,
        AudioWorkletProcessor:class {constructor(){this.port={postMessage:x=>messages.push(x)};}},
        sampleRate:48000,registerProcessor(name,type){Processor=type;}});
    assert.equal(vm.runInContext('typeof URL',context),'undefined');
    const runtime=file('snap-runtime.mjs').toString().replaceAll('import.meta.url',
        JSON.stringify('https://example.test/snap-runtime.mjs')).replace('export default createSnapDsp;','');
    vm.runInContext(runtime,context);
    vm.runInContext(file('snap-worklet.js').toString().replace(/^import.*\n/,''),context);
    const processor=new Processor();
    await processor.port.onmessage({data:{type:'init',wasmBytes:file('snap_dsp.wasm')}});
    assert.equal(processor.ready,true,JSON.stringify(messages));
    const output=[new Float32Array(128),new Float32Array(128)];
    processor.process([[new Float32Array(128).fill(.1)]],[output]);
    assert.ok(output[0].every(Number.isFinite));
});
