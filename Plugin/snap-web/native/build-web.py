#!/usr/bin/env python3
"""Build the browser DSP from the supplied, unmodified SNAP v1.2.4 source ZIP.
Requires Emscripten, Python 3 and its regular LLVM/Binaryen dependencies.
Usage: python Plugin/snap-web/native/build-web.py SNAP_v1.2.4_Source.zip
"""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

web = Path(__file__).resolve().parents[1]
source_info = json.loads((web / 'native/source-v124.json').read_text())
archive = Path(sys.argv[1]).resolve()
with tempfile.TemporaryDirectory(prefix='snap-web-124-') as temporary:
    build = Path(temporary)
    with zipfile.ZipFile(archive) as z:
        # Extract only the native DSP inputs and unchanged third-party dependencies.
        for entry in z.infolist():
            parts = Path(entry.filename).parts
            relative = Path(*parts[1:])
            if entry.is_dir() or not parts or relative.parts[0] not in {'Source', 'Models', 'Vendor'}:
                continue
            if '..' in relative.parts or relative.is_absolute():
                raise ValueError('Unsafe archive path')
            target = build / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(entry))
    for name, expected in source_info['source_files_sha256'].items():
        if hashlib.sha256((build / name).read_bytes()).hexdigest() != expected:
            raise ValueError('Wrong source version: ' + name)
    model = (build / 'Models/forSNAP_Comp.nam').read_bytes()
    if hashlib.sha256(model).hexdigest() != source_info['model_sha256']:
        raise ValueError('Wrong NAM model')
    (build / 'EmbeddedNam.h').write_text('#pragma once\nnamespace EmbeddedNam { inline constexpr char data[] = R"NAMMODEL('
        + model.decode() + ')NAMMODEL"; inline constexpr auto size=sizeof(data)-1; }\n')
    nam = build / 'Vendor/NAM'
    includes = ['-I' + str(p) for p in [web / 'native', build, nam, nam / 'Dependencies/eigen',
        nam / 'Dependencies/nlohmann', nam / 'Dependencies/AudioDSPTools/dsp']]
    files = [*sorted(nam.glob('NAM/**/*.cpp')), web / 'native/NamCompressor.cpp',
        web / 'native/snap-native.cpp', web / 'snap_dsp.c']
    def compile_file(source):
        target = build / (source.parent.name + '_' + source.stem + '.o')
        compiler = os.environ.get('EMCC', 'emcc') if source.suffix == '.c' else os.environ.get('EMXX', 'em++')
        arguments = [compiler, str(source), '-O3', '-msimd128', '-DNAM_SAMPLE_FLOAT', '-DNDEBUG',
            '-DEIGEN_DONT_PARALLELIZE', '-fexceptions', *includes, '-c', '-o', str(target)]
        if source.suffix != '.c': arguments += ['-std=c++20']
        subprocess.run(arguments, check=True)
        return target
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        objects = list(executor.map(compile_file, files))
    exports = ['snap_init', 'snap_reset', 'snap_set_param', 'snap_get_input_l', 'snap_get_input_r',
        'snap_get_output_l', 'snap_get_output_r', 'snap_get_input_peak_db', 'snap_get_gate_closed',
        'snap_process', 'snap_native_error']
    output = build / 'snap-runtime.mjs'
    subprocess.run([os.environ.get('EMXX', 'em++'), *map(str, objects), '-O3', '-msimd128', '-fexceptions',
        '-sDISABLE_EXCEPTION_CATCHING=0', '-sMODULARIZE=1', '-sEXPORT_ES6=1', '-sEXPORT_NAME=createSnapDsp',
        '-sENVIRONMENT=web,worker', '-sFILESYSTEM=0', '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=33554432',
        '-sEXPORTED_FUNCTIONS=' + json.dumps(['_' + name for name in exports]),
        '-sEXPORTED_RUNTIME_METHODS=["UTF8ToString"]', '-o', str(output)], check=True)
    (web / 'snap-runtime.mjs').write_text(output.read_text().replace('snap-runtime.wasm', 'snap_dsp.wasm'))
    shutil.copyfile(output.with_suffix('.wasm'), web / 'snap_dsp.wasm')
print('Built SNAP v1.2.4 Web DSP (Full NAM, mono, 4x DRIVE).')
