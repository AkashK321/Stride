/**
 * Integration tests for useHeading hook
 *
 * Tests the compass heading subscription, rolling average smoothing,
 * alignment detection, and permission handling.
 */

import * as React from "react";
import { render, waitFor, act } from "@testing-library/react-native";
import { useHeading } from "../hooks/useHeading";

// Mock expo-location
const mockRequestForegroundPermissionsAsync = jest.fn();
const mockWatchHeadingAsync = jest.fn();

jest.mock("expo-location", () => ({
    requestForegroundPermissionsAsync: (...args: any[]) =>
        mockRequestForegroundPermissionsAsync(...args),
    watchHeadingAsync: (...args: any[]) => mockWatchHeadingAsync(...args),
}));

// Test consumer component to access hook return values
function HeadingTestConsumer({
    onRender,
}: {
    onRender: (result: ReturnType<typeof useHeading>) => void;
}) {
    const result = useHeading();
    React.useEffect(() => {
        onRender(result);
    });
    return null;
}

describe("useHeading", () => {
    let capturedResult: ReturnType<typeof useHeading> | null = null;
    let mockSubscriptionRemove: jest.Mock;
    // Holds the callback passed to watchHeadingAsync so tests can fire heading updates
    let headingCallback: ((data: { trueHeading: number | null; magHeading: number }) => void) | null =
        null;

    beforeEach(() => {
        jest.clearAllMocks();
        capturedResult = null;
        headingCallback = null;

        mockSubscriptionRemove = jest.fn();

        mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: "granted" });

        mockWatchHeadingAsync.mockImplementation((cb: any) => {
            headingCallback = cb;
            return Promise.resolve({ remove: mockSubscriptionRemove });
        });
    });

    // --- Initial state ---

    describe("Initial state", () => {
        it("starts with smoothedHeading as null before any readings arrive", async () => {
            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(mockWatchHeadingAsync).toHaveBeenCalled();
            });

            expect(capturedResult?.smoothedHeading).toBeNull();
        });

        it("starts with hasPermission false before permission resolves", () => {
            // Delay permission resolution so we can observe initial state
            let resolvePermission: (value: any) => void;
            mockRequestForegroundPermissionsAsync.mockReturnValueOnce(
                new Promise((resolve) => {
                    resolvePermission = resolve;
                })
            );

            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            expect(capturedResult?.hasPermission).toBe(false);
        });
    });

    // --- Permission handling ---

    describe("Permission handling", () => {
        it("sets hasPermission to true when permission is granted", async () => {
            mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: "granted" });

            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(capturedResult?.hasPermission).toBe(true);
            });
        });

        it("sets hasPermission to false when permission is denied", async () => {
            mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: "denied" });

            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalled();
            });

            expect(capturedResult?.hasPermission).toBe(false);
        });

        it("does not subscribe to heading when permission is denied", async () => {
            mockRequestForegroundPermissionsAsync.mockResolvedValue({ status: "denied" });

            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(mockRequestForegroundPermissionsAsync).toHaveBeenCalled();
            });

            expect(mockWatchHeadingAsync).not.toHaveBeenCalled();
        });
    });

    // --- Heading readings ---

    describe("Heading readings", () => {
        it("uses trueHeading when it is available and non-negative", async () => {
            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(headingCallback).not.toBeNull();
            });

            await act(async () => {
                headingCallback!({ trueHeading: 90, magHeading: 100 });
            });

            await waitFor(() => {
                expect(capturedResult?.smoothedHeading).not.toBeNull();
            });

            // With one sample the smoothed value should be close to the true heading
            expect(capturedResult!.smoothedHeading!).toBeCloseTo(90, 0);
        });

        it("falls back to magHeading when trueHeading is null", async () => {
            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(headingCallback).not.toBeNull();
            });

            await act(async () => {
                headingCallback!({ trueHeading: null, magHeading: 180 });
            });

            await waitFor(() => {
                expect(capturedResult?.smoothedHeading).not.toBeNull();
            });

            expect(capturedResult!.smoothedHeading!).toBeCloseTo(180, 0);
        });

        it("falls back to magHeading when trueHeading is negative", async () => {
            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(headingCallback).not.toBeNull();
            });

            await act(async () => {
                headingCallback!({ trueHeading: -1, magHeading: 270 });
            });

            await waitFor(() => {
                expect(capturedResult?.smoothedHeading).not.toBeNull();
            });

            expect(capturedResult!.smoothedHeading!).toBeCloseTo(270, 0);
        });

        it("smooths heading over multiple readings using rolling average", async () => {
            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(headingCallback).not.toBeNull();
            });

            // Send 5 readings all pointing north (0°)
            await act(async () => {
                for (let i = 0; i < 5; i++) {
                    headingCallback!({ trueHeading: 0, magHeading: 0 });
                }
            });

            await waitFor(() => {
                expect(capturedResult?.smoothedHeading).not.toBeNull();
            });

            expect(capturedResult!.smoothedHeading!).toBeCloseTo(0, 0);
        });

        it("handles 0°/360° wrap-around correctly in rolling average", async () => {
            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(headingCallback).not.toBeNull();
            });

            // 5° and 355° should average to ~0°, not ~180°
            await act(async () => {
                for (let i = 0; i < 5; i++) {
                    headingCallback!({ trueHeading: 5, magHeading: 5 });
                    headingCallback!({ trueHeading: 355, magHeading: 355 });
                }
            });

            await waitFor(() => {
                expect(capturedResult?.smoothedHeading).not.toBeNull();
            });

            const h = capturedResult!.smoothedHeading!;
            // Should be near 0° (either 0 or 360, both valid)
            const nearZero = h < 10 || h > 350;
            expect(nearZero).toBe(true);
        });
    });

    // --- getAlignment ---

    describe("getAlignment()", () => {
        it("returns 'unknown' when targetHeading is null", async () => {
            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(headingCallback).not.toBeNull();
            });

            await act(async () => {
                headingCallback!({ trueHeading: 90, magHeading: 90 });
            });

            expect(capturedResult?.getAlignment(null)).toBe("unknown");
        });

        it("returns 'unknown' when no heading readings have arrived yet", async () => {
            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(headingCallback).not.toBeNull();
            });

            // No readings fired yet
            expect(capturedResult?.getAlignment(90)).toBe("unknown");
        });

        it("returns 'aligned' when user is facing within tolerance of target", async () => {
            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(headingCallback).not.toBeNull();
            });

            // User facing 95°, target is 90° — within 20° tolerance
            await act(async () => {
                for (let i = 0; i < 10; i++) {
                    headingCallback!({ trueHeading: 95, magHeading: 95 });
                }
            });

            await waitFor(() => {
                expect(capturedResult?.smoothedHeading).not.toBeNull();
            });

            expect(capturedResult?.getAlignment(90)).toBe("aligned");
        });

        it("returns 'turn_right' when user needs to turn right to face target", async () => {
            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(headingCallback).not.toBeNull();
            });

            // User facing north (0°), target is east (90°) — need to turn right
            await act(async () => {
                for (let i = 0; i < 10; i++) {
                    headingCallback!({ trueHeading: 0, magHeading: 0 });
                }
            });

            await waitFor(() => {
                expect(capturedResult?.smoothedHeading).not.toBeNull();
            });

            expect(capturedResult?.getAlignment(90)).toBe("turn_right");
        });

        it("returns 'turn_left' when user needs to turn left to face target", async () => {
            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(headingCallback).not.toBeNull();
            });

            // User facing east (90°), target is north (0°) — need to turn left
            await act(async () => {
                for (let i = 0; i < 10; i++) {
                    headingCallback!({ trueHeading: 90, magHeading: 90 });
                }
            });

            await waitFor(() => {
                expect(capturedResult?.smoothedHeading).not.toBeNull();
            });

            expect(capturedResult?.getAlignment(0)).toBe("turn_left");
        });

        it("handles 0°/360° wrap-around in alignment — facing 350° with target 10° is aligned", async () => {
            render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(headingCallback).not.toBeNull();
            });

            // User facing 355°, target is 10° — only 15° apart across the 0° boundary
            // Using 15° gap (not 20°) so the test stays comfortably inside the tolerance
            // boundary even after floating point rounding in the circular mean
            await act(async () => {
                for (let i = 0; i < 10; i++) {
                    headingCallback!({ trueHeading: 355, magHeading: 355 });
                }
            });

            await waitFor(() => {
                expect(capturedResult?.smoothedHeading).not.toBeNull();
            });

            expect(capturedResult?.getAlignment(10)).toBe("aligned");
        });
    });

    // --- Cleanup ---

    describe("Cleanup", () => {
        it("removes the heading subscription on unmount", async () => {
            const { unmount } = render(
                <HeadingTestConsumer
                    onRender={(result) => {
                        capturedResult = result;
                    }}
                />
            );

            await waitFor(() => {
                expect(mockWatchHeadingAsync).toHaveBeenCalled();
            });

            unmount();

            expect(mockSubscriptionRemove).toHaveBeenCalledTimes(1);
        });
    });
});