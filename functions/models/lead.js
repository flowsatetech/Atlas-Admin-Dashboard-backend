const { z, baseEntityFields } = require('./common');

const leadStatusEnum = z.enum(['new', 'contacted', 'qualified', 'lost']);

const leadSchema = z.object({
    ...baseEntityFields,
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
    fullName: z.string().trim().optional().default(''),
    email: z.string().trim().email('Invalid email address'),
    phone: z.string().trim().optional().default(''),
    company: z.string().trim().optional().default(''),
    status: leadStatusEnum.default('new'),
    stage: z.string().trim().optional().default(''),
    contactPerson: z.string().trim().optional().default(''),
    value: z.number().nonnegative().optional().default(0),
    source: z.string().trim().optional().default(''),
    notes: z.string().trim().optional().default(''),
    assignedTo: z.string().trim().optional().default(''),
});

const createLeadSchema = leadSchema.omit({ createdAt: true, updatedAt: true });

const updateLeadSchema = createLeadSchema.omit({ id: true }).partial();

module.exports = {
    leadStatusEnum,
    leadSchema,
    createLeadSchema,
    updateLeadSchema,
};