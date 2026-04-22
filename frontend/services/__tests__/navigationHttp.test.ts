import {
  nextNavigationRequestId,
  sendNavigationFrameHttp,
  NavigationFrameMetadata,
} from "../navigationHttp";

jest.mock("../api", () => ({
  requireApiUrl: () => "https://api.example.com/prod",
}));

describe("navigationHttp", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("increments request IDs sequentially", () => {
    const id1 = nextNavigationRequestId();
    const id2 = nextNavigationRequestId();
    expect(id2).toBe(id1 + 1);
  });

  it("posts multipart frame and returns parsed response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          type: "navigation_update",
          request_id: 10,
          session_id: "session-1",
        }),
    } as any);

    const metadata: NavigationFrameMetadata = {
      session_id: "session-1",
      focal_length_pixels: 800,
      heading_degrees: 90,
      gps: null,
      distance_traveled: 0,
      timestamp_ms: Date.now(),
      request_id: 10,
    };

    const response = await sendNavigationFrameHttp("file:///tmp/frame.jpg", metadata);
    expect(response.type).toBe("navigation_update");
    expect(response.request_id).toBe(10);
    expect(response.latency_ms).toBeDefined();
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.com/prod/navigation/frame",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws when API returns navigation error payload", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          type: "navigation_error",
          error: "Missing multipart field: metadata",
        }),
    } as any);

    const metadata: NavigationFrameMetadata = {
      session_id: "session-1",
      focal_length_pixels: 800,
      heading_degrees: 90,
      gps: null,
      distance_traveled: 0,
      timestamp_ms: Date.now(),
      request_id: 11,
    };

    await expect(sendNavigationFrameHttp("file:///tmp/frame.jpg", metadata)).rejects.toThrow(
      "Missing multipart field: metadata",
    );
  });
});
