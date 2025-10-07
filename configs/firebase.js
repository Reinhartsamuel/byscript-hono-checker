
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore"; // Correct the import to use 'firebase-admin/firestore'
// const serviceAccount = require('../saudagar-staging.json');
import * as admin from "firebase-admin";

const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;

// process.env.NEXT_PUBLIC_APP_MODE === 'production'
//   ? process.env.FIREBASE_SERVICE_ACCOUNT
//   : process.env.FIREBASE_SERVICE_ACCOUNT_STAGING;

if (!serviceAccountBase64) {
  throw new Error("Missing FIREBASE_SERVICE_ACCOUNT environment variable");
}

// console.log('mode :::', process.env.NEXT_PUBLIC_APP_MODE);
const serviceAccount = JSON.parse(
  Buffer.from(serviceAccountBase64, "base64").toString("utf8")
);
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
} else {
  getApp();
}

const adminDb = getFirestore();
const storage = admin.storage();
export { adminDb, admin, storage };
