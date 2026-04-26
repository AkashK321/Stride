/**
 * Unit tests for SensorService heading calculation logic
 *
 * Tests cover:
 * 1. Tilt-compensated heading calculation from accelerometer + magnetometer
 * 2. Circular mean smoothing with correct 0°/360° wraparound handling
 * 3. Magnetometer hard-iron calibration offset correction
 *
 * These functions underpin the heading tracking feature (issue #169)
 * which feeds heading_degrees into NavigationFrameMessage via WebSocket.
 */

// ─── Pure utility functions extracted for unit testing ────────────────────────
// These mirror the logic in services/SensorService.ts

function toRadians(deg: number): number {
    return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
    return (rad * 180) / Math.PI;
}

/**
 * Computes tilt-compensated heading (degrees, 0–360) from raw sensor readings.
 * Mirrors the formula in SensorService.ts:
 *   roll  = atan2(acc_y, acc_z)
 *   pitch = atan2(-acc_x, sqrt(acc_y² + acc_z²))
 *   mag_x_comp = mag_x * cos(pitch) + mag_z * sin(pitch)
 *   mag_y_comp = mag_x * sin(roll) * sin(pitch) + mag_y * cos(roll) - mag_z * sin(roll) * cos(pitch)
 *   heading = atan2(-mag_y_comp, mag_x_comp)  →  normalised to [0, 360)
 */
function computeTiltCompensatedHeading(
    acc: { x: number; y: number; z: number },
    mag: { x: number; y: number; z: number }
): number {
    const roll = Math.atan2(acc.y, acc.z);
    const pitch = Math.atan2(-acc.x, Math.sqrt(acc.y ** 2 + acc.z ** 2));

    const magXComp =
        mag.x * Math.cos(pitch) + mag.z * Math.sin(pitch);
    const magYComp =
        mag.x * Math.sin(roll) * Math.sin(pitch) +
        mag.y * Math.cos(roll) -
        mag.z * Math.sin(roll) * Math.cos(pitch);

    let heading = toDegrees(Math.atan2(-magYComp, magXComp));
    if (heading < 0) heading += 360;
    return heading;
}

/**
 * Computes circular mean of a list of headings (degrees).
 * Correctly handles the 0°/360° wraparound.
 * Mirrors the smoothing window logic in SensorService.ts.
 */
function circularMean(headings: number[]): number {
    if (headings.length === 0) return 0;
    const n = headings.length;
    const sinSum = headings.reduce(
        (sum, h) => sum + Math.sin(toRadians(h)),
        0
    );
    const cosSum = headings.reduce(
        (sum, h) => sum + Math.cos(toRadians(h)),
        0
    );
    let mean = toDegrees(Math.atan2(sinSum / n, cosSum / n));
    if (mean < 0) mean += 360;
    return mean;
}

/**
 * Applies hard-iron calibration offset to raw magnetometer readings.
 * Mirrors the figure-8 calibration correction in SensorService.ts:
 *   correctedMag = rawMag - offset
 */
function applyMagCalibration(
    raw: { x: number; y: number; z: number },
    offset: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
    return {
        x: raw.x - offset.x,
        y: raw.y - offset.y,
        z: raw.z - offset.z,
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SensorService – tilt-compensated heading", () => {
    /**
     * When the phone is held flat (acc_z ≈ 9.8, acc_x ≈ acc_y ≈ 0) and the
     * magnetometer points north (positive mag_x), heading should be near 0°.
     */
    test("returns ~0° when phone is flat and mag points north", () => {
        const acc = { x: 0, y: 0, z: 9.8 };
        const mag = { x: 40, y: 0, z: 0 };
        const heading = computeTiltCompensatedHeading(acc, mag);
        expect(heading).toBeCloseTo(0, 0); // within 1°
    });

    /**
     * When mag_y is strongly negative (pointing east), heading should be ~90°.
     */
    test("returns ~90° when phone faces east", () => {
        const acc = { x: 0, y: 0, z: 9.8 };
        const mag = { x: 0, y: -40, z: 0 };
        const heading = computeTiltCompensatedHeading(acc, mag);
        expect(heading).toBeCloseTo(90, 0);
    });

    /**
     * When mag_x is strongly negative (pointing south), heading should be ~180°.
     */
    test("returns ~180° when phone faces south", () => {
        const acc = { x: 0, y: 0, z: 9.8 };
        const mag = { x: -40, y: 0, z: 0 };
        const heading = computeTiltCompensatedHeading(acc, mag);
        expect(heading).toBeCloseTo(180, 0);
    });

    /**
     * Heading output must always be in the range [0, 360).
     * Negative intermediate atan2 results must be normalised.
     */
    test("heading is always in [0, 360) range", () => {
        const testCases = [
            { acc: { x: 0, y: 0, z: 9.8 }, mag: { x: 40, y: 1, z: 0 } },
            { acc: { x: 0, y: 0, z: 9.8 }, mag: { x: -10, y: -35, z: 0 } },
            { acc: { x: 1, y: 2, z: 9.5 }, mag: { x: 20, y: -30, z: 5 } },
            { acc: { x: -1, y: 0, z: 9.7 }, mag: { x: 5, y: 38, z: -3 } },
        ];
        for (const { acc, mag } of testCases) {
            const heading = computeTiltCompensatedHeading(acc, mag);
            expect(heading).toBeGreaterThanOrEqual(0);
            expect(heading).toBeLessThan(360);
        }
    });

    /**
     * With phone tilted (acc_x != 0), tilt compensation should still produce
     * a sensible heading — verifies the roll/pitch compensation math runs
     * without NaN or Infinity.
     */
    test("does not produce NaN or Infinity when phone is tilted", () => {
        const acc = { x: 3.0, y: 1.5, z: 8.9 }; // ~18° pitch tilt
        const mag = { x: 25, y: -15, z: 10 };
        const heading = computeTiltCompensatedHeading(acc, mag);
        expect(Number.isFinite(heading)).toBe(true);
        expect(Number.isNaN(heading)).toBe(false);
    });
});

