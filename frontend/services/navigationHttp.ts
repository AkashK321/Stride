import { requireApiUrl } from "./api";

export interface NavigationFrameMetadata {
  session_id: string;
  focal_length_pixels: number;
  heading_degrees: number | null;
  gps: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    altitude_accuracy: number | null;
    speed: number | null;
  } | null;
  distance_traveled: number;
  timestamp_ms: number;
  request_id: number;
}

export interface NavigationResponse {
  frameSize?: number;
  valid?: boolean;
  estimatedDistances?: Array<{
    className: string;
    distance: string;
  }>;
  type?: string;
  session_id?: string;
  current_step?: number;
  remaining_instructions?: Array<unknown>;
  estimated_position?: unknown;
  confidence?: number;
  message?: string;
  error?: string;
  status?: string;
  request_id?: number;
  latency_ms?: number;
}

let requestIdCounter = 0;
export function nextNavigationRequestId(): number {
  requestIdCounter += 1;
  return requestIdCounter;
}

export async function sendNavigationFrameHttp(
  imageUri: string,
  metadata: NavigationFrameMetadata,
): Promise<NavigationResponse> {
  const base = requireApiUrl();
  const url = `${base}/navigation/frame`;
  const startedAt = Date.now();

  const form = new FormData();
  form.append("metadata", JSON.stringify(metadata));
  form.append("image", {
    uri: imageUri,
    name: `nav-frame-${metadata.request_id}.jpg`,
    type: "image/jpeg",
  } as any);

  const response = await fetch(url, {
    method: "POST",
    body: form,
  });

  const raw = await response.text();
  let data: NavigationResponse = {};
  if (raw.length > 0) {
    try {
      data = JSON.parse(raw) as NavigationResponse;
    } catch {
      throw new Error(`Navigation frame failed: non-JSON response (${response.status})`);
    }
  }

  const latency = Date.now() - startedAt;
  data.latency_ms = latency;

  if (!response.ok) {
    throw new Error(data.error || data.message || `Navigation frame failed: HTTP ${response.status}`);
  }

  return data;
}
