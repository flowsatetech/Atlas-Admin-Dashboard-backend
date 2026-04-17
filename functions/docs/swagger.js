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
- **Admin** — users with \`admin\` or \`superAdmin\` role (create/update/delete operations).
- **Super Admin** — \`superAdmin\` role only.

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
                    description: "Requires an active admin/superAdmin session (cookieAuth). Creates the user but does NOT set a cookie for the new user — the admin's session is preserved.",
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
                        401: { description: "Invalid session" }
                    }
                }
            },
            "/api/dashboard/general/info": {
                get: {
                    tags: ["Dashboard"],
                    summary: "Get dashboard overview info",
                    security: [{ cookieAuth: [] }],
                    responses: {
                        200: { description: "Dashboard info returned" }
                    }
                }
            },
            "/api/clients/all": {
                get: {
                    tags: ["Clients"],
                    summary: "List all clients",
                    security: [{ cookieAuth: [] }],
                    responses: {
                        200: { description: "Fetch clients success" }
                    }
                }
            },
            "/api/clients/new": {
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
                                    required: ["name"],
                                    properties: {
                                        name: { type: "string" }
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
