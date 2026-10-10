#include "NamCompressor.h"
#include <NAM/get_dsp.h>
// AudioDSPTools' standalone resampler retains two iPlug host constants.
// Supply only those constants; SNAP does not depend on the iPlug framework.
namespace iplug { inline constexpr double PI = 3.14159265358979323846; }
inline constexpr int DEFAULT_BLOCK_SIZE = 256;
#include <ResamplingContainer/ResamplingContainer.h>
#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <stdexcept>
#include <mutex>
#include <vector>

namespace
{
float gain(float db) { return std::pow(10.0f, db / 20.0f); }
float bounded(float value, float fallback, float low, float high)
{ return std::clamp(std::isfinite(value) ? value : fallback, low, high); }
float outputTrim(float drive, const NamCompressor::Calibration& c)
{
    const auto amount = std::clamp(drive <= 0
        ? c.referenceAmount * (1 - drive / c.minimumInputDb)
        : c.referenceAmount + (10 - c.referenceAmount) * drive / c.maximumInputDb, 0.0f, 10.0f);
    const auto index = std::min(9, static_cast<int>(amount));
    return c.outputTrimDb[static_cast<std::size_t>(index)]
        + (amount-index) * (c.outputTrimDb[static_cast<std::size_t>(index+1)]
                           - c.outputTrimDb[static_cast<std::size_t>(index)]);
}
}

struct NamCompressor::Impl
{
    std::array<std::unique_ptr<nam::DSP>, 2> models;
    std::unique_ptr<dsp::ResamplingContainer<float, 2, 12>> resampler;
    dsp::ResamplingContainer<float, 2, 12>::BlockProcessFunc render;
    std::array<std::vector<float>, 2> input, output, dry, delay;
    std::vector<float> postDrive, driveDelay;
    std::array<float, 2> toneState {};
    Calibration calibration;
    std::string error;
    int maximumBlock = 256, latency = 0, position = 0;
    int activeChannels = 2, rightWarmupSamples = 0, rightWarmupRemaining = 0;
    float rightBlend = 1, rightBlendStep = 1;
    std::array<std::uint64_t, 2> processedSamples {};
    float driveDb = 0, tone = 5, volume = 5, wet = 1, smooth = 0, toneCoefficient = 0;
    bool ready = false;
};

NamCompressor::NamCompressor() : impl(std::make_unique<Impl>()) {}
NamCompressor::~NamCompressor() = default;
void NamCompressor::release() { impl = std::make_unique<Impl>(); }
bool NamCompressor::isReady() const noexcept { return impl->ready; }
int NamCompressor::latencySamples() const noexcept { return impl->latency; }
std::array<std::uint64_t, 2> NamCompressor::processedModelSamples() const noexcept
{ return impl->processedSamples; }
const std::string& NamCompressor::error() const noexcept { return impl->error; }

float NamCompressor::inputDriveDb(float amount, Calibration c) noexcept
{
    amount = bounded(amount, c.referenceAmount, 0, 10);
    return amount <= c.referenceAmount
        ? c.minimumInputDb * (1 - amount / c.referenceAmount)
        : c.maximumInputDb * (amount - c.referenceAmount) / (10 - c.referenceAmount);
}

