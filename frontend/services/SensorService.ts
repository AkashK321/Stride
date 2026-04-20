// /**
//  * SensorService.ts
//  * 
//  * Core sensor service that provides:
//  * 1. Real-time sensor data access
//  * 2. Optional logging capability (for dev)
//  * 3. Localization processing (for production)
//  * 
//  * This service will remain in production, only the dev UI will be removed
//  */

// import { Accelerometer, Gyroscope, Magnetometer } from 'expo-sensors';
// import * as FileSystem from 'expo-file-system/legacy';
// import * as Sharing from 'expo-sharing';

// export interface Vector3D {
//   x: number;
//   y: number;
//   z: number;
// }

// export interface SensorReading {
//   accelerometer: Vector3D;
//   gyroscope: Vector3D;
//   magnetometer: Vector3D;
//   timestamp: number;
// }

// export interface LocalizationData {
//   position: Vector3D;
//   heading: number;
//   stepCount: number;
//   distance: number;
// }

// class SensorService {
//   private static instance: SensorService;
  
//   // Sensor subscriptions
//   private accelSubscription: any = null;
//   private gyroSubscription: any = null;
//   private magnetSubscription: any = null;
//   private updateInterval: any = null;
  
//   // Current sensor data
//   private currentAccel: Vector3D = { x: 0, y: 0, z: 0 };
//   private currentGyro: Vector3D = { x: 0, y: 0, z: 0 };
//   private currentMagnet: Vector3D = { x: 0, y: 0, z: 0 };
  
//   // Localization state
//   private position: Vector3D = { x: 0, y: 0, z: 0 };
//   private heading: number = 0;
//   private stepCount: number = 0;
//   private distance: number = 0;
  
//   // Heading smoothing
//   private headingHistory: number[] = [];
//   private readonly HEADING_FILTER_SIZE = 5; // Average last 5 samples
  
//   // Calibration data
//   private isCalibrated: boolean = false;
//   private accelBaseline: Vector3D = { x: 0, y: 0, z: 0 };
//   private gyroBaseline: Vector3D = { x: 0, y: 0, z: 0 };
//   private magnetBaseline: Vector3D = { x: 0, y: 0, z: 0 };
//   private headingOffset: number = 0;
  
//   // Dev logging (can be disabled in production)
//   private isLogging: boolean = false;
//   private logBuffer: SensorReading[] = [];
//   private sessionId: string | null = null;
  
//   // Callbacks for real-time updates
//   private updateCallbacks: Set<(data: SensorReading) => void> = new Set();
//   private localizationCallbacks: Set<(data: LocalizationData) => void> = new Set();
  
//   // Configuration
//   private readonly SAMPLE_RATE = 10; // Hz
//   private readonly UPDATE_INTERVAL = 1000 / this.SAMPLE_RATE; // 100ms
//   private readonly BUFFER_SIZE = 100; // Write to file every 100 samples (10 seconds at 10Hz)
  
//   private constructor() {
//     this.initializeSensors();
//   }
  
//   public static getInstance(): SensorService {
//     if (!SensorService.instance) {
//       SensorService.instance = new SensorService();
//     }
//     return SensorService.instance;
//   }
  
//   private initializeSensors() {
//     // Set update intervals
//     Accelerometer.setUpdateInterval(this.UPDATE_INTERVAL);
//     Gyroscope.setUpdateInterval(this.UPDATE_INTERVAL);
//     Magnetometer.setUpdateInterval(this.UPDATE_INTERVAL);
//   }
  
//   /**
//    * Check if sensors are available on this device
//    */
//   public async checkSensorAvailability() {
//     const accelAvailable = await Accelerometer.isAvailableAsync();
//     const gyroAvailable = await Gyroscope.isAvailableAsync();
//     const magnetAvailable = await Magnetometer.isAvailableAsync();
    
//     return {
//       accelerometer: accelAvailable,
//       gyroscope: gyroAvailable,
//       magnetometer: magnetAvailable,
//     };
//   }
  
//   /**
//    * Start sensor monitoring (used in production)
//    * This keeps running even when logging is disabled
//    */
//   public startMonitoring() {
//     if (this.accelSubscription) return; // Already monitoring
    
