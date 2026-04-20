/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");

const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();
const bucket = admin.storage().bucket();

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

exports.onSplitCreated = onDocumentCreated(
  "splits/{splitId}",
  async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      logger.log("No split document data found.");
      return;
    }

    const splitData = snapshot.data();
    const createdBy = splitData.createdBy;

    if (!createdBy || typeof createdBy !== "string") {
      logger.log("Split missing valid createdBy field.");
      return;
    }

    const userRef = db.collection("users").doc(createdBy);

    await userRef.set(
      {
        stats: {
          totalSplits: admin.firestore.FieldValue.increment(1),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    logger.log(`Incremented totalSplits for user ${createdBy}`);
  },
);

exports.deleteSplit = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const uid = request.auth.uid;
    const splitId = request.data?.splitId;

    if (!splitId || typeof splitId !== "string") {
      throw new HttpsError("invalid-argument", "A valid splitId is required.");
    }

    const splitRef = db.collection("splits").doc(splitId);
    const splitSnap = await splitRef.get();

    if (!splitSnap.exists) {
      throw new HttpsError("not-found", "Split not found.");
    }

    const splitData = splitSnap.data();

    if (!splitData || splitData.createdBy !== uid) {
      throw new HttpsError(
        "permission-denied",
        "You do not have permission to delete this split.",
      );
    }

    const subSplitsRef = splitRef.collection("subSplits");
    const subSplitsSnap = await subSplitsRef.get();

    const batchSize = 400;
    let batch = db.batch();
    let opCount = 0;

    for (const docSnap of subSplitsSnap.docs) {
      batch.delete(docSnap.ref);
      opCount += 1;

      if (opCount === batchSize) {
        await batch.commit();
        batch = db.batch();
        opCount = 0;
      }
    }

    if (opCount > 0) {
      await batch.commit();
    }

    try {
      await bucket.deleteFiles({
        prefix: `splits/${splitId}/`,
      });
    } catch (error) {
      logger.error("Failed deleting split storage files", {
        splitId,
        error: error instanceof Error ? error.message : error,
      });
      throw new HttpsError(
        "internal",
        "Failed to delete split files from storage.",
      );
    }

    await splitRef.delete();

    const userRef = db.collection("users").doc(uid);
    await userRef.set(
      {
        stats: {
          totalSplits: admin.firestore.FieldValue.increment(-1),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    logger.log(`Deleted split ${splitId} for user ${uid}`);

    return {
      success: true,
      splitId,
    };
  },
);
