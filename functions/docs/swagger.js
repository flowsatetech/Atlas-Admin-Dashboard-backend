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
                ErrorResponse: {
                    type: "object",
                    properties: {
                        success: { type: "boolean", example: false },
                        message: { type: "string", example: "An unknown error occured" }
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
                    summary: "Create a user (super admin only)",
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
