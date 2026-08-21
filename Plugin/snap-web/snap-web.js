(() => {
    const P = Object.freeze({
        INPUT_TRIM:0, GATE:1, COMP:2, COMP_VOL:3, COMP_TONE:4, COMP_ON:5,
        DRIVE:6, SNAP:7, TONE:8, LEVEL:9, DRIVE_ON:10, BOOST:11,
        EQ_ON:12, EQ31:13, EQ62:14, EQ125:15, EQ250:16, EQ500:17,
        EQ1K:18, EQ2K:19, EQ4K:20, EQ8K:21, EQ16K:22, EQ_OUT:23,
        SIGNAL_MODE:24, DRIVE_CPU_HIGH:25,
        DEV_DIRECT_OFF:26, DEV_TRANSIENT_OFF:27, DEV_DIRECT_ON:28, DEV_TRANSIENT_ON:29,
        DEV_NATURAL_COMP:30, DEV_DRIVE_CLIP_DB:31, DEV_DRIVE_LOW_CUT_HZ:32, DEV_DRIVE_HIGH_CUT_HZ:33
    });

    const DEFAULTS = {"inputTrim":0,"gate":1,"comp":5,"compVol":5,"compTone":5,"compOn":1,"drive":5,"snap":5,"tone":5,"level":5,"driveOn":1,"boost":0,"eqOn":0,"eq31":0,"eq62":0,"eq125":0,"eq250":0,"eq500":0,"eq1k":0,"eq2k":0,"eq4k":0,"eq8k":0,"eq16k":0,"eqOut":0,"signalMode":0,"driveCpuHigh":0,"cabMode":0,"devDirectOff":100,"devTransientOff":100,"devDirectOn":0,"devTransientOn":50,"devNaturalComp":1.0,"devDriveClipDb":-9.2,"devDriveLowCutHz":99.5,"devDriveHighCutHz":5150.0};


    const PRESETS = Object.freeze({"default":{"inputTrim":0,"gate":1,"comp":5,"compVol":5,"compTone":5,"compOn":1,"drive":5,"snap":5,"tone":5,"level":5,"driveOn":1,"boost":0,"eqOn":0,"eq31":0,"eq62":0,"eq125":0,"eq250":0,"eq500":0,"eq1k":0,"eq2k":0,"eq4k":0,"eq8k":0,"eq16k":0,"eqOut":0,"signalMode":0,"driveCpuHigh":0,"cabMode":0,"devDirectOff":100,"devTransientOff":100,"devDirectOn":0,"devTransientOn":50,"devNaturalComp":1.0,"devDriveClipDb":-9.2,"devDriveLowCutHz":99.5,"devDriveHighCutHz":5150.0},"Clean + CAB":{"inputTrim":0.0,"gate":3.0,"comp":7.449999809265137,"compVol":8.949999809265137,"compTone":8.579999923706055,"compOn":1.0,"drive":7.789999961853027,"snap":4.029999732971191,"tone":3.799999952316284,"level":5.0,"driveOn":0.0,"boost":0.0,"eqOn":1.0,"eq31":-2.829999923706055,"eq62":0.1599998474121094,"eq125":1.960000038146973,"eq250":1.130000114440918,"eq500":-2.060000419616699,"eq1k":0.0,"eq2k":0.5699996948242188,"eq4k":4.090000152587891,"eq8k":7.719999313354492,"eq16k":7.600000381469727,"eqOut":0.0,"signalMode":0,"driveCpuHigh":0,"cabMode":4.0,"devDirectOff":100,"devTransientOff":100,"devDirectOn":0,"devTransientOn":50.0,"devNaturalComp":1.0,"devDriveClipDb":0.0,"devDriveLowCutHz":65.0,"devDriveHighCutHz":8050.0},"Clean":{"inputTrim":0.0,"gate":0.199999988079071,"comp":5.0,"compVol":7.859999656677246,"compTone":6.369999885559082,"compOn":1.0,"drive":7.789999961853027,"snap":4.029999732971191,"tone":3.799999952316284,"level":5.0,"driveOn":0.0,"boost":0.0,"eqOn":0.0,"eq31":-2.829999923706055,"eq62":1.159999847412109,"eq125":4.090000152587891,"eq250":3.739999771118164,"eq500":-3.65000057220459,"eq1k":0.0,"eq2k":-3.060000419616699,"eq4k":4.090000152587891,"eq8k":7.719999313354492,"eq16k":7.600000381469727,"eqOut":0.0,"signalMode":0,"driveCpuHigh":0,"cabMode":0.0,"devDirectOff":100,"devTransientOff":100,"devDirectOn":0,"devTransientOn":50,"devNaturalComp":1.0,"devDriveClipDb":0.0,"devDriveLowCutHz":65.0,"devDriveHighCutHz":8050.0},"CleanShred":{"inputTrim":0.0,"gate":3.0,"comp":7.449999809265137,"compVol":8.949999809265137,"compTone":6.369999885559082,"compOn":1.0,"drive":7.789999961853027,"snap":4.029999732971191,"tone":3.799999952316284,"level":5.0,"driveOn":0.0,"boost":0.0,"eqOn":0.0,"eq31":-2.829999923706055,"eq62":1.159999847412109,"eq125":4.090000152587891,"eq250":3.739999771118164,"eq500":-3.65000057220459,"eq1k":0.0,"eq2k":-3.060000419616699,"eq4k":4.090000152587891,"eq8k":7.719999313354492,"eq16k":7.600000381469727,"eqOut":0.0,"signalMode":0,"driveCpuHigh":0,"cabMode":0.0,"devDirectOff":100,"devTransientOff":100,"devDirectOn":0,"devTransientOn":50,"devNaturalComp":1.0,"devDriveClipDb":0.0,"devDriveLowCutHz":65.0,"devDriveHighCutHz":8050.0},"Dist + CAB":{"inputTrim":0.0,"gate":3.0,"comp":4.069999694824219,"compVol":5.0,"compTone":5.0,"compOn":0.0,"drive":7.71999979019165,"snap":7.809999942779541,"tone":7.239999771118164,"level":4.400000095367432,"driveOn":1.0,"boost":1.0,"eqOn":1.0,"eq31":-2.829999923706055,"eq62":0.0,"eq125":1.769999504089355,"eq250":2.239999771118164,"eq500":1.309999465942383,"eq1k":-0.1999998092651367,"eq2k":3.049999237060547,"eq4k":4.680000305175781,"eq8k":12.0,"eq16k":8.399999618530273,"eqOut":0.0,"signalMode":0,"driveCpuHigh":0,"cabMode":1.0,"devDirectOff":100,"devTransientOff":100,"devDirectOn":0,"devTransientOn":50.0,"devNaturalComp":1.0,"devDriveClipDb":0.0,"devDriveLowCutHz":65.0,"devDriveHighCutHz":8050.0},"Dist":{"inputTrim":0.0,"gate":3.0,"comp":4.069999694824219,"compVol":5.0,"compTone":5.0,"compOn":0.0,"drive":7.71999979019165,"snap":7.809999942779541,"tone":7.239999771118164,"level":4.400000095367432,"driveOn":1.0,"boost":1.0,"eqOn":0.0,"eq31":-2.829999923706055,"eq62":0.0,"eq125":1.769999504089355,"eq250":2.239999771118164,"eq500":1.309999465942383,"eq1k":-0.1999998092651367,"eq2k":3.049999237060547,"eq4k":4.680000305175781,"eq8k":12.0,"eq16k":8.399999618530273,"eqOut":0.0,"signalMode":0,"driveCpuHigh":0,"cabMode":0.0,"devDirectOff":100,"devTransientOff":100,"devDirectOn":0,"devTransientOn":50.0,"devNaturalComp":1.0,"devDriveClipDb":0.0,"devDriveLowCutHz":65.0,"devDriveHighCutHz":8050.0},"Snap + CAB":{"inputTrim":0.0,"gate":3.0,"comp":7.899999618530273,"compVol":5.0,"compTone":6.440000057220459,"compOn":1.0,"drive":8.130000114440918,"snap":7.599999904632568,"tone":5.0,"level":4.75,"driveOn":1.0,"boost":0.0,"eqOn":1.0,"eq31":-2.829999923706055,"eq62":0.0,"eq125":1.819999694824219,"eq250":0.0,"eq500":-3.65000057220459,"eq1k":0.0,"eq2k":-3.060000419616699,"eq4k":4.090000152587891,"eq8k":7.719999313354492,"eq16k":7.600000381469727,"eqOut":0.0,"signalMode":0,"driveCpuHigh":0,"cabMode":4.0,"devDirectOff":100,"devTransientOff":100,"devDirectOn":0,"devTransientOn":50.0,"devNaturalComp":1.0,"devDriveClipDb":0.0,"devDriveLowCutHz":65.0,"devDriveHighCutHz":8050.0},"Snap":{"inputTrim":0.0,"gate":3.0,"comp":7.899999618530273,"compVol":5.0,"compTone":6.440000057220459,"compOn":1.0,"drive":8.130000114440918,"snap":7.099999904632568,"tone":3.099999904632568,"level":5.0,"driveOn":1.0,"boost":0.0,"eqOn":0.0,"eq31":-2.829999923706055,"eq62":1.159999847412109,"eq125":3.960000038146973,"eq250":0.0,"eq500":-3.65000057220459,"eq1k":0.0,"eq2k":-3.060000419616699,"eq4k":4.090000152587891,"eq8k":7.719999313354492,"eq16k":7.600000381469727,"eqOut":0.0,"signalMode":0,"driveCpuHigh":0,"cabMode":0.0,"devDirectOff":100,"devTransientOff":100,"devDirectOn":0,"devTransientOn":50.0,"devNaturalComp":1.0,"devDriveClipDb":0.0,"devDriveLowCutHz":65.0,"devDriveHighCutHz":8050.0}});

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
            this.limiter = null;
            this.ready = false;
            this.initPromise = null;
            this.params = { ...DEFAULTS };
            this.status = document.getElementById('sample-engine-status');
            this.browserStatus = document.getElementById('browser-demo-status');
            this.meterFill = document.getElementById('web-input-meter-fill');
            this.meterValue = document.getElementById('web-meter-value');
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
                // Web-demo-only final output lift. This AudioContext contains only the SNAP
                // sample player, so the Windows95 click/GUI sounds are intentionally untouched.
                this.master.gain.value = Math.pow(10, 6.0 / 20.0); // +6 dB

                this.limiter = this.context.createDynamicsCompressor();
                this.limiter.threshold.value = -1.0;
                this.limiter.knee.value = 0.0;
                this.limiter.ratio.value = 20.0;
                this.limiter.attack.value = 0.003;
                this.limiter.release.value = 0.08;

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
                this.master.connect(this.limiter).connect(this.context.destination);

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
                        this.updateGateVisual(Boolean(data.gateClosed));
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
            if (name === 'signalMode' || name === 'driveCpuHigh') value = 0;
            this.params[name] = Number(value);
            const map = {
                inputTrim:P.INPUT_TRIM, gate:P.GATE, comp:P.COMP, compVol:P.COMP_VOL,
                compTone:P.COMP_TONE, compOn:P.COMP_ON, drive:P.DRIVE, snap:P.SNAP,
                tone:P.TONE, level:P.LEVEL, driveOn:P.DRIVE_ON, boost:P.BOOST,
                eqOn:P.EQ_ON, eq31:P.EQ31, eq62:P.EQ62, eq125:P.EQ125,
                eq250:P.EQ250, eq500:P.EQ500, eq1k:P.EQ1K, eq2k:P.EQ2K,
                eq4k:P.EQ4K, eq8k:P.EQ8K, eq16k:P.EQ16K, eqOut:P.EQ_OUT,
                signalMode:P.SIGNAL_MODE, driveCpuHigh:P.DRIVE_CPU_HIGH,
                devDirectOff:P.DEV_DIRECT_OFF, devTransientOff:P.DEV_TRANSIENT_OFF,
                devDirectOn:P.DEV_DIRECT_ON, devTransientOn:P.DEV_TRANSIENT_ON,
                devNaturalComp:P.DEV_NATURAL_COMP,
                devDriveClipDb:P.DEV_DRIVE_CLIP_DB,
                devDriveLowCutHz:P.DEV_DRIVE_LOW_CUT_HZ,
                devDriveHighCutHz:P.DEV_DRIVE_HIGH_CUT_HZ
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
            // Web demo only: visual meter calibration.
            // This does NOT change the audio signal, gate threshold, DSP gain,
            // sample playback level, or the site's click / UI sound effects.
            // Keeping this as a simple display offset avoids adding any extra
            // animation / frame-rate work to the Web version.
            const DISPLAY_METER_OFFSET_DB = 6.0;
            const raw = Number(db);
            const displayDb = Number.isFinite(raw) ? raw + DISPLAY_METER_OFFSET_DB : -60;
            const v = Math.max(-60, Math.min(0, displayDb));

            if (this.meterFill) {
                this.meterFill.style.width = (((v + 60) / 60) * 100).toFixed(1) + '%';
            }
            if (this.meterValue) {
                this.meterValue.textContent = v <= -59.5 ? '-inf' : v.toFixed(1);
            }
        }

        updateGateVisual(closed) {
            const gate = document.querySelector('.snap-gate-knob');
            if (gate) gate.classList.toggle('gate-closed', Boolean(closed));
        }
    }


    function updateRangeVisual(el) {
        if (!el || el.type !== 'range') return;
        const min = Number(el.min || 0);
        const max = Number(el.max || 10);
        const value = Number(el.value);
        const t = max > min ? Math.max(0, Math.min(1, (value - min) / (max - min))) : 0;
        const angle = -135 + t * 270;

        const knob = el.closest('.snap-knob, .snap-gate-knob');
        if (knob) knob.style.setProperty('--knob-angle', angle + 'deg');

        const eqFader = el.closest('.snap-eq-fader');
        if (eqFader) {
            const topPct = (1 - t) * 100;
            eqFader.style.setProperty('--eq-top', topPct.toFixed(3) + '%');
        }
    }

    function updateSwitchVisual(name, value) {
        const on = Number(value) >= 0.5;
        document.querySelectorAll('[data-switch-visual="' + name + '"]').forEach(node => {
            node.classList.toggle('is-on', on);
        });

        if (name === 'eqOn') {
            const eq = document.getElementById('snap-eq-sliders');
            if (eq) eq.classList.toggle('is-off', !on);
        }
    }

    function syncSegmentVisual(name, value) {
        document.querySelectorAll('[data-segment-param="' + name + '"]').forEach(group => {
            group.querySelectorAll('label').forEach(label => {
                const radio = label.querySelector('input[type="radio"]');
                const selected = radio && Number(radio.value) === Number(value);
                label.classList.toggle('is-selected', selected);
                if (radio) radio.checked = selected;
            });
        });
    }

    function setupSegmentControls(engine) {
        document.querySelectorAll('[data-segment-param]').forEach(group => {
            const name = group.dataset.segmentParam;
            const hiddenSelect = group.querySelector('[data-snap-param="' + name + '"]');

            group.querySelectorAll('label').forEach(label => {
                const radio = label.querySelector('input[type="radio"]');
                if (!radio || radio.disabled || label.classList.contains('is-disabled')) return;
                label.addEventListener('click', () => {
                    if (!hiddenSelect) return;
                    hiddenSelect.value = radio.value;
                    hiddenSelect.dispatchEvent(new Event('change', { bubbles:true }));
                    syncSegmentVisual(name, radio.value);
                });
            });
        });
    }

    function setupKnobDragging() {
        document.querySelectorAll('.snap-knob input[type="range"], .snap-gate-knob input[type="range"]').forEach(el => {
            updateRangeVisual(el);
            let startY = 0;
            let startValue = 0;
            let dragging = false;

            el.addEventListener('pointerdown', e => {
                dragging = true;
                startY = e.clientY;
                startValue = Number(el.value);
                el.setPointerCapture(e.pointerId);
                e.preventDefault();
            });

            el.addEventListener('pointermove', e => {
                if (!dragging) return;
                const min = Number(el.min);
                const max = Number(el.max);
                const span = max - min;
                const delta = (startY - e.clientY) / 120 * span;
                let next = Math.max(min, Math.min(max, startValue + delta));
                const step = Number(el.step || 0.1);
                next = Math.round(next / step) * step;
                el.value = String(next);
                el.dispatchEvent(new Event('input', { bubbles:true }));
                e.preventDefault();
            });

            const stop = e => {
                dragging = false;
                try { el.releasePointerCapture(e.pointerId); } catch (_) {}
            };
            el.addEventListener('pointerup', stop);
            el.addEventListener('pointercancel', stop);
            el.addEventListener('wheel', e => {
                e.preventDefault();
                const step = Number(el.step || 0.1);
                const min = Number(el.min);
                const max = Number(el.max);
                const dir = e.deltaY < 0 ? 1 : -1;
                const next = Math.max(min, Math.min(max, Number(el.value) + dir * step));
                el.value = String(next);
                el.dispatchEvent(new Event('input', { bubbles:true }));
            }, { passive:false });
        });
    }

    function updateEqResponseCurve(engine) {
        const svg = document.getElementById('snap-eq-response-svg');
        const path = document.getElementById('snap-eq-response-path');
        if (!svg || !path) return;

        const eqOn = Number(engine && engine.params ? engine.params.eqOn : 0) >= 0.5;
        svg.classList.toggle('is-visible', eqOn);
        if (!eqOn) return;

        const sampleRate = engine && engine.context ? engine.context.sampleRate : 48000;
        const freqs = [31.25,62.5,125,250,500,1000,2000,4000,8000,16000];
        const names = ['eq31','eq62','eq125','eq250','eq500','eq1k','eq2k','eq4k','eq8k','eq16k'];
        const q = 1.1;

        function coeff(f, gainDb) {
            f = Math.max(20, Math.min(sampleRate * 0.45, f));
            const A = Math.pow(10, gainDb / 40);
            const w0 = 2 * Math.PI * f / sampleRate;
            const alpha = Math.sin(w0) / (2 * q);
            const c = Math.cos(w0);
            const a0 = 1 + alpha / A;
            return {
                b0:(1 + alpha*A)/a0,
                b1:(-2*c)/a0,
                b2:(1 - alpha*A)/a0,
                a1:(-2*c)/a0,
                a2:(1 - alpha/A)/a0
            };
        }

        const cs = freqs.map((f,i) => coeff(f, Number(engine.params[names[i]]) || 0));
        const points=[];
        const N=180;
        for (let i=0;i<N;i++) {
            const nx=i/(N-1);
            const f=31.25*Math.pow(2,nx*9);
            const w=2*Math.PI*f/sampleRate;
            const c1=Math.cos(w), s1=-Math.sin(w);
            const c2=Math.cos(2*w), s2=-Math.sin(2*w);
            let mag=1;
            for (const c of cs) {
                const nr=c.b0+c.b1*c1+c.b2*c2;
                const ni=c.b1*s1+c.b2*s2;
                const dr=1+c.a1*c1+c.a2*c2;
                const di=c.a1*s1+c.a2*s2;
                mag *= Math.sqrt((nr*nr+ni*ni)/(dr*dr+di*di));
            }
            let db=20*Math.log10(Math.max(mag,1e-9));
            db=Math.max(-12,Math.min(12,db));
            const x=nx*1000;
            const y=(12-db)/24*240;
            points.push((i===0?'M':'L')+x.toFixed(2)+' '+y.toFixed(2));
        }
        path.setAttribute('d', points.join(' '));
    }

    function setupSettingsUi(engine) {
        const panel = document.getElementById('snap-vst-settings');
        const open = document.getElementById('snap-settings-open');
        const close = document.getElementById('snap-settings-close');

        if (open && panel) open.addEventListener('click', () => panel.classList.add('is-open'));
        if (close && panel) close.addEventListener('click', () => panel.classList.remove('is-open'));

        const eqArea = document.querySelector('.snap-eq-area');
        if (eqArea) {
            eqArea.addEventListener('click', () => {
                if (Number(engine.params.eqOn) < 0.5) {
                    engine.setParam('eqOn', 1);
                    updateControlUi('eqOn', 1);
                    markPresetDirty();
                    updateEqResponseCurve(engine);
                }
            });
        }

        const reset = document.getElementById('snap-eq-reset');
        if (reset) {
            reset.addEventListener('click', () => {
                ['eq31','eq62','eq125','eq250','eq500','eq1k','eq2k','eq4k','eq8k','eq16k','eqOut']
                    .forEach(name => {
                        engine.setParam(name, 0);
                        updateControlUi(name, 0);
                    });
                markPresetDirty();
                updateEqResponseCurve(engine);
            });
        }
        updateEqResponseCurve(engine);
    }

    function updateControlUi(name, value) {
        const el = document.querySelector('[data-snap-param="' + name + '"]');
        if (!el) return;

        if (el.type === 'checkbox') el.checked = Number(value) >= 0.5;
        else el.value = String(value);

        document.querySelectorAll('[data-snap-value="' + name + '"]').forEach(valueEl => {
            if (el.type === 'checkbox') valueEl.textContent = Number(value) >= 0.5 ? 'ON' : 'OFF';
            else valueEl.textContent = String(Math.round(Number(value) * 100) / 100);
        });

        updateRangeVisual(el);
        updateSwitchVisual(name, value);
        syncSegmentVisual(name, value);
    }

    function applyPreset(engine, presetName) {
        const preset = PRESETS[presetName];
        if (!preset) return;

        Object.entries(preset).forEach(([name, value]) => {
            engine.setParam(name, value);
            updateControlUi(name, value);
        });

        // Web version is intentionally fixed to MONO and DRIVE CPU LOW.
        engine.setParam('signalMode', 0);
        engine.setParam('driveCpuHigh', 0);
        updateControlUi('signalMode', 0);

        updateEqResponseCurve(engine);

        const dirty = document.getElementById('web-preset-dirty');
        if (dirty) dirty.textContent = '';
    }

    function markPresetDirty() {
        const dirty = document.getElementById('web-preset-dirty');
        if (dirty) dirty.textContent = '*';
    }

    function bindControls(engine) {
        document.querySelectorAll('[data-snap-param]').forEach(el => {
            const name = el.dataset.snapParam;
            const valueEl = document.querySelector('[data-snap-value="' + name + '"]');

            const update = (dirty) => {
                let value;
                if (el.type === 'checkbox') value = el.checked ? 1 : 0;
                else value = Number(el.value);

                engine.setParam(name, value);

                document.querySelectorAll('[data-snap-value="' + name + '"]').forEach(node => {
                    if (el.type === 'checkbox') node.textContent = value ? 'ON' : 'OFF';
                    else node.textContent = String(Math.round(Number(value) * 100) / 100);
                });

                updateRangeVisual(el);
                updateSwitchVisual(name, value);
                syncSegmentVisual(name, value);

                if (name === 'eqOn' || name === 'eq31' || name === 'eq62' || name === 'eq125'
                    || name === 'eq250' || name === 'eq500' || name === 'eq1k' || name === 'eq2k'
                    || name === 'eq4k' || name === 'eq8k' || name === 'eq16k') {
                    updateEqResponseCurve(engine);
                }

                if (dirty) markPresetDirty();
            };

            el.addEventListener('input', () => update(true));
            el.addEventListener('change', () => update(true));
            update(false);
        });

        const presetSelect = document.getElementById('web-preset-select');
        if (presetSelect) {
            presetSelect.addEventListener('change', () => {
                applyPreset(engine, presetSelect.value);
            });
        }
    }

    window.addEventListener('DOMContentLoaded', () => {
        const audio = document.getElementById('snap-sample-audio');
        if (!audio) return;
        const engine = new SnapWebEngine(audio);
        window.snapWebEngine = engine;
        bindControls(engine);
        setupSegmentControls(engine);
        setupKnobDragging();
        setupSettingsUi(engine);

        Object.entries(DEFAULTS).forEach(([name,value]) => updateControlUi(name,value));

        // Construct the graph immediately so the media element never bypasses SNAP.
        engine.init().catch(() => {});
    });

    window.SnapWebParams = P;
})();
