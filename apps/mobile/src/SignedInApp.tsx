import type { AuthService, AuthUser } from '@folio-loom/auth';
import { useMemo, useState } from 'react';
import { EditorScreen } from './EditorScreen';
import { LibraryScreen } from './LibraryScreen';
import { getLocalStore } from './storage';

/**
 * Everything below is keyed by UID in `App`, so an account change unmounts the open manuscript,
 * its autosave and this library handle; nothing carries over into the next account's session.
 */
export function SignedInApp({ user, service }: { user: AuthUser; service: AuthService }) {
  const store = getLocalStore();
  const library = useMemo(() => store.forUser(user.uid), [store, user.uid]);
  const [openBookId, setOpenBookId] = useState<string | null>(null);

  if (openBookId) {
    return <EditorScreen library={library} bookId={openBookId} onClose={() => setOpenBookId(null)} />;
  }
  return <LibraryScreen user={user} service={service} store={store} library={library} onOpen={setOpenBookId} />;
}
