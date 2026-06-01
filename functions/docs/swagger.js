const swaggerJSDoc = require("swagger-jsdoc");

const serverUrl = process.env.SERVER_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const options = {
    definition: {
        openapi: "3.0.3",
        info: {
            title: "Atlas Africa Backend API",
            version: "1.0.0",
            description: `API documentation for the Atlas Africa admin backend.

**Authentication:** All protected routes require a valid \`auth_token\` HttpOnly cookie (set on login). In production the cookie is \`Secure\` and \`SameSite=Strict\`; in local development it uses localhost-friendly settings. The token stamp is verified against the database on every request for server-side session revocation.

**Authorization Levels:**
- **Authenticated** — any logged-in user.
- **Admin** — users with \`admin\` role (create/update/delete operations).

**Pagination:** List endpoints accept \`page\` (default 1) and \`limit\` (default 10, max 100) query params. Responses include a \`pagination\` object.

**Related entities:** Project list/detail responses include resolved \`client\` details alongside \`clientId\`. Other related entities are stored and returned as IDs (e.g. \`teamIds\`, \`authorId\`). Resolve via their respective endpoints.

**Blog responses:** Blog endpoints omit MongoDB internal \`_id\` fields from response payloads.

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
                ProjectClient: {
                    type: "object",
                    nullable: true,
                    description: "Resolved client details for project responses. Null when the referenced client cannot be found.",
                    properties: {
                        id: { type: "string" },
                        fullName: { type: "string" },
                        companyName: { type: "string" },
                        email: { type: "string", format: "email" },
                        phone: { type: "string" },
                        status: { type: "string", enum: ["Lead", "Active", "Inactive", "Archived"] },
                        tags: { type: "array", items: { type: "string" } },
                        assignedStaffId: { type: "string", nullable: true },
                        leadSource: { type: "string", nullable: true },
                        notes: { type: "string" },
                        projectsCount: { type: "integer" },
                        createdAt: { type: "integer" },
                        updatedAt: { type: "integer" }
                    }
                },
                Project: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        clientId: { type: "string" },
                        client: { "$ref": "#/components/schemas/ProjectClient" },
                        description: { type: "string" },
                        deadline: { type: "integer" },
                        budget: { type: "number" },
                        priority: { type: "string", enum: ["Low", "Medium", "High", "Urgent"] },
                        status: { type: "string", enum: ["Planned", "InProgress", "OnHold", "Completed", "Cancelled"], description: "Derived from linked task completion unless the project is OnHold or Cancelled. Automatically becomes Completed when all linked tasks are Done." },
                        teamIds: { type: "array", items: { type: "string" } },
                        totalTasks: { type: "integer", minimum: 0, description: "Number of tasks linked to this project." },
                        completedTasks: { type: "integer", minimum: 0, description: "Number of linked tasks with status Done." },
                        progress: { type: "integer", minimum: 0, maximum: 100, description: "Task-completion percentage derived as completedTasks / totalTasks * 100. This value is not manually settable." },
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
                },
                BlogPost: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        title: { type: "string" },
                        slug: { type: "string" },
                        excerpt: { type: "string" },
                        content: { type: "string", description: "HTML content of the post" },
                        category: { type: "string", enum: ["Marketing", "SEO", "Branding", "Social Media", "Content Marketing", "Email Marketing", "Other"] },
                        authorId: { type: "string" },
                        tags: { type: "array", items: { type: "string" } },
                        status: { type: "string", enum: ["draft", "published", "scheduled"] },
                        isFeatured: { type: "boolean" },
                        views: { type: "integer", minimum: 0 },
                        publishedAt: { type: "integer", nullable: true },
                        scheduledAt: { type: "integer", nullable: true },
                        createdAt: { type: "integer" },
                        updatedAt: { type: "integer" }
                    }
                },
                CreateBlogPostBody: {
                    type: "object",
                    required: ["title", "excerpt", "category", "authorId", "status"],
                    properties: {
                        title: { type: "string", example: "Getting Started with Digital Marketing" },
                        slug: { type: "string", description: "Optional — auto-generated from title if omitted", example: "getting-started-with-digital-marketing" },
                        excerpt: { type: "string", example: "A practical guide to building your digital marketing strategy from the ground up." },
                        content: { type: "string", description: "Body content of the post.", example: "Digital marketing encompasses all marketing efforts that use the internet or an electronic device." },
                        category: { type: "string", enum: ["Marketing", "SEO", "Branding", "Social Media", "Content Marketing", "Email Marketing", "Other"], example: "Marketing" },
                        authorId: { type: "string", description: "userId of an existing user. Must match a user in the database.", example: "2854abb8528fe1806d4a75d4f81035ef" },
                        tags: { type: "array", items: { type: "string" }, example: ["marketing", "digital", "strategy"] },
                        status: { type: "string", enum: ["draft", "published", "scheduled"], example: "draft" },
                        isFeatured: { type: "boolean", default: false, example: false },
                        scheduledAt: { type: "integer", nullable: true, description: "Unix ms timestamp for scheduled publish. Required when status is 'scheduled'.", example: null }
                    },
                    example: {
                        title: "Getting Started with Digital Marketing",
                        excerpt: "A practical guide to building your digital marketing strategy from the ground up.",
                        content: "Digital marketing encompasses all marketing efforts that use the internet or an electronic device.",
                        category: "Marketing",
                        authorId: "2854abb8528fe1806d4a75d4f81035ef",
                        tags: ["marketing", "digital", "strategy"],
                        status: "draft",
                        isFeatured: false
                    }
                },
                UpdateBlogPostBody: {
                    type: "object",
                    properties: {
                        title: { type: "string", example: "10 SEO Tips for 2026" },
                        slug: { type: "string", description: "Optional — auto-generated from title if omitted", example: "10-seo-tips-for-2026" },
                        excerpt: { type: "string", example: "A concise summary of the post." },
                        content: { type: "string", description: "Markdown body content. The backend stores markdown and renders HTML in /embed/{slug}." },
                        category: { type: "string", enum: ["Marketing", "SEO", "Branding", "Social Media", "Content Marketing", "Email Marketing", "Other"] },
                        authorId: { type: "string" },
                        tags: { type: "array", items: { type: "string" }, example: ["SEO", "Marketing"] },
                        status: { type: "string", enum: ["draft", "published", "scheduled"] },
                        isFeatured: { type: "boolean" },
                        scheduledAt: { type: "integer", nullable: true, description: "Unix ms timestamp for scheduled publish" }
                    }
                },
                BlogStats: {
                    type: "object",
                    properties: {
                        total: { type: "integer" },
                        published: { type: "integer" },
                        draft: { type: "integer" },
                        scheduled: { type: "integer" },
                        totalViews: { type: "integer" }
                    }
                }
            },
            responses: {
                BadRequest: {
                    description: "Invalid request parameters",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                code: 400,
                                data: null,
                                message: "Invalid request parameters"
                            }
                        }
                    }
                },
                Unauthorized: {
                    description: "Authentication required or session invalid",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                code: 401,
                                data: null,
                                message: "Access denied. Please sign in."
                            }
                        }
                    }
                },
                Forbidden: {
                    description: "Authenticated user does not have permission",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                code: 403,
                                data: null,
                                message: "Access denied. Admins only."
                            }
                        }
                    }
                },
                NotFound: {
                    description: "Resource not found",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                code: 404,
                                data: null,
                                message: "Resource not found"
                            }
                        }
                    }
                },
                TooManyRequests: {
                    description: "Rate limit exceeded",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                code: 429,
                                data: null,
                                message: "Too many requests. Please slow down."
                            }
                        }
                    }
                },
                ServerError: {
                    description: "Internal server error",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: {
                                status: "error",
                                code: 500,
                                data: null,
                                message: "An unknown error occurred"
                            }
                        }
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
                        200: { description: "Signed in successfully. auth_token cookie is set. Response includes user object with userId, firstName, lastName, email, and role (admin|staff)." },
                        400: { description: "Validation error" },
                        401: { description: "Invalid email or password" },
                        429: { description: "Rate limited (per-email and per-IP)" }
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
                        200: { description: "Fetch profile success. Response includes userId, firstName, lastName, email, and role (admin|staff)." },
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
            "/api/revenue": {
                get: {
                    tags: ["Revenue"],
                    summary: "Get revenue time series",
                    security: [{ cookieAuth: [] }],
                    description: "Returns a revenue time series (labels + values) for the requested period.",
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
                            description: "Revenue series returned",
                            content: {
                                "application/json": {
                                    example: {
                                        status: "success",
                                        code: 200,
                                        data: {
                                            period: "6months",
                                            labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
                                            revenueSeries: [45000, 52000, 48000, 61000, 55000, 68000]
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
            "/api/revenue/dashboard": {
                get: {
                    tags: ["Revenue"],
                    summary: "Get revenue dashboard aggregate data",
                    security: [{ cookieAuth: [] }],
                    description: "Requires `auth_token` cookie. Returns revenue KPI cards, revenue-over-time series, revenue by source, revenue by service, and top clients.",
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
                            description: "Revenue dashboard returned",
                            content: {
                                "application/json": {
                                    example: {
                                        status: "success",
                                        code: 200,
                                        data: {
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
                                                { clientId: "abc", clientName: "Global Solutions", amount: 85000, percentage: 18, logoUrl: null }
                                            ]
                                        },
                                        message: "Revenue dashboard fetched successfully"
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
            "/api/payments": {
                get: {
                    tags: ["Payments"],
                    summary: "List payments with filtering and pagination",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "page", in: "query", required: false, schema: { type: "integer", default: 1, minimum: 1 } },
                        { name: "limit", in: "query", required: false, schema: { type: "integer", default: 8, minimum: 1, maximum: 100 } },
                        { name: "search", in: "query", required: false, schema: { type: "string" } },
                        { name: "status", in: "query", required: false, schema: { type: "string", enum: ["Paid", "Pending", "Failed", "Cancelled"] } },
                        { name: "from", in: "query", required: false, schema: { type: "string", example: "2026-04-01" } },
                        { name: "to", in: "query", required: false, schema: { type: "string", example: "2026-04-30" } }
                    ],
                    responses: {
                        200: {
                            description: "Payments returned",
                            content: {
                                "application/json": {
                                    example: {
                                        status: "success",
                                        code: 200,
                                        data: {
                                            payments: [
                                                {
                                                    id: "pay_123",
                                                    clientId: "client_123",
                                                    client: "Acme Corporation",
                                                    clientName: "Acme Corporation",
                                                    projectId: "project_123",
                                                    project: "Website Redesign",
                                                    projectName: "Website Redesign",
                                                    amount: 15000,
                                                    status: "Paid",
                                                    date: 1775779200000,
                                                    source: "Website",
                                                    notes: "",
                                                    createdAt: 1775600000000,
                                                    updatedAt: 1775600000000
                                                }
                                            ],
                                            pagination: { page: 1, limit: 8, total: 1, totalPages: 1 }
                                        },
                                        message: "Fetch payments success"
                                    }
                                }
                            }
                        },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                },
                post: {
                    tags: ["Payments"],
                    summary: "Create a payment (Admin Only)",
                    security: [{ cookieAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["clientName", "project", "amount", "status", "date"],
                                    properties: {
                                        clientId: { type: "string", nullable: true },
                                        clientName: { type: "string" },
                                        projectId: { type: "string", nullable: true },
                                        project: { type: "string", description: "Alias for projectName" },
                                        projectName: { type: "string" },
                                        amount: { type: "number", minimum: 0 },
                                        status: { type: "string", enum: ["Paid", "Pending", "Failed", "Cancelled"] },
                                        date: { oneOf: [{ type: "integer" }, { type: "string", example: "2026-04-10" }] },
                                        source: { type: "string", nullable: true },
                                        notes: { type: "string" }
                                    }
                                },
                                example: {
                                    clientName: "Acme Corporation",
                                    project: "Website Redesign",
                                    amount: 15000,
                                    status: "Paid",
                                    date: "2026-04-10",
                                    source: "Website",
                                    notes: "April milestone payment"
                                }
                            }
                        }
                    },
                    responses: {
                        201: { description: "Payment created" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        404: { description: "Client or project not found" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/payments/{paymentId}": {
                get: {
                    tags: ["Payments"],
                    summary: "Get a payment",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "paymentId", in: "path", required: true, schema: { type: "string" } }
                    ],
                    responses: {
                        200: { description: "Payment returned" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        404: { description: "Payment not found" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                },
                patch: {
                    tags: ["Payments"],
                    summary: "Update a payment (Admin Only)",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "paymentId", in: "path", required: true, schema: { type: "string" } }
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        clientId: { type: "string", nullable: true },
                                        clientName: { type: "string" },
                                        projectId: { type: "string", nullable: true },
                                        project: { type: "string" },
                                        projectName: { type: "string" },
                                        amount: { type: "number", minimum: 0 },
                                        status: { type: "string", enum: ["Paid", "Pending", "Failed", "Cancelled"] },
                                        date: { oneOf: [{ type: "integer" }, { type: "string", example: "2026-04-10" }] },
                                        source: { type: "string", nullable: true },
                                        notes: { type: "string" }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: "Payment updated" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        403: { description: "Admins only" },
                        404: { description: "Payment, client, or project not found" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                },
                delete: {
                    tags: ["Payments"],
                    summary: "Delete a payment (Admin Only)",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "paymentId", in: "path", required: true, schema: { type: "string" } }
                    ],
                    responses: {
                        200: { description: "Payment deleted" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        403: { description: "Admins only" },
                        404: { description: "Payment not found" },
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
                    summary: "Create a new client (Admin Only)",
                    description: "Creates a new client record. If `assignedStaffId` is provided it must be the `userId` of an existing user.",
                    security: [{ cookieAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["fullName", "companyName", "email", "phone"],
                                    properties: {
                                        fullName: { type: "string", example: "Jane Doe" },
                                        companyName: { type: "string", example: "Acme Corp" },
                                        email: { type: "string", format: "email", example: "jane.doe@acmecorp.com" },
                                        phone: { type: "string", example: "+2348012345678" },
                                        status: { type: "string", enum: ["Lead", "Active", "Inactive", "Archived"], default: "Lead" },
                                        tags: { type: "array", items: { type: "string" }, example: ["enterprise", "fintech"] },
                                        assignedStaffId: { type: "string", nullable: true, description: "userId of an existing staff member", example: null },
                                        leadSource: { type: "string", nullable: true, example: "Referral" },
                                        notes: { type: "string", example: "Met at Lagos Tech Summit" }
                                    },
                                    example: {
                                        fullName: "Jane Doe",
                                        companyName: "Acme Corp",
                                        email: "jane.doe@acmecorp.com",
                                        phone: "+2348012345678",
                                        status: "Lead",
                                        tags: ["enterprise", "fintech"],
                                        leadSource: "Referral",
                                        notes: "Met at Lagos Tech Summit"
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        201: {
                            description: "Client added successfully",
                            content: {
                                "application/json": {
                                    schema: {
                                        type: "object",
                                        properties: {
                                            success: { type: "boolean", example: true },
                                            message: { type: "string", example: "Client added successfully" },
                                            data: {
                                                type: "object",
                                                properties: {
                                                    client: {
                                                        type: "object",
                                                        properties: {
                                                            id: { type: "string" },
                                                            fullName: { type: "string" },
                                                            company: { type: "string" },
                                                            status: { type: "string", enum: ["Lead", "Active", "Inactive", "Archived"] },
                                                            tags: { type: "array", items: { type: "string" } },
                                                            manager: { type: "string", description: "Assigned staff name or 'Unassigned'" },
                                                            projectsCount: { type: "integer", example: 0 }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        403: { $ref: "#/components/responses/Forbidden" },
                        404: { description: "assignedStaffId does not match any existing user", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/projects/stats": {
                get: {
                    tags: ["Projects"],
                    summary: "Get project counts by status",
                    security: [{ cookieAuth: [] }],
                    responses: {
                        200: {
                            description: "Project stats returned",
                            content: {
                                "application/json": {
                                    example: {
                                        status: "success",
                                        code: 200,
                                        data: {
                                            stats: { total: 24, planned: 4, inProgress: 10, onHold: 2, completed: 7, cancelled: 1 }
                                        },
                                        message: "Fetch project stats success"
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
                    description: "Returns full project details including comments, team member IDs, files, resolved client details, and task-derived progress/status.",
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
                    description: "Partial update — all fields optional. The project id cannot be changed. progress is derived from linked task completion and cannot be manually set.",
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
                },
                put: {
                    tags: ["Projects"],
                    summary: "Update project status and financial fields (admin only)",
                    description: "Used to update revenue recognition, assignees, and status. recognizedRevenue and recognizedAt must be provided together and are only allowed when status is Completed. progress is derived from linked task completion and cannot be manually set.",
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
                                        client: { type: "string" },
                                        dueTime: { type: "integer" },
                                        assignees: { type: "array", items: { type: "string" }, description: "Array of user IDs" },
                                        budget: { type: "number", minimum: 0 },
                                        status: { type: "string", enum: ["Planned", "InProgress", "OnHold", "Completed", "Cancelled"] },
                                        recognizedRevenue: { type: "number", minimum: 0, nullable: true },
                                        recognizedAt: { type: "integer", minimum: 0, nullable: true }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: "Project updated successfully" },
                        400: { description: "Validation error or business rule violation" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        403: { $ref: "#/components/responses/Forbidden" },
                        404: { description: "Project not found" },
                        429: { $ref: "#/components/responses/TooManyRequests" }
                    }
                }
            },
            "/api/projects/{projectId}/comments": {
                get: {
                    tags: ["Projects"],
                    summary: "Get comments for a project",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "projectId", in: "path", required: true, schema: { type: "string" } }
                    ],
                    responses: {
                        200: { description: "Comments returned" },
                        404: { description: "Project not found" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                },
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
            "/api/members": {
                get: {
                    tags: ["Members"],
                    summary: "List all staff members (paginated)",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
                        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 10 } },
                        { name: "search", in: "query", required: false, schema: { type: "string" } }
                    ],
                    responses: {
                        200: { description: "Staff members fetched successfully" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                },
                post: {
                    tags: ["Members"],
                    summary: "Add a new staff member (admin only)",
                    description: "Creates a new user account with a hashed password. The admin's session is preserved — no cookie is set for the new member.",
                    security: [{ cookieAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["firstName", "lastName", "email", "password", "role"],
                                    properties: {
                                        firstName: { type: "string" },
                                        lastName: { type: "string" },
                                        email: { type: "string", format: "email" },
                                        password: { type: "string", minLength: 8 },
                                        role: { type: "string", enum: ["admin", "staff"] },
                                        job: { type: "string" }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        201: { description: "Member added successfully" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        409: { description: "A member with this email already exists" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/members/{memberId}": {
                put: {
                    tags: ["Members"],
                    summary: "Update a staff member (admin only)",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "memberId", in: "path", required: true, schema: { type: "string" } }
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        firstName: { type: "string" },
                                        lastName: { type: "string" },
                                        role: { type: "string", enum: ["admin", "staff"], description: "Assign or remove admin privileges" },
                                        job: { type: "string" },
                                        status: { type: "string" }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: "Member updated successfully" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        403: { $ref: "#/components/responses/Forbidden" },
                        404: { description: "Member not found" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                },
                delete: {
                    tags: ["Members"],
                    summary: "Offboard and remove individual staff access account (Admin Only)",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "memberId", in: "path", required: true, schema: { type: "string" }, description: "Unique account identifier token of target staff member" }
                    ],
                    responses: {
                        200: { description: "Staff account removed successfully" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        403: { $ref: "#/components/responses/Forbidden" },
                        404: { description: "Member not found" },
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
            "/api/tasks": {
                get: {
                    tags: ["Tasks"],
                    summary: "List tasks (paginated)",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "status", in: "query", required: false, schema: { type: "string", enum: ["Todo", "InProgress", "Review", "Done", "Blocked"] } },
                        { name: "assigneeId", in: "query", required: false, schema: { type: "string" } },
                        { name: "projectId", in: "query", required: false, schema: { type: "string" } },
                        { name: "page", in: "query", required: false, schema: { type: "integer", minimum: 1, default: 1 } },
                        { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } }
                    ],
                    responses: {
                        200: { description: "Tasks fetched successfully" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        429: { $ref: "#/components/responses/TooManyRequests" }
                    }
                },
                post: {
                    tags: ["Tasks"],
                    summary: "Create a new task (admin only)",
                    security: [{ cookieAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["title", "assigneeId"],
                                    properties: {
                                        title: { type: "string" },
                                        description: { type: "string" },
                                        assigneeId: { type: "string" },
                                        dueDate: { type: "integer" },
                                        status: { type: "string", enum: ["Todo", "InProgress", "Review", "Done", "Blocked"], default: "Todo" },
                                        projectId: { type: "string" },
                                        priority: { type: "string", enum: ["low", "medium", "high"] }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        201: { description: "Task created successfully" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        403: { $ref: "#/components/responses/Forbidden" },
                        404: { description: "Assignee or project not found" },
                        429: { $ref: "#/components/responses/TooManyRequests" }
                    }
                }
            },
            "/api/tasks/{taskId}": {
                get: {
                    tags: ["Tasks"],
                    summary: "Get full task details by ID",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "taskId", in: "path", required: true, schema: { type: "string" } }
                    ],
                    responses: {
                        200: { description: "Task details fetched successfully, including assignee and project objects when available" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        404: { description: "Task not found" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                },
                patch: {
                    tags: ["Tasks"],
                    summary: "Partially update a task (admin only)",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "taskId", in: "path", required: true, schema: { type: "string" } }
                    ],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        title: { type: "string" },
                                        description: { type: "string" },
                                        assigneeId: { type: "string" },
                                        dueDate: { type: "integer" },
                                        status: { type: "string", enum: ["Todo", "InProgress", "Review", "Done", "Blocked"] },
                                        projectId: { type: "string" },
                                        priority: { type: "string", enum: ["low", "medium", "high"] }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: "Task updated successfully" },
                        400: { $ref: "#/components/responses/BadRequest" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        403: { $ref: "#/components/responses/Forbidden" },
                        404: { description: "Task, assignee, or project not found" },
                        429: { $ref: "#/components/responses/TooManyRequests" }
                    }
                },
                delete: {
                    tags: ["Tasks"],
                    summary: "Delete a task (admin only)",
                    security: [{ cookieAuth: [] }],
                    parameters: [
                        { name: "taskId", in: "path", required: true, schema: { type: "string" } }
                    ],
                    responses: {
                        200: { description: "Task deleted successfully" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        403: { $ref: "#/components/responses/Forbidden" },
                        404: { description: "Task not found" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" }
                    }
                }
            },
            "/api/health": {
                get: {
                    tags: ["Health"],
                    summary: "Basic health check endpoint",
                    responses: {
                        200: { description: "Service is healthy" }
                    }
                }
            },
            "/api/health/redis/flush": {
                post: {
                    tags: ["Health"],
                    summary: "Flush Redis cache (admin only)",
                    security: [{ cookieAuth: [] }],
                    description: "Clears the active Redis database using FLUSHDB. Intended for controlled maintenance operations.",
                    responses: {
                        200: { description: "Redis cache flushed successfully" },
                        401: { $ref: "#/components/responses/Unauthorized" },
                        403: { $ref: "#/components/responses/Forbidden" },
                        429: { $ref: "#/components/responses/TooManyRequests" },
                        500: { $ref: "#/components/responses/ServerError" },
                        503: { description: "Redis is not connected" }
                    }
                }
            },
            "/api/blog": {
                "get": {
                    "tags": ["Blog"],
                    "summary": "List blog posts with pagination and optional filters",
                    "security": [{ "cookieAuth": [] }],
                    "parameters": [
                        { "name": "page", "in": "query", "schema": { "type": "integer", "default": 1 } },
                        { "name": "limit", "in": "query", "schema": { "type": "integer", "default": 10, "maximum": 100 } },
                        { "name": "status", "in": "query", "schema": { "type": "string", "enum": ["draft", "published", "scheduled"] } },
                        { "name": "category", "in": "query", "schema": { "type": "string" } },
                        { "name": "search", "in": "query", "schema": { "type": "string" } }
                    ],
                    "responses": {
                        "200": {
                            "description": "Paginated list of blog posts",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "posts": { "type": "array", "items": { "$ref": "#/components/schemas/BlogPost" } },
                                            "pagination": { "$ref": "#/components/schemas/Pagination" }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                "post": {
                    "tags": ["Blog"],
                    "summary": "Create a new blog post (Admin Only)",
                    "description": "Creates a new blog post. `slug` is auto-generated from `title` if omitted. Setting `status` to `published` will automatically set `publishedAt` to the current timestamp. `authorId` must be the `userId` of an existing user.",
                    "security": [{ "cookieAuth": [] }],
                    "requestBody": {
                        "required": true,
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/CreateBlogPostBody" }
                            }
                        }
                    },
                    "responses": {
                        "201": {
                            "description": "Blog post created successfully",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "success": { "type": "boolean", "example": true },
                                            "message": { "type": "string", "example": "Blog post created" },
                                            "data": {
                                                "type": "object",
                                                "properties": {
                                                    "post": { "$ref": "#/components/schemas/BlogPost" }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        "400": { "description": "Validation error — missing or invalid fields", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                        "401": { "description": "Not authenticated — missing or invalid auth_token cookie", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                        "403": { "description": "Forbidden — admin role required", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                        "404": { "description": "Author not found — authorId does not match any existing user", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                        "409": { "description": "Conflict — a post with the same slug already exists", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } },
                        "500": { "description": "Internal server error", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ErrorResponse" } } } }
                    }
                }
            },
            "/api/blog/stats": {
                "get": {
                    "tags": ["Blog"],
                    "summary": "Get aggregate blog stats (total, published, draft, scheduled, totalViews)",
                    "security": [{ "cookieAuth": [] }],
                    "responses": {
                        "200": {
                            "description": "Blog statistics",
                            "content": {
                                "application/json": {
                                    "schema": { "$ref": "#/components/schemas/BlogStats" }
                                }
                            }
                        }
                    }
                }
            },
            "/api/blog/{postId}": {
                "get": {
                    "tags": ["Blog"],
                    "summary": "Get a single blog post by ID",
                    "security": [{ "cookieAuth": [] }],
                    "parameters": [
                        { "name": "postId", "in": "path", "required": true, "schema": { "type": "string" } }
                    ],
                    "responses": {
                        "200": { "description": "Blog post detail", "content": { "application/json": { "schema": { "$ref": "#/components/schemas/BlogPost" } } } },
                        "404": { "description": "Not found" }
                    }
                },
                "put": {
                    "tags": ["Blog"],
                    "summary": "Update a blog post (Admin Only)",
                    "description": "Use this endpoint to update content, set `status` to `published`, or toggle `isFeatured`. It replaces the separate publish/feature routes.",
                    "security": [{ "cookieAuth": [] }],
                    "parameters": [
                        { "name": "postId", "in": "path", "required": true, "schema": { "type": "string" } }
                    ],
                    "requestBody": {
                        "required": true,
                        "content": {
                            "application/json": {
                                "schema": { "$ref": "#/components/schemas/UpdateBlogPostBody" }
                            }
                        }
                    },
                    "responses": {
                        "200": { "description": "Blog post updated" },
                        "404": { "description": "Not found" }
                    }
                },
                "delete": {
                    "tags": ["Blog"],
                    "summary": "Delete a blog post (Admin Only)",
                    "security": [{ "cookieAuth": [] }],
                    "parameters": [
                        { "name": "postId", "in": "path", "required": true, "schema": { "type": "string" } }
                    ],
                    "responses": {
                        "200": { description: "Deleted" },
                        "404": { description: "Not found" }
                    }
                }
            },
            "/api/blog/track/{slug}": {
                "post": {
                    "tags": ["Blog"],
                    "summary": "Increment view count for an embedded post (public, token-protected)",
                    "description": "Public endpoint called by the embed page. Requires a short-lived signed token generated by `/embed/{slug}`. Invalid/expired/replayed tokens are ignored.",
                    "parameters": [
                        { "name": "slug", "in": "path", "required": true, "schema": { "type": "string" } }
                    ],
                    "requestBody": {
                        "required": true,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["token"],
                                    "properties": {
                                        "token": {
                                            "type": "string",
                                            "description": "Short-lived signed token generated by /embed/{slug}."
                                        }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "200": { "description": "Accepted (view counted only when token is valid)" },
                        "429": { "description": "Rate limit exceeded" }
                    }
                }
            },
            "/embed/{slug}": {
                "get": {
                    "tags": ["Blog"],
                    "summary": "Serve a rendered HTML embed page for a published blog post",
                    "description": "Returns a full standalone HTML page suitable for embedding via an `<iframe>`. The page contains a tracking script that POSTs to `/api/blog/track/{slug}` to increment views. CORS and frame-ancestor headers allow embedding on any origin.",
                    "parameters": [
                        { "name": "slug", in: "path", "required": true, "schema": { "type": "string" } }
                    ],
                    "responses": {
                        "200": { "description": "HTML embed page", "content": { "text/html": {} } },
                        "404": { "description": "Post not found or not published" }
                    }
                }
            },
            "/api/leads": {
                "get": {
                    "tags": ["Leads"],
                    "summary": "List all leads (paginated)",
                    "security": [{ "cookieAuth": [] }],
                    "parameters": [
                        { "name": "page", "in": "query", "schema": { "type": "integer", "default": 1 } },
                        { "name": "limit", "in": "query", "schema": { "type": "integer", "default": 10 } },
                        { "name": "search", "in": "query", "schema": { "type": "string" }, "description": "Search by name, email, or company" },
                        { "name": "status", "in": "query", "schema": { "type": "string", "enum": ["new", "contacted", "qualified", "lost"] } }
                    ],
                    "responses": {
                        "200": { "description": "Leads fetched successfully" },
                        "401": { "description": "Unauthorized" }
                    }
                },
                "post": {
                    "tags": ["Leads"],
                    "summary": "Add a new lead",
                    "security": [{ "cookieAuth": [] }],
                    "requestBody": {
                        "required": true,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["firstName", "lastName", "email"],
                                    "properties": {
                                        "firstName": { "type": "string" },
                                        "lastName": { "type": "string" },
                                        "email": { "type": "string", "format": "email" },
                                        "phone": { "type": "string" },
                                        "company": { "type": "string" },
                                        "source": { "type": "string" },
                                        "stage": { "type": "string" },
                                        "contactPerson": { "type": "string" },
                                        "value": { "type": "number" },
                                        "notes": { "type": "string" }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "201": { "description": "Lead added successfully" },
                        "400": { "description": "Invalid request parameters" }
                    }
                }
            },
            "/api/clients/stats": {
                "get": {
                    "tags": ["Clients"],
                    "summary": "Get client dashboard metrics cards",
                    "security": [{ "cookieAuth": [] }],
                    "description": "Requires `auth_token` cookie. Returns total, active, inactive, and lead client metrics totals for frontend KPI card rendering.",
                    "responses": {
                        "200": {
                            "description": "Client cards statistics data returned dynamically",
                            "content": {
                                "application/json": {
                                    "example": {
                                        "status": "success",
                                        "code": 200,
                                        "data": {
                                            "totalClients": 30,
                                            "activeClients": 21,
                                            "inactiveClients": 2,
                                            "leadClients": 7
                                        },
                                        "message": "Request successful"
                                    }
                                }
                            }
                        },
                        "401": { "description": "Unauthorized" },
                        "500": { "description": "Internal server error" }
                    }
                }
            },
            "/api/clients/{id}": {
                "get": {
                    "tags": ["Clients"],
                    "summary": "Get detailed overview of a single client profile entry",
                    "security": [{ "cookieAuth": [] }],
                    "parameters": [
                        { "name": "id", "in": "path", "required": true, "schema": { "type": "string" }, "description": "Unique custom identifier token of target client" }
                    ],
                    "responses": {
                        "200": { "description": "Client data object structures returned smoothly" },
                        "404": { "description": "Client record not found matches target query" }
                    }
                },
                "patch": {
                    "tags": ["Clients"],
                    "summary": "Update parts of an individual client document structure (Admin Only)",
                    "security": [{ "cookieAuth": [] }],
                    "parameters": [
                        { "name": "id", "in": "path", "required": true, "schema": { "type": "string" }, "description": "Unique custom identifier token of target client" }
                    ],
                    "requestBody": {
                        "required": true,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "fullName": { "type": "string" },
                                        "companyName": { "type": "string" },
                                        "status": { "type": "string", "enum": ["Lead", "Active", "Inactive", "Archived"] },
                                        "notes": { "type": "string" }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "200": { "description": "Client mutations saved cleanly and recorded in activity telemetry" },
                        "400": { "description": "Validation schema matching execution constraints failed" },
                        "404": { "description": "Target client record does not exist matching token query" }
                    }
                },
                "delete": {
                    "tags": ["Clients"],
                    "summary": "Delete an individual client document from active ecosystem collection (Admin Only)",
                    "security": [{ "cookieAuth": [] }],
                    "parameters": [
                        { "name": "id", "in": "path", "required": true, "schema": { "type": "string" }, "description": "Unique custom identifier token of target client" }
                    ],
                    "responses": {
                        "200": { "description": "Client profile document fully cleared from the storage tables" },
                        "404": { "description": "Client document profile target verification query failed" }
                    }
                }
            },
            "/api/leads/{leadId}": {
                "get": {
                    "tags": ["Leads"],
                    "summary": "Get detailed pipeline information of an individual lead",
                    "security": [{ "cookieAuth": [] }],
                    "parameters": [
                        { "name": "leadId", "in": "path", "required": true, "schema": { "type": "string" }, "description": "Unique target token identifier of specified lead record" }
                    ],
                    "responses": {
                        "200": { "description": "Lead deep metrics loaded cleanly" },
                        "404": { "description": "Lead entry matching data lookup verification not found" }
                    }
                },
                "patch": {
                    "tags": ["Leads"],
                    "summary": "Modify pipeline characteristics on an individual lead document structure",
                    "security": [{ "cookieAuth": [] }],
                    "parameters": [
                        { "name": "leadId", in: "path", "required": true, "schema": { "type": "string" }, "description": "Unique target token identifier of specified lead record" }
                    ],
                    "requestBody": {
                        "required": true,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "status": { "type": "string", "enum": ["new", "contacted", "qualified", "lost"] },
                                        "stage": { "type": "string" },
                                        "value": { "type": "number" },
                                        "notes": { "type": "string" }
                                    }
                                }
                            }
                        }
                    },
                    "responses": {
                        "200": { description: "Lead mutations verified and merged safely into the collection parameters" },
                        "404": { description: "Lead record mismatch verify parameters on execution failed" }
                    }
                },
                "delete": {
                    "tags": ["Leads"],
                    "summary": "Purge specified lead completely from active CRM pipelines",
                    "security": [{ "cookieAuth": [] }],
                    "parameters": [
                        { "name": "leadId", "in": "path", "required": true, "schema": { "type": "string" }, "description": "Unique target token identifier of specified lead record" }
                    ],
                    "responses": {
                        "200": { "description": "Lead document profile successfully purged from active systems" },
                        "404": { "description": "Lead document match validation check not found" }
                    }
                }
            }
        }
    },
    "apis": []
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
