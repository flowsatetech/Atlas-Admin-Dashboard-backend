const { z, baseEntityFields } = require("./common");

const userRoleEnum = z.enum(["admin", "manager", "staff", "viewer"]);

const userSchema = z.object({
    ...baseEntityFields,
    fullName: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.email(),
    role: userRoleEnum.default("staff"),
    avatarUrl: z.string().url().nullable().default(null),
    authProvider: z.enum(["atlas", "google"]).default("atlas"),
    passwordHash: z.string().min(1).nullable().default(null),
    stamp: z.string().nullable().default(null),
    lastLogin: z.number().int().nonnegative().nullable().default(null)
});

const createUserSchema = userSchema.omit({
    createdAt: true,
    updatedAt: true
});

const updateUserSchema = createUserSchema.partial();

const loginSchema = z.object({
    email: z.email(),
    password: z.string().min(8),
    rememberMe: z.boolean().optional(),
});

const createMemberSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['admin', 'staff']),
    job: z.string().optional(),
});

const updateMemberSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    role: z.enum(['admin', 'staff']).optional(),
    job: z.string().optional(),
    status: z.string().optional(),
});

module.exports = {
    userRoleEnum,
    userSchema,
    createUserSchema,
    updateUserSchema,
    loginSchema,
    createMemberSchema,
    updateMemberSchema,
};
