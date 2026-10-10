#pragma once
#include <cstddef>
#include <cstdint>
#include <array>
#include <memory>
#include <string>

// All loading/prewarming/allocation happens in prepare(), never process().
// The final model and knob range can change without changing the host parameters.
class NamCompressor
{
public:
    struct Controls { float amount = 7, tone = 5, volume = 5; bool enabled = true; };
    struct Calibration
    {
        float referenceAmount = 7;
        float minimumInputDb = -21;
        float maximumInputDb = 9;
        float referenceOutputDb = 0;
        float internalBusDb = 5;
        // Normalized tone offset and span; defaults preserve the original curve.
        float toneOffset = 0;
        float toneRange = 1;
        float volumeRangeDb = 18;
        // Unity position; volumeRangeDb is the attenuation from unity to zero.
        float volumeReference = 5;
        // Additional static trim at each COMP integer, relative to COMP 7.
        // Zero keeps mathematical inverse drive; captured compressors can
        // need a measured trim curve to keep the average audition level stable.
        std::array<float, 11> outputTrimDb {};
    };
    NamCompressor();
    ~NamCompressor();
    NamCompressor(const NamCompressor&) = delete;
    NamCompressor& operator=(const NamCompressor&) = delete;
    bool prepare(double hostRate, int maximumBlock, const char* json, std::size_t bytes,
                 Controls initial, Calibration calibration);
    void release();
    void process(float* const* channels, int channelCount, int frames, Controls controls) noexcept;
    bool isReady() const noexcept;
    int latencySamples() const noexcept;
    // Read on the processing thread, or while it is stopped, for verification.
    std::array<std::uint64_t, 2> processedModelSamples() const noexcept;
    const std::string& error() const noexcept;
    static float inputDriveDb(float amount, Calibration calibration) noexcept;
private:
    struct Impl;
    std::unique_ptr<Impl> impl;
};
