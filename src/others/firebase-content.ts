import { getApp, getApps, initializeApp } from 'firebase/app';
import { collection, doc, getDocFromServer, getDocsFromServer, getFirestore } from 'firebase/firestore';
import { normalizePrice, normalizeWeather, weatherWindow, type ContentKind, type PriceRecord, type Revisions, type WeatherDay } from './content-model';

// This is the same public Firebase project configuration used by Web-Control-Dev.
// Access is determined by Firestore Security Rules, not by keeping this object private.
const config = {
  apiKey: 'AIzaSyA-BtHaIrWzCAiylZ9xbzryVfH8kYswkj4',
  authDomain: 'agrigrow-f8852.firebaseapp.com',
  projectId: 'agrigrow-f8852',
  storageBucket: 'agrigrow-f8852.firebasestorage.app',
  messagingSenderId: '790741628928',
  appId: '1:790741628928:web:13577d8de4d9dbd7c3c0e5',
};
const db = getFirestore(getApps().length ? getApp() : initializeApp(config));

export async function fetchRevisions(): Promise<Revisions> {
  const [prices, weather] = await Promise.all(['prices', 'weather'].map(kind =>
    getDocFromServer(doc(db, 'contentVersions', kind))));
  const revision = (snapshot: typeof prices) => {
    const value = snapshot.exists() ? snapshot.data().revision : null;
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  };
  return { prices: revision(prices), weather: revision(weather) };
}

export async function fetchContent(kind: 'prices', now?: number): Promise<PriceRecord[]>;
export async function fetchContent(kind: 'weather', now?: number): Promise<WeatherDay[]>;
export async function fetchContent(kind: ContentKind, now = Date.now()): Promise<PriceRecord[] | WeatherDay[]> {
  if (kind === 'prices') {
    const snapshot = await getDocsFromServer(collection(db, 'marketPrices'));
    return snapshot.docs.map(item => normalizePrice(item.id, item.data()))
      .filter((item): item is PriceRecord => item !== null)
      .sort((a, b) => a.commodityName.localeCompare(b.commodityName));
  }
  const dates = weatherWindow(now);
  const snapshots = await Promise.all(dates.map(date =>
    getDocFromServer(doc(db, 'weatherRecords', `davao-del-sur_${date}`))));
  return snapshots.flatMap((snapshot, index) => {
    if (!snapshot.exists()) return [];
    const data = snapshot.data();
    const updatedAt = data.updatedAt?.toMillis?.() ?? null;
    const day = normalizeWeather({ ...data, updatedAt }, dates[index]);
    return day ? [day] : [];
  });
}
