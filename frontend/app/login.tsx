import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

// Visual-first sign in / sign up screen. Behavior is placeholder-only and will
// navigate to the camera screen after a short simulated delay.

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'signup' | 'signin'>('signin');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmitPlaceholder = () => {
    setLoading(true);
    // Simulate a short network/auth delay
    setTimeout(() => {
      setLoading(false);
      // Navigate to camera screen (App)
      router.replace('/App');
    }, 700);
  };

  return (
    <SafeAreaView style={styles.outer}>
      <KeyboardAvoidingView
        style={styles.wrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.cardContainer}>
          <View style={styles.card}>
            <Text style={styles.titleSmall}>{mode === 'signup' ? 'Create your Account' : 'Sign in to your Account'}</Text>
            <Text style={styles.titleLarge}>Welcome to{`\n`}<Text style={styles.stride}>Stride.</Text></Text>

            <Text style={styles.subtitle}>{mode === 'signup' ? 'Create your Account' : 'Sign in to your Account'}</Text>

            {mode === 'signup' && (
              <TextInput
                placeholder="Email"
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            )}

            {mode === 'signup' && (
              <TextInput
                placeholder="Password"
                style={styles.input}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            )}

            {mode === 'signup' && (
              <TextInput
                placeholder="Confirm Password"
                style={styles.input}
                secureTextEntry
                value={confirm}
                onChangeText={setConfirm}
              />
            )}

            {mode === 'signin' && (
              <>
                <TextInput
                  placeholder="Email"
                  style={styles.input}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                />
                <TextInput
                  placeholder="Password"
                  style={styles.input}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                />
                <TouchableOpacity style={styles.forgot} onPress={() => { /* placeholder */ }}>
                  <Text style={styles.forgotText}>Forgot Password?</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity style={styles.primaryButton} onPress={onSubmitPlaceholder} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>{mode === 'signup' ? 'Create Account' : 'Sign In'}</Text>}
            </TouchableOpacity>

            {mode === 'signin' && (
              <Text style={styles.orLabel}>Or sign in with</Text>
            )}

            {mode === 'signin' && (
              <View style={styles.socialRow}>
                <TouchableOpacity style={styles.socialBtn} onPress={() => { /* placeholder */ }}>
                  <Text style={styles.socialLabel}>G</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialBtn} onPress={() => { /* placeholder */ }}>
                  <Text style={styles.socialLabel}></Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        <View style={styles.footerBand}>
          <Text style={styles.footerText}>
            {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <Text style={styles.footerLink} onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
              {mode === 'signup' ? 'Sign In' : 'Create Account'}
            </Text>
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#d9d2d2' },
  wrapper: { flex: 1 },
  cardContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: '88%',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 28,
    paddingHorizontal: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  titleSmall: { color: '#8b8585', fontSize: 14, marginBottom: 8 },
  titleLarge: { fontSize: 36, fontWeight: '800', color: '#111' },
  stride: { color: '#2f9a4a' },
  subtitle: { color: '#8a8a8a', marginTop: 16, marginBottom: 12 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
    borderWidth: 0.5,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
  },
  forgot: { alignSelf: 'flex-end', marginBottom: 6 },
  forgotText: { color: '#9aa0a6', fontSize: 12 },
  primaryButton: {
    backgroundColor: '#2f9a4a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  orLabel: { textAlign: 'center', color: '#999', marginTop: 12, marginBottom: 8 },
  socialRow: { flexDirection: 'row', justifyContent: 'space-between' },
  socialBtn: {
    width: 140,
    height: 48,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
  },
  socialLabel: { fontSize: 18 },
  footerBand: {
    height: 72,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: { color: '#fff' },
  footerLink: { color: '#2f9a4a', fontWeight: '600' },
});


