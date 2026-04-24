const swaggerJSDoc = require("swagger-jsdoc");

const serverUrl = process.env.SERVER_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const options = {
    definition: {
        openapi: "3.0.3",
        info: {
            title: "Atlas Africa Backend API",
            version: "1.0.0",
            description: `API documentation for the Atlas Africa admin backend.

**Authentication:** All protected routes require a valid \`auth_token\` HttpOnly cookie (set on login). The cookie is \`Secure\`, \`SameSite=Strict\`, and stamp-verified against the database on every request for server-side session revocation.

**Authorization Levels:**
- **Authenticated** — any logged-in user.
- **Admin** — users with \`admin\` role (create/update/delete operations).

**Pagination:** List endpoints accept \`page\` (default 1) and \`limit\` (default 10, max 100) query params. Responses include a \`pagination\` object.

**ID-only references:** Related entities are stored and returned as IDs (e.g. \`clientId\`, \`teamIds\`, \`authorId\`). Resolve via their respective endpoints.

**Rate Limiting:** All endpoints are rate-limited per-user (authenticated) or per-IP (anonymous). Auth endpoints have stricter limits per-email and per-IP.`
        },
        servers: [
            {
                url: serverUrl
            }
        ],
        components: {
            securitySchemes: {
                cookieAuth: {
                    type: "apiKey",
                    in: "cookie",
                    name: "auth_token",
                    description: "Authenticate by calling POST /api/auth/login with email + password. The server sets an HttpOnly auth_token cookie automatically. All subsequent requests use that cookie."
                }
            },
            schemas: {
                ApiSuccessResponse: {
                    type: "object",
                    properties: {
                        status: { type: "string", example: "success" },
                        code: { type: "integer", example: 200 },
                        data: { nullable: true },
                        message: { type: "string", example: "Request successful" }
                    },
                    required: ["status", "code", "data", "message"]
                },
                ErrorResponse: {
                    type: "object",
                    properties: {
                        success: { type: "boolean", example: false },
                        message: { type: "string", example: "An unknown error occurred" }
                    }
                },
                Pagination: {
                    type: "object",
                    properties: {
                        total: { type: "integer" },
                        page: { type: "integer" },
                        limit: { type: "integer" },
                        totalPages: { type: "integer" }
                    }
                },
                ProjectInfoData: {
                    type: "object",
                    description: "Global project counts — always unfiltered.",
                    properties: {
                        totalProjects: { type: "integer" },
                        totalInProgress: { type: "integer" },
                        totalInReview: { type: "integer" },
                        totalCompleted: { type: "integer" }
                    }
                },
                Project: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        clientId: { type: "string" },
                        description: { type: "string" },
                        deadline: { type: "integer" },
                        budget: { type: "number" },
                        priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"] },
                        status: { type: "string", enum: ["Planned", "InProgress", "OnHold", "Completed", "Cancelled"] },
                        teamIds: { type: "array", items: { type: "string" } },
                        progress: { type: "integer", minimum: 0, maximum: 100 },
                        files: { type: "array", items: { type: "string", format: "uri" } },
                        createdAt: { type: "integer" },
                        updatedAt: { type: "integer" }
                    }
                },
                ProjectDetail: {
                    allOf: [
                        { "$ref": "#/components/schemas/Project" },
                        {
                            type: "object",
                            properties: {
                                comments: {
                                    type: "array",
                                    items: { "$ref": "#/components/schemas/Comment" }
                                }
                            }
                        }
                    ]
                },
                Comment: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        projectId: { type: "string" },
                        authorId: { type: "string" },
                        content: { type: "string" },
                        createdAt: { type: "integer" },
                        updatedAt: { type: "integer" }
                    }
                }
            }
        },
        paths: {
            "/api/auth/login": {
                post: {
                    tags: ["Auth"],
                    summary: "Login user",
                    description: "Authenticates via email/password. Sets an HttpOnly, Secure, SameSite=Strict auth_token cookie. Stamp is stored in DB for server-side session revocation.",
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["email", "password"],
                                    properties: {
                                        email: { type: "string", format: "email" },
                                        password: { type: "string", minLength: 8 },
                                        rememberMe: { type: "boolean", description: "If true, cookie lasts 30 days; otherwise 1 hour." }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: "Signed in successfully. auth_token cookie is set." },
                        400: { description: "Validation error" },
                        401: { description: "Invalid email or password" },
                        429: { description: "Rate limited (per-email and per-IP)" }
                    }
                }
            },
            "/api/auth/signup": {
                post: {
                    tags: ["Auth"],
                    summary: "Create a new user account (admin only)",
                    description: "Requires an active admin session (cookieAuth). Creates the user but does NOT set a cookie for the new user — the admin's session is preserved.",
                    security: [{ cookieAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["firstName", "lastName", "email", "password"],
                                    properties: {
                                        firstName: { type: "string" },
                                        lastName: { type: "string" },
                                        email: { type: "string", format: "email" },
                                        password: { type: "string", minLength: 8 }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        201: { description: "Account created successfully" },
                        400: { description: "Validation error or email already registered" },
                        403: { description: "Admins only" },
                        409: { description: "Email already registered" },
                        429: { description: "Rate limited" }
                    }
                }
            },
            "/api/auth/logout": {
                post: {
                    tags: ["Auth"],
                    summary: "Logout user",
                    description: "Clears auth_token cookie and nullifies the user's stamp in DB, invalidating all sessions.",
                    security: [{ cookieAuth: [] }],
                    responses: {
                        200: { description: "Logged out successfully" },
                        500: { description: "Server error during logout" }
                    }
                }
            },
            "/api/user/profile": {
                get: {
                    tags: ["User"],
                    summary: "Get current user profile",
                    security: [{ cookieAuth: [] }],
                    responses: {
                        200: { description: "Fetch profile success" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/dashboard/metrics": {
                get: {
                    tags: ["Dashboard"],
                    summary: "Get dashboard KPI cards",
                    security: [{ cookieAuth: [] }],
                    description: "Requires `auth_token` cookie. Returns total clients, active projects, pending tasks, and new leads with trend metadata.",
                    responses: {
                        200: {
                            description: "Dashboard metrics returned",
                            content: {
                                "application/json": {
                                    example: {
                                        status: "success",
                                        code: 200,
                                        data: {
                                            totalClients: { value: 2550, changePct: 12.5, direction: "up", compareLabel: "Vs last month" },
                                            activeProjects: { value: 140, changePct: 8.2, direction: "up", compareLabel: "Vs last month" },
                                            pendingTasks: { value: 65, changePct: -3.5, direction: "down", compareLabel: "Vs last month" },
                                            newLeads: { value: 200, changePct: 12.5, direction: "up", compareLabel: "Vs last month" }
                                        },
                                        message: "Request successful"
                                    }
                                }
                            }
                        },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/dashboard/performance": {
                get: {
                    tags: ["Dashboard"],
                    summary: "Get dashboard performance chart data",
                    security: [{ cookieAuth: [] }],
                    description: "Requires `auth_token` cookie. Returns revenue and new-client series grouped by period buckets.",
                    parameters: [
                        {
                            name: "period",
                            in: "query",
                            required: false,
                            schema: { type: "string", enum: ["3months", "6months", "12months"], default: "6months" }
                        }
                    ],
                    responses: {
                        200: {
                            description: "Performance chart data returned",
                            content: {
                                "application/json": {
                                    example: {
                                        status: "success",
                                        code: 200,
                                        data: {
                                            period: "6months",
                                            labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
                                            revenueSeries: [20, 36, 54, 50, 72, 56],
                                            newClientSeries: [16, 23, 34, 27, 42, 34]
                                        },
                                        message: "Request successful"
                                    }
                                }
                            }
                        },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/dashboard/projects/in-progress": {
                get: {
                    tags: ["Dashboard"],
                    summary: "Get in-progress projects widget data",
                    security: [{ cookieAuth: [] }],
                    description: "Requires `auth_token` cookie. Returns active projects with status labels and progress percentages.",
                    parameters: [
                        {
                            name: "limit",
                            in: "query",
                            required: false,
                            schema: { type: "integer", minimum: 1, maximum: 20, default: 4 }
                        }
                    ],
                    responses: {
                        200: {
                            description: "In-progress projects returned",
                            content: {
                                "application/json": {
                                    example: {
                                        status: "success",
                                        code: 200,
                                        data: {
                                            projects: [
                                                { id: "p1", name: "Brand Strategy", clientName: "Rivera Group", statusLabel: "Finishing", progress: 92 },
                                                { id: "p2", name: "Market Analysis", clientName: "Apex Group", statusLabel: "On Track", progress: 60 }
                                            ],
                                            totalActiveProjects: 4
                                        },
                                        message: "Request successful"
                                    }
                                }
                            }
                        },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/dashboard/activities": {
                get: {
                    tags: ["Dashboard"],
                    summary: "Get recent activity feed",
                    security: [{ cookieAuth: [] }],
                    description: "Requires `auth_token` cookie. Returns paginated activity feed for dashboard list.",
                    parameters: [
                        {
                            name: "page",
                            in: "query",
                            required: false,
                            schema: { type: "integer", minimum: 1, default: 1 }
                        },
                        {
                            name: "limit",
                            in: "query",
                            required: false,
                            schema: { type: "integer", minimum: 1, maximum: 50, default: 10 }
                        }
                    ],
                    responses: {
                        200: {
                            description: "Recent activities returned",
                            content: {
                                "application/json": {
                                    example: {
                                        status: "success",
                                        code: 200,
                                        data: {
                                            items: [
                                                {
                                                    id: "a1",
                                                    title: "New Client Added",
                                                    description: "David Paith was added as a new client",
                                                    actorName: "Admin User",
                                                    createdAt: 1713211200000,
                                                    timeAgo: "2 mins ago"
                                                }
                                            ],
                                            pagination: { page: 1, limit: 10, total: 24, totalPages: 3 }
                                        },
                                        message: "Request successful"
                                    }
                                }
                            }
                        },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/analytics/overview": {
                get: {
                    tags: ["Analytics"],
                    summary: "Get analytics overview cards",
                    security: [{ cookieAuth: [] }],
                    description: "Requires `auth_token` cookie. Returns visitors, page views, conversion rate, and top traffic source with trends.",
                    responses: {
                        200: {
                            description: "Analytics overview returned",
                            content: {
                                "application/json": {
                                    example: {
                                        status: "success",
                                        code: 200,
                                        data: {
                                            websiteVisitors: { value: 35000, changePct: 15, direction: "up" },
                                            pageViews: { value: 78222, changePct: 15, direction: "up" },
                                            conversionRate: { value: 7.6, changePct: -1.2, direction: "down" },
                                            topTrafficSource: { name: "Google", changePct: 8, direction: "up" }
                                        },
                                        message: "Request successful"
                                    }
                                }
                            }
                        },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/analytics/traffic": {
                get: {
                    tags: ["Analytics"],
                    summary: "Get analytics traffic time-series",
                    security: [{ cookieAuth: [] }],
                    description: "Requires `auth_token` cookie. Returns visits, page views, and conversion-rate series.",
                    parameters: [
                        {
                            name: "range",
                            in: "query",
                            required: false,
                            schema: { type: "string", enum: ["7d", "30d", "3months", "6months", "12months"], default: "7d" }
                        }
                    ],
                    responses: {
                        200: { description: "Traffic overview returned" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/analytics/sources": {
                get: {
                    tags: ["Analytics"],
                    summary: "Get normalized traffic sources",
                    security: [{ cookieAuth: [] }],
                    description: "Requires `auth_token` cookie. Returns traffic source percentages for source bars.",
                    parameters: [
                        {
                            name: "range",
                            in: "query",
                            required: false,
                            schema: { type: "string", enum: ["7d", "30d", "3months", "6months", "12months"], default: "30d" }
                        }
                    ],
                    responses: {
                        200: { description: "Traffic sources returned" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/analytics/campaigns": {
                get: {
                    tags: ["Analytics"],
                    summary: "Get campaign performance table",
                    security: [{ cookieAuth: [] }],
                    description: "Requires `auth_token` cookie. Returns campaign rows with impressions, clicks, conversions, conversion rate, and pagination.",
                    parameters: [
                        { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
                        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } },
                        { name: "sortBy", in: "query", required: false, schema: { type: "string", enum: ["createdAt", "campaignName", "impressions", "clicks", "conversions", "conversionRate"], default: "createdAt" } },
                        { name: "order", in: "query", required: false, schema: { type: "string", enum: ["asc", "desc"], default: "desc" } }
                    ],
                    responses: {
                        200: { description: "Campaign performance returned" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/analytics/distribution": {
                get: {
                    tags: ["Analytics"],
                    summary: "Get analytics distribution pie data",
                    security: [{ cookieAuth: [] }],
                    description: "Requires `auth_token` cookie. Returns distribution values for pie chart widgets.",
                    responses: {
                        200: {
                            description: "Distribution data returned",
                            content: {
                                "application/json": {
                                    example: {
                                        status: "success",
                                        code: 200,
                                        data: {
                                            distribution: [
                                                { label: "Page Views", value: 78540 },
                                                { label: "Website Visitors", value: 35280 },
                                                { label: "Leads", value: 4820 },
                                                { label: "Customers", value: 690 }
                                            ]
                                        },
                                        message: "Request successful"
                                    }
                                }
                            }
                        },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/clients": {
                get: {
                    tags: ["Clients"],
                    summary: "List clients with optional status and pagination",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        {
                            name: "status",
                            in: "query",
                            required: false,
                            schema: { type: "string", enum: ["Lead", "Active", "Inactive", "Archived"] }
                        },
                        {
                            name: "page",
                            in: "query",
                            required: false,
                            schema: { type: "integer", minimum: 1, default: 1 }
                        },
                        {
                            name: "limit",
                            in: "query",
                            required: false,
                            schema: { type: "integer", minimum: 1, maximum: 100, default: 10 }
                        }
                    ],
                    responses: {
                        200: { description: "Fetch clients success" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                },
                post: {
                    tags: ["Clients"],
                    summary: "Create a new client",
                    security: [{ cookieAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["fullName", "companyName", "email", "phone"],
                                    properties: {
                                        fullName: { type: "string" },
                                        companyName: { type: "string" },
                                        email: { type: "string", format: "email" },
                                        phone: { type: "string" },
                                        status: { type: "string", enum: ["Lead", "Active", "Inactive", "Archived"] },
                                        tags: { type: "array", items: { type: "string" } },
                                        assignedStaffId: { type: "string", nullable: true },
                                        leadSource: { type: "string", nullable: true },
                                        notes: { type: "string" }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        201: { description: "Client added successfully" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        403: { $ref: "#/components/responses/Forbidden" },
                        409: { description: "Conflict (duplicate resource)" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/projects": {
                get: {
                    tags: ["Projects"],
                    summary: "List projects (paginated)",
                    description: "Returns paginated projects with optional status filter. Always includes an infoData object with global (unfiltered) project counts.",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "page", in: "query", schema: { type: "integer", default: 1 } },
                        { name: "limit", in: "query", schema: { type: "integer", default: 10, maximum: 100 } },
                        { name: "status", in: "query", schema: { type: "string", enum: ["Planned", "InProgress", "OnHold", "Completed", "Cancelled"] }, description: "Filter by project status" }
                    ],
                    responses: {
                        200: {
                            description: "Fetch projects success",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: { type: "boolean" },
                                            message: { type: "string" },
                                            data: {
                                                type: "object",
                                                properties: {
                                                    projects: { type: "array", items: { "$ref": "#/components/schemas/Project" } },
                                                    pagination: { "$ref": "#/components/schemas/Pagination" },
                                                    infoData: { "$ref": "#/components/schemas/ProjectInfoData" }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        400: { description: "Invalid query parameters" },
                        401: { description: "Unauthorized" }
                    }
                },
                post: {
                    tags: ["Projects"],
                    summary: "Create a new project (admin only)",
                    security: [{ cookieAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["name", "clientId", "deadline"],
                                    properties: {
                                        name: { type: "string" },
                                        clientId: { type: "string" },
                                        description: { type: "string", default: "" },
                                        deadline: { type: "integer" },
                                        budget: { type: "number", default: 0 },
                                        priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"], default: "Medium" },
                                        status: { type: "string", enum: ["Planned", "InProgress", "OnHold", "Completed", "Cancelled"], default: "Planned" },
                                        teamIds: { type: "array", items: { type: "string" }, default: [] }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        201: {
                            description: "Project created successfully",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: { type: "boolean" },
                                            message: { type: "string" },
                                            data: {
                                                type: "object",
                                                properties: {
                                                    project: { "$ref": "#/components/schemas/Project" }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        400: { description: "Validation error" },
                        403: { description: "Admins only" }
                    }
                }
            },
            "/api/projects/{projectId}": {
                get: {
                    tags: ["Projects"],
                    summary: "Get project details",
                    description: "Returns full project details including comments, team member IDs, and files.",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "projectId", in: "path", required: true, schema: { type: "string" } }
                    ],
                    responses: {
                        200: {
                            description: "Fetch project success",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: { type: "boolean" },
                                            message: { type: "string" },
                                            data: {
                                                type: "object",
                                                properties: {
                                                    project: { "$ref": "#/components/schemas/ProjectDetail" }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        404: { description: "Project not found" }
                    }
                },
                patch: {
                    tags: ["Projects"],
                    summary: "Update a project (admin only)",
                    description: "Partial update — all fields optional. The project id cannot be changed.",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "projectId", in: "path", required: true, schema: { type: "string" } }
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string" },
                                        clientId: { type: "string" },
                                        description: { type: "string" },
                                        deadline: { type: "integer" },
                                        budget: { type: "number" },
                                        priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"] },
                                        status: { type: "string", enum: ["Planned", "InProgress", "OnHold", "Completed", "Cancelled"] },
                                        teamIds: { type: "array", items: { type: "string" } }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: {
                            description: "Project updated successfully",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: { type: "boolean" },
                                            message: { type: "string" },
                                            data: {
                                                type: "object",
                                                properties: {
                                                    project: { "$ref": "#/components/schemas/Project" }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        400: { description: "Invalid update data" },
                        403: { description: "Admins only" },
                        404: { description: "Project not found" }
                    }
                },
                delete: {
                    tags: ["Projects"],
                    summary: "Delete a project (admin only)",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "projectId", in: "path", required: true, schema: { type: "string" } }
                    ],
                    responses: {
                        204: { description: "No content — project deleted" },
                        403: { description: "Admins only" },
                        404: { description: "Project not found" }
                    }
                }
            },
            "/api/projects/{projectId}/comments": {
                post: {
                    tags: ["Projects"],
                    summary: "Add a comment to a project",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "projectId", in: "path", required: true, schema: { type: "string" } }
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["comment"],
                                    properties: {
                                        comment: { type: "string", minLength: 1 }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        204: { description: "No content — comment added" },
                        400: { description: "Comment content is required" },
                        404: { description: "Project not found" }
                    }
                }
            },
            "/api/members/all": {
                get: {
                    tags: ["Members"],
                    summary: "List all members",
                    security: [{ cookieAuth: [] }],
                    responses: {
                        200: { description: "Fetch members success" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/media/images/all": {
                get: {
                    tags: ["Media"],
                    summary: "List image resources",
                    security: [{ cookieAuth: [] }],
                    responses: {
                        200: { description: "Fetch media images success" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/media/images/{imageId}": {
                get: {
                    tags: ["Media"],
                    summary: "Fetch image by ID (redirects to provider URL)",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        {
                            name: "imageId",
                            in: "path",
                            required: true,
                            schema: { type: "string" }
                        }
                    ],
                    responses: {
                        302: { description: "Redirect to image URL" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        404: { $ref: "#/components/responses/NotFound" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/media/images/new": {
                post: {
                    tags: ["Media"],
                    summary: "Upload a new image",
                    security: [{ cookieAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "multipart/form-data": {
                                schema: {
                                    type: "object",
                                    required: ["image"],
                                    properties: {
                                        image: {
                                            type: "string",
                                            format: "binary"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: "Image uploaded successfully" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/media/images/{imageId}/replace": {
                put: {
                    tags: ["Media"],
                    summary: "Replace an existing image",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        {
                            name: "imageId",
                            in: "path",
                            required: true,
                            schema: { type: "string" }
                        }
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            "multipart/form-data": {
                                schema: {
                                    type: "object",
                                    required: ["image"],
                                    properties: {
                                        image: {
                                            type: "string",
                                            format: "binary"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: "Image replaced successfully" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        404: { $ref: "#/components/responses/NotFound" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/media/strings/all": {
                get: {
                    tags: ["Media"],
                    summary: "List all media strings",
                    security: [{ cookieAuth: [] }],
                    responses: {
                        200: { description: "Fetch media strings success" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/media/strings/new": {
                post: {
                    tags: ["Media"],
                    summary: "Create a new media string",
                    security: [{ cookieAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["string"],
                                    properties: {
                                        string: { type: "string" }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: "Add media string success" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/media/strings/{stringId}/replace": {
                put: {
                    tags: ["Media"],
                    summary: "Replace an existing media string",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        {
                            name: "stringId",
                            in: "path",
                            required: true,
                            schema: { type: "string" }
                        }
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["string"],
                                    properties: {
                                        string: { type: "string" }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: "Replace media string success" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        404: { $ref: "#/components/responses/NotFound" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/media/strings/{stringId}": {
                get: {
                    tags: ["Media"],
                    summary: "Get raw media string by ID",
                    parameters: [
                        {
                            name: "stringId",
                            in: "path",
                            required: true,
                            schema: { type: "string" }
                        }
                    ],
                    responses: {
                        200: { description: "Raw string content" },
                        404: { $ref: "#/components/responses/NotFound" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/": {
                get: {
                    tags: ["Health"],
                    summary: "Basic health check endpoint",
                    responses: {
                        200: { description: "Service is healthy" }
                    }
                }
            }
        }
    },
    apis: []
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