//     // Subscribe to all sensors (they update independently)
//     this.accelSubscription = Accelerometer.addListener(({ x, y, z }) => {
//       this.currentAccel = { x, y, z };
//     });
    
//     this.gyroSubscription = Gyroscope.addListener(({ x, y, z }) => {
//       this.currentGyro = { x, y, z };
//     });
    
//     this.magnetSubscription = Magnetometer.addListener(({ x, y, z }) => {
//       this.currentMagnet = { x, y, z };
//     });

//     // Use interval to collect data at consistent rate
//     this.updateInterval = setInterval(() => {
//       this.processUpdate();
//     }, this.UPDATE_INTERVAL);
//   }
  
//   /**
//    * Stop sensor monitoring (cleanup)
//    */
//   public stopMonitoring() {
//     if (this.updateInterval) {
//       clearInterval(this.updateInterval);
//       this.updateInterval = null;
//     }
    
//     if (this.accelSubscription) {
//       this.accelSubscription.remove();
//       this.accelSubscription = null;
//     }
//     if (this.gyroSubscription) {
//       this.gyroSubscription.remove();
//       this.gyroSubscription = null;
//     }
//     if (this.magnetSubscription) {
//       this.magnetSubscription.remove();
//       this.magnetSubscription = null;
//     }
//   }
  
//   /**
//    * DEV ONLY: Start logging sensor data to files
//    */
//   public async startLogging(): Promise<string> {
//     if (this.isLogging) throw new Error('Already logging');
    
//     this.startMonitoring(); // Ensure sensors are running
//     this.sessionId = `session_${Date.now()}`;
//     this.logBuffer = [];
//     this.isLogging = true;
    
//     // Create session directory
//     const sessionPath = `${FileSystem.documentDirectory}sensor_logs/${this.sessionId}/`;
//     await FileSystem.makeDirectoryAsync(sessionPath, { intermediates: true });
    
//     // Write metadata
//     const metadata = {
//       sessionId: this.sessionId,
//       startTime: new Date().toISOString(),
//       sampleRate: this.SAMPLE_RATE,
//     };
    
//     await FileSystem.writeAsStringAsync(
//       `${sessionPath}metadata.json`,
//       JSON.stringify(metadata, null, 2)
//     );
    
//     return this.sessionId;
//   }
  
//   /**
//    * DEV ONLY: Stop logging sensor data
//    */
//   public async stopLogging(): Promise<void> {
//     if (!this.isLogging || !this.sessionId) return;
    
//     // Write remaining buffer
//     if (this.logBuffer.length > 0) {
//       await this.writeLogBuffer();
//     }
    
//     this.isLogging = false;
//     this.sessionId = null;
//     this.logBuffer = [];
//   }
  
//   /**
//    * DEV ONLY: Write log buffer to file
//    */
//   private async writeLogBuffer() {
//     if (!this.sessionId || this.logBuffer.length === 0) return;
    
//     const dataPath = `${FileSystem.documentDirectory}sensor_logs/${this.sessionId}/sensor_data.csv`;
//     const csvLines = this.logBuffer.map(d => 
//       `${d.timestamp},${d.accelerometer.x},${d.accelerometer.y},${d.accelerometer.z},` +
//       `${d.gyroscope.x},${d.gyroscope.y},${d.gyroscope.z},` +
//       `${d.magnetometer.x},${d.magnetometer.y},${d.magnetometer.z}`
//     ).join('\n');
    
//     const fileInfo = await FileSystem.getInfoAsync(dataPath);
    
//     if (!fileInfo.exists) {
//       const header = 'timestamp,acc_x,acc_y,acc_z,gyro_x,gyro_y,gyro_z,mag_x,mag_y,mag_z\n';
//       await FileSystem.writeAsStringAsync(dataPath, header + csvLines + '\n');
//     } else {
//       const existingData = await FileSystem.readAsStringAsync(dataPath);
//       await FileSystem.writeAsStringAsync(dataPath, existingData + csvLines + '\n');
//     }
    
//     this.logBuffer = [];
//   }
  
