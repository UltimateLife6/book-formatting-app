import { type AuthService, type AuthState, gateDecision, LOADING_STATE } from '@folio-loom/auth';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AuthScreen } from './src/AuthScreen';
import { getAuthService } from './src/firebase';
import { ProjectsScreen } from './src/ProjectsScreen';
import { colors } from './src/theme';

const noopSubscribe = () => () => {};

function useAuth(): { service: AuthService | null; state: AuthState } {
  const setup = useMemo((): { service: AuthService | null; error: string | null } => {
    try {
      return { service: getAuthService(), error: null };
    } catch (error) {
      return { service: null, error: error instanceof Error ? error.message : 'Firebase is not configured.' };
    }
  }, []);
  const service = setup.service;
  const state = useSyncExternalStore(service ? service.subscribe : noopSubscribe, service ? service.getSnapshot : () => LOADING_STATE);
  return { service, state: setup.error ? { status: 'error', message: setup.error } : state };
}

export default function App() {
  const { service, state } = useAuth();
  // The app's only screen is private, so it is gated exactly like a private web route.
  const decision = gateDecision(state, 'private');

  let content: React.ReactNode;
  if (decision === 'render' && state.status === 'signedIn' && service) {
    content = <ProjectsScreen user={state.user} service={service} />;
  } else if (decision === 'redirectToSignIn' && service) {
    content = <AuthScreen service={service} />;
  } else if (decision === 'showError') {
    content = (
      <View style={styles.center}>
        <Text style={styles.error} accessibilityRole="alert">
          {state.status === 'error' ? state.message : "We couldn't check your session."}
        </Text>
      </View>
    );
  } else {
    content = (
      <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel="Checking your session" accessibilityState={{ busy: true }}>
        <ActivityIndicator size="large" color={colors.ink} />
        <Text style={styles.muted}>Checking your session…</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {content}
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  muted: { color: colors.muted, fontSize: 15 },
  error: { color: colors.error, fontSize: 16, textAlign: 'center' },
});
