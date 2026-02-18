/**
 * SensorService.ts
 * 
 * Core sensor service that provides:
 * 1. Real-time sensor data access
 * 2. Optional logging capability (for dev)
 * 3. Localization processing (for production)
 * 
 * This service will remain in production, only the dev UI will be removed
 */

import { Accelerometer, Gyroscope, Magnetometer } from 'expo-sensors';
import * as FileSystem from 'expo-file-system/legacy';

export interface Vector3D {
    x: number;
    y: number;
    z: number;
}

export interface SensorReading {
    accelerometer: Vector3D;
    gyroscope: Vector3D;
    magnetometer: Vector3D;
    timestamp: number;
}

export interface LocalizationData {
    position: Vector3D;
    heading: number;
    stepCount: number;
    distance: number;
}

class SensorService {
    private static instance: SensorService;

    // Sensor subscriptions
    private accelSubscription: any = null;
    private gyroSubscription: any = null;
    private magnetSubscription: any = null;
    private updateInterval: any = null;

    // Current sensor data
    private currentAccel: Vector3D = { x: 0, y: 0, z: 0 };
    private currentGyro: Vector3D = { x: 0, y: 0, z: 0 };
    private currentMagnet: Vector3D = { x: 0, y: 0, z: 0 };

    // Localization state
    private position: Vector3D = { x: 0, y: 0, z: 0 };
    private heading: number = 0;
    private stepCount: number = 0;
    private distance: number = 0;

    // Dev logging (can be disabled in production)
    private isLogging: boolean = false;
    private logBuffer: SensorReading[] = [];
    private sessionId: string | null = null;

    // Callbacks for real-time updates
    private updateCallbacks: Set<(data: SensorReading) => void> = new Set();
    private localizationCallbacks: Set<(data: LocalizationData) => void> = new Set();

    // Configuration
    private readonly SAMPLE_RATE = 10; // Hz
    private readonly UPDATE_INTERVAL = 1000 / this.SAMPLE_RATE;
    private readonly BUFFER_SIZE = 1000;

    private constructor() {
        this.initializeSensors();
    }

    public static getInstance(): SensorService {
        if (!SensorService.instance) {
            SensorService.instance = new SensorService();
        }
        return SensorService.instance;
    }

    private async initializeSensors() {
        // Set update intervals
        Accelerometer.setUpdateInterval(this.UPDATE_INTERVAL);
        Gyroscope.setUpdateInterval(this.UPDATE_INTERVAL);
        Magnetometer.setUpdateInterval(this.UPDATE_INTERVAL);
    }

    /**
     * Start sensor monitoring (used in production)
     * This keeps running even when logging is disabled
     */
    public startMonitoring() {
        if (this.accelSubscription) return; // Already monitoring

        // Subscribe to all sensors (they update independently)
        this.accelSubscription = Accelerometer.addListener(({ x, y, z }) => {
            this.currentAccel = { x, y, z };
        });

        this.gyroSubscription = Gyroscope.addListener(({ x, y, z }) => {
            this.currentGyro = { x, y, z };
        });

        this.magnetSubscription = Magnetometer.addListener(({ x, y, z }) => {
            this.currentMagnet = { x, y, z };
        });

        // Use interval to collect data at consistent rate
        this.updateInterval = setInterval(() => {
            this.processUpdate();
        }, this.UPDATE_INTERVAL);
    }

