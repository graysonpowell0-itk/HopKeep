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
3. Create a web app and copy config values into `.env.local` using `.env.example`.
4. Deploy rules and indexes:

```bash
npx firebase-tools deploy --only firestore,storage
```

5. Bootstrap one property manager manually in Firebase Auth and `users/{uid}`, then seed editable properties:

```bash
SEED_ADMIN_EMAIL=manager@example.com SEED_ADMIN_PASSWORD='password' npm run seed
```

6. Create Firebase Auth users, then add matching `users/{uid}` docs:

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

## Deploy

Vercel works with the same environment variables. Firebase Hosting is configured in `firebase.json` for framework-aware deploys:

```bash
npx firebase-tools deploy --only hosting
```
