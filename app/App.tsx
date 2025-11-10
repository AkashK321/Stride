import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { JSX, useEffect, useRef, useState } from 'react';
import { Button, Modal, StyleSheet, Text, View } from 'react-native';

// Set the detection interval (in milliseconds)
// Show the capture modal every 3 seconds as a placeholder
const DETECTION_INTERVAL_MS = 3000;

export default function App(): JSX.Element {
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [requestedPermissionOnce, setRequestedPermissionOnce] = useState(false);
    const [showCaptureModal, setShowCaptureModal] = useState(false);

    // Simulated detection: show the capture modal and log a mock detection.
    // The original native capture code is commented out below so you can re-enable it later
    // when you're ready to use real camera captures on a physical device.
    const handleDetect = async () => {
        if (isProcessing) return;
        setIsProcessing(true);

        // Show the modal briefly to simulate a capture
        setShowCaptureModal(true);
        setTimeout(() => setShowCaptureModal(false), 1000);

        // Log a mock detection result
        console.log('MOCK: Simulated capture — no native camera call performed.');

        /*
        // Original native capture implementation (commented out):
        if (!cameraRef.current) {
            console.log('cameraRef is not available, skipping native capture');
            setIsProcessing(false);
            return;
        }

        try {
            const options = { quality: 0.5, base64: true, skipProcessing: true };
            const photo = await cameraRef.current.takePictureAsync(options);
            console.log('Captured photo (native):', photo.uri);

            // Send to backend endpoint (example)
            const apiGatewayUrl = 'https://backend.example.com/detect';
            try {
                const response = await fetch(apiGatewayUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: photo.base64 }),
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    console.log('API Error (non-OK response):', response.status, errorText);
                } else {
                    const data = await response.json();
                    console.log('Detections from backend:', data);
                }
            } catch (fetchErr) {
                console.log('Fetch error while sending photo:', fetchErr);
            }
        } catch (nativeErr) {
            console.log('Native camera capture failed:', nativeErr);
        }
        */

        setIsProcessing(false);
    };

    useEffect(() => {
        // Auto-request permission once when the component mounts / when permission object becomes available
        if (permission && !permission.granted && !requestedPermissionOnce) {
            // trigger OS permission prompt
            requestPermission();
            setRequestedPermissionOnce(true);
        }

        // Wait for permissions and for the camera to be ready
        if (!permission || !isCameraReady) {
            return;
        }

        if (isProcessing) {
            return;
        }

        // When permission is granted and camera is ready, start periodic simulated captures
        if (permission.granted && isCameraReady) {
            // run one immediately
            handleDetect().then(() => {});
            const id = setInterval(() => {
                handleDetect().then(() => {});
            }, DETECTION_INTERVAL_MS);
            return () => clearInterval(id);
        }

        // Otherwise, nothing to do until camera is ready and permission granted
        return;
    }, [isProcessing, permission, isCameraReady]);

    // --- Main Render ---

    if (!permission) {
        return <View style={styles.container}><Text style={styles.loadingText}>Requesting permissions...</Text></View>;
    }
    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.loadingText}>No access to camera. Please grant permission.</Text>
                <Button title="Grant Permission" onPress={requestPermission} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Stride</Text>
            <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing={'back'}
                onCameraReady={() => {
                    console.log("Camera is ready")
                    setIsCameraReady(true);
                    }
                }
            />
            <Modal visible={showCaptureModal} transparent animationType="fade">
              <View style={styles.modalContainer}>
                <View style={styles.modalCard}>
                  <Text style={{fontSize:18, fontWeight:'600'}}>Image Captured</Text>
                  <Text style={{marginTop:8,color:'#444'}}>Captured — image was successfully taken.</Text>
                </View>
              </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        position: 'absolute',
        top: 50,
        left: 20,
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
        zIndex: 20, // Must be on top
    },
    camera: {
        width: '100%',
        height: '100%',
    },
    loadingText: {
        color: 'white',
        fontSize: 18,
    }
    ,
    modalContainer: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalCard: {
        width: '80%',
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 10,
        alignItems: 'center',
    }
});

