# Threadly – Firebase / Firestore artifact files

This folder contains Firebase configuration and documentation files for the Threadly project.

## Included files

- `firebase.json` – tells Firebase CLI where the Firestore rules and indexes files are.
- `firestore.rules` – Firestore access-control rules for Threadly's main collections.
- `firestore.indexes.json` – Firestore composite-index configuration (currently empty; add indexes if Firebase reports that a query requires one).
- `.env.example` – safe template for the public Firebase web-app configuration values.

## Threadly Firestore collections

| Collection | Purpose |
|---|---|
| `users` | User profiles and account roles (`creative` / `customer`) |
| `posts` | Community posts created by creatives |
| `products` | Products listed by creatives |
| `orders` | Customer orders, payment confirmation and fulfilment status |
| `patterns` | AI-generated patterns owned by creatives |
| `conversations` | Conversations between users |
| `conversations/{conversationId}/messages` | Individual messages |
| `users/{userId}/savedPrices` | Saved pricing-calculator results |

## Connect this folder to your Firebase project

1. Install Node.js if it is not already installed.
2. Install the Firebase CLI:

   ```cmd
   npm install -g firebase-tools
   ```

3. Sign in:

   ```cmd
   firebase login
   ```

4. From the Threadly project root, initialise or connect the Firebase project:

   ```cmd
   firebase use --add
   ```

   Select the existing Firebase project used by Threadly. This creates or updates `.firebaserc` with the project alias.

5. Copy `.env.example` to `.env.local` and fill in the values from Firebase Console > Project settings > General > Your apps.

6. Deploy Firestore rules and indexes:

   ```cmd
   firebase deploy --only firestore
   ```

## Important security and compatibility notes

- Never submit `.env.local`, Firebase Admin service-account JSON files, private keys, or other secrets.
- `.env.example` contains placeholders only. Replace them locally; do not put real secret values in the submitted artifact.
- The rules in this starter package are based on the Threadly collection names and fields described in the project. **Compare them with the rules currently deployed in your Firebase Console and test every workflow before deploying.** In particular, check product creation/editing, order creation, customer payment-proof resubmission, creator payment review, order completion, messaging, and pattern generation.
- Firestore rules are not filters. Queries must be written so that every returned document is readable by the requesting user.
- The current `firestore.indexes.json` has no composite indexes. If Firestore displays a “requires an index” link, create the index and export/deploy the updated index configuration.
- The Firebase web configuration values are used by the client app. Do not put Admin SDK private credentials in browser code.

## Suggested evidence for the written project artifact

Capture screenshots from your own Firebase Console showing:
1. Firestore Database > Data with the Threadly collections.
2. Example `users`, `products`, `posts`, and `orders` documents (hide personal data).
3. Firestore Database > Rules.
4. Firebase Authentication showing test accounts with personal details hidden.

Add these screenshots to the database implementation section of your report.