//   /**
//    * Process sensor update (runs for both logging and localization)
//    */
//   private processUpdate() {
//     const reading: SensorReading = {
//       accelerometer: { ...this.currentAccel },
//       gyroscope: { ...this.currentGyro },
//       magnetometer: { ...this.currentMagnet },
//       timestamp: Date.now(),
//     };
    
//     // Apply calibration to get corrected reading
//     const calibratedReading = this.applyCalibratedReading(reading);
    
//     // DEV: Add to log buffer if logging (use RAW data for logging)
//     if (this.isLogging) {
//       this.logBuffer.push(reading);
      
//       if (this.logBuffer.length >= this.BUFFER_SIZE) {
//         this.writeLogBuffer();
//       }
//     }
    
//     // PRODUCTION: Process localization with CALIBRATED data
//     this.updateLocalization(calibratedReading);
    
//     // Notify subscribers with CALIBRATED data
//     this.updateCallbacks.forEach(callback => callback(calibratedReading));
//   }
  
//   /**
//    * Update localization data (used in production)
//    */
//   private updateLocalization(reading: SensorReading) {
//     // Calculate tilt-compensated heading from magnetometer and accelerometer
//     const { x: ax, y: ay, z: az } = reading.accelerometer;
//     const { x: mx, y: my, z: mz } = reading.magnetometer;
    
//     // Calculate roll and pitch from accelerometer
//     const roll = Math.atan2(ay, az);
//     const pitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));
    
//     // Tilt compensation for magnetometer
//     // Rotate magnetometer readings to compensate for phone tilt
//     const magX = mx * Math.cos(pitch) + mz * Math.sin(pitch);
//     const magY = mx * Math.sin(roll) * Math.sin(pitch) + 
//                  my * Math.cos(roll) - 
//                  mz * Math.sin(roll) * Math.cos(pitch);
    
//     // Calculate heading (yaw) - now tilt-compensated
//     let rawHeading = Math.atan2(-magY, magX) * (180 / Math.PI);
    
//     // Normalize to 0-360
//     if (rawHeading < 0) rawHeading += 360;
    
//     // Apply heading offset if calibrated
//     let currentHeading: number;
//     if (this.isCalibrated) {
//       currentHeading = rawHeading - this.headingOffset;
//       // Normalize to 0-360
//       if (currentHeading < 0) currentHeading += 360;
//       if (currentHeading >= 360) currentHeading -= 360;
//     } else {
//       currentHeading = rawHeading;
//     }
    
//     // Apply smoothing filter to reduce noise
//     this.heading = this.smoothHeading(currentHeading);
    
//     // Simple step detection
//     const accelMagnitude = Math.sqrt(
//       reading.accelerometer.x ** 2 +
//       reading.accelerometer.y ** 2 +
//       reading.accelerometer.z ** 2
//     );
    
//     // Detect step (simple threshold)
//     if (accelMagnitude > 12.0) {
//       this.stepCount++;
//       this.distance += 0.7; // Average step length in meters
//     }
    
//     // Update position based on heading and steps
//     // This is simplified - use IMUProcessor for production
    
//     const locData: LocalizationData = {
//       position: this.position,
//       heading: this.heading,
//       stepCount: this.stepCount,
//       distance: this.distance,
//     };
    
//     this.localizationCallbacks.forEach(callback => callback(locData));
//   }
  
//   /**
//    * Smooth heading using moving average filter
//    * Handles 0/360 degree wraparound
//    */
//   private smoothHeading(newHeading: number): number {
//     // Add new heading to history
//     this.headingHistory.push(newHeading);
    
//     // Keep only last N samples
//     if (this.headingHistory.length > this.HEADING_FILTER_SIZE) {
//       this.headingHistory.shift();
//     }
    
//     // If we don't have enough samples yet, return current
//     if (this.headingHistory.length < 2) {
//       return newHeading;
//     }
    
//     // Handle 0/360 wraparound using circular mean
//     // Convert to unit vectors, average, then back to angle
//     let sinSum = 0;
//     let cosSum = 0;
    
