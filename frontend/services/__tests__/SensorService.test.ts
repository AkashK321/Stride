/**
 * Unit tests for SensorService.ts
 */

// Mock expo-sensors
const mockAccelListener = jest.fn();
const mockGyroListener = jest.fn();
const mockMagnetListener = jest.fn();

jest.mock("expo-sensors", () => ({
  Accelerometer: {
    setUpdateInterval: jest.fn(),
    addListener: jest.fn((callback) => {
      mockAccelListener.mockImplementation(callback);
      return { remove: jest.fn() };
    }),
  },
  Gyroscope: {
    setUpdateInterval: jest.fn(),
    addListener: jest.fn((callback) => {
      mockGyroListener.mockImplementation(callback);
      return { remove: jest.fn() };
    }),
  },
  Magnetometer: {
    setUpdateInterval: jest.fn(),
    addListener: jest.fn((callback) => {
      mockMagnetListener.mockImplementation(callback);
      return { remove: jest.fn() };
    }),
  },
}));

// Mock expo-file-system
jest.mock("expo-file-system/legacy", () => {
  const mockMakeDirectoryAsync = jest.fn(() => Promise.resolve());
  const mockWriteAsStringAsync = jest.fn(() => Promise.resolve());
  const mockReadAsStringAsync = jest.fn(() => Promise.resolve(""));
  const mockGetInfoAsync = jest.fn(() => Promise.resolve({ exists: false }));

  return {
    documentDirectory: "/mock/documents/",
    makeDirectoryAsync: mockMakeDirectoryAsync,
    writeAsStringAsync: mockWriteAsStringAsync,
    readAsStringAsync: mockReadAsStringAsync,
    getInfoAsync: mockGetInfoAsync,
  };
});

// Import the mocked module to access mock functions
import * as FileSystemMock from "expo-file-system/legacy";

// Create a reference to mock functions for use in tests
const mockFileSystem = {
  documentDirectory: "/mock/documents/",
  makeDirectoryAsync: FileSystemMock.makeDirectoryAsync as jest.Mock,
  writeAsStringAsync: FileSystemMock.writeAsStringAsync as jest.Mock,
  readAsStringAsync: FileSystemMock.readAsStringAsync as jest.Mock,
  getInfoAsync: FileSystemMock.getInfoAsync as jest.Mock,
};

// Import after mocks
import SensorServiceInstance, {
  SensorReading,
  LocalizationData,
  Vector3D,
} from "../SensorService";
import * as Sensors from "expo-sensors";

// Get the class from the instance's constructor
const SensorServiceClass = (SensorServiceInstance as any).constructor;

