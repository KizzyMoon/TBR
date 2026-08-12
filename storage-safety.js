(() => {
  const DB_NAME = 'kizzy-tbr-library-safe-v1';
  const DB_VERSION = 1;
  const LIBRARY_STORE = 'library';
  const SNAPSHOT_STORE = 'snapshots';
  const MAIN_KEY = 'main';
  const META_KEY = 'kizzy-tbr-library-last-saved';
  const BACKUP_KEY = 'kizzy-tbr-library-last-export';
  const MAX_SNAPSHOTS = 20;

  let dbPromise = null;
  let writeQueue = Promise.resolve();
  const originalSaveLibrary = saveLibrary;

  function openDatabase() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LIBRARY_STORE)) {
          db.createObjectStore(LIBRARY_STORE, { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          const store = db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id', autoIncrement: true });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Storage transaction aborted'));
    });
  }

  async function readMainRecord() {
    const db = await openDatabase();
    const tx = db.transaction(LIBRARY_STORE, 'readonly');
    return requestValue(tx.objectStore(LIBRARY_STORE).get(MAIN_KEY));
  }

  async function trimSnapshots() {
    const db = await openDatabase();
    const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
    const store = tx.objectStore(SNAPSHOT_STORE);
    const keys = await requestValue(store.getAllKeys());
    const excess = Math.max(0, keys.length - MAX_SNAPSHOTS);
    keys.slice(0, excess).forEach(key => store.delete(key));
    await transactionDone(tx);
  }

  async function persistToIndexedDB(books, savedAt, createSnapshot = true) {
    const db = await openDatabase();
    const stores = createSnapshot ? [LIBRARY_STORE, SNAPSHOT_STORE] : [LIBRARY_STORE];
    const tx = db.transaction(stores, 'readwrite');
    tx.objectStore(LIBRARY_STORE).put({
      key: MAIN_KEY,
      books: structuredClone(books),
      updatedAt: savedAt
    });
    if (createSnapshot) {
      tx.objectStore(SNAPSHOT_STORE).add({
        createdAt: savedAt,
        books: structuredClone(books)
      });
    }
    await transactionDone(tx);
    if (createSnapshot) await trimSnapshots();
  }

  function safeSaveLibrary() {
    originalSaveLibrary();
    const savedAt = Date.now();
    localStorage.setItem(META_KEY, String(savedAt));
    const books = structuredClone(state.books);
    writeQueue = writeQueue
      .then(() => persistToIndexedDB(books, savedAt, true))
      .catch(error => console.error('IndexedDB backup failed:', error));
  }

  saveLibrary = safeSaveLibrary;

  async function getLatestDifferentSnapshot() {
    const db = await openDatabase();
    const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
    const snapshots = await requestValue(tx.objectStore(SNAPSHOT_STORE).getAll());
    const current = JSON.stringify(state.books);
    return snapshots
      .sort((a, b) => b.createdAt - a.createdAt)
      .find(snapshot => JSON.stringify(snapshot.books) !== current) || null;
  }

  function formatDate(timestamp) {
    if (!timestamp) return 'Not yet';
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(new Date(timestamp));
  }

  function installSafetyCard() {
    const settings = document.getElementById('settingsView');
    if (!settings || document.getElementById('librarySafetyCard')) return;

    const cards = settings.querySelectorAll('.settings-card');
    const card = document.createElement('div');
    card.className = 'settings-card';
    card.id = 'librarySafetyCard';

    const title = document.createElement('h3');
    title.textContent = 'Library safety';

    const status = document.createElement('p');
    status.className = 'subtle';
    status.id = 'librarySafetyStatus';
    status.textContent = 'Your books are saved in two local copies, with rolling recovery snapshots.';

    const backupStatus = document.createElement('p');
    backupStatus.className = 'subtle';
    backupStatus.id = 'libraryBackupStatus';
    const lastExport = Number(localStorage.getItem(BACKUP_KEY) || 0);
    backupStatus.textContent = `Last downloaded backup: ${formatDate(lastExport)}`;

    const restore = document.createElement('button');
    restore.className = 'secondary';
    restore.type = 'button';
    restore.textContent = 'Restore previous version';
    restore.addEventListener('click', async () => {
      try {
        const snapshot = await getLatestDifferentSnapshot();
        if (!snapshot) {
          toast('No earlier recovery snapshot is available yet');
          return;
        }
        const when = formatDate(snapshot.createdAt);
        if (!confirm(`Restore your library to the version saved ${when}? Your current version will also remain in the recovery history.`)) return;
        state.books = structuredClone(snapshot.books);
        safeSaveLibrary();
        render();
        toast('Previous library version restored');
      } catch (error) {
        console.error(error);
        alert('I could not restore that recovery snapshot. Your current library has not been changed.');
      }
    });

    card.append(title, status, backupStatus, restore);
    const demoCard = [...cards].find(node => node.querySelector('#clearDemoButton'));
    if (demoCard) settings.insertBefore(card, demoCard);
    else settings.appendChild(card);

    const exportButton = document.getElementById('exportButton');
    if (exportButton) {
      exportButton.addEventListener('click', () => {
        const now = Date.now();
        localStorage.setItem(BACKUP_KEY, String(now));
        backupStatus.textContent = `Last downloaded backup: ${formatDate(now)}`;
      });
    }
  }

  async function initialiseSafeStorage() {
    try {
      const indexedRecord = await readMainRecord();
      const localSavedAt = Number(localStorage.getItem(META_KEY) || 0);

      if (indexedRecord && Array.isArray(indexedRecord.books) && indexedRecord.updatedAt >= localSavedAt) {
        state.books = structuredClone(indexedRecord.books);
        originalSaveLibrary();
        localStorage.setItem(META_KEY, String(indexedRecord.updatedAt || Date.now()));
        render();
      } else {
        const now = Date.now();
        localStorage.setItem(META_KEY, String(now));
        await persistToIndexedDB(structuredClone(state.books), now, true);
      }

      if (navigator.storage?.persist) {
        navigator.storage.persist().catch(() => {});
      }
    } catch (error) {
      console.error('Safe storage initialisation failed:', error);
    } finally {
      installSafetyCard();
    }
  }

  initialiseSafeStorage();
})();