//     for (const angle of this.headingHistory) {
//       const radians = angle * (Math.PI / 180);
//       sinSum += Math.sin(radians);
//       cosSum += Math.cos(radians);
//     }
    
//     const avgSin = sinSum / this.headingHistory.length;
//     const avgCos = cosSum / this.headingHistory.length;
    
//     let smoothedHeading = Math.atan2(avgSin, avgCos) * (180 / Math.PI);
    
//     // Normalize to 0-360
//     if (smoothedHeading < 0) smoothedHeading += 360;
    
//     return smoothedHeading;
//   }
  
//   /**
//    * Subscribe to real-time sensor updates
//    */
//   public subscribeToUpdates(callback: (data: SensorReading) => void) {
//     this.updateCallbacks.add(callback);
//     return () => this.updateCallbacks.delete(callback);
//   }
  
//   /**
//    * Subscribe to localization updates (PRODUCTION)
//    */
//   public subscribeToLocalization(callback: (data: LocalizationData) => void) {
//     this.localizationCallbacks.add(callback);
//     return () => this.localizationCallbacks.delete(callback);
//   }
  
//   /**
//    * Get current sensor reading
//    */
//   public getCurrentReading(): SensorReading {
//     return {
//       accelerometer: { ...this.currentAccel },
//       gyroscope: { ...this.currentGyro },
//       magnetometer: { ...this.currentMagnet },
//       timestamp: Date.now(),
//     };
//   }
  
//   /**
//    * Get current localization data
//    */
//   public getCurrentLocalization(): LocalizationData {
//     return {
//       position: { ...this.position },
//       heading: this.heading,
//       stepCount: this.stepCount,
//       distance: this.distance,
//     };
//   }
  
//   /**
//    * Reset localization data
//    */
//   public resetLocalization() {
//     this.position = { x: 0, y: 0, z: 0 };
//     this.heading = 0;
//     this.stepCount = 0;
//     this.distance = 0;
//     this.headingHistory = []; // Clear heading filter
//   }
  
//   /**
//    * Check if currently logging
//    */
//   public isCurrentlyLogging(): boolean {
//     return this.isLogging;
//   }
  
//   /**
//    * Get current session ID
//    */
//   public getSessionId(): string | null {
//     return this.sessionId;
//   }
  
//   /**
//    * Calibrate sensors - captures current state as baseline
//    * User should be stationary with phone in desired reference orientation
//    */
//   public async calibrate(samples: number = 100): Promise<void> {
//     const accelSamples: Vector3D[] = [];
//     const gyroSamples: Vector3D[] = [];
//     const magnetSamples: Vector3D[] = [];
    
//     // Collect samples over ~1 second
//     for (let i = 0; i < samples; i++) {
//       accelSamples.push({ ...this.currentAccel });
//       gyroSamples.push({ ...this.currentGyro });
//       magnetSamples.push({ ...this.currentMagnet });
      
//       // Wait 10ms between samples
//       await new Promise(resolve => setTimeout(resolve, 10));
//     }
    
//     // Calculate averages
//     this.accelBaseline = {
//       x: accelSamples.reduce((sum, s) => sum + s.x, 0) / samples,
//       y: accelSamples.reduce((sum, s) => sum + s.y, 0) / samples,
//       z: accelSamples.reduce((sum, s) => sum + s.z, 0) / samples,
//     };
    
//     this.gyroBaseline = {
//       x: gyroSamples.reduce((sum, s) => sum + s.x, 0) / samples,
//       y: gyroSamples.reduce((sum, s) => sum + s.y, 0) / samples,
//       z: gyroSamples.reduce((sum, s) => sum + s.z, 0) / samples,
//     };
    
//     this.magnetBaseline = {
//       x: magnetSamples.reduce((sum, s) => sum + s.x, 0) / samples,
//       y: magnetSamples.reduce((sum, s) => sum + s.y, 0) / samples,
//       z: magnetSamples.reduce((sum, s) => sum + s.z, 0) / samples,
//     };
    
//     // Calculate initial heading offset using tilt compensation
//     const { x: ax, y: ay, z: az } = this.accelBaseline;
//     const { x: mx, y: my, z: mz } = this.magnetBaseline;
    
