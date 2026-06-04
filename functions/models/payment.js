const { z, baseEntityFields } = require("./common");

const paymentStatusEnum = z.enum(["Paid", "Pending", "Failed", "Cancelled"]);

const emptyStringToNull = (value) => (value === "" ? null : value);
const requiredIdSchema = z.string().trim().min(1);
const nullableStringInputSchema = z.preprocess(emptyStringToNull, z.string().trim().nullable());
const nullableStringSchema = nullableStringInputSchema.default(null);

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
  clientId: requiredIdSchema,
  projectId: requiredIdSchema,
  amount: z.coerce.number().positive(),
  status: paymentStatusEnum.default("Pending"),
  date: dateInputSchema,
  source: nullableStringSchema,
  notes: z.string().default(""),
}).strict();

const createPaymentSchema = z.object({
  clientId: requiredIdSchema,
  projectId: requiredIdSchema,
  amount: z.coerce.number().positive(),
  status: paymentStatusEnum.default("Pending"),
  date: dateInputSchema,
  source: nullableStringSchema,
  notes: z.string().default(""),
}).strict();

const updatePaymentSchema = z.object({
  clientId: requiredIdSchema.optional(),
  projectId: requiredIdSchema.optional(),
  amount: z.coerce.number().positive().optional(),
  status: paymentStatusEnum.optional(),
  date: dateInputSchema.optional(),
  source: nullableStringInputSchema.optional(),
  notes: z.string().optional(),
}).strict();

module.exports = {
  paymentStatusEnum,
  paymentSchema,
  createPaymentSchema,
  updatePaymentSchema,
};
