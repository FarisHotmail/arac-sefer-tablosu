import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { BoardColumn, DispatchBoardData, TripCell } from './types';
import { INITIAL_BOARD } from './initialData';

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

// Connection test on boot
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client offline, utilizing cached storage.');
    }
    return false;
  }
}

const BOARD_DOC_ID = 'main';
const STORAGE_KEY = 'dispatch_board_local_cache';

export function getLocalBoard(): DispatchBoardData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.columns) && Array.isArray(parsed.rows)) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return INITIAL_BOARD;
}

export function saveLocalBoard(board: DispatchBoardData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  } catch {
    // ignore
  }
}

export async function saveBoardToFirestore(board: DispatchBoardData) {
  const payload: DispatchBoardData = {
    ...board,
    updatedAt: new Date().toISOString(),
    updatedBy: 'public',
  };

  saveLocalBoard(payload);

  const docRef = doc(db, 'dispatch_boards', BOARD_DOC_ID);
  try {
    await setDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `dispatch_boards/${BOARD_DOC_ID}`);
    throw error;
  }
}

export function subscribeToBoard(
  onUpdate: (board: DispatchBoardData) => void,
  onError?: (error: FirestoreErrorInfo) => void
) {
  const docRef = doc(db, 'dispatch_boards', BOARD_DOC_ID);
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as DispatchBoardData;
        saveLocalBoard(data);
        onUpdate(data);
      } else {
        // Document does not exist yet in Firestore, initialize and seed it directly
        const initial = getLocalBoard();
        onUpdate(initial);
        saveBoardToFirestore(initial).catch(() => {});
      }
    },
    (error) => {
      const info = handleFirestoreError(error, OperationType.GET, `dispatch_boards/${BOARD_DOC_ID}`);
      if (onError) onError(info);
    }
  );
}

export async function loginWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}
