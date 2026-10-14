import {
  type AuthService,
  type CredentialErrors,
  type CredentialMode,
  hasCredentialErrors,
  validateCredentials,
} from '@folio-loom/auth';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from './theme';

const COPY = {
  signIn: { title: 'Sign in', submit: 'Sign in', switchText: 'New to Folio Loom? Create an account' },
  signUp: { title: 'Create your account', submit: 'Create account', switchText: 'Already have an account? Sign in' },
} as const;

export function AuthScreen({ service }: { service: AuthService }) {
  const [mode, setMode] = useState<CredentialMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<CredentialErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = COPY[mode];

  async function submit() {
    setFormError(null);
    const errors = validateCredentials(email, password, mode);
    setFieldErrors(errors);
    if (hasCredentialErrors(errors)) return;
    setBusy(true);
    const result = mode === 'signUp' ? await service.signUp(email, password) : await service.signIn(email, password);
    setBusy(false);
    if (!result.ok) {
      setFormError(result.error.message);
      setPassword('');
    }
  }

  function switchMode() {
    setMode(mode === 'signIn' ? 'signUp' : 'signIn');
    setFieldErrors({});
    setFormError(null);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.form}>
        <Text style={styles.title} accessibilityRole="header">
          {copy.title}
        </Text>
        {formError ? (
          <Text style={styles.formError} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {formError}
          </Text>
        ) : null}

        <Text style={styles.label} nativeID="email-label">
          Email
        </Text>
        <TextInput
          style={[styles.input, fieldErrors.email ? styles.inputError : null]}
          accessibilityLabelledBy="email-label"
          accessibilityLabel="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        {fieldErrors.email ? <Text style={styles.fieldError}>{fieldErrors.email}</Text> : null}

        <Text style={styles.label} nativeID="password-label">
          Password
        </Text>
        <TextInput
          style={[styles.input, fieldErrors.password ? styles.inputError : null]}
          accessibilityLabelledBy="password-label"
          accessibilityLabel="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
          textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        {fieldErrors.password ? <Text style={styles.fieldError}>{fieldErrors.password}</Text> : null}

        <Pressable
          style={[styles.button, busy ? styles.buttonBusy : null]}
          onPress={submit}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
        >
          {busy ? <ActivityIndicator color="#fff" accessibilityLabel="Working" /> : <Text style={styles.buttonText}>{copy.submit}</Text>}
        </Pressable>

        <Pressable onPress={switchMode} accessibilityRole="button" style={styles.link}>
          <Text style={styles.linkText}>{copy.switchText}</Text>
        </Pressable>
        <Text style={styles.devNote}>Development build: accounts live in the local Firebase Auth emulator only.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper, justifyContent: 'center' },
  form: { padding: 24, gap: 8 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '600', marginBottom: 8 },
  label: { color: colors.ink, fontWeight: '600', marginTop: 8 },
  input: {
    minHeight: 48,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    fontSize: 16,
    color: colors.ink,
  },
  inputError: { borderColor: colors.error },
  fieldError: { color: colors.error },
  formError: { color: colors.error, borderColor: colors.error, borderWidth: 1, borderRadius: 8, padding: 12, backgroundColor: '#fff' },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  buttonBusy: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { color: colors.accent, fontSize: 15 },
  devNote: { color: colors.muted, fontSize: 12 },
});
