# Settings Module Implementation Plan

## Goal

Create a Settings module that supports profile image management for Admin and Staff users, and complete the navbar notification lifecycle requirements with pagination, read/archive behavior, 30-day retention, and automatic cleanup.

## Current Backend Context

- The backend is an Express app mounted from `server.js`.
- Routes live in `functions/routes`.
- MongoDB access helpers live in `functions/db/index.js`.
- Zod contracts/models live in `functions/models`.
- The existing user model already has profile image fields:
  - `avatarUrl`
  - `avatarPublicId`
  - `avatarResourceType`
- The existing Cloudinary helper already supports profile image upload:
  - `uploadProfilePicture(file)`
  - `deleteCloudinaryAsset(publicId, resourceType)`
- The existing notification route already supports basic pagination through:
  - `GET /api/notifications?page=&limit=`
- Current read notification behavior only sets `isRead: true`; it does not archive or expire notifications yet.

## Scope

### In Scope

- Add a new Settings route module.
- Add profile image upload, replace, remove, and view endpoints.
- Restrict profile image management to authenticated Admin and Staff users.
- Allow authenticated users to view profile images across the platform.
- Improve notification pagination response for navbar use.
- Move read notifications into an archived/trash state.
- Retain archived notifications for 30 days.
- Automatically delete archived notifications after 30 days.
- Update Swagger/OpenAPI comments for new and changed endpoints.
- Verify with build and targeted manual API checks.

### Out of Scope

- Frontend UI implementation.
- User profile text fields such as name, phone, or password.
- Notification delivery changes for email or in-app creation.
- Rebuilding the full notification preference system.

## Proposed API Design

### Settings Profile Image Endpoints

Base path:

```txt
/api/settings
```

#### Get Current User Profile Image

```txt
GET /api/settings/profile-image
```

Returns the authenticated user's current profile image metadata.

Expected response data:

```json
{
  "profileImage": {
    "userId": "user-id",
    "avatarUrl": "https://...",
    "avatarPublicId": "atlas-africa/profile-pictures/...",
    "avatarResourceType": "image"
  }
}
```

If no image exists, return `avatarUrl: null`.

#### Upload Current User Profile Image

```txt
POST /api/settings/profile-image
```

Request:

```txt
multipart/form-data
field name: image
```

Behavior:

- Validates file as JPEG, PNG, or WebP using existing profile image validation.
- Uploads the file to Cloudinary.
- Stores the resulting image URL and provider metadata on the current user.
- If the user already has an image, this endpoint can behave like replace to keep the frontend simple.

#### Replace Current User Profile Image

```txt
PUT /api/settings/profile-image
```

Request:

```txt
multipart/form-data
field name: image
```

Behavior:

- Uploads the new image.
- Deletes the old Cloudinary asset if `avatarPublicId` exists.
- Updates the current user avatar fields.

#### Remove Current User Profile Image

```txt
DELETE /api/settings/profile-image
```

Behavior:

- Deletes the existing Cloudinary asset if `avatarPublicId` exists.
- Clears user avatar fields:
  - `avatarUrl: null`
  - `avatarPublicId: null`
  - `avatarResourceType: null`

#### View Any User Profile Image

```txt
GET /api/settings/users/:userId/profile-image
```

Behavior:

- Allows authenticated users to fetch profile image metadata for another user.
- Used by the platform to show avatars in member lists, comments, assignments, notifications, and other shared views.
- Returns `404` if the user does not exist.
- Returns `avatarUrl: null` if the user exists but has no image.

## Authorization Rules

### Manage Own Profile Image

Allowed roles:

```txt
admin
staff
```

For:

```txt
POST /api/settings/profile-image
PUT /api/settings/profile-image
DELETE /api/settings/profile-image
```

### View Profile Images

Allowed:

```txt
any authenticated user
```

For:

```txt
GET /api/settings/profile-image
GET /api/settings/users/:userId/profile-image
```

## Implementation Steps

### 1. Create Settings Route

Create:

```txt
functions/routes/settings.js
```

Responsibilities:

- Configure `multer` memory upload for one `image` field.
- Use `uploadProfilePicture`.
- Use `deleteCloudinaryAsset`.
- Read current user id from:

```js
req.user?.userId || req.db_user?.userId
```

- Return normalized JSON response matching existing backend response style.

### 2. Mount Settings Route

Update `server.js`:

- Import `settingsRoutes`.
- Add a settings router.
- Mount it behind auth middleware:

```js
app.use('/api/settings', middlewares.authMiddleware, settingsApi);
```

### 3. Add DB Helpers

Update `functions/db/index.js` with helpers:

```js
async function getUserProfileImage(userId)
async function updateUserProfileImage(userId, avatarData)
async function clearUserProfileImage(userId)
```

