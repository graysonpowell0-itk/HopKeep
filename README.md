# Maintenance Command Center

Mobile-first hotel maintenance app for three-property repair logs, approvals, out-of-order rooms, daily logs, and scheduled maintenance.

## Stack

- Next.js App Router
- Tailwind CSS
- Firebase Auth
- Cloud Firestore
- Firebase Storage
- Firebase Hosting or Vercel

## Setup

1. Create a Firebase project.
2. Enable Email/Password in Firebase Auth.
3. Open Firebase Storage in the Firebase console and click **Get Started** to initialize the default bucket.
4. Create a web app and copy config values into `.env.local` using `.env.example`.
5. Deploy rules and indexes:

```bash
npx firebase-tools deploy --only firestore,storage
```

6. Bootstrap one property manager manually in Firebase Auth and `users/{uid}`, then seed editable properties:

```bash
SEED_ADMIN_EMAIL=manager@example.com SEED_ADMIN_PASSWORD='password' npm run seed
```

7. Create Firebase Auth users, then add matching `users/{uid}` docs:

```json
{
  "name": "Pat Technician",
  "email": "pat@example.com",
  "role": "technician",
  "assignedProperties": ["hampton_inn"],
  "active": true,
  "createdAt": "server timestamp",
  "updatedAt": "server timestamp"
}
```

Roles are `technician`, `property_admin`, and `property_manager`. A property manager can see all hotels. Technicians and property admins only see assigned properties.

## Verification

Run the production build:

```bash
npm run build
```

Run the Firebase smoke test with a temporary test-user password:

```bash
TEST_USER_PASSWORD='choose-a-temporary-password' npm run test:firebase
```

The smoke test creates three technician users, writes profile docs, attempts an image upload to Storage, submits Firestore repair logs, and reads those logs back. If Storage has not been initialized in the Firebase console, Auth and Firestore can pass while Storage reports a 404 until the default bucket is created and `storage.rules` are deployed.

## Deploy

Vercel works with the same environment variables. Firebase Hosting is configured in `firebase.json` for framework-aware deploys:

```bash
npx firebase-tools deploy --only hosting
```
