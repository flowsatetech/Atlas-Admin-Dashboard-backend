const { z, baseEntityFields } = require('./common');

const leadStatusEnum = z.enum(['new', 'discovery', 'qualified', 'proposal', 'won', 'lost']);

const noteEntrySchema = z.object({
    id: z.string().min(1),
    note: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
    createdBy: z.string().nullable().default(null),
});

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
    notesHistory: z.array(noteEntrySchema).optional().default([]),
    assignedTo: z.string().trim().optional().default(''),
});

const createLeadSchema = leadSchema.omit({ id: true, createdAt: true, updatedAt: true });

const updateLeadSchema = createLeadSchema.partial();

const appendNoteSchema = z.object({
    note: z.string().min(1, 'Note content is required'),
});

module.exports = {
    leadStatusEnum,
    noteEntrySchema,
    leadSchema,
    createLeadSchema,
    updateLeadSchema,
    appendNoteSchema,
};