Return only safe fields:

```js
{
  userId,
  firstName,
  lastName,
  fullName,
  role,
  avatarUrl,
  avatarPublicId,
  avatarResourceType
}
```

### 4. Add Settings Model Contract

Create if useful:

```txt
functions/models/settings.js
```

Potential schemas:

```js
profileImageResponseSchema
```

This is optional because upload validation already lives in `cloudinary.js`, but a response contract can help keep docs and responses consistent.

### 5. Update Notification Schema

Update `functions/models/notification.js` to include lifecycle fields:

```js
status: z.enum(["active", "archived"]).default("active")
readAt: z.number().int().nonnegative().nullable().default(null)
archivedAt: z.number().int().nonnegative().nullable().default(null)
expiresAt: z.number().int().nonnegative().nullable().default(null)
```

Keep `isRead` for backward compatibility.

### 6. Update Notification DB Indexes

Update `initializeDB()` in `functions/db/index.js`:

```js
await notifications.createIndex({ recipientId: 1, status: 1, createdAt: -1 });
await notifications.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

The TTL index automatically removes archived notifications when `expiresAt` is reached.

### 7. Update Notification Creation

When creating notifications, default lifecycle fields:

```js
status: "active"
isRead: false
readAt: null
archivedAt: null
expiresAt: null
```

### 8. Update Notification Listing

Update `getNotificationsByRecipient` to support:

```txt
status=active|archived|all
unreadOnly=true|false
page=1
limit=20
```

Default should be active notifications only:

```js
status: "active"
```

This ensures navbar notification queries do not show read/archived items.

Response shape should include:

```json
{
  "notifications": [],
  "pagination": {
    "total": 0,
    "page": 1,
    "limit": 20,
    "totalPages": 0
  },
  "unreadCount": 0
}
```

### 9. Archive Read Notifications

Update `markNotificationAsRead(notificationId, recipientId)`:

```js
const now = Date.now();
const expiresAt = now + 30 * 24 * 60 * 60 * 1000;

$set: {
  isRead: true,
  status: "archived",
  readAt: now,
  archivedAt: now,
  expiresAt,
  updatedAt: now
}
```

Update `markAllNotificationsAsRead(recipientId)` the same way for all active unread notifications.

### 10. Optional Archived Notification Endpoint

Add if the UI needs a trash/archive view:

```txt
GET /api/notifications/archive?page=1&limit=20
```

Internally this can call the same service with:

```js
status: "archived"
```

### 11. Swagger/OpenAPI Updates

Add docs for:

```txt
GET    /api/settings/profile-image
POST   /api/settings/profile-image
PUT    /api/settings/profile-image
DELETE /api/settings/profile-image
GET    /api/settings/users/:userId/profile-image
```

Update notification docs for:

```txt
GET /api/notifications
PUT /api/notifications/:id/read
PUT /api/notifications/read-all
```

Document query parameters:

```txt
page
limit
status
unreadOnly
```

## File Checklist

Expected files to create or update:

```txt
server.js
functions/routes/settings.js
functions/routes/notifications.js
functions/db/index.js
functions/models/notification.js
functions/models/settings.js
```

`functions/models/settings.js` is optional unless response contracts are needed.

## Verification Plan

### Build

Run:

```txt
npm run build
```

### Manual API Checks

Profile image:

```txt
GET    /api/settings/profile-image
POST   /api/settings/profile-image
PUT    /api/settings/profile-image
DELETE /api/settings/profile-image
GET    /api/settings/users/:userId/profile-image
```

Notification pagination:

```txt
GET /api/notifications?page=1&limit=10
GET /api/notifications?page=2&limit=10
```

Notification lifecycle:

```txt
PUT /api/notifications/:id/read
GET /api/notifications
GET /api/notifications?status=archived
PUT /api/notifications/read-all
```

Expected behavior:

- Active navbar list excludes archived notifications.
- `unreadCount` decreases after read/archive.
- Archived notifications have `archivedAt` and `expiresAt`.
- MongoDB TTL index is present on `expiresAt`.

## Risks and Decisions

- `POST /profile-image` can either reject when an image already exists or behave as an upsert. Recommended behavior is upsert because it simplifies frontend usage.
- TTL deletion in MongoDB is not instant. MongoDB removes expired documents in the background, usually within a short delay.
- Local upload fallback may produce `publicId: null`; delete logic must safely skip provider deletion when no public id exists.
- Existing clients may rely on `isRead`; keep it alongside the new `status` field for compatibility.

## Recommended Build Order

1. Add notification lifecycle fields and DB TTL index.
2. Update notification read/list behavior.
3. Add settings profile image DB helpers.
4. Add settings route and mount it.
5. Add Swagger docs.
6. Run build and manual API checks.
