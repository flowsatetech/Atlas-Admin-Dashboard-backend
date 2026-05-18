const { z } = require('zod');

/**
 * Lead Schema
 * Centralized Zod rules for Lead data validation.
 * Reusable in routes and controllers.
 */
const LeadSchema = z.object({
    firstName: z.string().trim().min(1, "First name is required"),
    lastName: z.string().trim().min(1, "Last name is required"),
    fullName: z.string().trim().optional().or(z.literal('')), 
    email: z.string().trim().email("Invalid email address"),
    phone: z.string().trim().optional().or(z.literal('')),
    company: z.string().trim().optional().or(z.literal('')),
    status: z.enum(['new', 'contacted', 'qualified', 'lost']).default('new'),
    stage: z.string().trim().optional().or(z.literal('')),          
    contactPerson: z.string().trim().optional().or(z.literal('')),  
    value: z.number().optional().default(0),
    source: z.string().trim().optional().or(z.literal('')),
    notes: z.string().trim().optional().or(z.literal('')),
    assignedTo: z.string().trim().optional().or(z.literal('')), // Admin ID
    createdAt: z.string().optional()
});

// For creating a new lead
const CreateLeadSchema = LeadSchema.omit({ createdAt: true });

module.exports = {
    LeadSchema,
    CreateLeadSchema
};