bool NamCompressor::prepare(double hostRate, int maximumBlock, const char* json,
                            std::size_t bytes, Controls initial, Calibration calibration)
{
    // Lanczos lookup-table initialization is shared across instances.
    // Serialize prepare only; the audio callback never acquires this lock.
    static std::mutex prepareMutex;
    const std::lock_guard<std::mutex> lock(prepareMutex);
    release();
    auto& s = *impl;
    s.calibration = calibration;
    if (json == nullptr || bytes == 0)
    { s.error = "No NAM model data; COMP is bypassed."; return false; }
    try
    {
        if (!std::isfinite(hostRate) || hostRate < 8000 || hostRate > 384000
            || calibration.referenceAmount <= 0 || calibration.referenceAmount >= 10
            || !std::isfinite(calibration.minimumInputDb) || calibration.minimumInputDb >= 0
            || !std::isfinite(calibration.maximumInputDb) || calibration.maximumInputDb <= 0
            || !std::isfinite(calibration.toneOffset)
            || !std::isfinite(calibration.toneRange) || calibration.toneRange <= 0
            || !std::isfinite(calibration.volumeRangeDb) || calibration.volumeRangeDb <= 0
            || !std::isfinite(calibration.volumeReference)
            || calibration.volumeReference <= 0 || calibration.volumeReference >= 10)
            throw std::runtime_error("Invalid NAM processing configuration");
        const auto config = nlohmann::json::parse(json, json + bytes);
        nam::DspLoadOptions options;
        options.prewarm = false;
        for (auto& model : s.models)
        {
            model = nam::get_dsp(config, options);
            if (model->NumInputChannels() != 1 || model->NumOutputChannels() != 1)
                throw std::runtime_error("COMP requires a mono-input, mono-output NAM");
        }
        const auto modelRate = s.models[0]->GetExpectedSampleRate();
        if (!std::isfinite(modelRate) || modelRate < 8000 || modelRate > 384000)
            throw std::runtime_error("NAM sample_rate must be specified within 8-384 kHz");
        // A minimum scratch size also accommodates resampler pre-population
        // when hosts request tiny blocks. Always rebuild resamplers on prepare.
        // Chunk oversized host buffers rather than overfilling the upstream
        // resampler's fixed history. This also bounds inference scratch memory.
        const auto scratchMinimum = std::max(256, static_cast<int>(std::ceil(32 * (1 + hostRate / modelRate))));
        s.maximumBlock = std::clamp(maximumBlock, scratchMinimum, 2048);
        const bool convert = std::abs(hostRate - modelRate) > 0.01;
        if (convert)
        {
            s.resampler = std::make_unique<dsp::ResamplingContainer<float, 2, 12>>(modelRate);
            s.resampler->Reset(hostRate, s.maximumBlock);
            // Upstream GetLatency reports pre-population, which differs from
            // the audible impulse delay by several samples at some ratios.
            // Measure the resampling pair outside the audio callback, without
            // the model (its captured response must never be time-normalized).
            std::vector<float> probe(s.maximumBlock, 0), result(s.maximumBlock, 0);
            probe[0] = 1;
            float* inputs[] { probe.data(), probe.data() };
            float* outputs[] { result.data(), result.data() };
            s.resampler->ProcessBlock(inputs, outputs, s.maximumBlock,
                [](float** in, float** out, int n)
                { for (int c = 0; c < 2; ++c) std::copy_n(in[c], n, out[c]); });
            const auto peak = std::max_element(result.begin(), result.end(),
                [](float a, float b) { return std::abs(a) < std::abs(b); });
            s.latency = static_cast<int>(peak - result.begin());
            s.resampler = std::make_unique<dsp::ResamplingContainer<float, 2, 12>>(modelRate);
            s.resampler->Reset(hostRate, s.maximumBlock);
        }
        const auto modelBlock = static_cast<int>(std::ceil(s.maximumBlock * modelRate / hostRate));
        for (auto& model : s.models)
            model->ResetAndPrewarm(modelRate, std::max(s.maximumBlock, modelBlock));
        // The embedded Full WaveNet has finite convolution history. Upon
        // resuming stereo, process its right stream normally while hiding that
        // output for a receptive field, resampling delay and tone settling.
        // No history replay, reset, allocation or extra inference burst occurs
        // in the audio callback. Fresh stereo preparation needs no transition.
        s.rightWarmupSamples = static_cast<int>(std::ceil(
            s.models[1]->GetPrewarmSamples() * hostRate / modelRate))
            + s.latency + static_cast<int>(std::ceil(hostRate * .005));
        s.rightBlendStep = 1.0f / static_cast<float>(std::max(1.0, hostRate * .020));
        // A small pointer capture fits std::function's inline storage. The
        // function is created once here; inference itself never loads models.
        s.render = [state = &s](float** inputs, float** outputs, int frames)
        {
            for (int c = 0; c < state->activeChannels; ++c)
            {
                state->models[static_cast<std::size_t>(c)]->process(&inputs[c], &outputs[c], frames);
                state->processedSamples[static_cast<std::size_t>(c)] += static_cast<std::uint64_t>(frames);
            }
            // Keep the output resampler's second history current without
            // running a second NAM in mono. Host mono output still uses left.
            if (state->activeChannels == 1)
                std::copy_n(outputs[0], frames, outputs[1]);
        };
        for (int c = 0; c < 2; ++c)
        {
            s.input[c].resize(s.maximumBlock);
            s.output[c].resize(s.maximumBlock);
            s.dry[c].resize(s.maximumBlock);
            s.delay[c].assign(s.latency + 1, 0);
        }
        s.postDrive.resize(s.maximumBlock);
        s.driveDb = inputDriveDb(initial.amount, calibration);
        s.driveDelay.assign(s.latency + 1, s.driveDb);
        s.tone = bounded(initial.tone, 5, 0, 10);
        s.volume = bounded(initial.volume, calibration.volumeReference, 0, 10);
        s.wet = initial.enabled ? 1.0f : 0.0f;
        s.smooth = static_cast<float>(1 - std::exp(-1 / (hostRate * .020)));
        s.toneCoefficient = static_cast<float>(1 - std::exp(-6.283185307179586 * 2400 / hostRate));
        s.ready = true;
        return true;
    }
    catch (const std::exception& e)
    {
        const std::string message = e.what();
        release(); impl->error = message;
        return false;
    }
}

