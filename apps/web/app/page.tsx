import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <p className="tag">Folio Loom 2.0 · foundation preview</p>
      <h1>Format your manuscript into a professional book.</h1>
      <p className="muted">Sign in to open your projects. Your manuscripts are private to your account.</p>
      <div className="actions">
        <Link className="button" href="/sign-in">
          Sign in
        </Link>
        <Link className="button secondary" href="/sign-up">
          Create account
        </Link>
      </div>
    </main>
  );
}
