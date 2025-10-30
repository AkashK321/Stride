import React, {useState, useEffect, useRef, JSX} from 'react';
import {StyleSheet, Text, View, Button, TouchableOpacity} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

// Set the detection interval (in milliseconds)
const DETECTION_INTERVAL_MS = 5000;

export default function App(): JSX.Element {
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isCameraReady, setIsCameraReady] = useState(false);

    const handleDetect = async () => {
        if (!cameraRef.current || isProcessing) {
            return;
        }

        setIsProcessing(true);

        // Take the Picture
        // We get the image as a base64 string, which is what our API needs
        // TODO: we shouldn't be taking individual images, process video feed itself,
        //  this implementation is very rudimentary
        const options = { quality: 0.5, base64: true, skipProcessing: true};
        let photo;
        try {
            // Note: this causes the screen to flash with each picture taken, but it should be removed eventually
            // as we transition to processing the video feed vs taking individual images on an interval
            photo = await cameraRef.current.takePictureAsync(options);
        } catch (error) {
            console.error("Failed to take picture:", error);
            setIsProcessing(false);
            return;
        }

        // Send to backend endpoint
        const apiGatewayUrl = "https://backend.example.com/detect";
        console.log("Sending image to API Gateway...");

        try {
            // We send the base64 string in a JSON body
            const response = await fetch(apiGatewayUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image: photo.base64,

                }),
            });

            // Get the Result
            if (!response.ok) {
                const errorText = await response.text();
                console.error("API Error:", response.status, errorText);
                alert(`MOCK ERROR: API call failed. (This is expected if URL is a placeholder)`);
            } else {
                // If the call succeeds
                const data = await response.json();
                console.log("Detections from SageMaker:", data);
                // Process data here?
                alert(`MOCK SUCCESS: Detected ${data.detections.length} objects.`);
            }

        } catch (error) {
            console.error("Fetch Error:", error);
            // This will happen if the URL is bad, or you have no internet
            alert("MOCK SUCCESS: Captured image and sent to placeholder URL. See console for details.");
            console.log("Mock capture success. The app would have sent a base64 string to the API.");
        }

        setIsProcessing(false);
    };

    useEffect(() => {
        // Wait for permissions and for the camera to be ready
        if (!permission || !isCameraReady) {
            return;
        }

        if (isProcessing) {
            return;
        }

        // Set a timer to run the detection
        const timerId = setTimeout(() => {
            handleDetect().then(r => {});
        }, DETECTION_INTERVAL_MS);

        // Cleanup function
        return () => {
            clearTimeout(timerId);
        };
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
});
