#pragma once

#include <algorithm>
#include <array>
#include <cmath>

// A separate input high-pass between GATE and COMP. The DRIVE laboratory
// low-cut remains independent. No allocations or added latency in this stage.
class InputLowCut
{
public:
    inline static constexpr std::array<float, 4> frequencies { 0, 60, 100, 150 };
    inline static constexpr std::array<const char*, 4> labels {
        "OFF", "60 Hz", "100 Hz", "150 Hz"
    };

    static float frequencyForChoice (int choice) noexcept
    {
        return frequencies[static_cast<std::size_t> (std::clamp (choice, 0, static_cast<int> (frequencies.size()) - 1))];
    }

    void prepare (double rate, int choice) noexcept
    {
        sampleRate = std::max (1000.0, rate);
        const auto selectedHz = frequencyForChoice (choice);
        cutoff = selectedHz > 0 ? selectedHz : 80.0;
        wet = selectedHz > 0 ? 1.0 : 0.0;
        smoothing = 1.0 - std::exp (-1.0 / (sampleRate * 0.020));
        updateCoefficients();
        reset();
    }

    void reset() noexcept { states = {}; }

    void process (float* const* channels, int channelCount, int sampleCount, int choice) noexcept
    {
        const auto selectedHz = frequencyForChoice (choice);
        const auto wetTarget = selectedHz > 0 ? 1.0 : 0.0;
        // While OFF, keep the last cutoff and filter histories warm for a smooth
        // next activation. Once the fade reaches zero, the output is exact dry.
        const auto cutoffTarget = selectedHz > 0 ? static_cast<double> (selectedHz) : cutoff;
        channelCount = std::clamp (channelCount, 0, static_cast<int> (states.size()));
        for (int i = 0; i < sampleCount; ++i)
        {
            if (cutoff != cutoffTarget)
            {
                cutoff += smoothing * (cutoffTarget - cutoff);
                if (std::abs (cutoffTarget - cutoff) < 1.0e-6) cutoff = cutoffTarget;
                updateCoefficients();
            }
            wet += smoothing * (wetTarget - wet);
            if (std::abs (wetTarget - wet) < 1.0e-7) wet = wetTarget;

            // Bilinear-transform Butterworth high-pass, -3 dB at the selected
            // frequency and 12 dB/oct below it. Smooth the cutoff, rather than
            // abruptly replacing coefficients, during frequency automation.
            for (int c = 0; c < channelCount; ++c)
            {
                auto& state = states[static_cast<std::size_t> (c)];
                const auto input = static_cast<double> (channels[c][i]);
                const auto filtered = b0 * input + state.z1;
                state.z1 = -2.0 * b0 * input - a1 * filtered + state.z2;
                state.z2 = b0 * input - a2 * filtered;
                if (std::abs (state.z1) < 1.0e-30) state.z1 = 0;
                if (std::abs (state.z2) < 1.0e-30) state.z2 = 0;
                if (wet > 0)
                    channels[c][i] = static_cast<float> (input + wet * (filtered - input));
            }
        }
    }

private:
    void updateCoefficients() noexcept
    {
        const auto k = std::tan (3.14159265358979323846 * cutoff / sampleRate);
        b0 = 1.0 / (1.0 + 1.4142135623730950488 * k + k * k);
        a1 = 2.0 * (k * k - 1.0) * b0;
        a2 = (1.0 - 1.4142135623730950488 * k + k * k) * b0;
    }
    struct State { double z1 = 0, z2 = 0; };
    std::array<State, 2> states {};
    double sampleRate = 48000, cutoff = 80, wet = 0, smoothing = 0;
    double b0 = 1, a1 = 0, a2 = 0;
};
