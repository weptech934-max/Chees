import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged, User } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocFromServer,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128);
  return cleaned.length > 0 ? cleaned : 'id_default';
}

export function sanitizeDisplayName(name: string): string {
  const trimmed = name.trim().slice(0, 50);
  return trimmed.length >= 1 ? trimmed : 'Contender';
}

export async function signInWithGooglePopup(): Promise<User | null> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutFirebase(): Promise<void> {
  await fbSignOut(auth);
}

export { onAuthStateChanged };
export type { User };

export async function syncUserProfileToFirestore(profile: {
  uid: string;
  displayName: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
}): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const uid = sanitizeId(auth.currentUser.uid);
  if (!ID_REGEX.test(uid)) return;
  const path = `users/${uid}`;
  const docRef = doc(db, 'users', uid);

  const safeName = sanitizeDisplayName(profile.displayName);
  const safeRating = Math.min(4000, Math.max(100, Math.round(profile.rating)));
  const safeWins = Math.min(1000000, Math.max(0, Math.round(profile.wins)));
  const safeLosses = Math.min(1000000, Math.max(0, Math.round(profile.losses)));
  const safeDraws = Math.min(1000000, Math.max(0, Math.round(profile.draws)));

  try {
    const existingSnap = await getDoc(docRef);
    if (!existingSnap.exists()) {
      await setDoc(docRef, {
        uid,
        displayName: safeName,
        rating: safeRating,
        wins: safeWins,
        losses: safeLosses,
        draws: safeDraws,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(docRef, {
        displayName: safeName,
        rating: safeRating,
        wins: safeWins,
        losses: safeLosses,
        draws: safeDraws,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function archiveCompletedGameToFirestore(game: {
  gameId: string;
  whiteName: string;
  blackName: string;
  whiteRating: number;
  blackRating: number;
  winner: 'w' | 'b' | 'draw';
  resultReason: string;
  timeControl: string;
  finalFen: string;
  pgnMoves: string;
}): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const ownerUid = sanitizeId(auth.currentUser.uid);
  const gameId = sanitizeId(`${game.gameId}_${ownerUid}`.slice(0, 120));
  const path = `games/${gameId}`;
  const docRef = doc(db, 'games', gameId);

  try {
    const existingSnap = await getDoc(docRef);
    if (existingSnap.exists()) return;
    await setDoc(docRef, {
      gameId,
      ownerUid,
      whiteName: sanitizeDisplayName(game.whiteName),
      blackName: sanitizeDisplayName(game.blackName),
      whiteRating: Math.min(4000, Math.max(100, Math.round(game.whiteRating))),
      blackRating: Math.min(4000, Math.max(100, Math.round(game.blackRating))),
      winner: game.winner,
      resultReason: (game.resultReason || 'checkmate').slice(0, 40),
      timeControl: (game.timeControl || '10+0 Rapid').slice(0, 30),
      finalFen: (game.finalFen || '').slice(0, 200),
      pgnMoves: (game.pgnMoves || '').slice(0, 5000),
      status: 'completed',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}
