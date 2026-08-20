(() => {
    const P = Object.freeze({
        INPUT_TRIM:0, GATE:1, COMP:2, COMP_VOL:3, COMP_TONE:4, COMP_ON:5,
        DRIVE:6, SNAP:7, TONE:8, LEVEL:9, DRIVE_ON:10, BOOST:11,
        EQ_ON:12, EQ31:13, EQ62:14, EQ125:15, EQ250:16, EQ500:17,
        EQ1K:18, EQ2K:19, EQ4K:20, EQ8K:21, EQ16K:22, EQ_OUT:23,
        SIGNAL_MODE:24, DRIVE_CPU_HIGH:25,
        DEV_DIRECT_OFF:26, DEV_TRANSIENT_OFF:27, DEV_DIRECT_ON:28, DEV_TRANSIENT_ON:29
    });

    const DEFAULTS = {
        inputTrim:0, gate:1, comp:5, compVol:5, compTone:5, compOn:1,
        drive:5, snap:5, tone:5, level:5, driveOn:1, boost:0,
        eqOn:0, eq31:0, eq62:0, eq125:0, eq250:0, eq500:0, eq1k:0,
        eq2k:0, eq4k:0, eq8k:0, eq16k:0, eqOut:0,
        signalMode:0, driveCpuHigh:1,
        devDirectOff:100, devTransientOff:100, devDirectOn:0, devTransientOn:50,
        cabMode:0
    };

    class SnapWebEngine {
        constructor(audioElement) {
            this.audioElement = audioElement;
            this.context = null;
            this.mediaSource = null;
            this.worklet = null;
            this.dryGain = null;
            this.cabAGain = null;
            this.cabBGain = null;
            this.convolverA = null;
            this.convolverB = null;
            this.master = null;
            this.ready = false;
            this.initPromise = null;
            this.params = { ...DEFAULTS };
            this.status = document.getElementById('sample-engine-status');
            this.browserStatus = document.getElementById('browser-demo-status');
            this.meterFill = document.getElementById('web-input-meter-fill');
        }

        setStatus(text) {
            if (this.status) this.status.textContent = text;
        }

        async init() {
            if (this.initPromise) return this.initPromise;
            this.initPromise = this._init();
            return this.initPromise;
        }

        async _init() {
            this.setStatus('LOADING SNAP WEB DSP...');
            try {
                const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                this.context = new AudioContextClass({ latencyHint: 'interactive' });
                await this.context.audioWorklet.addModule('Plugin/snap-web/snap-worklet.js');

                const wasmResponse = await fetch('Plugin/snap-web/snap_dsp.wasm', { cache: 'no-cache' });
                if (!wasmResponse.ok) throw new Error('WASM HTTP ' + wasmResponse.status);
                const wasmBytes = await wasmResponse.arrayBuffer();

                this.mediaSource = this.context.createMediaElementSource(this.audioElement);
                this.worklet = new AudioWorkletNode(this.context, 'snap-web-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [2],
                    channelCount: 2,
                    channelCountMode: 'explicit'
                });

                this.master = this.context.createGain();
                this.dryGain = this.context.createGain();
                this.cabAGain = this.context.createGain();
                this.cabBGain = this.context.createGain();
                this.convolverA = this.context.createConvolver();
                this.convolverB = this.context.createConvolver();
                this.convolverA.normalize = false;
                this.convolverB.normalize = false;

                this.mediaSource.connect(this.worklet);
                this.worklet.connect(this.dryGain).connect(this.master);
                this.worklet.connect(this.convolverA).connect(this.cabAGain).connect(this.master);
                this.worklet.connect(this.convolverB).connect(this.cabBGain).connect(this.master);
                this.master.connect(this.context.destination);

                this.worklet.port.onmessage = (event) => {
                    const data = event.data || {};
                    if (data.type === 'ready') {
                        this.ready = true;
                        this.applyAllParams();
                        this.applyCabMode(this.params.cabMode, true);
                        this.setStatus('LOOP ON / SNAP WEB DSP: READY');
                        if (this.browserStatus) {
                            this.browserStatus.textContent = 'Web DSP Ready';
                            this.browserStatus.className = 'status-ready';
                        }
                    } else if (data.type === 'meter') {
                        this.updateMeter(data.db);
                    } else if (data.type === 'error') {
                        this.setStatus('SNAP WEB DSP ERROR');
                        console.error('SNAP worklet:', data.message);
                    }
                };

                this.worklet.port.postMessage({ type:'init', wasmBytes }, [wasmBytes]);

                // Load the exact CAB A/B WAV assets from the VST project.
                const [irA, irB] = await Promise.all([
                    this.loadIr('Plugin/snap-web/ir/Cab_A_4x12.wav'),
                    this.loadIr('Plugin/snap-web/ir/Cab_B_2x12.wav')
                ]);
                this.convolverA.buffer = irA;
                this.convolverB.buffer = irB;

                // Wait until the worklet reports ready.
                const start = performance.now();
                while (!this.ready && performance.now() - start < 5000) {
                    await new Promise(r => setTimeout(r, 20));
                }
                if (!this.ready) throw new Error('WASM initialization timed out');
                return true;
            } catch (error) {
                console.error('SNAP Web init failed:', error);
                this.setStatus('SNAP WEB DSP: LOAD FAILED');
                if (this.browserStatus) this.browserStatus.textContent = 'Load Failed';
                throw error;
            }
        }

        async loadIr(url) {
            const r = await fetch(url, { cache: 'force-cache' });
            if (!r.ok) throw new Error('IR HTTP ' + r.status + ': ' + url);
            const a = await r.arrayBuffer();
            return this.context.decodeAudioData(a.slice(0));
        }

        async resume() {
            await this.init();
            if (this.context.state !== 'running') await this.context.resume();
        }

        send(id, value) {
            if (this.worklet) this.worklet.port.postMessage({ type:'param', id, value:Number(value) });
        }

        setParam(name, value) {
            this.params[name] = Number(value);
            const map = {
                inputTrim:P.INPUT_TRIM, gate:P.GATE, comp:P.COMP, compVol:P.COMP_VOL,
                compTone:P.COMP_TONE, compOn:P.COMP_ON, drive:P.DRIVE, snap:P.SNAP,
                tone:P.TONE, level:P.LEVEL, driveOn:P.DRIVE_ON, boost:P.BOOST,
                eqOn:P.EQ_ON, eq31:P.EQ31, eq62:P.EQ62, eq125:P.EQ125,
                eq250:P.EQ250, eq500:P.EQ500, eq1k:P.EQ1K, eq2k:P.EQ2K,
                eq4k:P.EQ4K, eq8k:P.EQ8K, eq16k:P.EQ16K, eqOut:P.EQ_OUT,
                signalMode:P.SIGNAL_MODE, driveCpuHigh:P.DRIVE_CPU_HIGH
            };
            if (name === 'cabMode') return this.applyCabMode(Number(value));
            if (map[name] !== undefined) this.send(map[name], value);
        }

        applyAllParams() {
            Object.entries(this.params).forEach(([name,value]) => {
                if (name !== 'cabMode') this.setParam(name,value);
            });
        }

        applyCabMode(mode, immediate=false) {
            if (!this.context || !this.dryGain) return;
            mode = Math.max(0, Math.min(4, Number(mode) || 0));
            this.params.cabMode = mode;
            const cabOutput = Math.pow(10, -12/20);
            const fullWet = Math.pow(10, -3.5/20);
            const blend = Math.pow(10, -0.5/20);
            let dry=0,a=0,b=0;
            if (mode===0) dry=1;
            if (mode===1) a=cabOutput*fullWet;
            if (mode===2) b=cabOutput*fullWet;
            if (mode===3) { dry=.25*blend; a=.75*cabOutput*blend; }
            if (mode===4) { dry=.25*blend; b=.75*cabOutput*blend; }
            const t=this.context.currentTime;
            [ [this.dryGain,dry], [this.cabAGain,a], [this.cabBGain,b] ].forEach(([node,target]) => {
                node.gain.cancelScheduledValues(t);
                if (immediate) node.gain.setValueAtTime(target,t);
                else {
                    node.gain.setValueAtTime(node.gain.value,t);
                    node.gain.linearRampToValueAtTime(target,t+.020);
                }
            });
        }

        updateMeter(db) {
            if (!this.meterFill) return;
            const v = Math.max(-60, Math.min(0, Number(db) || -60));
            this.meterFill.style.width = (((v + 60) / 60) * 100).toFixed(1) + '%';
        }
    }

    function bindControls(engine) {
        document.querySelectorAll('[data-snap-param]').forEach(el => {
            const name = el.dataset.snapParam;
            const valueEl = document.querySelector('[data-snap-value="' + name + '"]');
            const update = () => {
                let value;
                if (el.type === 'checkbox') value = el.checked ? 1 : 0;
                else value = Number(el.value);
                engine.setParam(name, value);
                if (valueEl) valueEl.textContent = el.type === 'checkbox' ? (value ? 'ON' : 'OFF') : value;
            };
            el.addEventListener('input', update);
            el.addEventListener('change', update);
            update();
        });
    }

    window.addEventListener('DOMContentLoaded', () => {
        const audio = document.getElementById('snap-sample-audio');
        if (!audio) return;
        const engine = new SnapWebEngine(audio);
        window.snapWebEngine = engine;
        bindControls(engine);
        // Construct the graph immediately so the media element never bypasses SNAP.
        engine.init().catch(() => {});
    });

    window.SnapWebParams = P;
})();
