function normalizeServerUrl(value) {
    const fallback = `http://localhost:${process.env.PORT || 3000}`;
    const rawValue = String(value || fallback).trim();

    if (/^https?:\/\//i.test(rawValue) || rawValue.startsWith("/")) {
        return rawValue;
    }

    return `http://${rawValue}`;
}

const serverUrl = normalizeServerUrl(process.env.SERVER_BASE_URL);

const enumValues = Object.freeze({
    clientStatuses: ["Lead", "Active", "Inactive", "Archived"],
    projectStatuses: ["Planned", "InProgress", "OnHold", "Completed", "Cancelled"],
    projectPriorities: ["Low", "Medium", "High", "Urgent"],
    taskStatuses: ["Todo", "InProgress", "Review", "Done", "Blocked"],
    taskPriorities: ["low", "medium", "high"],
    blogStatuses: ["draft", "published", "scheduled"],
    blogCategories: ["Marketing", "SEO", "Branding", "Social Media", "Content Marketing", "Email Marketing", "Other"],
    leadStatuses: ["new", "contacted", "qualified", "lost"],
    paymentStatuses: ["Paid", "Pending", "Failed", "Cancelled"],
    dashboardPeriods: ["3months", "6months", "12months"],
    analyticsRanges: ["7d", "30d", "3months", "6months", "12months"],
    trendDirections: ["up", "down", "flat"],
    memberRoles: ["admin", "manager", "staff"],
    memberEditableRoles: ["admin", "staff"],
    userRoles: ["admin", "manager", "staff", "viewer"],
    campaignSortFields: ["createdAt", "campaignName", "impressions", "clicks", "conversions", "conversionRate"],
    sortOrders: ["asc", "desc"],
    projectStatusLabels: ["Finishing", "On Track", "At Risk"],
    notificationTypes: [
        "TASK_ASSIGNMENT",
        "PROJECT_ASSIGNMENT",
        "CLIENT_ASSIGNMENT",
        "LEAD_ASSIGNMENT",
        "COMMENT_MENTION",
        "ROLE_CHANGE",
        "SYSTEM_ALERT",
        "CLIENT_CREATED",
        "PROJECT_STATUS_CHANGE",
        "LEAD_STATUS_CHANGE",
        "PROJECT_COMMENT",
        "PASSWORD_UPDATED"
    ]
});

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const parameterRef = (name) => ({ $ref: `#/components/parameters/${name}` });
const responseRef = (name) => ({ $ref: `#/components/responses/${name}` });

const jsonContent = (schema, example, examples) => {
    const content = { schema };
    if (example !== undefined) content.example = example;
    if (examples !== undefined) content.examples = examples;
    return { "application/json": content };
};

const jsonRequestBody = (schemaName, example, description, required = true) => ({
    required,
    description,
    content: jsonContent(ref(schemaName), example)
});

const successEnvelopeSchema = (dataSchema) => ({
    allOf: [
        ref("ApiSuccessEnvelope"),
        {
            type: "object",
            properties: {
                data: dataSchema
            }
        }
    ]
});

const successResponse = (description, dataSchema, dataExample, message = "Request successful", code = 200) => ({
    description,
    content: jsonContent(successEnvelopeSchema(dataSchema), {
        status: "success",
        code,
        data: dataExample,
        message
    })
});

const emptySuccessResponse = (description, message = "Request successful", code = 200) => successResponse(
    description,
    { type: "object", nullable: true, additionalProperties: true },
    null,
    message,
    code
);

const noContentResponse = (description) => ({ description });

const textResponse = (description, example) => ({
    description,
    content: {
        "text/plain": {
            schema: { type: "string" },
            example
        }
    }
});

const htmlResponse = (description, example = "<html><body>Rendered content</body></html>") => ({
    description,
    content: {
        "text/html": {
            schema: { type: "string" },
            example
        }
    }
});

const redirectResponse = (description) => ({
    description,
    headers: {
        Location: {
            description: "Provider-hosted URL that the client is redirected to.",
            schema: { type: "string", format: "uri" }
        }
    }
});

const errorResponse = (description, code, message, details) => ({
    description,
    content: jsonContent(ref("ApiErrorEnvelope"), {
        status: "error",
        code,
        data: null,
        message,
        ...(details ? { details } : {})
    })
});

const queryParam = (name, schema, description, example) => ({
    name,
    in: "query",
    required: false,
    description,
    schema,
    ...(example !== undefined ? { example } : {})
});

const pathParam = (name, description, example) => ({
    name,
    in: "path",
    required: true,
    description,
    schema: { type: "string", minLength: 1 },
    ...(example !== undefined ? { example } : {})
});

const examples = {
    userId: "2854abb8528fe1806d4a75d4f81035ef",
    adminUserId: "6d62ab4046f47a11a8e70b92a57a889c",
    clientId: "client_atlas_001",
    projectId: "project_brand_refresh_001",
    taskId: "task_launch_plan_001",
    paymentId: "payment_april_milestone_001",
    postId: "post_digital_strategy_001",
    slug: "getting-started-with-digital-marketing",
    leadId: "lead_quote_request_001",
    notificationId: "notification_001",
    imageId: "8dce7fb2a3e34ad6b0a51d8f6e0c771c",
    fileId: "media_file_001",
    timestamp: 1775779200000,
    createdAt: 1775600000000,
    updatedAt: 1775686400000,
    userProfile: {
        userId: "2854abb8528fe1806d4a75d4f81035ef",
        firstName: "Ada",
        lastName: "Okafor",
        email: "ada.okafor@atlas.example",
        role: "admin",
        avatarUrl: "https://res.cloudinary.com/atlas/image/upload/v1775600000/atlas-africa/profile-pictures/avatar.webp"
    },
    member: {
        userId: "2854abb8528fe1806d4a75d4f81035ef",
        firstName: "Ada",
        lastName: "Okafor",
        fullName: "Ada Okafor",
        email: "ada.okafor@atlas.example",
        phone: "+2348012345678",
        role: "admin",
        job: "Operations Lead",
        status: "active",
        avatarUrl: null,
        lastLogin: 1775600000000,
        createdAt: 1775600000000,
        updatedAt: 1775686400000
    },
    notification: {
        id: "notification_001",
        recipientId: "2854abb8528fe1806d4a75d4f81035ef",
        type: "TASK_ASSIGNMENT",
        title: "New task assigned",
        message: "Prepare launch checklist was assigned to you.",
        link: "/api/tasks/task_launch_plan_001",
        referenceId: "task_launch_plan_001",
        referenceType: "task",
        isRead: false,
        createdBy: "6d62ab4046f47a11a8e70b92a57a889c",
        createdAt: 1775600000000,
        updatedAt: 1775686400000
    },
    clientSummary: {
        id: "client_atlas_001",
        fullName: "Jane Doe",
        company: "Acme Corporation",
        companyName: "Acme Corporation",
        email: "jane.doe@acme.example",
        phone: "+2348012345678",
        status: "Active",
        tags: ["enterprise", "fintech"],
        manager: "Ada Okafor",
        assignedStaffId: "2854abb8528fe1806d4a75d4f81035ef",
        leadSource: "Referral",
        notes: "Met at Lagos Tech Summit.",
        projectsCount: 3,
        createdAt: 1775600000000,
        updatedAt: 1775686400000
    },
    clientDetail: {
        id: "client_atlas_001",
        fullName: "Jane Doe",
        companyName: "Acme Corporation",
        email: "jane.doe@acme.example",
        phone: "+2348012345678",
        status: "Active",
        tags: ["enterprise", "fintech"],
        manager: "Ada Okafor",
        assignedStaffId: "2854abb8528fe1806d4a75d4f81035ef",
        leadSource: "Referral",
        notes: "Met at Lagos Tech Summit.",
        projectsCount: 3,
        createdAt: 1775600000000,
        updatedAt: 1775686400000
    },
    comment: {
        id: "comment_001",
        projectId: "project_brand_refresh_001",
        authorId: "2854abb8528fe1806d4a75d4f81035ef",
        content: "Client approved the revised brand direction.",
        createdAt: 1775600000000,
        updatedAt: 1775600000000
    },
    project: {
        id: "project_brand_refresh_001",
        name: "Website Redesign",
        clientId: "client_atlas_001",
        client: {
            id: "client_atlas_001",
            fullName: "Jane Doe",
            companyName: "Acme Corporation",
            email: "jane.doe@acme.example",
            phone: "+2348012345678",
            status: "Active",
            tags: ["enterprise", "fintech"],
            assignedStaffId: "2854abb8528fe1806d4a75d4f81035ef",
            leadSource: "Referral",
            notes: "Met at Lagos Tech Summit.",
            projectsCount: 3,
            createdAt: 1775600000000,
            updatedAt: 1775686400000
        },
        description: "Refresh the public website, messaging, and conversion pages.",
        deadline: 1775779200000,
        budget: 45000,
        priority: "High",
        status: "InProgress",
        teamIds: ["2854abb8528fe1806d4a75d4f81035ef"],
        files: ["https://res.cloudinary.com/demo/project-brief.pdf"],
        totalTasks: 12,
        completedTasks: 7,
        progress: 58,
        createdAt: 1775600000000,
        updatedAt: 1775686400000
    },
    task: {
        id: "task_launch_plan_001",
        title: "Prepare launch checklist",
        description: "Confirm copy, analytics, redirects, and deployment plan.",
        status: "InProgress",
        assigneeId: "2854abb8528fe1806d4a75d4f81035ef",
        assigneeName: "Ada Okafor",
        assignee: {
            userId: "2854abb8528fe1806d4a75d4f81035ef",
            firstName: "Ada",
            lastName: "Okafor",
            fullName: "Ada Okafor",
            email: "ada.okafor@atlas.example"
        },
        dueDate: 1775779200000,
        projectId: "project_brand_refresh_001",
        priority: "high",
        isOverdue: false,
        createdAt: 1775600000000,
        updatedAt: 1775686400000
    },
    blogPost: {
        id: "post_digital_strategy_001",
        title: "Getting Started with Digital Marketing",
        slug: "getting-started-with-digital-marketing",
        excerpt: "A practical guide to building your digital marketing strategy from the ground up.",
        content: "## Introduction\nDigital marketing works best when goals, channels, and measurement are aligned.",
        category: "Marketing",
        authorId: "2854abb8528fe1806d4a75d4f81035ef",
        tags: ["marketing", "digital", "strategy"],
        status: "published",
        isFeatured: true,
        views: 1240,
        publishedAt: 1775600000000,
        scheduledAt: null,
        createdAt: 1775520000000,
        updatedAt: 1775686400000
    },
    lead: {
        id: "lead_quote_request_001",
        firstName: "Kemi",
        lastName: "Adebayo",
        fullName: "Kemi Adebayo",
        email: "kemi@brightfoods.example",
        phone: "+2348098765432",
        company: "Bright Foods Ltd",
        status: "qualified",
        stage: "Discovery Call",
        contactPerson: "Kemi Adebayo",
        value: 25000,
        source: "Website",
        notes: "Interested in a full funnel marketing package.",
        assignedTo: "2854abb8528fe1806d4a75d4f81035ef",
        createdAt: 1775600000000,
        updatedAt: 1775686400000
    },
    payment: {
        id: "payment_april_milestone_001",
        clientId: "client_atlas_001",
        projectId: "project_brand_refresh_001",
        amount: 15000,
        status: "Paid",
        date: 1775779200000,
        source: "Website",
        notes: "April milestone payment",
        createdAt: 1775600000000,
        updatedAt: 1775686400000
    },
    mediaImage: {
        id: "8dce7fb2a3e34ad6b0a51d8f6e0c771c",
        url: "https://res.cloudinary.com/atlas/image/upload/v1775600000/dashboard/hero.png"
    },
    mediaFile: {
        id: "media_file_001",
        fileName: "company-presentation.pdf",
        type: "document",
        mimeType: "application/pdf",
        sizeBytes: 1024000,
        storageProvider: "cloudinary",
        publicId: "atlas-africa/files/company-presentation",
        resourceType: "raw",
        url: "https://res.cloudinary.com/atlas/raw/upload/v1775600000/atlas-africa/files/company-presentation.pdf",
        uploadedBy: "2854abb8528fe1806d4a75d4f81035ef",
        createdAt: 1775600000000,
        updatedAt: 1775686400000
    }
};

