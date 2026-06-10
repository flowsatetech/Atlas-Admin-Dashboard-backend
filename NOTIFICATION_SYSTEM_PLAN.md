# Notification System Architecture Plan

This document outlines the architecture and design plan for the backend Notification System. It covers the database model, service layer, REST API endpoints, and integration points with existing modules based on identified scenarios (Task Assignment, Project Assignment, Client Assignment, Lead Assignment, Comment Mentions, Role/Permission Changes).

## 1. Database Model (`functions/models/notification.js`)

The Notification model will store all notifications sent to users. It is designed to be flexible enough to handle various types of notifications and link back to relevant resources.

**Mongoose Schema Definition:**

```javascript
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Indexed for fast querying of a user's notifications
  },
  type: {
    type: String,
    enum: [
      'TASK_ASSIGNMENT',
      'PROJECT_ASSIGNMENT',
      'CLIENT_ASSIGNMENT',
      'LEAD_ASSIGNMENT',
      'COMMENT_MENTION',
      'ROLE_CHANGE',
      'SYSTEM_ALERT'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  link: {
    type: String,
    // Optional: Frontend route to navigate to when the notification is clicked
    // e.g., '/projects/123/tasks/456'
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    // Optional: ID of the associated document (e.g., Task ID, Project ID)
  },
  referenceType: {
    type: String,
    // Optional: Model name of the associated document (e.g., 'Task', 'Project')
  },
  isRead: {
    type: Boolean,
    default: false,
    index: true // Indexed to easily fetch unread notifications
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
    // Optional: The user who triggered this notification (e.g., the assigner)
  }
}, {
  timestamps: true // Automatically manages createdAt and updatedAt
});

// Compound index to optimize querying a specific user's notifications sorted by creation date
NotificationSchema.index({ recipientId: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
```

## 2. Notification Service (`functions/services/notification.js`)

The Service layer encapsulates the business logic for managing notifications. This service will be used by the API endpoints and other services/routes (Integration Points).

**Methods:**

*   `createNotification(data)`:
    *   **Description**: Validates input data and creates a new notification record in the database.
    *   **Logic**: Can potentially be extended later to emit real-time events via Socket.IO or push notifications.
    *   **Parameters**: `{ recipientId, type, title, message, link, referenceId, referenceType, createdBy }`
    *   **Returns**: The created Notification document.

*   `getUserNotifications(userId, options)`:
    *   **Description**: Fetches notifications for a specific user with pagination and filtering.
    *   **Parameters**: `userId` (ObjectId), `options` (Object: `{ page, limit, unreadOnly }`)
    *   **Returns**: Object containing `{ notifications, totalCount, unreadCount }`.

*   `markAsRead(notificationId, userId)`:
    *   **Description**: Marks a specific notification as read. Verifies that the `notificationId` belongs to the `userId` to prevent unauthorized updates.
    *   **Parameters**: `notificationId` (ObjectId), `userId` (ObjectId)
    *   **Returns**: The updated Notification document.

*   `markAllAsRead(userId)`:
    *   **Description**: Updates all `isRead: false` notifications for a given user to `isRead: true`.
    *   **Parameters**: `userId` (ObjectId)
    *   **Returns**: The number of updated documents.

*   `deleteNotification(notificationId, userId)` (Optional):
    *   **Description**: Deletes a specific notification (verifying ownership). Can be implemented if users are allowed to clear their notification history.

## 3. API Endpoints (`functions/routes/notifications.js`)

These endpoints will be exposed to the frontend dashboard so users can view and interact with their notifications. Ensure these routes are protected by the `auth` middleware.

*   `GET /api/notifications`
    *   **Description**: Retrieve the authenticated user's notifications.
    *   **Query Parameters**:
        *   `page` (default: 1)
        *   `limit` (default: 20)
        *   `unreadOnly` (boolean, default: false)
    *   **Response**: `200 OK` with pagination metadata and an array of notification objects.

*   `PUT /api/notifications/:id/read`
    *   **Description**: Mark a single notification as read.
    *   **URL Parameters**: `id` (Notification ID)
    *   **Response**: `200 OK` with the updated notification object.

*   `PUT /api/notifications/read-all`
    *   **Description**: Mark all of the authenticated user's notifications as read.
    *   **Response**: `200 OK` with a success message.

## 4. Integration Points

To generate notifications, the `NotificationService.createNotification()` method needs to be injected into existing workflow routes or services.

*   **Task Assignment (`functions/routes/tasks.js` or `functions/services/task.js`)**
    *   **Trigger**: When a task is created with an assignee, or an existing task's `assigneeId` is updated.
    *   **Action**: Create a `TASK_ASSIGNMENT` notification for the new assignee.

*   **Project Assignment (`functions/routes/projects.js` or `functions/services/project.js`)**
    *   **Trigger**: When users are added to a project's `members` array.
    *   **Action**: Create a `PROJECT_ASSIGNMENT` notification for each new member.

*   **Client & Lead Assignment (`functions/routes/clients.js`, `functions/routes/leads.js`)**
    *   **Trigger**: When a client or lead is assigned to a specific account manager or sales rep.
    *   **Action**: Create a `CLIENT_ASSIGNMENT` or `LEAD_ASSIGNMENT` notification.

*   **Comment Mentions (e.g., `functions/routes/comments.js` or inline in tasks/projects)**
    *   **Trigger**: When a new comment is posted containing `@username` mentions. The system must parse the comment text to extract usernames.
    *   **Action**: Look up the User IDs for the mentioned usernames and create a `COMMENT_MENTION` notification for each.

*   **Role/Permission Changes (`functions/routes/members.js` or `functions/routes/user.js`)**
    *   **Trigger**: When an admin changes a user's role (e.g., from 'Viewer' to 'Editor').
    *   **Action**: Create a `ROLE_CHANGE` notification for the affected user to inform them of their new access level.

## Next Steps for Implementation
1.  Create the Mongoose model file.
2.  Implement the NotificationService class.
3.  Implement the router and controller logic for the API endpoints.
4.  Mount the new router in `server.js` (or index router).
5.  Systematically update existing routes/services to trigger notifications at the integration points.
6.  Write unit and integration tests for the notification flow.