describe("SensorService", () => {
  let service: typeof SensorServiceInstance;
  let originalInstance: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockAccelListener.mockClear();
    mockGyroListener.mockClear();
    mockMagnetListener.mockClear();

    // Reset singleton instance by accessing private property
    originalInstance = (SensorServiceClass as any).instance;
    (SensorServiceClass as any).instance = undefined;

    // Get fresh instance
    service = SensorServiceClass.getInstance();
  });

  afterEach(() => {
    // Clean up
    if (service) {
      service.stopMonitoring();
      service.stopLogging();
    }
    (SensorServiceClass as any).instance = originalInstance;
  });

  describe("singleton pattern", () => {
    it("returns the same instance on multiple calls", () => {
      const instance1 = SensorServiceClass.getInstance();
      const instance2 = SensorServiceClass.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("initialization", () => {
    it("initializes sensor update intervals", () => {
      expect(Sensors.Accelerometer.setUpdateInterval).toHaveBeenCalled();
      expect(Sensors.Gyroscope.setUpdateInterval).toHaveBeenCalled();
      expect(Sensors.Magnetometer.setUpdateInterval).toHaveBeenCalled();
    });

    it("has default sensor values", () => {
      const reading = service.getCurrentReading();
      expect(reading.accelerometer).toEqual({ x: 0, y: 0, z: 0 });
      expect(reading.gyroscope).toEqual({ x: 0, y: 0, z: 0 });
      expect(reading.magnetometer).toEqual({ x: 0, y: 0, z: 0 });
    });

    it("has default localization values", () => {
      const localization = service.getCurrentLocalization();
      expect(localization.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(localization.heading).toBe(0);
      expect(localization.stepCount).toBe(0);
      expect(localization.distance).toBe(0);
    });
  });

  describe("startMonitoring", () => {
    it("subscribes to all sensors", () => {
      service.startMonitoring();

      expect(Sensors.Accelerometer.addListener).toHaveBeenCalled();
      expect(Sensors.Gyroscope.addListener).toHaveBeenCalled();
      expect(Sensors.Magnetometer.addListener).toHaveBeenCalled();
    });

    it("does not subscribe again if already monitoring", () => {
      service.startMonitoring();
      const callCount1 = Sensors.Accelerometer.addListener.mock.calls.length;

      service.startMonitoring();
      const callCount2 = Sensors.Accelerometer.addListener.mock.calls.length;

      expect(callCount1).toBe(callCount2);
    });

    it("updates current accelerometer data when sensor fires", () => {
      service.startMonitoring();

      const testData = { x: 1.0, y: 2.0, z: 3.0 };
      mockAccelListener({ x: testData.x, y: testData.y, z: testData.z });

      const reading = service.getCurrentReading();
      expect(reading.accelerometer).toEqual(testData);
    });

    it("updates current gyroscope data when sensor fires", () => {
      service.startMonitoring();

      const testData = { x: 4.0, y: 5.0, z: 6.0 };
      mockGyroListener({ x: testData.x, y: testData.y, z: testData.z });

      const reading = service.getCurrentReading();
      expect(reading.gyroscope).toEqual(testData);
    });

    it("updates current magnetometer data when sensor fires", () => {
      service.startMonitoring();

      const testData = { x: 7.0, y: 8.0, z: 9.0 };
      mockMagnetListener({ x: testData.x, y: testData.y, z: testData.z });

      const reading = service.getCurrentReading();
      expect(reading.magnetometer).toEqual(testData);
    });
  });

  describe("stopMonitoring", () => {
    it("removes all sensor subscriptions", () => {
      service.startMonitoring();
      const accelSub = Sensors.Accelerometer.addListener.mock.results[0].value;
      const gyroSub = Sensors.Gyroscope.addListener.mock.results[0].value;
      const magnetSub = Sensors.Magnetometer.addListener.mock.results[0].value;

      service.stopMonitoring();

      expect(accelSub.remove).toHaveBeenCalled();
      expect(gyroSub.remove).toHaveBeenCalled();
      expect(magnetSub.remove).toHaveBeenCalled();
    });

    it("clears update interval", () => {
      jest.useFakeTimers();
      service.startMonitoring();

      const intervalId = (service as any).updateInterval;
      expect(intervalId).toBeDefined();

      service.stopMonitoring();

      expect((service as any).updateInterval).toBeNull();
      jest.useRealTimers();
    });
  });

  describe("processUpdate", () => {
    beforeEach(() => {
      service.startMonitoring();
    });

    it("creates sensor reading with current values", () => {
      // Set sensor values
      mockAccelListener({ x: 1, y: 2, z: 3 });
      mockGyroListener({ x: 4, y: 5, z: 6 });
      mockMagnetListener({ x: 7, y: 8, z: 9 });

      const callback = jest.fn();
      service.subscribeToUpdates(callback);

      // Trigger update
      (service as any).processUpdate();

      expect(callback).toHaveBeenCalled();
      const reading = callback.mock.calls[0][0] as SensorReading;
      expect(reading.accelerometer).toEqual({ x: 1, y: 2, z: 3 });
      expect(reading.gyroscope).toEqual({ x: 4, y: 5, z: 6 });
      expect(reading.magnetometer).toEqual({ x: 7, y: 8, z: 9 });
      expect(reading.timestamp).toBeGreaterThan(0);
    });

    it("notifies all update subscribers", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      service.subscribeToUpdates(callback1);
      service.subscribeToUpdates(callback2);

      (service as any).processUpdate();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it("updates localization data", () => {
      const callback = jest.fn();
      service.subscribeToLocalization(callback);

      // Set magnetometer for heading calculation
      mockMagnetListener({ x: 1, y: -1, z: 0 });

      (service as any).processUpdate();

      expect(callback).toHaveBeenCalled();
      const locData = callback.mock.calls[0][0] as LocalizationData;
      expect(locData.heading).toBeDefined();
    });
  });

  describe("updateLocalization", () => {
    it("calculates heading from magnetometer", () => {
      // Heading = atan2(-my, mx) * (180 / PI)
      // For mx=1, my=-1: atan2(1, 1) = 45 degrees
      mockMagnetListener({ x: 1, y: -1, z: 0 });

      const reading: SensorReading = {
        accelerometer: { x: 0, y: 0, z: 0 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 1, y: -1, z: 0 },
        timestamp: Date.now(),
      };

      (service as any).updateLocalization(reading);

      const localization = service.getCurrentLocalization();
      expect(localization.heading).toBeCloseTo(45, 1);
    });

    it("detects steps when accelerometer magnitude exceeds threshold", () => {
      // Magnitude = sqrt(10^2 + 10^2 + 10^2) = sqrt(300) ≈ 17.3 > 12.0
      const reading: SensorReading = {
        accelerometer: { x: 10, y: 10, z: 10 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 0, y: 0, z: 0 },
        timestamp: Date.now(),
      };

      const initialStepCount = service.getCurrentLocalization().stepCount;
      const initialDistance = service.getCurrentLocalization().distance;

      (service as any).updateLocalization(reading);

      const localization = service.getCurrentLocalization();
      expect(localization.stepCount).toBe(initialStepCount + 1);
      expect(localization.distance).toBeCloseTo(initialDistance + 0.7, 1);
    });

    it("does not detect step when accelerometer magnitude is below threshold", () => {
      // Magnitude = sqrt(1^2 + 1^2 + 1^2) = sqrt(3) ≈ 1.73 < 12.0
      const reading: SensorReading = {
        accelerometer: { x: 1, y: 1, z: 1 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 0, y: 0, z: 0 },
        timestamp: Date.now(),
      };

      const initialStepCount = service.getCurrentLocalization().stepCount;

      (service as any).updateLocalization(reading);

      const localization = service.getCurrentLocalization();
      expect(localization.stepCount).toBe(initialStepCount);
    });

    it("notifies localization subscribers", () => {
      const callback = jest.fn();
      service.subscribeToLocalization(callback);

      const reading: SensorReading = {
        accelerometer: { x: 0, y: 0, z: 0 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 1, y: 0, z: 0 },
        timestamp: Date.now(),
      };

      (service as any).updateLocalization(reading);

      expect(callback).toHaveBeenCalled();
      const locData = callback.mock.calls[0][0] as LocalizationData;
      expect(locData).toHaveProperty("position");
      expect(locData).toHaveProperty("heading");
      expect(locData).toHaveProperty("stepCount");
      expect(locData).toHaveProperty("distance");
    });
  });

  describe("subscribeToUpdates", () => {
    it("adds callback to update callbacks", () => {
      const callback = jest.fn();
      service.subscribeToUpdates(callback);

      (service as any).processUpdate();

      expect(callback).toHaveBeenCalled();
    });

    it("returns unsubscribe function", () => {
      const callback = jest.fn();
      const unsubscribe = service.subscribeToUpdates(callback);

      expect(typeof unsubscribe).toBe("function");

      unsubscribe();
      (service as any).processUpdate();

      expect(callback).not.toHaveBeenCalled();
    });

    it("allows multiple subscribers", () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      service.subscribeToUpdates(callback1);
      service.subscribeToUpdates(callback2);

      (service as any).processUpdate();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });
  });

  describe("subscribeToLocalization", () => {
    it("adds callback to localization callbacks", () => {
      const callback = jest.fn();
      service.subscribeToLocalization(callback);

      const reading: SensorReading = {
        accelerometer: { x: 0, y: 0, z: 0 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 1, y: 0, z: 0 },
        timestamp: Date.now(),
      };

      (service as any).updateLocalization(reading);

      expect(callback).toHaveBeenCalled();
    });

    it("returns unsubscribe function", () => {
      const callback = jest.fn();
      const unsubscribe = service.subscribeToLocalization(callback);

      expect(typeof unsubscribe).toBe("function");

      unsubscribe();

      const reading: SensorReading = {
        accelerometer: { x: 0, y: 0, z: 0 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 1, y: 0, z: 0 },
        timestamp: Date.now(),
      };

      (service as any).updateLocalization(reading);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("getCurrentReading", () => {
    it("returns current sensor values", () => {
      service.startMonitoring();

      mockAccelListener({ x: 1, y: 2, z: 3 });
      mockGyroListener({ x: 4, y: 5, z: 6 });
      mockMagnetListener({ x: 7, y: 8, z: 9 });

      const reading = service.getCurrentReading();

      expect(reading.accelerometer).toEqual({ x: 1, y: 2, z: 3 });
      expect(reading.gyroscope).toEqual({ x: 4, y: 5, z: 6 });
      expect(reading.magnetometer).toEqual({ x: 7, y: 8, z: 9 });
      expect(reading.timestamp).toBeGreaterThan(0);
    });

    it("returns a new object (not reference)", () => {
      const reading1 = service.getCurrentReading();
      const reading2 = service.getCurrentReading();

      expect(reading1).not.toBe(reading2);
      expect(reading1.accelerometer).not.toBe(reading2.accelerometer);
    });
  });

  describe("getCurrentLocalization", () => {
    it("returns current localization data", () => {
      const localization = service.getCurrentLocalization();

      expect(localization).toHaveProperty("position");
      expect(localization).toHaveProperty("heading");
      expect(localization).toHaveProperty("stepCount");
      expect(localization).toHaveProperty("distance");
    });

    it("returns a new object (not reference)", () => {
      const loc1 = service.getCurrentLocalization();
      const loc2 = service.getCurrentLocalization();

      expect(loc1).not.toBe(loc2);
      expect(loc1.position).not.toBe(loc2.position);
    });
  });

  describe("resetLocalization", () => {
    it("resets all localization values to zero", () => {
      // Set some values first
      const reading: SensorReading = {
        accelerometer: { x: 10, y: 10, z: 10 },
        gyroscope: { x: 0, y: 0, z: 0 },
        magnetometer: { x: 1, y: 0, z: 0 },
        timestamp: Date.now(),
      };

      (service as any).updateLocalization(reading);

      // Verify values changed
      let localization = service.getCurrentLocalization();
      expect(localization.stepCount).toBeGreaterThan(0);

      // Reset
      service.resetLocalization();

      localization = service.getCurrentLocalization();
      expect(localization.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(localization.heading).toBe(0);
      expect(localization.stepCount).toBe(0);
      expect(localization.distance).toBe(0);
    });
  });

  describe("startLogging", () => {
    beforeEach(() => {
      service.startMonitoring();
    });

    it("starts logging and returns session ID", async () => {
      const sessionId = await service.startLogging();

      expect(sessionId).toBeDefined();
      expect(sessionId).toMatch(/^session_\d+$/);
      expect(service.isCurrentlyLogging()).toBe(true);
      expect(service.getSessionId()).toBe(sessionId);
    });

    it("creates session directory", async () => {
      await service.startLogging();

      const sessionId = service.getSessionId();
      const expectedPath = `${mockFileSystem.documentDirectory}sensor_logs/${sessionId}/`;

      expect(mockFileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
        expectedPath,
        { intermediates: true }
      );
    });

    it("writes metadata file", async () => {
      await service.startLogging();

      const sessionId = service.getSessionId();
      const metadataPath = `${mockFileSystem.documentDirectory}sensor_logs/${sessionId}/metadata.json`;

      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        metadataPath,
        expect.stringContaining(sessionId!)
      );
    });

    it("throws error if already logging", async () => {
      await service.startLogging();

      await expect(service.startLogging()).rejects.toThrow("Already logging");
    });

    it("ensures monitoring is started", async () => {
      service.stopMonitoring();

      await service.startLogging();

      expect(Sensors.Accelerometer.addListener).toHaveBeenCalled();
    });
  });

  describe("stopLogging", () => {
    beforeEach(async () => {
      service.startMonitoring();
      await service.startLogging();
    });

    it("stops logging and clears session", async () => {
      await service.stopLogging();

      expect(service.isCurrentlyLogging()).toBe(false);
      expect(service.getSessionId()).toBeNull();
    });

    it("writes remaining buffer before stopping", async () => {
      // Add some data to buffer
      const reading: SensorReading = {
        accelerometer: { x: 1, y: 2, z: 3 },
        gyroscope: { x: 4, y: 5, z: 6 },
        magnetometer: { x: 7, y: 8, z: 9 },
        timestamp: Date.now(),
      };

      (service as any).logBuffer.push(reading);

      await service.stopLogging();

      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
    });

    it("does nothing if not logging", async () => {
      await service.stopLogging();
      const callCount = mockFileSystem.writeAsStringAsync.mock.calls.length;

      await service.stopLogging();

      expect(mockFileSystem.writeAsStringAsync.mock.calls.length).toBe(callCount);
    });
  });

  describe("writeLogBuffer", () => {
    beforeEach(async () => {
      service.startMonitoring();
      await service.startLogging();
    });

    it("writes buffer to CSV file", async () => {
      const reading: SensorReading = {
        accelerometer: { x: 1, y: 2, z: 3 },
        gyroscope: { x: 4, y: 5, z: 6 },
        magnetometer: { x: 7, y: 8, z: 9 },
        timestamp: 1234567890,
      };

      (service as any).logBuffer.push(reading);
      await (service as any).writeLogBuffer();

      const sessionId = service.getSessionId();
      const dataPath = `${mockFileSystem.documentDirectory}sensor_logs/${sessionId}/sensor_data.csv`;

      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        dataPath,
        expect.stringContaining("1234567890,1,2,3,4,5,6,7,8,9")
      );
    });

    it("writes header for new file", async () => {
      mockFileSystem.getInfoAsync.mockResolvedValueOnce({ exists: false });

      const reading: SensorReading = {
        accelerometer: { x: 1, y: 2, z: 3 },
        gyroscope: { x: 4, y: 5, z: 6 },
        magnetometer: { x: 7, y: 8, z: 9 },
        timestamp: 1234567890,
      };

      (service as any).logBuffer.push(reading);
      await (service as any).writeLogBuffer();

      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("timestamp,acc_x,acc_y,acc_z,gyro_x,gyro_y,gyro_z,mag_x,mag_y,mag_z")
      );
    });

    it("appends to existing file", async () => {
      mockFileSystem.getInfoAsync.mockResolvedValueOnce({ exists: true });
      mockFileSystem.readAsStringAsync.mockResolvedValueOnce("existing,data\n");

      const reading: SensorReading = {
        accelerometer: { x: 1, y: 2, z: 3 },
        gyroscope: { x: 4, y: 5, z: 6 },
        magnetometer: { x: 7, y: 8, z: 9 },
        timestamp: 1234567890,
      };

      (service as any).logBuffer.push(reading);
      await (service as any).writeLogBuffer();

      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining("existing,data")
      );
    });

    it("clears buffer after writing", async () => {
      const reading: SensorReading = {
        accelerometer: { x: 1, y: 2, z: 3 },
        gyroscope: { x: 4, y: 5, z: 6 },
        magnetometer: { x: 7, y: 8, z: 9 },
        timestamp: 1234567890,
      };

      (service as any).logBuffer.push(reading);
      await (service as any).writeLogBuffer();

      expect((service as any).logBuffer.length).toBe(0);
    });

    it("does nothing if no session ID", async () => {
      await service.stopLogging();

      const callCount = mockFileSystem.writeAsStringAsync.mock.calls.length;
      await (service as any).writeLogBuffer();

      expect(mockFileSystem.writeAsStringAsync.mock.calls.length).toBe(callCount);
    });

    it("does nothing if buffer is empty", async () => {
      const callCount = mockFileSystem.writeAsStringAsync.mock.calls.length;
      await (service as any).writeLogBuffer();

      expect(mockFileSystem.writeAsStringAsync.mock.calls.length).toBe(callCount);
    });
  });

  describe("buffer management", () => {
    beforeEach(async () => {
      service.startMonitoring();
      await service.startLogging();
    });

    it("writes buffer when it reaches BUFFER_SIZE", async () => {
      const BUFFER_SIZE = (service as any).BUFFER_SIZE;

      // Fill buffer to just below threshold
      for (let i = 0; i < BUFFER_SIZE - 1; i++) {
        const reading: SensorReading = {
          accelerometer: { x: 1, y: 2, z: 3 },
          gyroscope: { x: 4, y: 5, z: 6 },
          magnetometer: { x: 7, y: 8, z: 9 },
          timestamp: Date.now() + i,
        };
        (service as any).logBuffer.push(reading);
      }

      const callCountBefore = mockFileSystem.writeAsStringAsync.mock.calls.length;

      // Add one more to trigger write
      const reading: SensorReading = {
        accelerometer: { x: 1, y: 2, z: 3 },
        gyroscope: { x: 4, y: 5, z: 6 },
        magnetometer: { x: 7, y: 8, z: 9 },
        timestamp: Date.now(),
      };
      (service as any).logBuffer.push(reading);
      (service as any).processUpdate();

      // Wait for async write
      await new Promise((resolve) => setImmediate(resolve));

      expect(mockFileSystem.writeAsStringAsync.mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });

  describe("isCurrentlyLogging", () => {
    it("returns false when not logging", () => {
      expect(service.isCurrentlyLogging()).toBe(false);
    });

    it("returns true when logging", async () => {
      service.startMonitoring();
      await service.startLogging();

      expect(service.isCurrentlyLogging()).toBe(true);
    });
  });

  describe("getSessionId", () => {
    it("returns null when not logging", () => {
      expect(service.getSessionId()).toBeNull();
    });

    it("returns session ID when logging", async () => {
      service.startMonitoring();
      const sessionId = await service.startLogging();

      expect(service.getSessionId()).toBe(sessionId);
    });
  });
});