const swaggerSpec = {
    openapi: "3.0.3",
    info: {
        title: "Atlas Admin Dashboard Backend API",
        version: "1.0.0",
        description: `Comprehensive OpenAPI documentation for the Atlas Admin Dashboard backend.

This file is intentionally route-focused: every documented path maps to a mounted route in this repository.

## How to use these docs
1. Start with **Auth > Login user** and send an email/password payload.
2. The server sets an HttpOnly \`auth_token\` cookie. Swagger UI can reuse it when the browser accepts the cookie for this API host.
3. Protected routes declare the **cookieAuth** security requirement. Admin-only routes additionally require a user whose role is \`admin\`.
4. Webhook routes use a separate bearer token from \`WEBHOOK_BEARER_TOKEN\` and declare **webhookBearer**.

## Response envelope
Most JSON responses under \`/api\` are normalized by the Express middleware into:
\`{ status, code, data, message }\`.

A few endpoints intentionally return non-JSON responses and are documented as such:
- \`GET /api/media/images/{imageId}\` redirects to the provider URL.
- \`GET /embed/{slug}\` returns HTML.
- Some write operations return \`204 No Content\`.

## Timestamps and dates
Most persisted dates are Unix timestamps in milliseconds. Payment date input is more flexible and accepts either a Unix millisecond timestamp, a numeric string, or a parseable date string such as \`2026-04-10\`.

## Swagger UI payload helpers
Enum fields are documented with OpenAPI \`enum\` values so Swagger UI renders dropdowns where possible. Request schemas include examples and defaults to make payload construction easier.`,
        contact: {
            name: "Atlas Backend Team"
        }
    },
    servers: [
        {
            url: "/",
            description: "Same origin"
        },
        {
            url: serverUrl,
            description: "Configured server URL"
        },
    ],
    tags: [
        { name: "Auth", description: "Cookie-based authentication and session lifecycle." },
        { name: "User", description: "Current authenticated user profile." },
        { name: "Dashboard", description: "Admin dashboard KPI cards, charts, in-progress projects, and activity feed." },
        { name: "Analytics", description: "Website analytics summaries, traffic charts, sources, campaigns, and distribution widgets." },
        { name: "Revenue", description: "Revenue time series and revenue dashboard aggregations." },
        { name: "Payments", description: "Payment records for clients and projects." },
        { name: "Clients", description: "Client CRM records, status cards, details, and admin mutations." },
        { name: "Projects", description: "Projects, derived progress, comments, and project status management." },
        { name: "Tasks", description: "Task assignment, filtering, task details, and task lifecycle operations." },
        { name: "Members", description: "Staff account management. These routes are admin-only." },
        { name: "Media", description: "Image uploads/replacement and general file metadata." },
        { name: "Blog", description: "Authenticated blog administration, public embed rendering, and view tracking." },
        { name: "Leads", description: "Lead pipeline records used by the admin dashboard." },
        { name: "Notifications", description: "User notification inbox and read-state updates." },
        { name: "Webhooks", description: "Bearer-token protected public lead ingestion endpoints." },
        { name: "Health", description: "Service health and maintenance endpoints." },
        { name: "Docs", description: "Swagger UI and raw OpenAPI specification endpoints." }
    ],
    components: {
        securitySchemes: {
            cookieAuth: {
                type: "apiKey",
                in: "cookie",
                name: "auth_token",
                description: "HttpOnly JWT cookie set by POST /api/auth/login. The JWT includes a server-side stamp so sessions can be revoked by clearing the user's stored stamp."
            },
            webhookBearer: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "WEBHOOK_BEARER_TOKEN",
                description: "Shared bearer token required by /api/webhooks/* routes. Send Authorization: Bearer <WEBHOOK_BEARER_TOKEN>."
            }
        },
        parameters: {
            Page: queryParam("page", { type: "integer", minimum: 1, default: 1 }, "1-based page number for paginated endpoints.", 1),
            Limit10: queryParam("limit", { type: "integer", minimum: 1, maximum: 100, default: 10 }, "Maximum number of records to return.", 10),
            Limit8: queryParam("limit", { type: "integer", minimum: 1, maximum: 100, default: 8 }, "Maximum number of payment records to return.", 8),
            Limit20: queryParam("limit", { type: "integer", minimum: 1, maximum: 100, default: 20 }, "Maximum number of task records to return.", 20),
            ActivityLimit: queryParam("limit", { type: "integer", minimum: 1, maximum: 50, default: 10 }, "Maximum number of activity rows to return.", 10),
            InProgressLimit: queryParam("limit", { type: "integer", minimum: 1, maximum: 20, default: 4 }, "Maximum number of in-progress projects to return.", 4),
            NotificationUnreadOnly: queryParam("unreadOnly", { type: "boolean", default: false }, "Return unread notifications only.", false),
            Search: queryParam("search", { type: "string" }, "Case-insensitive search text where supported by the endpoint.", "acme"),
            ClientStatus: queryParam("status", { type: "string", enum: enumValues.clientStatuses }, "Filter clients by lifecycle status.", "Active"),
            ProjectStatus: queryParam("status", { type: "string", enum: enumValues.projectStatuses }, "Filter projects by project status.", "InProgress"),
            TaskStatus: queryParam("status", { type: "string", enum: enumValues.taskStatuses }, "Filter tasks by workflow status.", "InProgress"),
            BlogStatus: queryParam("status", { type: "string", enum: enumValues.blogStatuses }, "Filter blog posts by publishing status.", "published"),
            BlogCategory: queryParam("category", { type: "string", enum: enumValues.blogCategories }, "Filter blog posts by category.", "Marketing"),
            LeadStatus: queryParam("status", { type: "string", enum: enumValues.leadStatuses }, "Filter leads by pipeline status.", "qualified"),
            PaymentStatus: queryParam("status", { type: "string", enum: enumValues.paymentStatuses }, "Filter payments by payment status.", "Paid"),
            FromDate: queryParam("from", { type: "string" }, "Inclusive payment date filter. Use YYYY-MM-DD, ISO date, or a Unix millisecond timestamp string.", "2026-04-01"),
            ToDate: queryParam("to", { type: "string" }, "Inclusive payment date filter. The backend expands date-only values to the end of the UTC day.", "2026-04-30"),
            DashboardPeriod: queryParam("period", { type: "string", enum: enumValues.dashboardPeriods, default: "6months" }, "Time period bucket selection. Swagger UI renders this as a dropdown.", "6months"),
            AnalyticsRange7d: queryParam("range", { type: "string", enum: enumValues.analyticsRanges, default: "7d" }, "Analytics range. Swagger UI renders this as a dropdown.", "30d"),
            AnalyticsRange30d: queryParam("range", { type: "string", enum: enumValues.analyticsRanges, default: "30d" }, "Analytics range. Swagger UI renders this as a dropdown.", "30d"),
            CampaignSortBy: queryParam("sortBy", { type: "string", enum: enumValues.campaignSortFields, default: "createdAt" }, "Campaign table sort field.", "createdAt"),
            SortOrder: queryParam("order", { type: "string", enum: enumValues.sortOrders, default: "desc" }, "Sort direction.", "desc"),
            AssigneeId: queryParam("assigneeId", { type: "string" }, "Filter tasks assigned to a userId.", examples.userId),
            AssignedTo: queryParam("assignedTo", { type: "string" }, "Legacy alias for assigneeId supported by the backend.", examples.userId),
            ProjectIdQuery: queryParam("projectId", { type: "string" }, "Filter tasks by project ID.", examples.projectId),
            ClientIdPath: pathParam("id", "Client custom ID token.", examples.clientId),
            ProjectIdPath: pathParam("projectId", "Project custom ID token.", examples.projectId),
            TaskIdPath: pathParam("taskId", "Task custom ID token.", examples.taskId),
            NotificationIdPath: pathParam("id", "Notification custom ID token.", examples.notificationId),
            PaymentIdPath: pathParam("paymentId", "Payment custom ID token.", examples.paymentId),
            PostIdPath: pathParam("postId", "Blog post custom ID token.", examples.postId),
            BlogSlugPath: pathParam("slug", "URL-safe blog slug. The embed route only accepts lowercase letters, numbers, and hyphens.", examples.slug),
            LeadIdPath: pathParam("leadId", "Lead custom ID token.", examples.leadId),
            MemberIdPath: pathParam("id", "Staff userId. Used for update, password change, and delete operations.", examples.userId),
            ImageIdPath: pathParam("imageId", "Media image ID token.", examples.imageId),
            FileIdPath: pathParam("fileId", "Media file ID token.", examples.fileId),
            MediaFileType: queryParam("type", { type: "string", enum: ["image", "document", "video", "other"] }, "Optional media file type filter.", "document"),
            MediaFileLimit: queryParam("limit", { type: "integer", minimum: 1, maximum: 100, default: 100 }, "Maximum number of media file records to return.", 100)
        },
        schemas: {
            Timestamp: {
                type: "integer",
                format: "int64",
                minimum: 0,
                description: "Unix timestamp in milliseconds.",
                example: examples.timestamp
            },
            ApiSuccessEnvelope: {
                type: "object",
                required: ["status", "code", "data", "message"],
                properties: {
                    status: { type: "string", enum: ["success"], example: "success" },
                    code: { type: "integer", example: 200 },
                    data: {
                        description: "Endpoint-specific payload. Null when an operation has no response body data.",
                        nullable: true,
                        oneOf: [
                            { type: "object", additionalProperties: true },
                            { type: "array", items: { type: "object", additionalProperties: true } },
                            { type: "string" },
                            { type: "number" },
                            { type: "boolean" }
                        ]
                    },
                    message: { type: "string", example: "Request successful" }
                }
            },
            ApiErrorEnvelope: {
                type: "object",
                required: ["status", "code", "data", "message"],
                properties: {
                    status: { type: "string", enum: ["error"], example: "error" },
                    code: { type: "integer", minimum: 400, example: 400 },
                    data: { type: "object", nullable: true, additionalProperties: true, example: null },
                    message: { type: "string", example: "Invalid request parameters" },
                    details: {
                        type: "array",
                        nullable: true,
                        description: "Validation details are included in non-production environments when supplied by the route.",
                        items: { type: "string" },
                        example: ["email: Invalid email address"]
                    },
                    error: {
                        type: "object",
                        nullable: true,
                        description: "Server error object can be included outside production.",
                        additionalProperties: true
                    }
                }
            },
            Pagination: {
                type: "object",
                required: ["page", "limit", "total", "totalPages"],
                properties: {
                    page: { type: "integer", minimum: 1, example: 1 },
                    limit: { type: "integer", minimum: 1, example: 10 },
                    total: { type: "integer", minimum: 0, example: 42 },
                    totalPages: { type: "integer", minimum: 0, example: 5 }
                }
            },
            TrendMetric: {
                type: "object",
                required: ["value", "changePct", "direction"],
                properties: {
                    value: { type: "number", example: 2550 },
                    changePct: { type: "number", example: 12.5 },
                    direction: { type: "string", enum: enumValues.trendDirections, example: "up" },
                    compareLabel: { type: "string", example: "Vs last month" }
                }
            },
            UserProfile: {
                type: "object",
                required: ["userId", "firstName", "lastName", "email", "role"],
                properties: {
                    userId: { type: "string", example: examples.userId },
                    firstName: { type: "string", example: "Ada" },
                    lastName: { type: "string", example: "Okafor" },
                    email: { type: "string", format: "email", example: "ada.okafor@atlas.example" },
                    role: { type: "string", enum: enumValues.userRoles, example: "admin" },
                    avatarUrl: { type: "string", format: "uri", nullable: true, example: examples.userProfile.avatarUrl }
                },
                example: examples.userProfile
            },
            LoginRequest: {
                type: "object",
                required: ["email", "password"],
                properties: {
                    email: { type: "string", format: "email", example: "admin@atlas.example" },
                    password: { type: "string", minLength: 8, format: "password", example: "StrongPass123" },
                    rememberMe: { type: "boolean", default: false, description: "If true, the JWT cookie lasts 30 days. Otherwise it lasts one hour.", example: true }
                }
            },
            TestResetPasswordRequest: {
                type: "object",
                required: ["email", "password", "resetCode"],
                description: "Development/test-only password reset helper. Disabled when NODE_ENV=production.",
                properties: {
                    email: { type: "string", format: "email", example: "admin@atlas.example" },
                    password: { type: "string", minLength: 8, format: "password", example: "NewStrongPass123" },
                    resetCode: { type: "string", format: "password", description: "Must match TEST_PASSWORD_RESET_SECRET.", example: "change-this-test-reset-code" }
                }
            },
            Member: {
                type: "object",
                properties: {
                    userId: { type: "string", example: examples.userId },
                    firstName: { type: "string", example: "Ada" },
                    lastName: { type: "string", example: "Okafor" },
                    fullName: { type: "string", example: "Ada Okafor" },
                    email: { type: "string", format: "email", example: "ada.okafor@atlas.example" },
                    phone: { type: "string", nullable: true, example: "+2348012345678" },
                    role: { type: "string", enum: enumValues.memberRoles, example: "admin" },
                    job: { type: "string", nullable: true, example: "Operations Lead" },
                    status: { type: "string", nullable: true, example: "active" },
                    avatarUrl: { type: "string", format: "uri", nullable: true, example: null },
                    lastLogin: { allOf: [ref("Timestamp")], nullable: true },
                    createdAt: ref("Timestamp"),
                    updatedAt: ref("Timestamp")
                },
                example: examples.member
            },
            CreateMemberRequest: {
                type: "object",
                required: ["firstName", "lastName", "email", "phone", "password", "role"],
                properties: {
                    firstName: { type: "string", minLength: 1, example: "Ada" },
                    lastName: { type: "string", minLength: 1, example: "Okafor" },
                    email: { type: "string", format: "email", example: "ada.okafor@atlas.example" },
                    phone: { type: "string", minLength: 3, example: "+2348012345678" },
                    password: { type: "string", minLength: 8, format: "password", example: "StrongPass123" },
                    role: { type: "string", enum: enumValues.memberEditableRoles, default: "staff", example: "staff" },
                    job: { type: "string", example: "Account Manager" },
                    status: { type: "string", enum: ["active", "inactive"], default: "active", example: "active" }
                }
            },
            UpdateMemberRequest: {
                type: "object",
                description: "All fields are optional. Use the role dropdown to grant or remove admin privileges.",
                properties: {
                    firstName: { type: "string", example: "Ada" },
                    lastName: { type: "string", example: "Okafor" },
                    phone: { type: "string", minLength: 3, example: "+2348012345678" },
                    role: { type: "string", enum: enumValues.memberEditableRoles, example: "admin" },
                    job: { type: "string", example: "Operations Lead" },
                    status: { type: "string", enum: ["active", "inactive"], example: "active" }
                }
            },
            AdminChangeMemberPasswordRequest: {
                type: "object",
                required: ["password"],
                description: "Admin-only password reset payload for an existing staff, manager, or admin user. The backend hashes the password and revokes existing sessions by clearing the target user's stored stamp.",
                properties: {
                    password: { type: "string", minLength: 8, format: "password", example: "NewStrongPass123" }
                }
            },
            ClientSummary: {
                type: "object",
                required: ["id", "fullName", "company", "companyName", "email", "phone", "status", "tags", "manager", "assignedStaffId", "projectsCount"],
                description: "Client card/list item. Includes editable fields so edit forms can prefill from list responses without an extra detail request.",
                properties: {
                    id: { type: "string", example: examples.clientId },
                    fullName: { type: "string", example: "Jane Doe" },
                    company: { type: "string", description: "Legacy display alias for companyName.", example: "Acme Corporation" },
                    companyName: { type: "string", example: "Acme Corporation" },
                    email: { type: "string", format: "email", example: "jane.doe@acme.example" },
                    phone: { type: "string", minLength: 3, example: "+2348012345678" },
                    status: { type: "string", enum: enumValues.clientStatuses, example: "Active" },
                    tags: { type: "array", items: { type: "string" }, example: ["enterprise", "fintech"] },
                    manager: { type: "string", example: "Ada Okafor" },
                    assignedStaffId: { type: "string", nullable: true, example: examples.userId },
                    leadSource: { type: "string", nullable: true, example: "Referral" },
                    notes: { type: "string", default: "", example: "Met at Lagos Tech Summit." },
                    projectsCount: { type: "integer", minimum: 0, example: 3 },
                    createdAt: ref("Timestamp"),
                    updatedAt: ref("Timestamp")
                },
                example: examples.clientSummary
            },
            ClientDetail: {
                type: "object",
                required: ["id", "fullName", "companyName", "email", "phone", "status"],
                properties: {
                    id: { type: "string", example: examples.clientId },
                    fullName: { type: "string", example: "Jane Doe" },
                    companyName: { type: "string", example: "Acme Corporation" },
                    email: { type: "string", format: "email", example: "jane.doe@acme.example" },
                    phone: { type: "string", minLength: 3, example: "+2348012345678" },
                    status: { type: "string", enum: enumValues.clientStatuses, default: "Lead", example: "Active" },
                    tags: { type: "array", items: { type: "string" }, default: [], example: ["enterprise", "fintech"] },
                    manager: { type: "string", example: "Ada Okafor" },
                    assignedStaffId: { type: "string", nullable: true, example: examples.userId },
                    leadSource: { type: "string", nullable: true, example: "Referral" },
                    notes: { type: "string", default: "", example: "Met at Lagos Tech Summit." },
                    projectsCount: { type: "integer", minimum: 0, default: 0, example: 3 },
                    createdAt: ref("Timestamp"),
                    updatedAt: ref("Timestamp")
                },
                example: examples.clientDetail
            },
            CreateClientRequest: {
                type: "object",
                required: ["fullName", "companyName", "email", "phone"],
                properties: {
                    fullName: { type: "string", minLength: 1, example: "Jane Doe" },
                    companyName: { type: "string", minLength: 1, example: "Acme Corporation" },
                    email: { type: "string", format: "email", example: "jane.doe@acme.example" },
                    phone: { type: "string", minLength: 3, example: "+2348012345678" },
                    status: { type: "string", enum: enumValues.clientStatuses, default: "Lead", example: "Lead" },
                    tags: { type: "array", items: { type: "string", minLength: 1 }, default: [], example: ["enterprise", "fintech"] },
                    assignedStaffId: { type: "string", nullable: true, description: "Existing staff userId. Leave null to keep the client unassigned.", example: examples.userId },
                    leadSource: { type: "string", nullable: true, example: "Referral" },
                    notes: { type: "string", default: "", example: "Met at Lagos Tech Summit." }
                }
            },
            UpdateClientRequest: {
                type: "object",
                description: "Partial update. All fields are optional.",
                properties: {
                    fullName: { type: "string", minLength: 1, example: "Jane A. Doe" },
                    companyName: { type: "string", minLength: 1, example: "Acme Corporation" },
                    email: { type: "string", format: "email", example: "jane@acme.example" },
                    phone: { type: "string", minLength: 3, example: "+2348012345678" },
                    status: { type: "string", enum: enumValues.clientStatuses, example: "Active" },
                    tags: { type: "array", items: { type: "string", minLength: 1 }, example: ["enterprise", "priority"] },
                    assignedStaffId: { type: "string", nullable: true, description: "Existing staff userId or null to unassign.", example: examples.adminUserId },
                    leadSource: { type: "string", nullable: true, example: "Website" },
                    notes: { type: "string", example: "Updated after discovery call." }
                }
            },
            ClientStats: {
                type: "object",
                properties: {
                    totalClients: { type: "integer", minimum: 0, example: 30 },
                    activeClients: { type: "integer", minimum: 0, example: 21 },
                    inactiveClients: { type: "integer", minimum: 0, example: 2 },
                    leadClients: { type: "integer", minimum: 0, example: 7 }
                }
            },
            ProjectClient: {
                type: "object",
                nullable: true,
                description: "Resolved client details included by project detail/list helpers when available.",
                properties: {
                    id: { type: "string", example: examples.clientId },
                    fullName: { type: "string", example: "Jane Doe" },
                    companyName: { type: "string", example: "Acme Corporation" },
                    email: { type: "string", format: "email", example: "jane.doe@acme.example" },
                    phone: { type: "string", example: "+2348012345678" },
                    status: { type: "string", enum: enumValues.clientStatuses, example: "Active" },
                    tags: { type: "array", items: { type: "string" }, example: ["enterprise"] },
                    assignedStaffId: { type: "string", nullable: true, example: examples.userId },
                    leadSource: { type: "string", nullable: true, example: "Referral" },
                    notes: { type: "string", example: "Met at Lagos Tech Summit." },
                    projectsCount: { type: "integer", minimum: 0, example: 3 },
                    createdAt: ref("Timestamp"),
                    updatedAt: ref("Timestamp")
                }
            },
            Project: {
                type: "object",
                required: ["id", "name", "clientId", "deadline", "budget", "priority", "status"],
                properties: {
                    id: { type: "string", example: examples.projectId },
                    name: { type: "string", example: "Website Redesign" },
                    clientId: { type: "string", example: examples.clientId },
                    client: ref("ProjectClient"),
                    description: { type: "string", default: "", example: "Refresh the public website, messaging, and conversion pages." },
                    deadline: ref("Timestamp"),
                    budget: { type: "number", minimum: 0, default: 0, example: 45000 },
                    priority: { type: "string", enum: enumValues.projectPriorities, default: "Medium", example: "High" },
                    status: {
                        type: "string",
                        enum: enumValues.projectStatuses,
                        default: "Planned",
                        example: "InProgress",
                        description: "Progress is derived from linked tasks. Completed can be automatic when linked tasks are all Done. OnHold and Cancelled are preserved."
                    },
                    teamIds: { type: "array", items: { type: "string" }, default: [], example: [examples.userId] },
                    files: { type: "array", items: { type: "string", format: "uri" }, default: [], example: ["https://res.cloudinary.com/demo/project-brief.pdf"] },
                    totalTasks: { type: "integer", minimum: 0, readOnly: true, example: 12 },
                    completedTasks: { type: "integer", minimum: 0, readOnly: true, example: 7 },
                    progress: { type: "number", minimum: 0, maximum: 100, readOnly: true, description: "Derived from linked task completion and cannot be manually set.", example: 58 },
                    createdAt: ref("Timestamp"),
                    updatedAt: ref("Timestamp")
                },
                example: examples.project
            },
            ProjectDetail: {
                allOf: [
                    ref("Project"),
                    {
                        type: "object",
                        properties: {
                            comments: { type: "array", items: ref("Comment"), example: [examples.comment] }
                        }
                    }
                ]
            },
            ProjectStats: {
                type: "object",
                properties: {
                    total: { type: "integer", minimum: 0, example: 24 },
                    planned: { type: "integer", minimum: 0, example: 4 },
                    inProgress: { type: "integer", minimum: 0, example: 10 },
                    onHold: { type: "integer", minimum: 0, example: 2 },
                    completed: { type: "integer", minimum: 0, example: 7 },
                    cancelled: { type: "integer", minimum: 0, example: 1 }
                }
            },
            ProjectInfoData: {
                type: "object",
                description: "Global project counts returned with the project list; not filtered by the current list status filter.",
                properties: {
                    totalProjects: { type: "integer", minimum: 0, example: 24 },
                    totalInProgress: { type: "integer", minimum: 0, example: 10 },
                    totalInReview: { type: "integer", minimum: 0, example: 3 },
                    totalCompleted: { type: "integer", minimum: 0, example: 7 }
                }
            },
            CreateProjectRequest: {
                type: "object",
                required: ["name", "clientId", "deadline"],
                properties: {
                    name: { type: "string", minLength: 1, example: "Website Redesign" },
                    clientId: { type: "string", minLength: 1, description: "Must match an existing client id.", example: examples.clientId },
                    description: { type: "string", default: "", example: "Refresh website messaging and conversion pages." },
                    deadline: ref("Timestamp"),
                    budget: { type: "number", minimum: 0, default: 0, example: 45000 },
                    priority: { type: "string", enum: enumValues.projectPriorities, default: "Medium", example: "High" },
                    status: { type: "string", enum: enumValues.projectStatuses, default: "Planned", example: "Planned" },
                    teamIds: { type: "array", items: { type: "string", minLength: 1 }, default: [], description: "Each id must match an existing user.", example: [examples.userId] },
                    files: { type: "array", items: { type: "string", format: "uri" }, default: [], example: [] }
                }
            },
            UpdateProjectRequest: {
                type: "object",
                description: "Partial update. Do not include progress; it is derived from task completion and will be rejected.",
                properties: {
                    name: { type: "string", minLength: 1, example: "Website Redesign Phase 2" },
                    clientId: { type: "string", minLength: 1, example: examples.clientId },
                    description: { type: "string", example: "Updated scope after kickoff." },
                    deadline: ref("Timestamp"),
                    budget: { type: "number", minimum: 0, example: 50000 },
                    priority: { type: "string", enum: enumValues.projectPriorities, example: "Urgent" },
                    status: { type: "string", enum: enumValues.projectStatuses, example: "InProgress" },
                    teamIds: { type: "array", items: { type: "string" }, example: [examples.userId, examples.adminUserId] },
                    files: { type: "array", items: { type: "string", format: "uri" }, example: ["https://res.cloudinary.com/demo/updated-brief.pdf"] }
                }
            },
            UpdateProjectFinancialRequest: {
                type: "object",
                description: "Admin project update route for assignees, budget, and status.",
                properties: {
                    name: { type: "string", minLength: 1, example: "Website Redesign" },
                    client: { type: "string", description: "Legacy client field supported by this route.", example: examples.clientId },
                    dueTime: { allOf: [ref("Timestamp")], description: "Legacy due timestamp field supported by this route." },
                    assignees: { type: "array", items: { type: "string" }, description: "Array of existing user IDs.", example: [examples.userId] },
                    budget: { type: "number", minimum: 0, example: 45000 },
                    status: { type: "string", enum: enumValues.projectStatuses, example: "Completed" }
                },
                example: {
                    status: "Completed",
                    budget: 45000
                }
            },
            Comment: {
                type: "object",
                properties: {
                    id: { type: "string", example: "comment_001" },
                    projectId: { type: "string", example: examples.projectId },
                    authorId: { type: "string", example: examples.userId },
                    content: { type: "string", example: "Client approved the revised brand direction." },
                    createdAt: ref("Timestamp"),
                    updatedAt: ref("Timestamp")
                },
                example: examples.comment
            },
            CreateProjectCommentRequest: {
                type: "object",
                required: ["comment"],
                properties: {
                    comment: { type: "string", minLength: 1, example: "Client approved the revised brand direction." }
                }
            },
            Task: {
                type: "object",
                required: ["id", "title", "status", "assigneeId", "dueDate"],
                properties: {
                    id: { type: "string", example: examples.taskId },
                    title: { type: "string", example: "Prepare launch checklist" },
                    description: { type: "string", default: "", example: "Confirm copy, analytics, redirects, and deployment plan." },
                    status: { type: "string", enum: enumValues.taskStatuses, default: "Todo", example: "InProgress" },
                    assigneeId: { type: "string", nullable: true, example: examples.userId },
                    assigneeName: { type: "string", nullable: true, description: "Resolved assignee display name for task list cards.", example: "Ada Okafor" },
                    assignee: {
                        type: "object",
                        nullable: true,
                        description: "Resolved assignee summary. Null when the assignee user cannot be found.",
                        properties: {
                            userId: { type: "string", example: examples.userId },
                            firstName: { type: "string", example: "Ada" },
                            lastName: { type: "string", example: "Okafor" },
                            fullName: { type: "string", example: "Ada Okafor" },
                            email: { type: "string", format: "email", example: "ada.okafor@atlas.example" }
                        }
                    },
                    dueDate: ref("Timestamp"),
                    projectId: { type: "string", nullable: true, example: examples.projectId },
                    priority: { type: "string", enum: enumValues.taskPriorities, default: "medium", example: "high" },
                    isOverdue: { type: "boolean", readOnly: true, example: false },
                    createdAt: ref("Timestamp"),
                    updatedAt: ref("Timestamp")
                },
                example: examples.task
            },
            TaskDetail: {
                allOf: [
                    ref("Task"),
                    {
                        type: "object",
                        description: "Task detail may include enriched assignee or project objects from the database helper when available.",
                        additionalProperties: true
                    }
                ]
            },
            CreateTaskRequest: {
                type: "object",
                required: ["title", "assigneeId"],
                properties: {
                    title: { type: "string", minLength: 1, example: "Prepare launch checklist" },
                    description: { type: "string", example: "Confirm copy, analytics, redirects, and deployment plan." },
                    assigneeId: { type: "string", description: "Required unless using the legacy assignedTo alias. Must match an existing user.", example: examples.userId },
                    assignedTo: { type: "string", description: "Legacy alias for assigneeId.", example: examples.userId },
                    dueDate: ref("Timestamp"),
                    status: { type: "string", enum: enumValues.taskStatuses, default: "Todo", example: "Todo" },
                    projectId: { type: "string", description: "Optional existing project id.", example: examples.projectId },
                    priority: { type: "string", enum: enumValues.taskPriorities, default: "medium", example: "high" }
                }
            },
            UpdateTaskRequest: {
                type: "object",
                description: "Partial update. All fields are optional.",
                properties: {
                    title: { type: "string", minLength: 1, example: "Prepare updated launch checklist" },
                    description: { type: "string", example: "Add QA sign-off and analytics verification." },
                    assigneeId: { type: "string", example: examples.adminUserId },
                    assignedTo: { type: "string", description: "Legacy alias for assigneeId.", example: examples.adminUserId },
                    dueDate: ref("Timestamp"),
                    status: { type: "string", enum: enumValues.taskStatuses, example: "Review" },
                    projectId: { type: "string", example: examples.projectId },
                    priority: { type: "string", enum: enumValues.taskPriorities, example: "medium" }
                }
            },
            BlogPost: {
                type: "object",
                required: ["id", "title", "slug", "excerpt", "category", "authorId", "status"],
                description: "Blog responses are stripped of MongoDB internal _id fields.",
                properties: {
                    id: { type: "string", example: examples.postId },
                    title: { type: "string", example: "Getting Started with Digital Marketing" },
                    slug: { type: "string", example: examples.slug },
                    excerpt: { type: "string", example: "A practical guide to building your digital marketing strategy from the ground up." },
                    content: { type: "string", description: "Markdown content. The embed route renders Markdown to sanitized HTML.", example: "## Introduction\nDigital marketing works best when goals, channels, and measurement are aligned." },
                    category: { type: "string", enum: enumValues.blogCategories, example: "Marketing" },
                    authorId: { type: "string", example: examples.userId },
                    tags: { type: "array", items: { type: "string" }, default: [], example: ["marketing", "digital", "strategy"] },
                    status: { type: "string", enum: enumValues.blogStatuses, default: "draft", example: "published" },
                    isFeatured: { type: "boolean", default: false, example: true },
                    views: { type: "integer", minimum: 0, readOnly: true, example: 1240 },
                    publishedAt: { allOf: [ref("Timestamp")], nullable: true, example: 1775600000000 },
                    scheduledAt: { allOf: [ref("Timestamp")], nullable: true, example: null },
                    createdAt: ref("Timestamp"),
                    updatedAt: ref("Timestamp")
                },
                example: examples.blogPost
            },
            CreateBlogPostRequest: {
                type: "object",
                description: "Client payload for creating a blog post. Do not send slug; the backend generates it from title.",
                required: ["title", "excerpt", "category", "authorId"],
                properties: {
                    title: { type: "string", minLength: 1, description: "Used by the backend to generate the canonical slug.", example: "Getting Started with Digital Marketing" },
                    excerpt: { type: "string", minLength: 1, example: "A practical guide to building your digital marketing strategy from the ground up." },
                    content: { type: "string", default: "", example: "## Introduction\nDigital marketing works best when goals, channels, and measurement are aligned." },
                    category: { type: "string", enum: enumValues.blogCategories, example: "Marketing" },
                    authorId: { type: "string", description: "Must match an existing userId.", example: examples.userId },
                    tags: { type: "array", items: { type: "string", minLength: 1 }, default: [], example: ["marketing", "digital", "strategy"] },
                    status: { type: "string", enum: enumValues.blogStatuses, default: "draft", example: "draft" },
                    isFeatured: { type: "boolean", default: false, example: false },
                    publishedAt: { allOf: [ref("Timestamp")], nullable: true, example: null },
                    scheduledAt: { allOf: [ref("Timestamp")], nullable: true, description: "Use when status is scheduled.", example: null }
                }
            },
            UpdateBlogPostRequest: {
                type: "object",
                description: "Partial update. Do not send slug; if title changes, the backend regenerates the slug from title. Set status to published to publish; set isFeatured to control featured state.",
                properties: {
                    title: { type: "string", minLength: 1, description: "When changed, the backend regenerates slug from this title.", example: "10 SEO Tips for 2026" },
                    excerpt: { type: "string", example: "A concise summary of practical SEO improvements." },
                    content: { type: "string", example: "## SEO tips\nFocus on search intent, performance, and helpful content." },
                    category: { type: "string", enum: enumValues.blogCategories, example: "SEO" },
                    authorId: { type: "string", example: examples.userId },
                    tags: { type: "array", items: { type: "string" }, example: ["SEO", "Marketing"] },
                    status: { type: "string", enum: enumValues.blogStatuses, example: "published" },
                    isFeatured: { type: "boolean", example: true },
                    publishedAt: { allOf: [ref("Timestamp")], nullable: true, example: 1775600000000 },
                    scheduledAt: { allOf: [ref("Timestamp")], nullable: true, example: null }
                }
            },
            BlogStats: {
                type: "object",
                properties: {
                    total: { type: "integer", minimum: 0, example: 42 },
                    published: { type: "integer", minimum: 0, example: 28 },
                    draft: { type: "integer", minimum: 0, example: 10 },
                    scheduled: { type: "integer", minimum: 0, example: 4 },
                    totalViews: { type: "integer", minimum: 0, example: 38000 }
                }
            },
            TrackBlogViewRequest: {
                type: "object",
                required: ["token"],
                properties: {
                    token: { type: "string", description: "Short-lived signed token generated inside the /embed/{slug} HTML page.", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.track-token" }
                }
            },
            Lead: {
                type: "object",
                required: ["id", "firstName", "lastName", "email"],
                properties: {
                    id: { type: "string", example: examples.leadId },
                    firstName: { type: "string", example: "Kemi" },
                    lastName: { type: "string", example: "Adebayo" },
                    fullName: { type: "string", default: "", example: "Kemi Adebayo" },
                    email: { type: "string", format: "email", example: "kemi@brightfoods.example" },
                    phone: { type: "string", default: "", example: "+2348098765432" },
                    company: { type: "string", default: "", example: "Bright Foods Ltd" },
                    status: { type: "string", enum: enumValues.leadStatuses, default: "new", example: "qualified" },
                    stage: { type: "string", default: "", example: "Discovery Call" },
                    contactPerson: { type: "string", default: "", example: "Kemi Adebayo" },
                    value: { type: "number", minimum: 0, default: 0, example: 25000 },
                    source: { type: "string", default: "", example: "Website" },
                    notes: { type: "string", default: "", example: "Interested in a full funnel marketing package." },
                    assignedTo: { type: "string", default: "", example: examples.userId },
                    createdAt: ref("Timestamp"),
                    updatedAt: ref("Timestamp")
                },
                example: examples.lead
            },
            Notification: {
                type: "object",
                required: ["id", "recipientId", "type", "title", "message", "isRead", "createdAt", "updatedAt"],
                properties: {
                    id: { type: "string", example: examples.notificationId },
                    recipientId: { type: "string", example: examples.userId },
                    type: { type: "string", example: "TASK_ASSIGNMENT" },
                    title: { type: "string", example: "New task assigned" },
                    message: { type: "string", example: "Prepare launch checklist was assigned to you." },
                    link: { type: "string", nullable: true, example: "/api/tasks/task_launch_plan_001" },
                    referenceId: { type: "string", nullable: true, example: examples.taskId },
                    referenceType: { type: "string", nullable: true, example: "task" },
                    isRead: { type: "boolean", example: false },
                    createdBy: { type: "string", nullable: true, example: examples.adminUserId },
                    createdAt: ref("Timestamp"),
                    updatedAt: ref("Timestamp")
                },
                example: {
                    id: examples.notificationId,
                    recipientId: examples.userId,
                    type: "TASK_ASSIGNMENT",
                    title: "New task assigned",
                    message: "Prepare launch checklist was assigned to you.",
                    link: "/api/tasks/task_launch_plan_001",
                    referenceId: examples.taskId,
                    referenceType: "task",
                    isRead: false,
                    createdBy: examples.adminUserId,
                    createdAt: examples.createdAt,
                    updatedAt: examples.updatedAt
                }
            },
            NotificationPreferences: {
                type: "object",
                additionalProperties: false,
                properties: Object.fromEntries(enumValues.notificationTypes.map((type) => [
                    type,
                    { type: "boolean", example: true }
                ])),
                example: Object.fromEntries(enumValues.notificationTypes.map((type) => [type, true]))
            },
            UpdateNotificationPreferencesRequest: {
                type: "object",
                additionalProperties: false,
                description: "Per-user notification preferences. Send only the notification types to change; omitted types keep their current value for the authenticated user.",
                properties: Object.fromEntries(enumValues.notificationTypes.map((type) => [
                    type,
                    { type: "boolean", example: type !== "SYSTEM_ALERT" }
                ])),
                example: {
                    TASK_ASSIGNMENT: true,
                    PROJECT_STATUS_CHANGE: false,
                    CLIENT_CREATED: true
                }
            },
            CreateLeadRequest: {
                type: "object",
                required: ["firstName", "lastName", "email"],
                properties: {
                    firstName: { type: "string", minLength: 1, example: "Kemi" },
                    lastName: { type: "string", minLength: 1, example: "Adebayo" },
                    fullName: { type: "string", example: "Kemi Adebayo" },
                    email: { type: "string", format: "email", example: "kemi@brightfoods.example" },
                    phone: { type: "string", example: "+2348098765432" },
                    company: { type: "string", example: "Bright Foods Ltd" },
                    status: { type: "string", enum: enumValues.leadStatuses, default: "new", example: "new" },
                    stage: { type: "string", example: "New Inquiry" },
                    contactPerson: { type: "string", example: "Kemi Adebayo" },
                    value: { type: "number", minimum: 0, default: 0, example: 25000 },
                    source: { type: "string", example: "Website" },
                    notes: { type: "string", example: "Interested in brand strategy and paid ads." },
                    assignedTo: { type: "string", example: examples.userId }
                }
            },
            UpdateLeadRequest: {
                type: "object",
                description: "Partial lead update. All fields are optional.",
                properties: {
                    firstName: { type: "string", example: "Kemi" },
                    lastName: { type: "string", example: "Adebayo" },
                    fullName: { type: "string", example: "Kemi Adebayo" },
                    email: { type: "string", format: "email", example: "kemi@brightfoods.example" },
                    phone: { type: "string", example: "+2348098765432" },
                    company: { type: "string", example: "Bright Foods Ltd" },
                    status: { type: "string", enum: enumValues.leadStatuses, example: "contacted" },
                    stage: { type: "string", example: "Discovery Call" },
                    contactPerson: { type: "string", example: "Kemi Adebayo" },
                    value: { type: "number", minimum: 0, example: 30000 },
                    source: { type: "string", example: "Referral" },
                    notes: { type: "string", example: "Call scheduled for next week." },
                    assignedTo: { type: "string", example: examples.adminUserId }
                }
            },
            Payment: {
                type: "object",
                required: ["id", "clientId", "projectId", "amount", "status", "date"],
                description: "Payment records persist relationship IDs only. Client/project display names are derived from clients/projects by separate lookups when needed and are not stored on payment documents.",
                properties: {
                    id: { type: "string", example: examples.paymentId },
                    clientId: { type: "string", minLength: 1, description: "Existing client id referenced by this payment.", example: examples.clientId },
                    projectId: { type: "string", minLength: 1, description: "Existing project id referenced by this payment.", example: examples.projectId },
                    amount: { type: "number", minimum: 0, exclusiveMinimum: true, example: 15000 },
                    status: { type: "string", enum: enumValues.paymentStatuses, default: "Pending", example: "Paid" },
                    date: ref("Timestamp"),
                    source: { type: "string", nullable: true, example: "Website" },
                    notes: { type: "string", default: "", example: "April milestone payment" },
                    createdAt: ref("Timestamp"),
                    updatedAt: ref("Timestamp")
                },
                example: examples.payment
            },
            PaymentDateInput: {
                oneOf: [
                    { type: "integer", format: "int64", minimum: 0, example: 1775779200000 },
                    { type: "string", example: "2026-04-10" }
                ],
                description: "Accepted payment date input: Unix milliseconds, numeric string, or parseable date string. The backend stores Unix milliseconds."
            },
            CreatePaymentRequest: {
                type: "object",
                required: ["clientId", "projectId", "amount", "date"],
                additionalProperties: false,
                description: "Create payment payload. clientId and projectId are required, must reference existing records, and the project must belong to the supplied client when the project has a clientId.",
                properties: {
                    clientId: { type: "string", minLength: 1, description: "Existing client id. Required and verified by the backend.", example: examples.clientId },
                    projectId: { type: "string", minLength: 1, description: "Existing project id. Required and verified by the backend.", example: examples.projectId },
                    amount: { type: "number", minimum: 0, exclusiveMinimum: true, example: 15000 },
                    status: { type: "string", enum: enumValues.paymentStatuses, default: "Pending", example: "Paid" },
                    date: ref("PaymentDateInput"),
                    source: { type: "string", nullable: true, example: "Website" },
                    notes: { type: "string", default: "", example: "April milestone payment" }
                },
                example: {
                    clientId: examples.clientId,
                    projectId: examples.projectId,
                    amount: 15000,
                    status: "Paid",
                    date: "2026-04-10",
                    source: "Website",
                    notes: "April milestone payment"
                }
            },
            UpdatePaymentRequest: {
                type: "object",
                additionalProperties: false,
                description: "Partial payment update. All fields are optional. If clientId or projectId changes, both the effective client/project references are verified and project/client mismatches are rejected.",
                properties: {
                    clientId: { type: "string", minLength: 1, example: examples.clientId },
                    projectId: { type: "string", minLength: 1, example: examples.projectId },
                    amount: { type: "number", minimum: 0, exclusiveMinimum: true, example: 18000 },
                    status: { type: "string", enum: enumValues.paymentStatuses, example: "Pending" },
                    date: ref("PaymentDateInput"),
                    source: { type: "string", nullable: true, example: "Referral" },
                    notes: { type: "string", example: "Updated payment status after bank confirmation." }
                }
            },
            MediaImage: {
                type: "object",
                properties: {
                    id: { type: "string", example: examples.imageId },
                    url: { type: "string", format: "uri", example: "https://res.cloudinary.com/atlas/image/upload/v1775600000/dashboard/hero.png" }
                },
                example: examples.mediaImage
            },
            MediaFile: {
                type: "object",
                properties: {
                    id: { type: "string", example: examples.fileId },
                    fileName: { type: "string", example: "company-presentation.pdf" },
                    type: { type: "string", enum: ["image", "document", "video", "other"], example: "document" },
                    mimeType: { type: "string", example: "application/pdf" },
                    sizeBytes: { type: "integer", minimum: 0, example: 1024000 },
                    storageProvider: { type: "string", enum: ["cloudinary", "local", "s3", "other"], example: "cloudinary" },
                    publicId: { type: "string", nullable: true, example: "atlas-africa/files/company-presentation" },
                    resourceType: { type: "string", enum: ["image", "video", "raw"], nullable: true, example: "raw" },
                    url: { type: "string", format: "uri", example: examples.mediaFile.url },
                    uploadedBy: { type: "string", nullable: true, example: examples.userId },
                    createdAt: ref("Timestamp"),
                    updatedAt: ref("Timestamp")
                },
                example: examples.mediaFile
            },
            RegisterMediaFileUrlRequest: {
                type: "object",
                required: ["url"],
                properties: {
                    url: { type: "string", format: "uri", example: "https://cdn.example.com/files/company-presentation.pdf" },
                    fileName: { type: "string", example: "company-presentation.pdf" },
                    type: { type: "string", enum: ["image", "document", "video", "other"], default: "other", example: "document" },
                    mimeType: { type: "string", default: "application/octet-stream", example: "application/pdf" },
                    sizeBytes: { type: "integer", minimum: 0, default: 0, example: 1024000 }
                }
            },
            DashboardMetrics: {
                type: "object",
                properties: {
                    totalClients: ref("TrendMetric"),
                    totalProjects: ref("TrendMetric"),
                    activeProjects: ref("TrendMetric"),
                    pendingTasks: ref("TrendMetric"),
                    newLeads: ref("TrendMetric")
                }
            },
            DashboardPerformance: {
                type: "object",
                properties: {
                    period: { type: "string", enum: enumValues.dashboardPeriods, example: "6months" },
                    labels: { type: "array", items: { type: "string" }, example: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"] },
                    revenueSeries: { type: "array", items: { type: "number" }, example: [20000, 36000, 54000, 50000, 72000, 56000] },
                    newClientSeries: { type: "array", items: { type: "number" }, example: [16, 23, 34, 27, 42, 34] }
                }
            },
            DashboardInProgressProject: {
                type: "object",
                properties: {
                    id: { type: "string", example: examples.projectId },
                    name: { type: "string", example: "Brand Strategy" },
                    clientName: { type: "string", example: "Acme Corporation" },
                    statusLabel: { type: "string", enum: enumValues.projectStatusLabels, example: "On Track" },
                    progress: { type: "number", minimum: 0, maximum: 100, example: 60 }
                }
            },
            DashboardActivities: {
                type: "object",
                properties: {
                    items: {
                        type: "array",
                        items: ref("DashboardActivityItem")
                    },
                    pagination: ref("Pagination")
                }
            },
            DashboardActivityItem: {
                type: "object",
                properties: {
                    id: { type: "string", example: "activity_001" },
                    title: { type: "string", example: "New Client Added" },
                    description: { type: "string", example: "Jane Doe was added as a new client" },
                    actorName: { type: "string", example: "Ada Okafor" },
                    createdAt: ref("Timestamp"),
                    timeAgo: { type: "string", example: "2 mins ago" }
                }
            },
            AnalyticsOverview: {
                type: "object",
                properties: {
                    websiteVisitors: ref("TrendMetric"),
                    pageViews: ref("TrendMetric"),
                    conversionRate: ref("TrendMetric"),
                    topTrafficSource: {
                        type: "object",
                        properties: {
                            name: { type: "string", example: "Google" },
                            changePct: { type: "number", example: 8 },
                            direction: { type: "string", enum: enumValues.trendDirections, example: "up" }
                        }
                    }
                }
            },
            AnalyticsTraffic: {
                type: "object",
                properties: {
                    range: { type: "string", enum: enumValues.analyticsRanges, example: "30d" },
                    labels: { type: "array", items: { type: "string" }, example: ["Week 1", "Week 2", "Week 3", "Week 4"] },
                    visitsSeries: { type: "array", items: { type: "number" }, example: [8500, 9200, 10100, 9800] },
                    pageViewsSeries: { type: "array", items: { type: "number" }, example: [18500, 20300, 21900, 21000] },
                    conversionRateSeries: { type: "array", items: { type: "number" }, example: [4.8, 5.1, 5.6, 5.2] }
                }
            },
            AnalyticsSources: {
                type: "object",
                properties: {
                    sources: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                source: { type: "string", example: "Google" },
                                percentage: { type: "number", minimum: 0, maximum: 100, example: 42.5 }
                            }
                        }
                    }
                }
            },
            AnalyticsCampaign: {
                type: "object",
                properties: {
                    id: { type: "string", example: "campaign_001" },
                    campaignName: { type: "string", example: "Q2 Growth Campaign" },
                    impressions: { type: "integer", minimum: 0, example: 125000 },
                    clicks: { type: "integer", minimum: 0, example: 5300 },
                    conversions: { type: "integer", minimum: 0, example: 420 },
                    conversionRate: { type: "number", minimum: 0, maximum: 100, example: 7.92 }
                }
            },
            AnalyticsDistribution: {
                type: "object",
                properties: {
                    distribution: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                label: { type: "string", example: "Page Views" },
                                value: { type: "number", minimum: 0, example: 78540 }
                            }
                        }
                    }
                }
            },
            RevenueSummaryMetric: {
                allOf: [
                    ref("TrendMetric"),
                    {
                        type: "object",
                        properties: {
                            compareLabel: { type: "string", example: "vs previous period" }
                        }
                    }
                ]
            },
            RevenueSeries: {
                type: "object",
                properties: {
                    period: { type: "string", enum: enumValues.dashboardPeriods, example: "6months" },
                    labels: { type: "array", items: { type: "string" }, example: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"] },
                    revenueSeries: { type: "array", items: { type: "number" }, example: [45000, 52000, 48000, 61000, 55000, 68000] }
                }
            },
            RevenueDashboard: {
                type: "object",
                properties: {
                    summary: {
                        type: "object",
                        properties: {
                            totalRevenue: ref("RevenueSummaryMetric"),
                            monthlyRevenue: ref("RevenueSummaryMetric"),
                            growthRate: ref("RevenueSummaryMetric"),
                            pendingPayments: ref("RevenueSummaryMetric")
                        }
                    },
                    revenueOverTime: {
                        type: "object",
                        properties: {
                            labels: { type: "array", items: { type: "string" }, example: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"] },
                            series: { type: "array", items: { type: "number" }, example: [45000, 52000, 48000, 61000, 55000, 68000] }
                        }
                    },
                    revenueBySource: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                source: { type: "string", example: "Website" },
                                amount: { type: "number", example: 120000 }
                            }
                        }
                    },
                    revenueByService: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                service: { type: "string", example: "Consulting" },
                                amount: { type: "number", example: 180000 },
                                percentage: { type: "number", example: 38 }
                            }
                        }
                    },
                    topClients: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                clientId: { type: "string", example: examples.clientId },
                                clientName: { type: "string", example: "Acme Corporation" },
                                amount: { type: "number", example: 85000 },
                                percentage: { type: "number", example: 18 },
                                logoUrl: { type: "string", format: "uri", nullable: true, example: null }
                            }
                        }
                    }
                }
            },
            QualifiedWebhookLeadRequest: {
                type: "object",
                required: ["name", "email"],
                properties: {
                    form_type: { type: "string", example: "quote_request" },
                    name: { type: "string", minLength: 1, example: "Kemi Adebayo" },
                    email: { type: "string", format: "email", example: "kemi@brightfoods.example" },
                    phone: { type: "string", default: "", example: "+2348098765432" },
                    service: { type: "string", default: "", example: "Growth Marketing" },
                    budget: { type: "string", default: "", example: "$10,000 - $25,000" },
                    details: { type: "string", default: "", example: "We need help launching a new food product line." }
                }
            },
            GeneralWebhookLeadRequest: {
                type: "object",
                required: ["name", "email"],
                properties: {
                    name: { type: "string", minLength: 1, example: "Tunde Bello" },
                    email: { type: "string", format: "email", example: "tunde@northstar.example" },
                    phone: { type: "string", default: "", example: "+2348011122233" },
                    business: { type: "string", default: "", example: "Northstar Logistics" },
                    service: { type: "string", default: "", example: "Brand Strategy" },
                    challenge: { type: "string", default: "", example: "Low lead quality from current campaigns." },
                    budget: { type: "string", default: "", example: "$5,000 - $10,000" }
                }
            },
            HealthData: {
                type: "object",
                nullable: true,
                description: "Health route sends raw success/message fields, which the /api response normalizer converts to data: null.",
                example: null
            }
        },
        responses: {
            BadRequest: errorResponse("Bad request or validation error.", 400, "Invalid request parameters", ["One or more fields are invalid."]),
            Unauthorized: errorResponse("Authentication is required, invalid, expired, or revoked.", 401, "Access denied. Please sign in."),
            Forbidden: errorResponse("The authenticated user does not have permission for this operation.", 403, "Access denied. Admins only."),
            NotFound: errorResponse("The requested resource was not found.", 404, "Resource not found"),
            Conflict: errorResponse("A unique constraint or duplicate value conflict occurred.", 409, "A resource with this value already exists."),
            TooManyRequests: errorResponse("Rate limit exceeded.", 429, "Too many requests. Please slow down."),
            ServerError: errorResponse("Internal server error.", 500, "An unknown error occurred"),
            ServiceUnavailable: errorResponse("Dependency unavailable.", 503, "Service temporarily unavailable")
        }
    },
    paths: {
        "/api/auth/login": {
            post: {
                tags: ["Auth"],
                operationId: "loginUser",
                summary: "Login user",
                description: "Authenticates an admin/staff user with email and password, sets the HttpOnly auth_token cookie, stores a fresh stamp on the user record, and returns the authenticated user profile. The cookie is Secure; SameSite is strict in production and none outside production.",
                requestBody: jsonRequestBody("LoginRequest", {
                    email: "admin@atlas.example",
                    password: "StrongPass123",
                    rememberMe: true
                }, "Login credentials. Use rememberMe to request a longer-lived cookie."),
                responses: {
                    200: successResponse("Signed in successfully. auth_token cookie is set by Set-Cookie.", {
                        type: "object",
                        properties: { user: ref("UserProfile") }
                    }, { user: examples.userProfile }, "Signed in successfully"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/auth/test-reset-password": {
            post: {
                tags: ["Auth"],
                operationId: "testResetPassword",
                summary: "Reset password for testing",
                description: "Development/test-only helper that resets a user's password after validating resetCode against TEST_PASSWORD_RESET_SECRET. It hashes the new password and clears the user's session stamp so old cookies are revoked. This route returns 404 when NODE_ENV=production.",
                requestBody: jsonRequestBody("TestResetPasswordRequest", {
                    email: "admin@atlas.example",
                    password: "NewStrongPass123",
                    resetCode: "change-this-test-reset-code"
                }, "Test reset payload."),
                responses: {
                    200: successResponse("Password reset successfully.", {
                        type: "object",
                        properties: {
                            user: {
                                type: "object",
                                properties: {
                                    userId: { type: "string", example: examples.userId },
                                    email: { type: "string", format: "email", example: "admin@atlas.example" },
                                    role: { type: "string", example: "admin" }
                                }
                            }
                        }
                    }, {
                        user: {
                            userId: examples.userId,
                            email: "admin@atlas.example",
                            role: "admin"
                        }
                    }, "Password reset successfully. You can now log in with the new password."),
                    400: responseRef("BadRequest"),
                    403: responseRef("Forbidden"),
                    404: responseRef("NotFound"),
                    503: responseRef("ServiceUnavailable"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/auth/logout": {
            post: {
                tags: ["Auth"],
                operationId: "logoutUser",
                summary: "Logout user",
                description: "Clears the auth_token cookie and nullifies the current user's session stamp in the database, revoking active sessions for that user.",
                security: [{ cookieAuth: [] }],
                responses: {
                    200: emptySuccessResponse("Logged out successfully.", "Logged out successfully"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/user/profile": {
            get: {
                tags: ["User"],
                operationId: "getCurrentUserProfile",
                summary: "Get current user profile",
                description: "Returns the profile of the authenticated user resolved by auth_token. The backend verifies the token stamp against the database before reaching this route.",
                security: [{ cookieAuth: [] }],
                responses: {
                    200: successResponse("Current profile returned.", {
                        type: "object",
                        properties: { profile: ref("UserProfile") }
                    }, { profile: examples.userProfile }, "Fetch profile success"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/user/profile/picture": {
            put: {
                tags: ["User"],
                operationId: "updateCurrentUserProfilePicture",
                summary: "Upload or replace current user's profile picture",
                description: "Authenticated self-service profile picture upload. Uses multipart/form-data field name picture. Only JPEG, PNG, and WebP are accepted; SVG, GIF, HEIC, documents, video, and non-image payloads are rejected by MIME, extension, and magic-byte checks. Replacing a picture deletes the previous Cloudinary asset when a public ID is stored.",
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    description: "Multipart payload with one strict image file.",
                    content: {
                        "multipart/form-data": {
                            schema: {
                                type: "object",
                                required: ["picture"],
                                properties: {
                                    picture: { type: "string", format: "binary", description: "JPEG, PNG, or WebP image only. Maximum size is 5 MB." }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: successResponse("Profile picture updated.", {
                        type: "object",
                        properties: { profile: ref("UserProfile") }
                    }, { profile: examples.userProfile }, "Profile picture updated successfully"),
                    400: errorResponse("Missing file or unsupported image type/content.", 400, "Profile picture must be a JPEG, PNG, or WebP image"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            delete: {
                tags: ["User"],
                operationId: "deleteCurrentUserProfilePicture",
                summary: "Remove current user's profile picture",
                description: "Authenticated self-service profile picture removal. Deletes the stored Cloudinary asset when possible and clears avatarUrl/avatarPublicId/avatarResourceType in the user record.",
                security: [{ cookieAuth: [] }],
                responses: {
                    200: successResponse("Profile picture removed.", {
                        type: "object",
                        properties: { profile: ref("UserProfile") }
                    }, { profile: { ...examples.userProfile, avatarUrl: null } }, "Profile picture removed successfully"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/dashboard/metrics": {
            get: {
                tags: ["Dashboard"],
                operationId: "getDashboardMetrics",
                summary: "Get dashboard KPI cards",
                description: "Returns total clients, total projects, active projects, pending tasks, and new leads with month-over-month trend metadata.",
                security: [{ cookieAuth: [] }],
                responses: {
                    200: successResponse("Dashboard metrics returned.", ref("DashboardMetrics"), {
                        totalClients: { value: 2550, changePct: 12.5, direction: "up", compareLabel: "Vs last month" },
                        totalProjects: { value: 240, changePct: 6.4, direction: "up", compareLabel: "Vs last month" },
                        activeProjects: { value: 140, changePct: 8.2, direction: "up", compareLabel: "Vs last month" },
                        pendingTasks: { value: 65, changePct: -3.5, direction: "down", compareLabel: "Vs last month" },
                        newLeads: { value: 200, changePct: 12.5, direction: "up", compareLabel: "Vs last month" }
                    }),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/dashboard/performance": {
            get: {
                tags: ["Dashboard"],
                operationId: "getDashboardPerformance",
                summary: "Get dashboard performance chart data",
                description: "Returns labels plus paid-payment revenue and new-client series for the selected period.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("DashboardPeriod")],
                responses: {
                    200: successResponse("Performance chart data returned.", ref("DashboardPerformance"), {
                        period: "6months",
                        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
                        revenueSeries: [20000, 36000, 54000, 50000, 72000, 56000],
                        newClientSeries: [16, 23, 34, 27, 42, 34]
                    }),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/dashboard/projects/in-progress": {
            get: {
                tags: ["Dashboard"],
                operationId: "getDashboardInProgressProjects",
                summary: "Get in-progress projects widget data",
                description: "Returns active projects with display status labels derived from project status, progress, and deadline. Limit is capped at 20.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("InProgressLimit")],
                responses: {
                    200: successResponse("In-progress project widget data returned.", {
                        type: "object",
                        properties: {
                            projects: { type: "array", items: ref("DashboardInProgressProject") },
                            totalActiveProjects: { type: "integer", minimum: 0, example: 4 }
                        }
                    }, {
                        projects: [
                            { id: "project_brand_refresh_001", name: "Brand Strategy", clientName: "Acme Corporation", statusLabel: "On Track", progress: 60 },
                            { id: "project_market_analysis_001", name: "Market Analysis", clientName: "Apex Group", statusLabel: "Finishing", progress: 92 }
                        ],
                        totalActiveProjects: 4
                    }),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/dashboard/activities": {
            get: {
                tags: ["Dashboard"],
                operationId: "getDashboardActivities",
                summary: "Get recent activity feed",
                description: "Returns paginated activity feed items. Activity titles are normalized from stored activity type values such as client.created or payment.updated.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("Page"), parameterRef("ActivityLimit")],
                responses: {
                    200: successResponse("Recent activity feed returned.", ref("DashboardActivities"), {
                        items: [
                            {
                                id: "activity_001",
                                title: "New Client Added",
                                description: "Jane Doe was added as a new client",
                                actorName: "Ada Okafor",
                                createdAt: 1775600000000,
                                timeAgo: "2 mins ago"
                            }
                        ],
                        pagination: { page: 1, limit: 10, total: 24, totalPages: 3 }
                    }),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/analytics/overview": {
            get: {
                tags: ["Analytics"],
                operationId: "getAnalyticsOverview",
                summary: "Get analytics overview cards",
                description: "Returns visitors, page views, conversion rate, and top traffic source with trend metadata for dashboard analytics cards.",
                security: [{ cookieAuth: [] }],
                responses: {
                    200: successResponse("Analytics overview returned.", ref("AnalyticsOverview"), {
                        websiteVisitors: { value: 35000, changePct: 15, direction: "up" },
                        pageViews: { value: 78222, changePct: 15, direction: "up" },
                        conversionRate: { value: 7.6, changePct: -1.2, direction: "down" },
                        topTrafficSource: { name: "Google", changePct: 8, direction: "up" }
                    }),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/analytics/traffic": {
            get: {
                tags: ["Analytics"],
                operationId: "getAnalyticsTraffic",
                summary: "Get analytics traffic time-series",
                description: "Returns visits, page views, and conversion-rate series for the selected analytics range.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("AnalyticsRange7d")],
                responses: {
                    200: successResponse("Traffic overview returned.", ref("AnalyticsTraffic"), {
                        range: "30d",
                        labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
                        visitsSeries: [8500, 9200, 10100, 9800],
                        pageViewsSeries: [18500, 20300, 21900, 21000],
                        conversionRateSeries: [4.8, 5.1, 5.6, 5.2]
                    }),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/analytics/sources": {
            get: {
                tags: ["Analytics"],
                operationId: "getAnalyticsSources",
                summary: "Get normalized traffic sources",
                description: "Returns traffic source percentages normalized across analytics snapshots for the selected range.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("AnalyticsRange30d")],
                responses: {
                    200: successResponse("Traffic sources returned.", ref("AnalyticsSources"), {
                        sources: [
                            { source: "Google", percentage: 42.5 },
                            { source: "Direct", percentage: 26.2 },
                            { source: "Referral", percentage: 18.4 }
                        ]
                    }),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/analytics/campaigns": {
            get: {
                tags: ["Analytics"],
                operationId: "getAnalyticsCampaigns",
                summary: "Get campaign performance table",
                description: "Returns campaign performance rows with pagination. sortBy and order are enums so Swagger UI renders dropdowns.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("Page"), parameterRef("Limit10"), parameterRef("CampaignSortBy"), parameterRef("SortOrder")],
                responses: {
                    200: successResponse("Campaign performance returned.", {
                        type: "object",
                        properties: {
                            campaigns: { type: "array", items: ref("AnalyticsCampaign") },
                            pagination: ref("Pagination")
                        }
                    }, {
                        campaigns: [
                            { id: "campaign_001", campaignName: "Q2 Growth Campaign", impressions: 125000, clicks: 5300, conversions: 420, conversionRate: 7.92 }
                        ],
                        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
                    }),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/analytics/distribution": {
            get: {
                tags: ["Analytics"],
                operationId: "getAnalyticsDistribution",
                summary: "Get analytics distribution pie data",
                description: "Returns values used by distribution widgets: page views, visitors, leads, and active clients.",
                security: [{ cookieAuth: [] }],
                responses: {
                    200: successResponse("Distribution data returned.", ref("AnalyticsDistribution"), {
                        distribution: [
                            { label: "Page Views", value: 78540 },
                            { label: "Website Visitors", value: 35280 },
                            { label: "Leads", value: 4820 },
                            { label: "Customers", value: 690 }
                        ]
                    }),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/revenue": {
            get: {
                tags: ["Revenue"],
                operationId: "getRevenueSeries",
                summary: "Get revenue time series",
                description: "Returns recognized revenue labels and values for the selected period.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("DashboardPeriod")],
                responses: {
                    200: successResponse("Revenue series returned.", ref("RevenueSeries"), {
                        period: "6months",
                        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
                        revenueSeries: [45000, 52000, 48000, 61000, 55000, 68000]
                    }),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/revenue/dashboard": {
            get: {
                tags: ["Revenue"],
                operationId: "getRevenueDashboard",
                summary: "Get revenue dashboard aggregate data",
                description: "Returns revenue KPI cards, revenue-over-time chart data, source/service groupings, and top clients for the selected period.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("DashboardPeriod")],
                responses: {
                    200: successResponse("Revenue dashboard returned.", ref("RevenueDashboard"), {
                        summary: {
                            totalRevenue: { value: 346000, changePct: 15, direction: "up", compareLabel: "vs previous period" },
                            monthlyRevenue: { value: 68000, changePct: 12, direction: "up", compareLabel: "vs last month" },
                            growthRate: { value: 18.5, changePct: 3, direction: "up", compareLabel: "vs last quarter" },
                            pendingPayments: { value: 30000, changePct: -8, direction: "down", compareLabel: "vs last month" }
                        },
                        revenueOverTime: {
                            labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
                            series: [45000, 52000, 48000, 61000, 55000, 68000]
                        },
                        revenueBySource: [
                            { source: "Website", amount: 120000 },
                            { source: "Referral", amount: 180000 }
                        ],
                        revenueByService: [
                            { service: "Consulting", amount: 180000, percentage: 38 },
                            { service: "Design Services", amount: 140000, percentage: 30 }
                        ],
                        topClients: [
                            { clientId: examples.clientId, clientName: "Acme Corporation", amount: 85000, percentage: 18, logoUrl: null }
                        ]
                    }, "Revenue dashboard fetched successfully"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/payments": {
            get: {
                tags: ["Payments"],
                operationId: "listPayments",
                summary: "List payments with filtering and pagination",
                description: "Returns ID-only payment rows, supports search over payment id/clientId/projectId/source/notes, payment status dropdown, and from/to date filtering. Date filters accept YYYY-MM-DD, ISO dates, or timestamp strings.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("Page"), parameterRef("Limit8"), parameterRef("Search"), parameterRef("PaymentStatus"), parameterRef("FromDate"), parameterRef("ToDate")],
                responses: {
                    200: successResponse("Payments returned.", {
                        type: "object",
                        properties: {
                            payments: { type: "array", items: ref("Payment") },
                            pagination: ref("Pagination")
                        }
                    }, {
                        payments: [examples.payment],
                        pagination: { page: 1, limit: 8, total: 1, totalPages: 1 }
                    }, "Fetch payments success"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            post: {
                tags: ["Payments"],
                operationId: "createPayment",
                summary: "Create a payment",
                description: "Admin-only. Creates an ID-only payment and logs a payment.created activity. clientId and projectId are required, must exist, and must match project ownership when the project has a clientId. The payment document does not store client or project names.",
                security: [{ cookieAuth: [] }],
                requestBody: jsonRequestBody("CreatePaymentRequest", {
                    clientId: examples.clientId,
                    projectId: examples.projectId,
                    amount: 15000,
                    status: "Paid",
                    date: "2026-04-10",
                    source: "Website",
                    notes: "April milestone payment"
                }, "Payment payload. Use required IDs, status dropdown, and flexible date input."),
                responses: {
                    201: successResponse("Payment created.", {
                        type: "object",
                        properties: { payment: ref("Payment") }
                    }, { payment: examples.payment }, "Payment created successfully", 201),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Client or project referenced by the payload was not found.", 404, "Client not found"),
                    409: errorResponse("Project/client mismatch.", 409, "Project does not belong to supplied client"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/payments/{paymentId}": {
            get: {
                tags: ["Payments"],
                operationId: "getPayment",
                summary: "Get a payment",
                description: "Returns one formatted payment by id.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("PaymentIdPath")],
                responses: {
                    200: successResponse("Payment returned.", {
                        type: "object",
                        properties: { payment: ref("Payment") }
                    }, { payment: examples.payment }, "Fetch payment success"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Payment not found.", 404, "Payment not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            patch: {
                tags: ["Payments"],
                operationId: "updatePayment",
                summary: "Update a payment",
                description: "Admin-only partial update. The backend verifies the existing payment first, validates provided fields, validates the effective clientId/projectId references, rejects project/client mismatches, and logs payment.updated. Name and alias fields are not accepted.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("PaymentIdPath")],
                requestBody: jsonRequestBody("UpdatePaymentRequest", {
                    status: "Pending",
                    amount: 18000,
                    notes: "Awaiting bank confirmation."
                }, "Payment patch payload. All fields are optional."),
                responses: {
                    200: successResponse("Payment updated.", {
                        type: "object",
                        properties: { payment: ref("Payment") }
                    }, { payment: { ...examples.payment, status: "Pending", amount: 18000, notes: "Awaiting bank confirmation." } }, "Payment updated successfully"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Payment, client, or project not found.", 404, "Payment not found"),
                    409: errorResponse("Project/client mismatch.", 409, "Project does not belong to supplied client"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            delete: {
                tags: ["Payments"],
                operationId: "deletePayment",
                summary: "Delete a payment",
                description: "Admin-only. Deletes a payment and logs payment.deleted.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("PaymentIdPath")],
                responses: {
                    200: emptySuccessResponse("Payment deleted.", "Payment deleted successfully"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Payment not found.", 404, "Payment not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/clients/stats": {
            get: {
                tags: ["Clients"],
                operationId: "getClientStats",
                summary: "Get client dashboard metrics cards",
                description: "Returns aggregate client counts for total, active, inactive, and lead clients.",
                security: [{ cookieAuth: [] }],
                responses: {
                    200: successResponse("Client stats returned.", ref("ClientStats"), {
                        totalClients: 30,
                        activeClients: 21,
                        inactiveClients: 2,
                        leadClients: 7
                    }, "Fetch client stats success"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/clients": {
            get: {
                tags: ["Clients"],
                operationId: "listClients",
                summary: "List clients with optional status and pagination",
                description: "Returns formatted client summary cards with assigned manager names. The status query uses the client status enum dropdown.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ClientStatus"), parameterRef("Page"), parameterRef("Limit10")],
                responses: {
                    200: successResponse("Clients returned.", {
                        type: "object",
                        properties: {
                            clients: { type: "array", items: ref("ClientSummary") },
                            pagination: ref("Pagination")
                        }
                    }, {
                        clients: [examples.clientSummary],
                        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
                    }, "Fetch clients success"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            post: {
                tags: ["Clients"],
                operationId: "createClient",
                summary: "Create a new client",
                description: "Admin-only. Creates a client, verifies assignedStaffId when provided, logs client.created, and records an analytics event.",
                security: [{ cookieAuth: [] }],
                requestBody: jsonRequestBody("CreateClientRequest", {
                    fullName: "Jane Doe",
                    companyName: "Acme Corporation",
                    email: "jane.doe@acme.example",
                    phone: "+2348012345678",
                    status: "Lead",
                    tags: ["enterprise", "fintech"],
                    assignedStaffId: examples.userId,
                    leadSource: "Referral",
                    notes: "Met at Lagos Tech Summit."
                }, "Client creation payload. status is a dropdown and defaults to Lead."),
                responses: {
                    201: successResponse("Client added successfully.", {
                        type: "object",
                        properties: { client: ref("ClientSummary") }
                    }, { client: examples.clientSummary }, "Client added successfully", 201),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("assignedStaffId does not match an existing user.", 404, "Assigned staff member not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/clients/{id}": {
            get: {
                tags: ["Clients"],
                operationId: "getClientById",
                summary: "Get detailed client profile",
                description: "Returns one client profile with contact details, status, tags, assignment, lead source, notes, counts, and timestamps.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ClientIdPath")],
                responses: {
                    200: successResponse("Client details returned.", {
                        type: "object",
                        properties: { client: ref("ClientDetail") }
                    }, { client: examples.clientDetail }, "Fetch client details success"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Client not found.", 404, "Client not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            patch: {
                tags: ["Clients"],
                operationId: "updateClient",
                summary: "Update an individual client",
                description: "Admin-only partial update. If assignedStaffId is provided, it must match an existing user.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ClientIdPath")],
                requestBody: jsonRequestBody("UpdateClientRequest", {
                    status: "Active",
                    tags: ["enterprise", "priority"],
                    notes: "Updated after discovery call."
                }, "Client patch payload. All fields are optional."),
                responses: {
                    200: emptySuccessResponse("Client updated successfully.", "Client updated successfully"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Client or assigned staff member not found.", 404, "Client not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            delete: {
                tags: ["Clients"],
                operationId: "deleteClient",
                summary: "Delete an individual client",
                description: "Admin-only. Deletes a client profile and logs client.deleted.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ClientIdPath")],
                responses: {
                    200: emptySuccessResponse("Client deleted successfully.", "Client profile successfully deleted"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Client not found.", 404, "Client not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/projects/stats": {
            get: {
                tags: ["Projects"],
                operationId: "getProjectStats",
                summary: "Get project counts by status",
                description: "Returns project totals by status for project overview cards.",
                security: [{ cookieAuth: [] }],
                responses: {
                    200: successResponse("Project stats returned.", {
                        type: "object",
                        properties: { stats: ref("ProjectStats") }
                    }, { stats: { total: 24, planned: 4, inProgress: 10, onHold: 2, completed: 7, cancelled: 1 } }, "Fetch project stats success"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/projects": {
            get: {
                tags: ["Projects"],
                operationId: "listProjects",
                summary: "List projects",
                description: "Returns paginated projects with optional status filter and an infoData object containing global project counts. Project progress is derived from linked tasks.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("Page"), parameterRef("Limit10"), parameterRef("ProjectStatus")],
                responses: {
                    200: successResponse("Projects returned.", {
                        type: "object",
                        properties: {
                            projects: { type: "array", items: ref("Project") },
                            pagination: ref("Pagination"),
                            infoData: ref("ProjectInfoData")
                        }
                    }, {
                        projects: [examples.project],
                        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
                        infoData: { totalProjects: 24, totalInProgress: 10, totalInReview: 3, totalCompleted: 7 }
                    }, "Fetch projects success"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            post: {
                tags: ["Projects"],
                operationId: "createProject",
                summary: "Create a new project",
                description: "Admin-only. Creates a project after verifying clientId and teamIds. Do not include progress; project progress is derived from linked task completion and will be rejected.",
                security: [{ cookieAuth: [] }],
                requestBody: jsonRequestBody("CreateProjectRequest", {
                    name: "Website Redesign",
                    clientId: examples.clientId,
                    description: "Refresh website messaging and conversion pages.",
                    deadline: 1775779200000,
                    budget: 45000,
                    priority: "High",
                    status: "Planned",
                    teamIds: [examples.userId],
                    files: []
                }, "Project creation payload. priority and status are dropdowns."),
                responses: {
                    201: successResponse("Project created successfully.", {
                        type: "object",
                        properties: { project: ref("Project") }
                    }, { project: examples.project }, "Project created successfully", 201),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Client or one or more team members not found.", 404, "Client not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/projects/{projectId}": {
            get: {
                tags: ["Projects"],
                operationId: "getProjectById",
                summary: "Get project details",
                description: "Returns full project details including comments, resolved client where available, team IDs, files, and task-derived progress/status fields.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ProjectIdPath")],
                responses: {
                    200: successResponse("Project details returned.", {
                        type: "object",
                        properties: { project: ref("ProjectDetail") }
                    }, { project: { ...examples.project, comments: [examples.comment] } }, "Fetch project success"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Project not found.", 404, "Project not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            patch: {
                tags: ["Projects"],
                operationId: "patchProject",
                summary: "Partially update a project",
                description: "Admin-only partial update using the project model schema. clientId and teamIds are verified when provided. progress is rejected because it is derived.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ProjectIdPath")],
                requestBody: jsonRequestBody("UpdateProjectRequest", {
                    status: "InProgress",
                    priority: "Urgent",
                    budget: 50000,
                    teamIds: [examples.userId, examples.adminUserId]
                }, "Project patch payload. All fields are optional."),
                responses: {
                    200: successResponse("Project updated successfully.", {
                        type: "object",
                        properties: { project: ref("Project") }
                    }, { project: { ...examples.project, priority: "Urgent", budget: 50000 } }, "Project updated successfully"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Project, client, or one or more team members not found.", 404, "Project not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            put: {
                tags: ["Projects"],
                operationId: "updateProjectFinancialsAndStatus",
                summary: "Update project status, assignees, and budget",
                description: "Admin-only update route for legacy fields, status, assignees, and budget.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ProjectIdPath")],
                requestBody: jsonRequestBody("UpdateProjectFinancialRequest", {
                    status: "Completed",
                    budget: 45000
                }, "Project status/budget update payload."),
                responses: {
                    200: emptySuccessResponse("Project updated successfully.", "Project updated successfully"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Project or assignee not found.", 404, "Project not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            delete: {
                tags: ["Projects"],
                operationId: "deleteProject",
                summary: "Delete a project",
                description: "Admin-only. Deletes a project and cascades deletion to linked tasks and project comments so no orphan task records remain accessible. The route returns 204 No Content on success.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ProjectIdPath")],
                responses: {
                    204: noContentResponse("Project deleted successfully. No response body."),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Project not found.", 404, "Project not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/projects/{projectId}/comments": {
            get: {
                tags: ["Projects"],
                operationId: "listProjectComments",
                summary: "Get comments for a project",
                description: "Verifies the project exists, then returns all comments associated with that project.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ProjectIdPath")],
                responses: {
                    200: successResponse("Project comments returned.", {
                        type: "object",
                        properties: { comments: { type: "array", items: ref("Comment") } }
                    }, { comments: [examples.comment] }, "Fetch comments success"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Project not found.", 404, "Project not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            post: {
                tags: ["Projects"],
                operationId: "addProjectComment",
                summary: "Add a comment to a project",
                description: "Adds a comment authored by the authenticated user's userId. The route returns 204 No Content when the comment is created.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ProjectIdPath")],
                requestBody: jsonRequestBody("CreateProjectCommentRequest", { comment: "Client approved the revised brand direction." }, "Comment payload."),
                responses: {
                    204: noContentResponse("Comment added successfully. No response body."),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Project not found.", 404, "Project not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/projects/{projectId}/files": {
            get: {
                tags: ["Projects"],
                operationId: "listProjectFiles",
                summary: "Get files for a project",
                description: "Verifies the project exists, then returns paginated files associated with that project.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ProjectIdPath"), parameterRef("Page"), parameterRef("MediaFileLimit")],
                responses: {
                    200: successResponse("Project files returned.", {
                        type: "object",
                        properties: {
                            files: { type: "array", items: ref("MediaFile") },
                            pagination: ref("Pagination")
                        }
                    }, {
                        files: [examples.mediaFile],
                        pagination: { page: 1, limit: 100, total: 1, totalPages: 1 }
                    }, "Fetch project files success"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Project not found.", 404, "Project not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            post: {
                tags: ["Projects"],
                operationId: "uploadProjectFile",
                summary: "Upload a file to a project",
                description: "Uploads a file via multipart/form-data, stores it in the configured storage provider, and links it to the specified project.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ProjectIdPath")],
                requestBody: {
                    required: true,
                    description: "Multipart payload with the file to upload.",
                    content: {
                        "multipart/form-data": {
                            schema: {
                                type: "object",
                                required: ["file"],
                                properties: {
                                    file: { type: "string", format: "binary", description: "The file to upload. Maximum size is configured by the server (default 50MB)." }
                                }
                            }
                        }
                    }
                },
                responses: {
                    201: successResponse("Project file uploaded successfully.", {
                        type: "object",
                        properties: { file: ref("MediaFile") }
                    }, { file: examples.mediaFile }, "Project file uploaded successfully", 201),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Project not found.", 404, "Project not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/projects/{projectId}/files/{fileId}": {
            delete: {
                tags: ["Projects"],
                operationId: "deleteProjectFile",
                summary: "Delete a file from a project",
                description: "Deletes a specific file from a project and removes it from the storage provider.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ProjectIdPath"), parameterRef("FileIdPath")],
                responses: {
                    200: successResponse("Project file deleted successfully.", {
                        type: "object",
                        properties: { id: { type: "string", example: examples.fileId } }
                    }, { id: examples.fileId }, "Project file deleted successfully"),
                    400: errorResponse("File does not belong to this project.", 400, "File does not belong to this project"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Project or file not found.", 404, "Project not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/tasks": {
            get: {
                tags: ["Tasks"],
                operationId: "listTasks",
                summary: "List tasks with filtering and pagination",
                description: "Returns task cards with derived isOverdue. Supports status, assigneeId/assignedTo, projectId, page, and limit filters.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("TaskStatus"), parameterRef("AssigneeId"), parameterRef("AssignedTo"), parameterRef("ProjectIdQuery"), parameterRef("Page"), parameterRef("Limit20")],
                responses: {
                    200: successResponse("Tasks returned.", {
                        type: "object",
                        properties: {
                            tasks: { type: "array", items: ref("Task") },
                            pagination: ref("Pagination")
                        }
                    }, {
                        tasks: [examples.task],
                        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
                    }, "Tasks fetched successfully"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            post: {
                tags: ["Tasks"],
                operationId: "createTask",
                summary: "Create a new task",
                description: "Admin-only. Creates a task after verifying assigneeId and optional projectId. Logs task.created and records an analytics event.",
                security: [{ cookieAuth: [] }],
                requestBody: jsonRequestBody("CreateTaskRequest", {
                    title: "Prepare launch checklist",
                    description: "Confirm copy, analytics, redirects, and deployment plan.",
                    assigneeId: examples.userId,
                    dueDate: 1775779200000,
                    status: "Todo",
                    projectId: examples.projectId,
                    priority: "high"
                }, "Task creation payload. status and priority render as dropdowns."),
                responses: {
                    201: successResponse("Task created successfully.", {
                        type: "object",
                        properties: { task: ref("Task") }
                    }, { task: examples.task }, "Task created successfully", 201),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Assignee or project not found.", 404, "Assignee not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/tasks/{taskId}": {
            get: {
                tags: ["Tasks"],
                operationId: "getTaskById",
                summary: "Get full task details by ID",
                description: "Returns task details by ID with isOverdue derived at request time. The database helper may include related assignee/project detail objects.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("TaskIdPath")],
                responses: {
                    200: successResponse("Task details returned.", {
                        type: "object",
                        properties: { task: ref("TaskDetail") }
                    }, { task: examples.task }, "Task details fetched successfully"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Task not found.", 404, "Task not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            patch: {
                tags: ["Tasks"],
                operationId: "updateTask",
                summary: "Partially update a task",
                description: "Admin-only partial update. Verifies task exists and validates optional assignee/project references before writing changes.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("TaskIdPath")],
                requestBody: jsonRequestBody("UpdateTaskRequest", {
                    status: "Review",
                    priority: "medium",
                    description: "Add QA sign-off and analytics verification."
                }, "Task patch payload. All fields are optional."),
                responses: {
                    200: emptySuccessResponse("Task updated successfully.", "Task updated successfully"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Task, assignee, or project not found.", 404, "Task not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            delete: {
                tags: ["Tasks"],
                operationId: "deleteTask",
                summary: "Delete a task",
                description: "Admin-only. Deletes a task and logs task.deleted.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("TaskIdPath")],
                responses: {
                    200: emptySuccessResponse("Task deleted successfully.", "Task deleted successfully"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Task not found.", 404, "Task not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/members": {
            get: {
                tags: ["Members"],
                operationId: "listMembers",
                summary: "List staff members",
                description: "Admin-only. Returns paginated staff accounts. Password hashes are never returned.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("Page"), parameterRef("Limit10"), parameterRef("Search")],
                responses: {
                    200: successResponse("Staff members returned.", {
                        type: "object",
                        properties: {
                            members: { type: "array", items: ref("Member") },
                            pagination: ref("Pagination")
                        }
                    }, {
                        members: [examples.member],
                        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
                    }, "Staff members fetched successfully"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            post: {
                tags: ["Members"],
                operationId: "createMember",
                summary: "Add a new staff member",
                description: "Admin-only. Creates a new Atlas-auth user account with a hashed password. The admin remains logged in; no cookie is set for the newly created member.",
                security: [{ cookieAuth: [] }],
                requestBody: jsonRequestBody("CreateMemberRequest", {
                    firstName: "Ada",
                    lastName: "Okafor",
                    email: "ada.okafor@atlas.example",
                    phone: "+2348012345678",
                    password: "StrongPass123",
                    role: "staff",
                    job: "Account Manager",
                    status: "active"
                }, "New staff member payload. role renders as a dropdown."),
                responses: {
                    201: successResponse("Member added successfully.", {
                        type: "object",
                        properties: { user: ref("Member") }
                    }, { user: examples.member }, "Member added successfully", 201),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    409: errorResponse("A member with this email already exists.", 409, "A member with this email already exists"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/members/{id}/password": {
            put: {
                tags: ["Members"],
                operationId: "changeMemberPassword",
                summary: "Change a member password",
                description: "Admin-only. Changes the password for an existing staff, manager, or admin user. The backend validates the password, hashes it with bcrypt, clears the target user's session stamp to revoke existing auth cookies, and never returns the password hash.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("MemberIdPath")],
                requestBody: jsonRequestBody("AdminChangeMemberPasswordRequest", {
                    password: "NewStrongPass123"
                }, "New password for the target member. Minimum length is 8 characters."),
                responses: {
                    200: emptySuccessResponse("Member password updated successfully.", "Member password updated successfully"),
                    400: errorResponse("Invalid password or unsupported target role.", 400, "Invalid password data.", ["Password must be at least 8 characters"]),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Member not found.", 404, "Member not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/members/{id}/picture": {
            put: {
                tags: ["Members"],
                operationId: "updateMemberPicture",
                summary: "Upload or replace a staff member's profile picture",
                description: "Admin-only member profile picture upload. Uses multipart/form-data field name picture. Only JPEG, PNG, and WebP are accepted; replacing a picture deletes the previous Cloudinary asset when a public ID is stored.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("MemberIdPath")],
                requestBody: {
                    required: true,
                    description: "Multipart payload with one strict image file.",
                    content: {
                        "multipart/form-data": {
                            schema: {
                                type: "object",
                                required: ["picture"],
                                properties: {
                                    picture: { type: "string", format: "binary", description: "JPEG, PNG, or WebP image only. Maximum size is 5 MB." }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: successResponse("Member picture updated.", {
                        type: "object",
                        properties: { member: ref("Member") }
                    }, { member: { ...examples.member, avatarUrl: examples.userProfile.avatarUrl } }, "Member picture updated successfully"),
                    400: errorResponse("Missing file or unsupported image type/content.", 400, "Profile picture must be a JPEG, PNG, or WebP image"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Member not found.", 404, "Member not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/members/{id}": {
            patch: {
                tags: ["Members"],
                operationId: "updateMember",
                summary: "Update a staff member",
                description: "Admin-only. Updates profile/admin fields for a staff account. The actual Express routes use :id for update and :memberId for delete; both map to this same URL shape.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("MemberIdPath")],
                requestBody: jsonRequestBody("UpdateMemberRequest", {
                    phone: "+2348012345678",
                    role: "admin",
                    job: "Operations Lead",
                    status: "active"
                }, "Staff member patch payload. role renders as a dropdown."),
                responses: {
                    200: emptySuccessResponse("Member updated successfully.", "Member updated successfully"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Member not found.", 404, "Member not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            delete: {
                tags: ["Members"],
                operationId: "deleteMember",
                summary: "Remove a staff member",
                description: "Admin-only. Deletes a staff user by userId.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("MemberIdPath")],
                responses: {
                    200: emptySuccessResponse("Staff account removed successfully.", "Staff member removed successfully"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Staff member not found.", 404, "Staff member not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/media/images/all": {
            get: {
                tags: ["Media"],
                operationId: "listMediaImages",
                summary: "List image resources",
                description: "Returns uploaded image IDs and URLs. If a stored URL is missing, the backend falls back to /api/media/images/{id}.",
                security: [{ cookieAuth: [] }],
                responses: {
                    200: successResponse("Media images returned.", {
                        type: "object",
                        properties: { images: { type: "array", items: ref("MediaImage") } }
                    }, { images: [examples.mediaImage] }, "Fetch media success"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/media/images/{imageId}": {
            get: {
                tags: ["Media"],
                operationId: "redirectToMediaImage",
                summary: "Fetch image by ID",
                description: "Looks up an image record and redirects to the stored provider URL. This endpoint returns 302 instead of a JSON envelope on success.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ImageIdPath")],
                responses: {
                    302: redirectResponse("Redirect to image URL."),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Image ID not found.", 404, "Image Id not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/media/images/new": {
            post: {
                tags: ["Media"],
                operationId: "uploadMediaImage",
                summary: "Upload a new image",
                description: "Uploads one image file to the configured provider using multipart/form-data field name image. The multer middleware allows image/* files up to 10 MB.",
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    description: "Multipart payload with one image file.",
                    content: {
                        "multipart/form-data": {
                            schema: {
                                type: "object",
                                required: ["image"],
                                properties: {
                                    image: { type: "string", format: "binary", description: "Image file. Must have an image/* MIME type and be <= 10 MB." }
                                }
                            }
                        }
                    }
                },
                responses: {
                    201: successResponse("Image uploaded successfully.", ref("MediaImage"), examples.mediaImage, "Image uploaded successfully", 201),
                    400: errorResponse("No image file uploaded or invalid file type/size.", 400, "No image file uploaded"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/media/images/{imageId}/replace": {
            put: {
                tags: ["Media"],
                operationId: "replaceMediaImage",
                summary: "Replace an existing image",
                description: "Uploads a replacement image, deletes the old provider resource when a public_id exists, and updates the stored image URL.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("ImageIdPath")],
                requestBody: {
                    required: true,
                    description: "Multipart payload with replacement image file.",
                    content: {
                        "multipart/form-data": {
                            schema: {
                                type: "object",
                                required: ["image"],
                                properties: {
                                    image: { type: "string", format: "binary", description: "Replacement image file. Must have an image/* MIME type and be <= 10 MB." }
                                }
                            }
                        }
                    }
                },
                responses: {
                    200: successResponse("Image replaced successfully.", ref("MediaImage"), examples.mediaImage, "Image replaced successfully"),
                    400: errorResponse("No image file uploaded or invalid file type/size.", 400, "No image file uploaded"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Image ID not found.", 404, "Image Id not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/media/files": {
            get: {
                tags: ["Media"],
                operationId: "listMediaFiles",
                summary: "List media file metadata",
                description: "Returns uploaded and registered media file metadata. Response URLs are direct provider/HTTPS URLs; the backend does not proxy file bytes.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("Page"), parameterRef("MediaFileLimit"), parameterRef("MediaFileType")],
                responses: {
                    200: successResponse("Media files returned.", {
                        type: "object",
                        properties: {
                            files: { type: "array", items: ref("MediaFile") },
                            pagination: ref("Pagination")
                        }
                    }, { files: [examples.mediaFile], pagination: { page: 1, limit: 100, total: 1, totalPages: 1 } }, "Fetch media files success"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            post: {
                tags: ["Media"],
                operationId: "uploadMediaFile",
                summary: "Upload a general media file",
                description: "Uploads one general file to Cloudinary using multipart/form-data field name file. Cloudinary resource_type auto is used, and the response stores/returns the direct secure URL.",
                security: [{ cookieAuth: [] }],
                requestBody: {
                    required: true,
                    description: "Multipart payload with one file.",
                    content: {
                        "multipart/form-data": {
                            schema: {
                                type: "object",
                                required: ["file"],
                                properties: {
                                    file: { type: "string", format: "binary", description: "Any general file accepted by Cloudinary auto upload. Maximum size is 25 MB." }
                                }
                            }
                        }
                    }
                },
                responses: {
                    201: successResponse("File uploaded successfully.", {
                        type: "object",
                        properties: { file: ref("MediaFile"), url: { type: "string", format: "uri" } }
                    }, { file: examples.mediaFile, url: examples.mediaFile.url }, "File uploaded successfully", 201),
                    400: errorResponse("No file uploaded or invalid file metadata.", 400, "No file uploaded"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/media/files/url": {
            post: {
                tags: ["Media"],
                operationId: "registerMediaFileUrl",
                summary: "Register an HTTPS file URL",
                description: "Registers an existing HTTPS file URL without uploading a binary. The URL is returned directly in later metadata responses.",
                security: [{ cookieAuth: [] }],
                requestBody: jsonRequestBody("RegisterMediaFileUrlRequest", {
                    url: "https://cdn.example.com/files/company-presentation.pdf",
                    fileName: "company-presentation.pdf",
                    type: "document",
                    mimeType: "application/pdf",
                    sizeBytes: 1024000
                }, "HTTPS file URL metadata."),
                responses: {
                    201: successResponse("File URL registered successfully.", {
                        type: "object",
                        properties: { file: ref("MediaFile"), url: { type: "string", format: "uri" } }
                    }, { file: { ...examples.mediaFile, storageProvider: "other", publicId: null, resourceType: null }, url: "https://cdn.example.com/files/company-presentation.pdf" }, "File URL registered successfully", 201),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/media/files/{fileId}": {
            get: {
                tags: ["Media"],
                operationId: "getMediaFile",
                summary: "Get media file metadata",
                description: "Returns metadata for one file plus its direct URL. The backend does not proxy file bytes.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("FileIdPath")],
                responses: {
                    200: successResponse("Media file returned.", {
                        type: "object",
                        properties: { file: ref("MediaFile"), url: { type: "string", format: "uri" } }
                    }, { file: examples.mediaFile, url: examples.mediaFile.url }, "Fetch media file success"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("File ID not found.", 404, "File Id not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            delete: {
                tags: ["Media"],
                operationId: "deleteMediaFile",
                summary: "Delete a media file",
                description: "Deletes media file metadata and deletes the Cloudinary asset when a publicId/resourceType is stored.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("FileIdPath")],
                responses: {
                    200: successResponse("File deleted successfully.", {
                        type: "object",
                        properties: { id: { type: "string", example: examples.fileId } }
                    }, { id: examples.fileId }, "File deleted successfully"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("File ID not found.", 404, "File Id not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/blog": {
            get: {
                tags: ["Blog"],
                operationId: "listBlogPosts",
                summary: "List blog posts",
                description: "Authenticated route. Returns paginated blog posts with optional status, category, and text search filters.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("Page"), parameterRef("Limit10"), parameterRef("BlogStatus"), parameterRef("BlogCategory"), parameterRef("Search")],
                responses: {
                    200: successResponse("Blog posts returned.", {
                        type: "object",
                        properties: {
                            posts: { type: "array", items: ref("BlogPost") },
                            pagination: ref("Pagination")
                        }
                    }, {
                        posts: [examples.blogPost],
                        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
                    }, "Fetch blog posts success"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            post: {
                tags: ["Blog"],
                operationId: "createBlogPost",
                summary: "Create a new blog post",
                description: "Admin-only. Creates a blog post, generates slug server-side from title, verifies authorId, rejects duplicate generated slugs, and sets publishedAt automatically when status is published.",
                security: [{ cookieAuth: [] }],
                requestBody: jsonRequestBody("CreateBlogPostRequest", {
                    title: "Getting Started with Digital Marketing",
                    excerpt: "A practical guide to building your digital marketing strategy from the ground up.",
                    content: "## Introduction\nDigital marketing works best when goals, channels, and measurement are aligned.",
                    category: "Marketing",
                    authorId: examples.userId,
                    tags: ["marketing", "digital", "strategy"],
                    status: "draft",
                    isFeatured: false
                }, "Blog post payload. category and status are dropdowns."),
                responses: {
                    201: successResponse("Blog post created.", {
                        type: "object",
                        properties: { post: ref("BlogPost") }
                    }, { post: examples.blogPost }, "Blog post created", 201),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Author not found.", 404, "Author not found"),
                    409: errorResponse("Slug conflict.", 409, "A post with this slug already exists. Try a different title."),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/blog/stats": {
            get: {
                tags: ["Blog"],
                operationId: "getBlogStats",
                summary: "Get aggregate blog stats",
                description: "Authenticated route. Returns total, published, draft, scheduled, and total view counts.",
                security: [{ cookieAuth: [] }],
                responses: {
                    200: successResponse("Blog statistics returned.", ref("BlogStats"), {
                        total: 42,
                        published: 28,
                        draft: 10,
                        scheduled: 4,
                        totalViews: 38000
                    }, "Fetch blog stats success"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/blog/{postId}": {
            get: {
                tags: ["Blog"],
                operationId: "getBlogPostById",
                summary: "Get a single blog post by ID",
                description: "Authenticated route.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("PostIdPath")],
                responses: {
                    200: successResponse("Blog post returned.", {
                        type: "object",
                        properties: { post: ref("BlogPost") }
                    }, { post: examples.blogPost }, "Fetch blog post success"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Blog post not found.", 404, "Blog post not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            put: {
                tags: ["Blog"],
                operationId: "updateBlogPost",
                summary: "Update a blog post",
                description: "Admin-only. Updates a post. Client-sent slug is ignored; when title changes, a new slug is generated server-side from title. Publishing an unpublished post sets publishedAt automatically.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("PostIdPath")],
                requestBody: jsonRequestBody("UpdateBlogPostRequest", {
                    title: "10 SEO Tips for 2026",
                    category: "SEO",
                    status: "published",
                    isFeatured: true,
                    tags: ["SEO", "Marketing"]
                }, "Blog post update payload. All fields are optional."),
                responses: {
                    200: successResponse("Blog post updated.", {
                        type: "object",
                        properties: { post: ref("BlogPost") }
                    }, { post: { ...examples.blogPost, title: "10 SEO Tips for 2026", category: "SEO" } }, "Blog post updated"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Blog post not found.", 404, "Blog post not found"),
                    409: errorResponse("Slug conflict.", 409, "A post with this slug already exists."),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            delete: {
                tags: ["Blog"],
                operationId: "deleteBlogPost",
                summary: "Delete a blog post",
                description: "Admin-only. Deletes a blog post by id.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("PostIdPath")],
                responses: {
                    200: emptySuccessResponse("Blog post deleted.", "Blog post deleted"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Blog post not found.", 404, "Blog post not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/blog/track/{slug}": {
            post: {
                tags: ["Blog"],
                operationId: "trackBlogView",
                summary: "Increment view count for an embedded post",
                description: "Public endpoint used by the embed page. Requires a short-lived signed tracking token generated by /embed/{slug}. Invalid, expired, or replayed tokens are accepted with success but do not increment views.",
                parameters: [parameterRef("BlogSlugPath")],
                requestBody: jsonRequestBody("TrackBlogViewRequest", { token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.track-token" }, "Tracking token payload."),
                responses: {
                    200: emptySuccessResponse("Accepted. View is counted only when token is valid.", "Request successful"),
                    400: errorResponse("Invalid slug.", 400, "Invalid slug"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/embed/{slug}": {
            get: {
                tags: ["Blog"],
                operationId: "getBlogEmbedPage",
                summary: "Serve rendered HTML embed page for a published blog post",
                description: "Public route. Returns a standalone HTML page suitable for iframes. The route renders Markdown content, generates a short-lived tracking token, injects the tracking script, and sets frame/CORS headers for embedding.",
                parameters: [parameterRef("BlogSlugPath")],
                responses: {
                    200: htmlResponse("Rendered HTML embed page."),
                    404: htmlResponse("Post not found, unpublished, or slug format invalid.", "<p>Post not found.</p>"),
                    500: htmlResponse("Unexpected render error.", "<p>An error occurred.</p>"),
                    503: htmlResponse("Embed template file is missing or unavailable.", "<p>Service temporarily unavailable.</p>")
                }
            }
        },
        "/api/notifications": {
            get: {
                tags: ["Notifications"],
                operationId: "listNotifications",
                summary: "Fetch notifications",
                description: "Returns the signed-in user's notifications with pagination and optional unread-only filtering.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("Page"), parameterRef("Limit20"), parameterRef("NotificationUnreadOnly")],
                responses: {
                    200: successResponse("Notifications returned.", {
                        type: "object",
                        properties: {
                            notifications: { type: "array", items: ref("Notification") },
                            totalCount: { type: "integer", minimum: 0, example: 1 },
                            unreadCount: { type: "integer", minimum: 0, example: 0 },
                            currentPage: { type: "integer", minimum: 1, example: 1 },
                            totalPages: { type: "integer", minimum: 0, example: 1 }
                        }
                    }, {
                        notifications: [examples.notification],
                        totalCount: 1,
                        unreadCount: 0,
                        currentPage: 1,
                        totalPages: 1
                    }, "Notifications fetched successfully"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/notifications/preferences": {
            get: {
                tags: ["Notifications"],
                operationId: "getNotificationPreferences",
                summary: "Fetch notification preferences for the current user",
                description: "Returns the authenticated user's notification type toggles.",
                security: [{ cookieAuth: [] }],
                responses: {
                    200: successResponse("Notification preferences returned.", {
                        type: "object",
                        properties: {
                            preferences: ref("NotificationPreferences")
                        }
                    }, { preferences: Object.fromEntries(enumValues.notificationTypes.map((type) => [type, true])) }, "Notification preferences fetched successfully"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            put: {
                tags: ["Notifications"],
                operationId: "updateNotificationPreferences",
                summary: "Update notification preferences for the current user",
                description: "Updates the authenticated user's notification type toggles. Omitted types keep their current value.",
                security: [{ cookieAuth: [] }],
                requestBody: jsonRequestBody("UpdateNotificationPreferencesRequest", {
                    TASK_ASSIGNMENT: false,
                    PROJECT_STATUS_CHANGE: true
                }, "Per-user notification preference toggles. Send only the types to change."),
                responses: {
                    200: successResponse("Notification preferences updated.", {
                        type: "object",
                        properties: {
                            preferences: ref("NotificationPreferences")
                        }
                    }, {
                        preferences: {
                            ...Object.fromEntries(enumValues.notificationTypes.map((type) => [type, true])),
                            TASK_ASSIGNMENT: false
                        }
                    }, "Notification preferences updated successfully"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/notifications/read-all": {
            put: {
                tags: ["Notifications"],
                operationId: "markAllNotificationsAsRead",
                summary: "Mark all notifications as read",
                description: "Marks the signed-in user's unread notifications as read.",
                security: [{ cookieAuth: [] }],
                responses: {
                    200: successResponse("Notifications updated.", {
                        type: "object",
                        properties: {
                            modifiedCount: { type: "integer", minimum: 0, example: 3 }
                        }
                    }, { modifiedCount: 3 }, "Notifications marked as read successfully"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/notifications/{id}/read": {
            put: {
                tags: ["Notifications"],
                operationId: "markNotificationAsRead",
                summary: "Mark a notification as read",
                description: "Marks one notification as read for the signed-in user.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("NotificationIdPath")],
                responses: {
                    200: successResponse("Notification updated.", {
                        type: "object",
                        properties: {
                            notification: ref("Notification")
                        }
                    }, { notification: examples.notification }, "Notification marked as read"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Notification not found.", 404, "Notification not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/leads": {
            get: {
                tags: ["Leads"],
                operationId: "listLeads",
                summary: "List leads",
                description: "Returns paginated leads with optional search and status filtering.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("Page"), parameterRef("Limit10"), parameterRef("Search"), parameterRef("LeadStatus")],
                responses: {
                    200: successResponse("Leads returned.", {
                        type: "object",
                        additionalProperties: true,
                        properties: {
                            leads: { type: "array", items: ref("Lead") },
                            pagination: ref("Pagination")
                        }
                    }, {
                        leads: [examples.lead],
                        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 }
                    }, "Leads fetched successfully"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            post: {
                tags: ["Leads"],
                operationId: "createLead",
                summary: "Add a new lead",
                description: "Admin-only. Creates a new lead from dashboard input. Public lead ingestion should use the bearer-token protected webhook routes.",
                security: [{ cookieAuth: [] }],
                requestBody: jsonRequestBody("CreateLeadRequest", {
                    firstName: "Kemi",
                    lastName: "Adebayo",
                    fullName: "Kemi Adebayo",
                    email: "kemi@brightfoods.example",
                    phone: "+2348098765432",
                    company: "Bright Foods Ltd",
                    status: "new",
                    stage: "New Inquiry",
                    source: "Website",
                    value: 25000,
                    notes: "Interested in brand strategy and paid ads."
                }, "Lead creation payload. status renders as a dropdown."),
                responses: {
                    201: successResponse("Lead added successfully.", {
                        type: "object",
                        properties: { lead: ref("Lead") }
                    }, { lead: examples.lead }, "Lead added successfully", 201),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/leads/{leadId}": {
            get: {
                tags: ["Leads"],
                operationId: "getLeadById",
                summary: "Get detailed lead information",
                description: "Returns one lead by id.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("LeadIdPath")],
                responses: {
                    200: successResponse("Lead detail returned.", {
                        type: "object",
                        properties: { lead: ref("Lead") }
                    }, { lead: examples.lead }, "Lead details fetched successfully"),
                    401: responseRef("Unauthorized"),
                    404: errorResponse("Lead not found.", 404, "Lead not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            patch: {
                tags: ["Leads"],
                operationId: "updateLead",
                summary: "Update an individual lead",
                description: "Admin-only partial lead update. Validates provided fields and sets updatedAt.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("LeadIdPath")],
                requestBody: jsonRequestBody("UpdateLeadRequest", {
                    status: "contacted",
                    stage: "Discovery Call",
                    value: 30000,
                    notes: "Call scheduled for next week."
                }, "Lead patch payload. All fields are optional."),
                responses: {
                    200: emptySuccessResponse("Lead updated successfully.", "Lead updated successfully"),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Lead not found.", 404, "Lead not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            },
            delete: {
                tags: ["Leads"],
                operationId: "deleteLead",
                summary: "Delete an individual lead",
                description: "Admin-only. Deletes a lead by id.",
                security: [{ cookieAuth: [] }],
                parameters: [parameterRef("LeadIdPath")],
                responses: {
                    200: emptySuccessResponse("Lead deleted successfully.", "Lead deleted successfully"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    404: errorResponse("Lead not found.", 404, "Lead not found"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/health": {
            get: {
                tags: ["Health"],
                operationId: "getHealth",
                summary: "Basic health check endpoint",
                description: "Public endpoint. The route emits success, message, timestamp, and uptime, but the /api JSON normalizer keeps the standard envelope and data:null.",
                responses: {
                    200: emptySuccessResponse("Service is healthy.", "Atlas Admin Server is healthy")
                }
            }
        },
        "/api/health/redis/flush": {
            post: {
                tags: ["Health"],
                operationId: "flushRedisDatabase",
                summary: "Flush Redis database",
                description: "Admin-only maintenance endpoint. Clears the active Redis database using FLUSHDB. Intended for controlled maintenance operations only.",
                security: [{ cookieAuth: [] }],
                responses: {
                    200: emptySuccessResponse("Redis database flushed successfully.", "Redis database flushed successfully"),
                    401: responseRef("Unauthorized"),
                    403: responseRef("Forbidden"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError"),
                    503: errorResponse("Redis client is not connected.", 503, "Redis is not connected")
                }
            }
        },
        "/api/webhooks/leads/qualified": {
            post: {
                tags: ["Webhooks"],
                operationId: "ingestQualifiedLeadWebhook",
                summary: "Ingest qualified lead webhook",
                description: "Bearer-token protected public ingestion route. Converts name into firstName/lastName, stores a qualified lead with source quote_request, and places service/budget/details in notes.",
                security: [{ webhookBearer: [] }],
                requestBody: jsonRequestBody("QualifiedWebhookLeadRequest", {
                    form_type: "quote_request",
                    name: "Kemi Adebayo",
                    email: "kemi@brightfoods.example",
                    phone: "+2348098765432",
                    service: "Growth Marketing",
                    budget: "$10,000 - $25,000",
                    details: "We need help launching a new food product line."
                }, "Qualified lead webhook payload."),
                responses: {
                    201: emptySuccessResponse("Lead received and stored.", "Lead received", 201),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/webhooks/leads/general": {
            post: {
                tags: ["Webhooks"],
                operationId: "ingestGeneralLeadWebhook",
                summary: "Ingest general lead webhook",
                description: "Bearer-token protected public ingestion route. Converts name into firstName/lastName, stores a new lead with source book_a_call, and places service/budget/challenge in notes.",
                security: [{ webhookBearer: [] }],
                requestBody: jsonRequestBody("GeneralWebhookLeadRequest", {
                    name: "Tunde Bello",
                    email: "tunde@northstar.example",
                    phone: "+2348011122233",
                    business: "Northstar Logistics",
                    service: "Brand Strategy",
                    challenge: "Low lead quality from current campaigns.",
                    budget: "$5,000 - $10,000"
                }, "General lead webhook payload."),
                responses: {
                    201: emptySuccessResponse("Lead received and stored.", "Lead received", 201),
                    400: responseRef("BadRequest"),
                    401: responseRef("Unauthorized"),
                    429: responseRef("TooManyRequests"),
                    500: responseRef("ServerError")
                }
            }
        },
        "/api/docs": {
            get: {
                tags: ["Docs"],
                operationId: "getSwaggerUi",
                summary: "Open Swagger UI",
                description: "Serves the interactive Swagger UI configured in server.js. Authorization persistence is enabled in Swagger UI options.",
                responses: {
                    200: htmlResponse("Swagger UI HTML application.", "<html><body>Swagger UI</body></html>")
                }
            }
        },
        "/api/docs.json": {
            get: {
                tags: ["Docs"],
                operationId: "getOpenApiJson",
                summary: "Get raw OpenAPI specification",
                description: "Returns this OpenAPI specification as application/json. This route bypasses response-envelope normalization.",
                responses: {
                    200: {
                        description: "OpenAPI specification JSON.",
                        content: {
                            "application/json": {
                                schema: { type: "object", additionalProperties: true },
                                example: {
                                    openapi: "3.0.3",
                                    info: { title: "Atlas Admin Dashboard Backend API", version: "1.0.0" },
                                    paths: { "/api/auth/login": { post: { summary: "Login user" } } }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};

module.exports = swaggerSpec;
