const DEFAULT_DB_NAME = "peixiu-routing";
const DEFAULT_STORE_NAME = "tiles";

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function createIndexedDbTileStorage({
  dbName = DEFAULT_DB_NAME,
  storeName = DEFAULT_STORE_NAME,
  indexedDBImpl = globalThis.indexedDB,
} = {}) {
  if (!indexedDBImpl) {
    return {
      async get() {
        return null;
      },
      async set() {},
      async clear() {},
    };
  }

  let databasePromise;
  const openDatabase = () => {
    databasePromise ??= new Promise((resolve, reject) => {
      const request = indexedDBImpl.open(dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Unable to open IndexedDB"));
    });
    return databasePromise;
  };

  return {
    async get(key) {
      const database = await openDatabase();
      const transaction = database.transaction(storeName, "readonly");
      const value = await requestResult(transaction.objectStore(storeName).get(key));
      await transactionDone(transaction);
      return value ? value.slice(0) : null;
    },

    async set(key, bytes) {
      const database = await openDatabase();
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(bytes.slice(0), key);
      await transactionDone(transaction);
    },

    async clear({ region, graphVersion } = {}) {
      const database = await openDatabase();
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const [keyRegion, keyGraphVersion] = String(cursor.key).split("/", 3);
        if ((!region || keyRegion === region) && (!graphVersion || keyGraphVersion === graphVersion)) {
          cursor.delete();
        }
        cursor.continue();
      };
      await transactionDone(transaction);
    },
  };
}
