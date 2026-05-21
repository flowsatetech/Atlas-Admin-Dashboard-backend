const { z, baseEntityFields } = require("./common");

const paymentStatusEnum = z.enum(["Paid", "Pending", "Failed", "Cancelled"]);

const dateInputSchema = z.preprocess((value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return value;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
}, z.number().int().nonnegative());

const paymentSchema = z.object({
  ...baseEntityFields,
  clientId: z.string().min(1).nullable().default(null),
  clientName: z.string().min(1),
  projectId: z.string().min(1).nullable().default(null),
  projectName: z.string().min(1),
  amount: z.coerce.number().positive(),
  status: paymentStatusEnum.default("Pending"),
  date: dateInputSchema,
  source: z.string().trim().nullable().default(null),
  notes: z.string().default(""),
});

const createPaymentSchema = paymentSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  project: z.string().min(1).optional(),
});

const updatePaymentSchema = createPaymentSchema.partial();

module.exports = {
  paymentStatusEnum,
  paymentSchema,
  createPaymentSchema,
  updatePaymentSchema,
};
