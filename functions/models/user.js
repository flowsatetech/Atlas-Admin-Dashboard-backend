const { z, baseEntityFields } = require("./common");

const userRoleEnum = z.enum(["admin", "manager", "staff", "viewer"]);

const userSchema = z.object({
    ...baseEntityFields,
    fullName: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.email(),
    phone: z.string().min(3).nullable().default(null),
    role: userRoleEnum.default("staff"),
    avatarUrl: z.string().url().nullable().default(null),
    avatarPublicId: z.string().min(1).nullable().default(null),
    avatarResourceType: z.enum(["image", "video", "raw"]).nullable().default(null),
    authProvider: z.enum(["atlas", "google"]).default("atlas"),
    passwordHash: z.string().min(1).nullable().default(null),
    stamp: z.string().nullable().default(null),
    lastLogin: z.number().int().nonnegative().nullable().default(null),
    notificationPreferences: z.object({
        TASK_ASSIGNMENT: z.boolean().default(true),
        PROJECT_ASSIGNMENT: z.boolean().default(true),
        CLIENT_ASSIGNMENT: z.boolean().default(true),
        LEAD_ASSIGNMENT: z.boolean().default(true),
        COMMENT_MENTION: z.boolean().default(true),
        ROLE_CHANGE: z.boolean().default(true),
        SYSTEM_ALERT: z.boolean().default(true),
        CLIENT_CREATED: z.boolean().default(true),
        PROJECT_STATUS_CHANGE: z.boolean().default(true),
        LEAD_STATUS_CHANGE: z.boolean().default(true),
        PROJECT_COMMENT: z.boolean().default(true),
        PASSWORD_UPDATED: z.boolean().default(true),
    }).optional().default({})
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

const memberStatusEnum = z.enum(['active', 'inactive']);

const createMemberSchema = z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    phone: z.string().min(3, 'Phone number is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: z.enum(['admin', 'staff']),
    job: z.string().optional(),
    status: memberStatusEnum.default('active'),
});

const updateMemberSchema = z.object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().min(3).optional(),
    role: z.enum(['admin', 'staff']).optional(),
    job: z.string().optional(),
    status: memberStatusEnum.optional(),
});

const adminChangeMemberPasswordSchema = z.object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

module.exports = {
    userRoleEnum,
    memberStatusEnum,
    userSchema,
    createUserSchema,
    updateUserSchema,
    loginSchema,
    createMemberSchema,
    updateMemberSchema,
    adminChangeMemberPasswordSchema,
};
