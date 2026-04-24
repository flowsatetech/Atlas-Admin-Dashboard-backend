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

module.exports = {
    userRoleEnum,
    userSchema,
    createUserSchema,
    updateUserSchema
};
