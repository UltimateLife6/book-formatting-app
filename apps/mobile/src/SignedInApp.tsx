import type { AuthService, AuthUser } from '@folio-loom/auth';
import { useMemo, useState } from 'react';
import { EditorScreen } from './EditorScreen';
import { LibraryScreen } from './LibraryScreen';
import { getLocalStore } from './storage';
import { ConflictsScreen, SnapshotsScreen } from './SyncScreens';
import { useMobileSync } from './sync';

type Route = { name: 'library' } | { name: 'editor' | 'conflicts' | 'snapshots'; bookId: string };

/**
 * Everything below is keyed by UID in `App`, so an account change unmounts the open manuscript,
 * its autosave, this library handle and the sync engine; nothing carries over into the next
 * account's session.
 */
export function SignedInApp({ user, service }: { user: AuthUser; service: AuthService }) {
  const store = getLocalStore();
  const library = useMemo(() => store.forUser(user.uid), [store, user.uid]);
  const { engine, sync } = useMobileSync(user.uid, store, library);
  const [route, setRoute] = useState<Route>({ name: 'library' });
  const toLibrary = () => setRoute({ name: 'library' });

  if (route.name === 'editor') {
    return (
      <EditorScreen
        library={library}
        store={store}
        engine={engine}
        sync={sync}
        bookId={route.bookId}
        onClose={toLibrary}
        onNavigate={(name) => setRoute({ name, bookId: route.bookId })}
      />
    );
  }
  if (route.name === 'conflicts') return <ConflictsScreen engine={engine} sync={sync} bookId={route.bookId} onClose={toLibrary} />;
  if (route.name === 'snapshots') return <SnapshotsScreen engine={engine} sync={sync} bookId={route.bookId} onClose={toLibrary} />;
  return (
    <LibraryScreen
      user={user}
      service={service}
      store={store}
      library={library}
      engine={engine}
      sync={sync}
      onOpen={(bookId) => setRoute({ name: 'editor', bookId })}
      onNavigate={(name, bookId) => setRoute({ name, bookId })}
    />
  );
}
