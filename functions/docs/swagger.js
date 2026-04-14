const swaggerJSDoc = require("swagger-jsdoc");

const serverUrl = process.env.SERVER_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const options = {
    definition: {
        openapi: "3.0.3",
        info: {
            title: "Atlas Africa Backend API",
            version: "1.0.0",
            description: "API documentation for Atlas Africa admin backend."
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
                    name: "auth_token"
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
                        status: { type: "string", example: "error" },
                        code: { type: "integer", example: 400 },
                        data: { nullable: true, example: null },
                        message: { type: "string", example: "Request failed" }
                    },
                    required: ["status", "code", "data", "message"]
                }
            },
            responses: {
                BadRequest: {
                    description: "Bad request / validation error",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: { status: "error", code: 400, data: null, message: "Invalid query parameters" }
                        }
                    }
                },
                Unauthorized: {
                    description: "Unauthorized",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: { status: "error", code: 401, data: null, message: "Access denied. Please sign in." }
                        }
                    }
                },
                Forbidden: {
                    description: "Forbidden",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: { status: "error", code: 403, data: null, message: "Access denied." }
                        }
                    }
                },
                NotFound: {
                    description: "Resource not found",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: { status: "error", code: 404, data: null, message: "Resource not found" }
                        }
                    }
                },
                TooManyRequests: {
                    description: "Too many requests",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: { status: "error", code: 429, data: null, message: "Too many requests. Please slow down." }
                        }
                    }
                },
                ServerError: {
                    description: "Internal server error",
                    content: {
                        "application/json": {
                            schema: { $ref: "#/components/schemas/ErrorResponse" },
                            example: { status: "error", code: 500, data: null, message: "Request failed" }
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
                                        rememberMe: { type: "boolean" }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: "Signed in successfully" },
                        400: { description: "Validation error" },
                        401: { description: "Invalid email or password" }
                    }
                }
            },
            "/api/auth/signup": {
                post: {
                    tags: ["Auth"],
                    summary: "Create a user",
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
                                        password: { type: "string", minLength: 8 },
                                        rememberMe: { type: "boolean" }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        201: { description: "Account created successfully" },
                        403: { description: "Forbidden" }
                    }
                }
            },
            "/api/auth/logout": {
                post: {
                    tags: ["Auth"],
                    summary: "Logout user",
                    security: [{ cookieAuth: [] }],
                    responses: {
                        200: { description: "Logged out successfully" }
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
                        401: { description: "Invalid session" }
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
                                        success: true,
                                        data: {
                                            totalClients: { value: 2550, changePct: 12.5, direction: "up", compareLabel: "Vs last month" },
                                            activeProjects: { value: 140, changePct: 8.2, direction: "up", compareLabel: "Vs last month" },
                                            pendingTasks: { value: 65, changePct: -3.5, direction: "down", compareLabel: "Vs last month" },
                                            newLeads: { value: 200, changePct: 12.5, direction: "up", compareLabel: "Vs last month" }
                                        }
                                    }
                                }
                            }
                        }
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
                                        success: true,
                                        data: {
                                            period: "6months",
                                            labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
                                            revenueSeries: [20, 36, 54, 50, 72, 56],
                                            newClientSeries: [16, 23, 34, 27, 42, 34]
                                        }
                                    }
                                }
                            }
                        }
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
                                        success: true,
                                        data: {
                                            projects: [
                                                { id: "p1", name: "Brand Strategy", clientName: "Rivera Group", statusLabel: "Finishing", progress: 92 },
                                                { id: "p2", name: "Market Analysis", clientName: "Apex Group", statusLabel: "On Track", progress: 60 }
                                            ],
                                            totalActiveProjects: 4
                                        }
                                    }
                                }
                            }
                        }
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
                                        success: true,
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
                                        }
                                    }
                                }
                            }
                        }
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
                                        success: true,
                                        data: {
                                            websiteVisitors: { value: 35000, changePct: 15, direction: "up" },
                                            pageViews: { value: 78222, changePct: 15, direction: "up" },
                                            conversionRate: { value: 7.6, changePct: -1.2, direction: "down" },
                                            topTrafficSource: { name: "Google", changePct: 8, direction: "up" }
                                        }
                                    }
                                }
                            }
                        }
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
                        200: { description: "Traffic overview returned" }
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
                        200: { description: "Traffic sources returned" }
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
                        200: { description: "Campaign performance returned" }
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
                                        success: true,
                                        data: {
                                            distribution: [
                                                { label: "Page Views", value: 78540 },
                                                { label: "Website Visitors", value: 35280 },
                                                { label: "Leads", value: 4820 },
                                                { label: "Customers", value: 690 }
                                            ]
                                        }
                                    }
                                }
                            }
                        }
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
                        200: { description: "Fetch clients success" }
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
                        403: { description: "Admins only" }
                    }
                }
            },
            "/api/projects/all": {
                get: {
                    tags: ["Projects"],
                    summary: "List all projects",
                    security: [{ cookieAuth: [] }],
                    responses: {
                        200: { description: "Fetch projects success" }
                    }
                }
            },
            "/api/projects/new": {
                post: {
                    tags: ["Projects"],
                    summary: "Create a new project",
                    security: [{ cookieAuth: [] }],
                    requestBody: {
                        required: true,
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    required: ["name", "client", "dueTime", "assignees"],
                                    properties: {
                                        name: { type: "string" },
                                        client: { type: "string" },
                                        dueTime: { type: "number" },
                                        assignees: {
                                            type: "array",
                                            items: { type: "string" }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: "Project added successfully" },
                        403: { description: "Admins only" }
                    }
                }
            },
            "/api/members/all": {
                get: {
                    tags: ["Members"],
                    summary: "List all members",
                    security: [{ cookieAuth: [] }],
                    responses: {
                        200: { description: "Fetch members success" }
                    }
                }
            },
            "/api/media/images/all": {
                get: {
                    tags: ["Media"],
                    summary: "List image resources",
                    security: [{ cookieAuth: [] }],
                    responses: {
                        200: { description: "Fetch media images success" }
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
                        404: { description: "Image not found" }
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
                        200: { description: "Image uploaded successfully" }
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
                        200: { description: "Image replaced successfully" }
                    }
                }
            },
            "/api/media/strings/all": {
                get: {
                    tags: ["Media"],
                    summary: "List all media strings",
                    security: [{ cookieAuth: [] }],
                    responses: {
                        200: { description: "Fetch media strings success" }
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
                        200: { description: "Add media string success" }
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
                        200: { description: "Replace media string success" }
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
                        404: { description: "String not found" }
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