    /**
     * Stop sensor monitoring (cleanup)
     */
    public stopMonitoring() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        if (this.accelSubscription) {
            this.accelSubscription.remove();
            this.accelSubscription = null;
        }
        if (this.gyroSubscription) {
            this.gyroSubscription.remove();
            this.gyroSubscription = null;
        }
        if (this.magnetSubscription) {
            this.magnetSubscription.remove();
            this.magnetSubscription = null;
        }
    }

    /**
     * DEV ONLY: Start logging sensor data to files
     */
    public async startLogging(): Promise<string> {
        if (this.isLogging) throw new Error('Already logging');

        this.startMonitoring(); // Ensure sensors are running
        this.sessionId = `session_${Date.now()}`;
        this.logBuffer = [];
        this.isLogging = true;

        // Create session directory
        const sessionPath = `${FileSystem.documentDirectory}sensor_logs/${this.sessionId}/`;
        await FileSystem.makeDirectoryAsync(sessionPath, { intermediates: true });

        // Write metadata
        const metadata = {
            sessionId: this.sessionId,
            startTime: new Date().toISOString(),
            sampleRate: this.SAMPLE_RATE,
        };

        await FileSystem.writeAsStringAsync(
            `${sessionPath}metadata.json`,
            JSON.stringify(metadata, null, 2)
        );

        return this.sessionId;
    }

    /**
     * DEV ONLY: Stop logging sensor data
     */
    public async stopLogging(): Promise<void> {
        if (!this.isLogging || !this.sessionId) return;

        // Write remaining buffer
        if (this.logBuffer.length > 0) {
            await this.writeLogBuffer();
        }

        this.isLogging = false;
        this.sessionId = null;
        this.logBuffer = [];
    }

    /**
     * DEV ONLY: Write log buffer to file
     */
    private async writeLogBuffer() {
        if (!this.sessionId || this.logBuffer.length === 0) return;

        const dataPath = `${FileSystem.documentDirectory}sensor_logs/${this.sessionId}/sensor_data.csv`;
        const csvLines = this.logBuffer.map(d =>
            `${d.timestamp},${d.accelerometer.x},${d.accelerometer.y},${d.accelerometer.z},` +
            `${d.gyroscope.x},${d.gyroscope.y},${d.gyroscope.z},` +
            `${d.magnetometer.x},${d.magnetometer.y},${d.magnetometer.z}`
        ).join('\n');

        const fileInfo = await FileSystem.getInfoAsync(dataPath);

        if (!fileInfo.exists) {
            const header = 'timestamp,acc_x,acc_y,acc_z,gyro_x,gyro_y,gyro_z,mag_x,mag_y,mag_z\n';
            await FileSystem.writeAsStringAsync(dataPath, header + csvLines + '\n');
        } else {
            const existingData = await FileSystem.readAsStringAsync(dataPath);
            await FileSystem.writeAsStringAsync(dataPath, existingData + csvLines + '\n');
        }

        this.logBuffer = [];
    }

    /**
     * Process sensor update (runs for both logging and localization)
     */
    private processUpdate() {
        const reading: SensorReading = {
            accelerometer: { ...this.currentAccel },
            gyroscope: { ...this.currentGyro },
            magnetometer: { ...this.currentMagnet },
            timestamp: Date.now(),
        };

        // DEV: Add to log buffer if logging
        if (this.isLogging) {
            this.logBuffer.push(reading);

            if (this.logBuffer.length >= this.BUFFER_SIZE) {
                this.writeLogBuffer();
            }
        }

        // PRODUCTION: Process localization
        this.updateLocalization(reading);

        // Notify subscribers
        this.updateCallbacks.forEach(callback => callback(reading));
    }

    /**
     * Update localization data (used in production)
     */
    private updateLocalization(reading: SensorReading) {
        // Calculate heading from magnetometer
        const { x: mx, y: my } = reading.magnetometer;
        this.heading = Math.atan2(-my, mx) * (180 / Math.PI);

        // Simple step detection
        const accelMagnitude = Math.sqrt(
            reading.accelerometer.x ** 2 +
            reading.accelerometer.y ** 2 +
            reading.accelerometer.z ** 2
        );

        // Detect step (simple threshold)
        if (accelMagnitude > 12.0) {
            this.stepCount++;
            this.distance += 0.7; // Average step length in meters
        }

        // Update position based on heading and steps
        // This is simplified - use IMUProcessor for production

        const locData: LocalizationData = {
            position: this.position,
            heading: this.heading,
            stepCount: this.stepCount,
            distance: this.distance,
        };

        this.localizationCallbacks.forEach(callback => callback(locData));
    }

    /**
     * Subscribe to real-time sensor updates
     */
    public subscribeToUpdates(callback: (data: SensorReading) => void) {
        this.updateCallbacks.add(callback);
        return () => this.updateCallbacks.delete(callback);
    }

    /**
     * Subscribe to localization updates (PRODUCTION)
     */
    public subscribeToLocalization(callback: (data: LocalizationData) => void) {
        this.localizationCallbacks.add(callback);
        return () => this.localizationCallbacks.delete(callback);
    }

    /**
     * Get current sensor reading
     */
    public getCurrentReading(): SensorReading {
        return {
            accelerometer: { ...this.currentAccel },
            gyroscope: { ...this.currentGyro },
            magnetometer: { ...this.currentMagnet },
            timestamp: Date.now(),
        };
    }

    /**
     * Get current localization data
     */
    public getCurrentLocalization(): LocalizationData {
        return {
            position: { ...this.position },
            heading: this.heading,
            stepCount: this.stepCount,
            distance: this.distance,
        };
    }

    /**
     * Reset localization data
     */
    public resetLocalization() {
        this.position = { x: 0, y: 0, z: 0 };
        this.heading = 0;
        this.stepCount = 0;
        this.distance = 0;
    }

    /**
     * Check if currently logging
     */
    public isCurrentlyLogging(): boolean {
        return this.isLogging;
    }

    /**
     * Get current session ID
     */
    public getSessionId(): string | null {
        return this.sessionId;
    }
}

export default SensorService.getInstance();