void NamCompressor::process(float* const* channels, int channelCount, int frames,
                            Controls controls) noexcept
{
    auto& s = *impl;
    if (!s.ready || channelCount < 1 || frames < 1) return;
    channelCount = std::min(channelCount, 2);
    if (channelCount == 2 && s.activeChannels == 1)
    {
        s.rightWarmupRemaining = s.rightWarmupSamples;
        s.rightBlend = 0;
    }
    s.activeChannels = channelCount;
    const auto driveTarget = inputDriveDb(controls.amount, s.calibration);
    const auto toneTarget = bounded(controls.tone, 5, 0, 10);
    const auto volumeTarget = bounded(controls.volume, s.calibration.volumeReference, 0, 10);
    const auto wetTarget = controls.enabled ? 1.0f : 0.0f;
    for (int offset = 0; offset < frames; offset += s.maximumBlock)
    {
        const auto count = std::min(s.maximumBlock, frames - offset);
        for (int i = 0; i < count; ++i)
        {
            s.driveDb += s.smooth * (driveTarget - s.driveDb);
            const auto pre = gain(s.driveDb - s.calibration.internalBusDb);
            const auto read = (s.position + 1) % (s.latency + 1);
            s.driveDelay[s.position] = s.driveDb;
            s.postDrive[i] = s.driveDelay[read];
            for (int c = 0; c < 2; ++c)
            {
                const auto x = channels[std::min(c, channelCount - 1)][offset + i];
                s.input[c][i] = x * pre;
                s.delay[c][s.position] = x;
                s.dry[c][i] = s.delay[c][read];
            }
            s.position = read;
        }
        std::array<float*, 2> in { s.input[0].data(), s.input[1].data() };
        std::array<float*, 2> out { s.output[0].data(), s.output[1].data() };
        if (s.resampler)
            s.resampler->ProcessBlock(in.data(), out.data(), count, s.render);
        else s.render(in.data(), out.data(), count);
        for (int i = 0; i < count; ++i)
        {
            s.tone += s.smooth * (toneTarget - s.tone);
            s.volume += s.smooth * (volumeTarget - s.volume);
            s.wet += s.smooth * (wetTarget - s.wet);
            const auto center = s.calibration.toneOffset
                + s.calibration.toneRange * (s.tone - 5) / 5;
            const auto shape = std::copysign(std::pow(std::abs(center), .85f), center);
            const auto low = gain(shape <= 0 ? -shape * 2.5f : -shape * 1.5f);
            const auto high = gain(shape <= 0 ? shape * 9 : shape * 7);
            // Inverse input drive is static compensation, not another
            // compressor or envelope follower. Delaying the inverse by the
            // resampler latency keeps gain automation aligned with the audio.
            const auto post = gain(-s.postDrive[i] + s.calibration.referenceOutputDb
                                   + outputTrim(s.postDrive[i], s.calibration)
                                   + s.calibration.internalBusDb
                                   + (s.volume - s.calibration.volumeReference)
                                       * s.calibration.volumeRangeDb / s.calibration.volumeReference);
            if (s.activeChannels == 2)
            {
                if (s.rightWarmupRemaining > 0) --s.rightWarmupRemaining;
                else s.rightBlend = std::min(1.0f, s.rightBlend + s.rightBlendStep);
            }
            float leftWet = 0;
            for (int c = 0; c < s.activeChannels; ++c)
            {
                const auto x = s.output[c][i];
                s.toneState[c] += s.toneCoefficient * (x - s.toneState[c]);
                auto wet = (s.toneState[c] * low + (x - s.toneState[c]) * high) * post;
                if (c == 0) leftWet = wet;
                else if (s.rightBlend < 1)
                    wet = leftWet + s.rightBlend * (wet - leftWet);
                channels[c][offset + i] = s.dry[c][i] + s.wet * (wet - s.dry[c][i]);
            }
            if (s.activeChannels == 1) s.toneState[1] = s.toneState[0];
        }
    }
}
