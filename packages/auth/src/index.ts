export {
  DEFAULT_DEMO_PROJECT_ID,
  DEFAULT_EMULATOR_PORTS,
  type EmulatorFirebaseConfig,
  FirebaseConfigError,
  type FirebaseEnvInput,
  resolveFirebaseConfig,
} from './config';
export { safeAuthError, toSafeAuthError } from './errors';
export { type GateDecision, gateDecision, type RouteAccess, routeAccess } from './gate';
export * from './types';
export {
  type CredentialErrors,
  type CredentialMode,
  hasCredentialErrors,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validateCredentials,
} from './validation';
