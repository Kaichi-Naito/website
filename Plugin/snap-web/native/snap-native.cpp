// SNAP v1.2.4 browser bridge. Original native COMP and LOW CUT code is unchanged.
#include "NamCompressor.h"
#include "CompNamCalibration.h"
#include "InputLowCut.h"
#include "EmbeddedNam.h"

static NamCompressor compressor;
static InputLowCut lowCut;

extern "C" int snap_native_init(float rate)
{
    lowCut.prepare(rate, 0);
    return compressor.prepare(rate, 128, EmbeddedNam::data, EmbeddedNam::size,
                              {5, 5, 5, true}, CompNamCalibration::make());
}
extern "C" void snap_native_low_cut(float* left, int frames, int choice)
{
    float* channels[] {left};
    lowCut.process(channels, 1, frames, choice);
}
extern "C" void snap_native_comp(float* left, int frames, float amount, float tone, float volume, int enabled)
{
    float* channels[] {left};
    compressor.process(channels, 1, frames, {amount, tone, volume, enabled != 0});
}
extern "C" void snap_native_reset_filter() { lowCut.reset(); }
extern "C" const char* snap_native_error() { return compressor.error().c_str(); }
