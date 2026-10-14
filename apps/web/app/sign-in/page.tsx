import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthForm } from '../components/AuthForm';
import { AuthGateView } from '../components/AuthGateView';

export const metadata: Metadata = { title: 'Sign in · Folio Loom' };

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthGateView decision="showLoading">{() => null}</AuthGateView>}>
      <AuthForm mode="signIn" />
    </Suspense>
  );
}
