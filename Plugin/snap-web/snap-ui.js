/* Presentation only. The existing Web engine remains the source of DSP state. */
(() => {
    'use strict';
    const artwork = {"BACKGROUND": {"file": "label_00_white.png", "ratio": 7.729166666666667}, "BOOST": {"file": "label_01_white.png", "ratio": 3.609375}, "COMP": {"file": "label_02_white.png", "ratio": 2.996875}, "DISPLAY SIZE": {"file": "label_03_white.png", "ratio": 8.145833333333334}, "DRIVE CPU": {"file": "label_04_white.png", "ratio": 6.145833333333333}, "DRIVE": {"file": "label_05_white.png", "ratio": 3.51875}, "EQ": {"file": "label_06_white.png", "ratio": 1.328125}, "GATE": {"file": "label_07_white.png", "ratio": 2.921875}, "HIGH": {"file": "label_08_white.png", "ratio": 2.8385416666666665}, "LOW": {"file": "label_09_white.png", "ratio": 2.1145833333333335}, "MONO": {"file": "label_10_white.png", "ratio": 3.09375}, "ON / OFF": {"file": "label_11_white.png", "ratio": 4.5625}, "PRESET FOLDER": {"file": "label_12_white.png", "ratio": 9.5}, "RESET": {"file": "label_13_white.png", "ratio": 3.6822916666666665}, "SETTINGS": {"file": "label_14_white.png", "ratio": 5.729166666666667}, "SIGNAL": {"file": "label_15_white.png", "ratio": 4.348958333333333}, "SNAP": {"file": "label_16_white.png", "ratio": 3.075}, "STEREO": {"file": "label_17_white.png", "ratio": 4.411458333333333}, "TONE": {"file": "label_18_white.png", "ratio": 3.034375}, "VOL": {"file": "label_19_white.png", "ratio": 2.140625}, "-12": {"file": "label_20_gray.png", "ratio": 1.6363636363636365}, "-18": {"file": "label_21_gray.png", "ratio": 1.6391304347826088}, "-24": {"file": "label_22_gray.png", "ratio": 1.6406926406926408}, "-48": {"file": "label_23_gray.png", "ratio": 1.6391304347826088}, "-6": {"file": "label_24_gray.png", "ratio": 0.9826086956521739}, "-inf": {"file": "label_25_gray.png", "ratio": 2.051948051948052}, "0": {"file": "label_26_gray.png", "ratio": 0.49130434782608695}, "Good target": {"file": "label_30_white.png", "ratio": 5.820276497695852}, "Kaichi": {"file": "label_31_gray.png", "ratio": 3.4875}, "PRESET": {"file": "label_32_gray.png", "ratio": 4.459375}, "TRIM": {"file": "label_33_gray.png", "ratio": 2.8217391304347825}, " -> ": {"file": "label_34_gray.png", "ratio": 2.121019108280255}, "CLOSE": {"file": "label_35_gray.png", "ratio": 3.56875}, "31": {"file": "label_36_gray.png", "ratio": 1.0913043478260869}, "62": {"file": "label_37_gray.png", "ratio": 1.1385281385281385}, "125": {"file": "label_38_gray.png", "ratio": 1.7186147186147187}, "250": {"file": "label_39_gray.png", "ratio": 1.8225108225108224}, "500": {"file": "label_40_gray.png", "ratio": 1.826086956521739}, "1k": {"file": "label_41_gray.png", "ratio": 1.0649350649350648}, "2k": {"file": "label_42_gray.png", "ratio": 1.173160173160173}, "4k": {"file": "label_43_gray.png", "ratio": 1.1608695652173913}, "8k": {"file": "label_44_gray.png", "ratio": 1.173160173160173}, "16k": {"file": "label_45_gray.png", "ratio": 1.7359307359307359}, "CAB": {"file": "label_46_gray.png", "ratio": 2.1774891774891776}, "+12": {"file": "label_47_gray.png", "ratio": 1.8225108225108224}, "WATER": {"file": "label_48_white.png", "ratio": 3.8697916666666665}, "WOOD FLOOR": {"file": "label_49_white.png", "ratio": 7.067708333333333}, "OFF": {"file": "label_50_white.png", "ratio": 2.0989583333333335}, "Guitar Effect Plugin by Kaichi": {"file": "label_51_white.png", "ratio": 15.36697247706422}, "CAB off": {"file": "label_52_white.png", "ratio": 4.401041666666667}, "CAB A": {"file": "label_53_white.png", "ratio": 3.375}, "CAB B": {"file": "label_54_white.png", "ratio": 3.3125}, "CAB C": {"file": "label_55_white.png", "ratio": 3.2864583333333335}, "CAB D": {"file": "label_56_white.png", "ratio": 3.4166666666666665}, "GoodTarget": {"file": "label_30_white.png", "ratio": 5.820276497695852}, "→": {"file": "label_34_gray.png", "ratio": 2.121019108280255}, "60 Hz": {"file": "label_57_white.png", "ratio": 2.8020833333333335}, "100 Hz": {"file": "label_58_white.png", "ratio": 3.3802083333333335}, "150 Hz": {"file": "label_59_white.png", "ratio": 3.3802083333333335}, "LOW CUT": {"file": "label_65_white.png", "ratio": 4.178010471204188}};

    const CAB_LABELS = ['CAB off', 'CAB A', 'CAB B', 'CAB C', 'CAB D'];
    function label(text) {
        const item = artwork[text];
        if (!item) return document.createTextNode(text);
        const span = document.createElement('span');
        span.className = 'snap-art';
        span.setAttribute('role', 'img');
        span.setAttribute('aria-label', text);
        span.style.setProperty('--art', `url("ui/v134/labels/${item.file}")`);
        span.style.setProperty('--art-ratio', item.ratio);
        return span;
    }
    function sync(params) {
        const mode = Math.max(0, Math.min(4, Math.round(Number(params.cabMode) || 0)));
        const cab = document.getElementById('snap134-cab-label');
        if (cab && cab.dataset.mode !== String(mode)) {
            cab.replaceChildren(label(CAB_LABELS[mode]));
            cab.dataset.mode = String(mode);
        }
        const control = document.querySelector('[data-snap-param="cabMode"]');
        if (control) control.setAttribute('aria-valuetext', CAB_LABELS[mode]);
        const chain = [];
        if (Number(params.gate) > .01) chain.push('GATE');
        if (Number(params.inputLowCut) > 0) chain.push('LOW CUT');
        if (Number(params.compOn) >= .5) chain.push('COMP');
        if (Number(params.driveOn) >= .5) chain.push('DRIVE');
        if (Number(params.eqOn) >= .5) chain.push('EQ');
        if (mode > 0) chain.push('CAB');
        const flow = document.getElementById('snap134-flow');
        const text = chain.join(' → ');
        if (flow && flow.getAttribute('aria-label') !== text) {
            flow.setAttribute('aria-label', text);
            flow.replaceChildren(...chain.flatMap((word, i) => i ? [label('→'), label(word)] : [label(word)]));
        }
    }
    function setBackground(value) {
        const background = value === 'wood' ? 'wood' : 'water';
        const root = document.getElementById('snap-vst-ui');
        root.dataset.background = background;
        document.querySelectorAll('[data-snap-background]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.snapBackground === background));
        });
        try { localStorage.setItem('snap-web-background', background); } catch (_) { /* Optional preference. */ }
    }
    function setup(engine, applyValues) {
        let background = 'water';
        try { background = localStorage.getItem('snap-web-background') || background; } catch (_) {}
        setBackground(background);
        document.querySelectorAll('[data-snap-background]').forEach(button => {
            button.addEventListener('click', () => setBackground(button.dataset.snapBackground));
        });
        const select = document.getElementById('web-preset-select');
        const save = document.getElementById('web-preset-save');
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem('snap-web-user-preset-v124')); } catch (_) {}
        function addSavedOption() {
            if (!select.querySelector('[value="browser-saved"]')) {
                select.add(new Option('Saved preset', 'browser-saved'));
            }
        }
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) addSavedOption();
        select.addEventListener('change', () => {
            if (select.value === 'browser-saved' && saved) applyValues(saved);
        });
        save.addEventListener('click', () => {
            const snapshot = { ...engine.params };
            try {
                localStorage.setItem('snap-web-user-preset-v124', JSON.stringify(snapshot));
                saved = snapshot;
                addSavedOption();
                select.value = 'browser-saved';
                document.getElementById('web-preset-dirty').textContent = '';
                save.title = 'Preset saved in this browser';
            } catch (_) { save.title = 'Browser storage is unavailable; preset could not be saved'; }
        });
        sync(engine.params);
    }
    window.SnapWebUi = { sync, setup };
})();