//     // Calculate roll and pitch from accelerometer baseline
//     const roll = Math.atan2(ay, az);
//     const pitch = Math.atan2(-ax, Math.sqrt(ay * ay + az * az));
    
//     // Tilt-compensated magnetometer
//     const magX = mx * Math.cos(pitch) + mz * Math.sin(pitch);
//     const magY = mx * Math.sin(roll) * Math.sin(pitch) + 
//                  my * Math.cos(roll) - 
//                  mz * Math.sin(roll) * Math.cos(pitch);
    
//     // Calculate heading offset
//     this.headingOffset = Math.atan2(-magY, magX) * (180 / Math.PI);
//     if (this.headingOffset < 0) this.headingOffset += 360;
    
//     this.isCalibrated = true;
    
//     // Save calibration to storage
//     await this.saveCalibration();
//   }
  
//   /**
//    * Save calibration data to persistent storage
//    */
//   private async saveCalibration(): Promise<void> {
//     const calibrationData = {
//       accelBaseline: this.accelBaseline,
//       gyroBaseline: this.gyroBaseline,
//       magnetBaseline: this.magnetBaseline,
//       headingOffset: this.headingOffset,
//       timestamp: Date.now(),
//     };
    
//     const calibrationPath = `${FileSystem.documentDirectory}sensor_calibration.json`;
//     await FileSystem.writeAsStringAsync(
//       calibrationPath,
//       JSON.stringify(calibrationData, null, 2)
//     );
//   }
  
//   /**
//    * Load calibration data from persistent storage
//    */
//   public async loadCalibration(): Promise<boolean> {
//     try {
//       const calibrationPath = `${FileSystem.documentDirectory}sensor_calibration.json`;
//       const fileInfo = await FileSystem.getInfoAsync(calibrationPath);
      
//       if (!fileInfo.exists) {
//         return false;
//       }
      
//       const calibrationData = JSON.parse(
//         await FileSystem.readAsStringAsync(calibrationPath)
//       );
      
//       this.accelBaseline = calibrationData.accelBaseline;
//       this.gyroBaseline = calibrationData.gyroBaseline;
//       this.magnetBaseline = calibrationData.magnetBaseline;
//       this.headingOffset = calibrationData.headingOffset;
//       this.isCalibrated = true;
      
//       return true;
//     } catch (error) {
//       console.error('Error loading calibration:', error);
//       return false;
//     }
//   }
  
//   /**
//    * Clear calibration data
//    */
//   public async clearCalibration(): Promise<void> {
//     this.isCalibrated = false;
//     this.accelBaseline = { x: 0, y: 0, z: 0 };
//     this.gyroBaseline = { x: 0, y: 0, z: 0 };
//     this.magnetBaseline = { x: 0, y: 0, z: 0 };
//     this.headingOffset = 0;
    
//     try {
//       const calibrationPath = `${FileSystem.documentDirectory}sensor_calibration.json`;
//       const fileInfo = await FileSystem.getInfoAsync(calibrationPath);
//       if (fileInfo.exists) {
//         await FileSystem.deleteAsync(calibrationPath);
//       }
//     } catch (error) {
//       console.error('Error clearing calibration:', error);
//     }
//   }
  
//   /**
//    * Get calibration status
//    */
//   public getCalibrationStatus() {
//     return {
//       isCalibrated: this.isCalibrated,
//       accelBaseline: { ...this.accelBaseline },
//       gyroBaseline: { ...this.gyroBaseline },
//       magnetBaseline: { ...this.magnetBaseline },
//       headingOffset: this.headingOffset,
//     };
//   }
  
//   /**
//    * Apply calibration to sensor reading
//    */
//   private applyCalibratedReading(reading: SensorReading): SensorReading {
//     if (!this.isCalibrated) {
//       return reading;
//     }
    
