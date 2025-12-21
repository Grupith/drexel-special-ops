import { getFirestore } from "firebase/firestore";
import { app } from "./config"; // or "./config" / "./config.ts" depending on your setup

export const db = getFirestore(app);
