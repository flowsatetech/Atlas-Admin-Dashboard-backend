const { z, baseEntityFields } = require("./common");

const campaignStatSchema = z.object({
    ...baseEntityFields,
    campaignName: z.string().min(1),
    impressions: z.number().int().nonnegative().default(0),
    clicks: z.number().int().nonnegative().default(0),
    conversions: z.number().int().nonnegative().default(0),
    conversionRate: z.number().min(0).max(100).default(0)
});

const createCampaignStatSchema = campaignStatSchema.omit({
    createdAt: true,
    updatedAt: true
});

module.exports = {
    campaignStatSchema,
    createCampaignStatSchema
};
