import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD2KWUc38j33bp_FIAmvwnuyldGs4FZKmU",
  authDomain: "j-mart-33b3a.firebaseapp.com",
  projectId: "j-mart-33b3a",
  storageBucket: "j-mart-33b3a.firebasestorage.app",
  messagingSenderId: "131092903011",
  appId: "1:131092903011:web:b715170ddd69441847b456",
  measurementId: "G-9M609B5L5Q"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