//     return {
//       accelerometer: {
//         x: reading.accelerometer.x - this.accelBaseline.x,
//         y: reading.accelerometer.y - this.accelBaseline.y,
//         z: reading.accelerometer.z - this.accelBaseline.z,
//       },
//       gyroscope: {
//         x: reading.gyroscope.x - this.gyroBaseline.x,
//         y: reading.gyroscope.y - this.gyroBaseline.y,
//         z: reading.gyroscope.z - this.gyroBaseline.z,
//       },
//       magnetometer: {
//         x: reading.magnetometer.x - this.magnetBaseline.x,
//         y: reading.magnetometer.y - this.magnetBaseline.y,
//         z: reading.magnetometer.z - this.magnetBaseline.z,
//       },
//       timestamp: reading.timestamp,
//     };
//   }
  
//   /**
//    * List all available sessions
//    */
//   public async listSessions(): Promise<string[]> {
//     try {
//       const logsPath = `${FileSystem.documentDirectory}sensor_logs/`;
//       const dirInfo = await FileSystem.getInfoAsync(logsPath);
      
//       if (!dirInfo.exists) {
//         return [];
//       }
      
//       const sessions = await FileSystem.readDirectoryAsync(logsPath);
//       // Filter out any non-session files and sort by newest first
//       return sessions
//         .filter(name => name.startsWith('session_'))
//         .sort()
//         .reverse();
//     } catch (error) {
//       console.error('Error listing sessions:', error);
//       return [];
//     }
//   }
  
//   /**
//    * Get the file path for a session's CSV data
//    */
//   public getSessionDataPath(sessionId: string): string {
//     return `${FileSystem.documentDirectory}sensor_logs/${sessionId}/sensor_data.csv`;
//   }
  
//   /**
//    * Get session metadata
//    */
//   public async getSessionMetadata(sessionId: string): Promise<any> {
//     try {
//       const metadataPath = `${FileSystem.documentDirectory}sensor_logs/${sessionId}/metadata.json`;
//       const fileInfo = await FileSystem.getInfoAsync(metadataPath);
      
//       if (!fileInfo.exists) {
//         return null;
//       }
      
//       const metadataContent = await FileSystem.readAsStringAsync(metadataPath);
//       return JSON.parse(metadataContent);
//     } catch (error) {
//       console.error('Error reading metadata:', error);
//       return null;
//     }
//   }
  
//   /**
//    * Delete a session
//    */
//   public async deleteSession(sessionId: string): Promise<void> {
//     try {
//       const sessionPath = `${FileSystem.documentDirectory}sensor_logs/${sessionId}/`;
//       const dirInfo = await FileSystem.getInfoAsync(sessionPath);
      
//       if (dirInfo.exists) {
//         await FileSystem.deleteAsync(sessionPath, { idempotent: true });
//       }
//     } catch (error) {
//       console.error('Error deleting session:', error);
//       throw error;
//     }
//   }
  
//   /**
//    * Share/export a session's CSV file
//    */
//   public async shareSession(sessionId: string): Promise<void> {
//     try {
//       const csvPath = this.getSessionDataPath(sessionId);
//       const fileInfo = await FileSystem.getInfoAsync(csvPath);
      
//       if (!fileInfo.exists) {
//         throw new Error('Session data file not found');
//       }
      
//       // Check if sharing is available
//       const isAvailable = await Sharing.isAvailableAsync();
//       if (!isAvailable) {
//         throw new Error('Sharing is not available on this device');
//       }
      
//       // Share the CSV file
//       await Sharing.shareAsync(csvPath, {
//         mimeType: 'text/csv',
//         dialogTitle: `Export Sensor Data - ${sessionId}`,
//         UTI: 'public.comma-separated-values-text',
//       });
//     } catch (error) {
//       console.error('Error sharing session:', error);
//       throw error;
//     }
//   }
// }

// export default SensorService.getInstance();










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

import { Accelerometer, Gyroscope, Magnetometer } from "expo-sensors";
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { headingDegreesFromExpoHeading } from "../utils/locationHeading";

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
  /** Smoothed heading from expo-location (true north when available). */
  heading: number;
  /** Latest single-sample heading from expo-location (same source as navigation payloads). */
  headingRawDeg: number | null;
  stepCount: number;
  distance: number;
}

class SensorService {
  private static instance: SensorService;
  
