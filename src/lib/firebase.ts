import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
const databaseId = (firebaseConfig as any).firestoreDatabaseId || "ai-studio-773a3703-7861-48f8-a809-1456568b7d33";
export const db = getFirestore(app, databaseId);
