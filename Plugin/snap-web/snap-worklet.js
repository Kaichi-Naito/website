import createSnapDsp from './snap-runtime.mjs?v=1.2.4';

class SnapWebProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.ready = false;
        this.exports = null;
        this.inL = this.inR = this.outL = this.outR = null;
        this.meterCounter = 0;
        this.meterPeakDb = -60;
        this.pendingParams = [];

        this.port.onmessage = async (event) => {
            const data = event.data || {};
            if (data.type === 'init' && data.wasmBytes) {
                try {
                    const module = await createSnapDsp({ wasmBinary:data.wasmBytes });
                    // Keep the small existing processing interface; the generated runtime
                    // handles native C++ startup, SIMD, exceptions and resampling memory.
                    this.exports = { memory:{ get buffer() { return module.HEAPF32.buffer; } } };
                    for (const name of ['snap_init','snap_reset','snap_set_param',
                        'snap_get_input_l','snap_get_input_r','snap_get_output_l','snap_get_output_r',
                        'snap_get_input_peak_db','snap_get_gate_closed','snap_process']) {
                        this.exports[name] = module['_' + name];
                    }
                    this.exports.snap_init(sampleRate);
                    const error = module.UTF8ToString(module._snap_native_error());
                    if (error) throw new Error(error);
                    this.refreshViews();
                    for (const [id, value] of this.pendingParams) {
                        this.exports.snap_set_param(id, value);
                    }
                    this.pendingParams.length = 0;
                    this.ready = true;
                    this.port.postMessage({ type: 'ready' });
                } catch (error) {
                    this.port.postMessage({ type: 'error', message: String(error && error.message || error) });
                }
            } else if (data.type === 'param') {
                if (this.ready) this.exports.snap_set_param(data.id, data.value);
                else this.pendingParams.push([data.id, data.value]);
            } else if (data.type === 'reset' && this.ready) {
                this.exports.snap_reset();
            }
        };
    }

    refreshViews() {
        const mem = this.exports.memory.buffer;
        this.inL = new Float32Array(mem, this.exports.snap_get_input_l(), 128);
        this.inR = new Float32Array(mem, this.exports.snap_get_input_r(), 128);
        this.outL = new Float32Array(mem, this.exports.snap_get_output_l(), 128);
        this.outR = new Float32Array(mem, this.exports.snap_get_output_r(), 128);
    }

    process(inputs, outputs) {
        const output = outputs[0];
        if (!output || output.length === 0) return true;
        const out0 = output[0];
        const out1 = output[1] || output[0];
        const frames = out0.length;
        const input = inputs[0] || [];
        const src0 = input[0];
        const src1 = input[1] || src0;

        if (!this.ready || !this.exports) {
            for (let i = 0; i < frames; ++i) {
                out0[i] = src0 ? src0[i] : 0;
                out1[i] = src1 ? src1[i] : (src0 ? src0[i] : 0);
            }
            return true;
        }

        if (this.exports.memory.buffer !== this.inL.buffer) this.refreshViews();

        for (let i = 0; i < frames; ++i) {
            this.inL[i] = src0 ? src0[i] : 0;
            this.inR[i] = src1 ? src1[i] : (src0 ? src0[i] : 0);
        }

        this.exports.snap_process(frames);

        for (let i = 0; i < frames; ++i) {
            out0[i] = this.outL[i];
            out1[i] = this.outR[i];
        }

        this.meterPeakDb = Math.max(this.meterPeakDb, this.exports.snap_get_input_peak_db());
        if ((++this.meterCounter & 7) === 0) {
            this.port.postMessage({
                type: 'meter',
                db: this.meterPeakDb,
                gateClosed: Boolean(this.exports.snap_get_gate_closed())
            });
            this.meterPeakDb = -60;
        }
        return true;
    }
}

registerProcessor('snap-web-processor', SnapWebProcessor);