  // Sensor subscriptions
  private accelSubscription: any = null;
  private gyroSubscription: any = null;
  private magnetSubscription: any = null;
  private headingWatchSubscription: Location.LocationSubscription | null = null;
  /** Bumped in stopMonitoring so a late watchHeadingAsync resolve does not reattach after stop. */
  private headingWatchGeneration = 0;
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
  
  // Heading from expo-location (aligned with useSensorData / backend payloads)
  private lastExpoHeadingRawDeg: number | null = null;

  // Heading smoothing (moving average on expo samples)
  private headingHistory: number[] = [];
  private readonly HEADING_FILTER_SIZE = 10;
  
  // Dev logging (can be disabled in production)
  private isLogging: boolean = false;
  private logBuffer: SensorReading[] = [];
  private sessionId: string | null = null;
  
  // Callbacks for real-time updates
  private updateCallbacks: Set<(data: SensorReading) => void> = new Set();
  private localizationCallbacks: Set<(data: LocalizationData) => void> = new Set();
  
  // Configuration
  private readonly SAMPLE_RATE = 10; // Hz
  private readonly UPDATE_INTERVAL = 1000 / this.SAMPLE_RATE; // 100ms
  private readonly BUFFER_SIZE = 100; // Write to file every 100 samples (10 seconds at 10Hz)
  
  private constructor() {
    this.initializeSensors();
  }
  
  public static getInstance(): SensorService {
    if (!SensorService.instance) {
      SensorService.instance = new SensorService();
    }
    return SensorService.instance;
  }
  
  private initializeSensors() {
    // Set update intervals
    Accelerometer.setUpdateInterval(this.UPDATE_INTERVAL);
    Gyroscope.setUpdateInterval(this.UPDATE_INTERVAL);
    Magnetometer.setUpdateInterval(this.UPDATE_INTERVAL);
  }
  
  /**
   * Check if sensors are available on this device
   */
  public async checkSensorAvailability() {
    const accelAvailable = await Accelerometer.isAvailableAsync();
    const gyroAvailable = await Gyroscope.isAvailableAsync();
    const magnetAvailable = await Magnetometer.isAvailableAsync();
    
    return {
      accelerometer: accelAvailable,
      gyroscope: gyroAvailable,
      magnetometer: magnetAvailable,
    };
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

    void this.startLocationHeadingWatch();

    // Use interval to collect data at consistent rate
    this.updateInterval = setInterval(() => {
      this.processUpdate();
    }, this.UPDATE_INTERVAL);
  }

  private async startLocationHeadingWatch() {
    const generation = ++this.headingWatchGeneration;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (generation !== this.headingWatchGeneration) return;
      if (status !== "granted") {
        console.warn("SensorService: foreground location permission denied; heading unavailable");
        return;
      }
      this.headingWatchSubscription?.remove();
      const sub = await Location.watchHeadingAsync((h) => {
        this.lastExpoHeadingRawDeg = headingDegreesFromExpoHeading(h);
      });
      if (generation !== this.headingWatchGeneration) {
        sub.remove();
        return;
      }
      this.headingWatchSubscription = sub;
    } catch (e) {
      console.warn("SensorService: watchHeadingAsync failed", e);
    }
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
    this.headingWatchGeneration++;
    if (this.headingWatchSubscription) {
      this.headingWatchSubscription.remove();
      this.headingWatchSubscription = null;
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
    
    // DEV: Add to log buffer if logging (use RAW data for logging)
    if (this.isLogging) {
      this.logBuffer.push(reading);
      
      if (this.logBuffer.length >= this.BUFFER_SIZE) {
        this.writeLogBuffer();
      }
    }
    
    this.updateLocalization(reading);
    
    this.updateCallbacks.forEach(callback => callback(reading));
  }
  
  /**
   * Update localization data (used in production)
   */
  private updateLocalization(reading: SensorReading) {
    if (this.lastExpoHeadingRawDeg !== null) {
      this.heading = this.smoothHeading(this.lastExpoHeadingRawDeg);
    }
    
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
      headingRawDeg: this.lastExpoHeadingRawDeg,
      stepCount: this.stepCount,
      distance: this.distance,
    };
    