describe("SensorService – circular mean smoothing", () => {
    /**
     * Core wraparound test: averaging 350° and 10° should yield ~0°, not 180°.
     * This is the key correctness property of circular mean over arithmetic mean.
     */
    test("correctly averages headings that straddle 0°/360°", () => {
        const headings = [350, 10]; // arithmetic mean would be 180° — wrong
        const mean = circularMean(headings);
        // Expect result near 0° (could be expressed as ~360 or ~0)
        const normalised = mean > 180 ? mean - 360 : mean;
        expect(Math.abs(normalised)).toBeLessThan(5);
    });

    /**
     * When all headings are identical, the circular mean equals that value.
     */
    test("returns the same value when all headings are equal", () => {
        const headings = [90, 90, 90, 90, 90];
        expect(circularMean(headings)).toBeCloseTo(90, 1);
    });

    /**
     * Averaging headings around 270° (west) should stay near 270°.
     */
    test("correctly averages headings clustered around 270°", () => {
        const headings = [265, 270, 275, 268, 272];
        const mean = circularMean(headings);
        expect(mean).toBeGreaterThan(260);
        expect(mean).toBeLessThan(280);
    });

    /**
     * Edge case: single-element array returns that heading unchanged.
     */
    test("returns the single heading when array has one element", () => {
        expect(circularMean([135])).toBeCloseTo(135, 1);
    });

    /**
     * Empty array should not throw — returns 0 as a safe default.
     */
    test("handles empty array without throwing", () => {
        expect(() => circularMean([])).not.toThrow();
        expect(circularMean([])).toBe(0);
    });
});

describe("SensorService – magnetometer hard-iron calibration", () => {
    /**
     * After applying the offset, the corrected reading should equal raw - offset.
     */
    test("subtracts calibration offset from raw magnetometer reading", () => {
        const raw = { x: 50, y: -20, z: 10 };
        const offset = { x: 12, y: -8, z: 3 };
        const corrected = applyMagCalibration(raw, offset);
        expect(corrected.x).toBeCloseTo(38, 5);
        expect(corrected.y).toBeCloseTo(-12, 5);
        expect(corrected.z).toBeCloseTo(7, 5);
    });

    /**
     * A zero offset should leave the raw reading unchanged.
     */
    test("zero offset leaves reading unchanged", () => {
        const raw = { x: 33, y: -17, z: 5 };
        const offset = { x: 0, y: 0, z: 0 };
        const corrected = applyMagCalibration(raw, offset);
        expect(corrected).toEqual(raw);
    });

    /**
     * Negative offset values (i.e., raw values below the mean) are handled correctly.
     */
    test("handles negative raw and offset values correctly", () => {
        const raw = { x: -10, y: -5, z: -2 };
        const offset = { x: -15, y: 3, z: -8 };
        const corrected = applyMagCalibration(raw, offset);
        expect(corrected.x).toBeCloseTo(5, 5);
        expect(corrected.y).toBeCloseTo(-8, 5);
        expect(corrected.z).toBeCloseTo(6, 5);
    });
});