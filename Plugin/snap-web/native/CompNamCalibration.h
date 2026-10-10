#pragma once
#include "NamCompressor.h"

namespace CompNamCalibration
{
// forSNAP_Comp SHA256: 44544af3fed46085db3f76e2f52a75c49ec92b8152ba955b7ad6cc5b957c3f2f
inline NamCompressor::Calibration make()
{
    NamCompressor::Calibration calibration;
    // TONE 5 is the uncoloured NAM output. Keep the wider tone travel.
    calibration.toneOffset = 0.0f;
    calibration.toneRange = 1.5f;
    calibration.volumeRangeDb = 24;
    // VOL 7 is unity. Linear dB travel: 0=-24 dB, 10=+10.2857 dB.
    calibration.volumeReference = 7;
    // Static residual trim measured against the 190 s capture input.
    // COMP 7 remains exactly the captured digital level.
    calibration.outputTrimDb = {
        -15.164500f, -13.052500f, -10.912200f, -8.748190f, -6.565470f,
        -4.380200f, -2.190430f, 0.000000f, 2.184710f, 4.360930f, 6.525910f
    };
    return calibration;
}
}
