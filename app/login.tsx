import { useRouter } from 'expo-router';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    updateProfile,
    UserCredential,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
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
import { auth, db } from './firebase';

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const onSuccess = (user: UserCredential) => {
    console.log('Auth success, uid=', user.user.uid);
    // Navigate to the camera home (root index)
    router.replace('/App');
  };

  const onSubmit = async () => {
    if (!auth) {
      alert('Firebase not initialized. Check app/firebase.ts');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!username.trim()) {
          alert('Please enter a username.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          alert('Password must be at least 6 characters.');
          setLoading(false);
          return;
        }
        if (password !== confirm) {
          alert('Passwords do not match.');
          setLoading(false);
          return;
        }
        const user = await createUserWithEmailAndPassword(auth, email, password);
        // Update displayName on the Firebase Auth user
        try {
          if (auth.currentUser) {
            await updateProfile(auth.currentUser, { displayName: username });
          }
        } catch (profileErr) {
          console.log('updateProfile failed', profileErr);
        }
        // Save a user record in Firestore
        try {
          if (db) {
            await setDoc(doc(db, 'users', user.user.uid), {
              uid: user.user.uid,
              email: user.user.email,
              displayName: username,
              createdAt: serverTimestamp(),
            });
          }
        } catch (dbErr) {
          console.log('Failed to write user to Firestore', dbErr);
        }
        onSuccess(user);
      } else {
        const user = await signInWithEmailAndPassword(auth, email, password);
        onSuccess(user);
      }
    } catch (e: any) {
      console.log('Auth error', e);
      alert(e?.message ?? 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.outer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.card}>
          <Text style={styles.welcomePre}>Welcome to</Text>
          <Text style={styles.welcomeMain}>Stride.</Text>

          <Text style={styles.subtitle}>{mode === 'signup' ? 'Create your Account' : 'Sign in to your Account'}</Text>

          {mode === 'signup' && (
            <TextInput
              placeholder="Username"
              style={styles.input}
              value={username}
              onChangeText={setUsername}
            />
          )}

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

          {mode === 'signup' && (
            <TextInput
              placeholder="Confirm Password"
              style={styles.input}
              secureTextEntry
              value={confirm}
              onChangeText={setConfirm}
            />
          )}

          <TouchableOpacity style={styles.button} onPress={onSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{mode === 'signup' ? 'Create Account' : 'Sign In'}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.bottomBar}>
            <Text style={styles.bottomText}>
              {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            </Text>
            <TouchableOpacity onPress={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
              <Text style={styles.signInLink}>{mode === 'signup' ? 'Sign In' : 'Create Account'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: '#d9d2d2' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: '86%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  welcomePre: { fontSize: 20, color: '#666', marginBottom: 6 },
  welcomeMain: { fontSize: 40, fontWeight: '800', color: '#1b1b1b', marginBottom: 8 },
  subtitle: { color: '#888', marginBottom: 18 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
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
  button: {
    backgroundColor: '#2f9a4a',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  bottomBar: { flexDirection: 'row', marginTop: 18, justifyContent: 'center', alignItems: 'center' },
  bottomText: { color: '#222' },
  signInLink: { color: '#2f9a4a', marginLeft: 6 },
});