    this.localizationCallbacks.forEach(callback => callback(locData));
  }
  
  /**
   * Smooth heading using moving average filter
   * Handles 0/360 degree wraparound
   */
  private smoothHeading(newHeading: number): number {
    // Add new heading to history
    this.headingHistory.push(newHeading);
    
    // Keep only last N samples
    if (this.headingHistory.length > this.HEADING_FILTER_SIZE) {
      this.headingHistory.shift();
    }
    
    // If we don't have enough samples yet, return current
    if (this.headingHistory.length < 2) {
      return newHeading;
    }
    
    // Handle 0/360 wraparound using circular mean
    // Convert to unit vectors, average, then back to angle
    let sinSum = 0;
    let cosSum = 0;
    
    for (const angle of this.headingHistory) {
      const radians = angle * (Math.PI / 180);
      sinSum += Math.sin(radians);
      cosSum += Math.cos(radians);
    }
    
    const avgSin = sinSum / this.headingHistory.length;
    const avgCos = cosSum / this.headingHistory.length;
    
    let smoothedHeading = Math.atan2(avgSin, avgCos) * (180 / Math.PI);
    
    // Normalize to 0-360
    if (smoothedHeading < 0) smoothedHeading += 360;
    
    return smoothedHeading;
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
      headingRawDeg: this.lastExpoHeadingRawDeg,
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
    this.headingHistory = []; // Clear heading filter
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
  
  /**
   * List all available sessions
   */
  public async listSessions(): Promise<string[]> {
    try {
      const logsPath = `${FileSystem.documentDirectory}sensor_logs/`;
      const dirInfo = await FileSystem.getInfoAsync(logsPath);
      
      if (!dirInfo.exists) {
        return [];
      }
      
      const sessions = await FileSystem.readDirectoryAsync(logsPath);
      // Filter out any non-session files and sort by newest first
      return sessions
        .filter(name => name.startsWith('session_'))
        .sort()
        .reverse();
    } catch (error) {
      console.error('Error listing sessions:', error);
      return [];
    }
  }
  
  /**
   * Get the file path for a session's CSV data
   */
  public getSessionDataPath(sessionId: string): string {
    return `${FileSystem.documentDirectory}sensor_logs/${sessionId}/sensor_data.csv`;
  }
  
  /**
   * Get session metadata
   */
  public async getSessionMetadata(sessionId: string): Promise<any> {
    try {
      const metadataPath = `${FileSystem.documentDirectory}sensor_logs/${sessionId}/metadata.json`;
      const fileInfo = await FileSystem.getInfoAsync(metadataPath);
      
      if (!fileInfo.exists) {
        return null;
      }
      
      const metadataContent = await FileSystem.readAsStringAsync(metadataPath);
      return JSON.parse(metadataContent);
    } catch (error) {
      console.error('Error reading metadata:', error);
      return null;
    }
  }
  
  /**
   * Delete a session
   */
  public async deleteSession(sessionId: string): Promise<void> {
    try {
      const sessionPath = `${FileSystem.documentDirectory}sensor_logs/${sessionId}/`;
      const dirInfo = await FileSystem.getInfoAsync(sessionPath);
      
      if (dirInfo.exists) {
        await FileSystem.deleteAsync(sessionPath, { idempotent: true });
      }
    } catch (error) {
      console.error('Error deleting session:', error);
      throw error;
    }
  }
  
  /**
   * Share/export a session's CSV file
   */
  public async shareSession(sessionId: string): Promise<void> {
    try {
      const csvPath = this.getSessionDataPath(sessionId);
      const fileInfo = await FileSystem.getInfoAsync(csvPath);
      
      if (!fileInfo.exists) {
        throw new Error('Session data file not found');
      }
      
      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        throw new Error('Sharing is not available on this device');
      }
      
      // Share the CSV file
      await Sharing.shareAsync(csvPath, {
        mimeType: 'text/csv',
        dialogTitle: `Export Sensor Data - ${sessionId}`,
        UTI: 'public.comma-separated-values-text',
      });
    } catch (error) {
      console.error('Error sharing session:', error);
      throw error;
    }
  }
}

export default SensorService.getInstance();