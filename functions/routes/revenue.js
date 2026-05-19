const express = require('express');
const { z } = require('zod');

const middlewares = require('../middlewares');
const { logger, analytics, cache } = require('../helpers');
const db = require('../db');

const router = express.Router();
const { analytics: analyticsRateLimiter } = middlewares.rateLimiters;
const REVENUE_CACHE_TTL_MS = Number(process.env.REVENUE_CACHE_TTL_MS || 30_000);

const revenueQuerySchema = z.object({
  period: z.enum(['3months', '6months', '12months']).default('6months')
});

function getCalendarMonthRanges(nowTs = Date.now()) {
  const now = new Date(nowTs);
  const currentStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const nextMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const currentEnd = nextMonthStart - 1;
  const previousStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1);
  const previousEnd = currentStart - 1;

  return { currentStart, currentEnd, previousStart, previousEnd };
}

function getQuarterRanges(nowTs = Date.now()) {
  const now = new Date(nowTs);
  const currentStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1);
  const currentEnd = nowTs;
  const previousStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1);
  const previousEnd = currentStart - 1;
  const beforePreviousStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 8, 1);
  const beforePreviousEnd = previousStart - 1;

  return {
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    beforePreviousStart,
    beforePreviousEnd
  };
}

function sumRecognizedRevenue(projects = []) {
  return projects.reduce((sum, project) => sum + (Number(project.recognizedRevenue) || 0), 0);
}

function sumPendingRevenue(projects = []) {
  return projects.reduce((sum, project) => sum + (Number(project.budget) || 0), 0);
}

function roundMoney(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function roundPercent(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function toSummaryMetric(value, currentValue, previousValue, compareLabel = 'vs last month') {
  const changePct = analytics.percentageChange(currentValue, previousValue);
  return {
    value: roundMoney(value),
    changePct: roundPercent(changePct),
    direction: analytics.getTrendDirection(changePct),
    compareLabel
  };
}

function buildClientMap(clients = []) {
  return new Map(clients.map((client) => [client.id, client]));
}

function getProjectClient(project, clientMap) {
  const clientId = project.clientId || project.client || '';
  return clientMap.get(clientId) || null;
}

function getProjectSource(project, clientMap) {
  const client = getProjectClient(project, clientMap);
  return project.source || client?.leadSource || 'Direct';
}

function getProjectService(project) {
  return project.service || project.category || project.type || 'Other';
}

function sortByAmountDesc(items) {
  return items.sort((a, b) => b.amount - a.amount);
}

function groupRevenueBy(projects, getKey) {
  const totals = new Map();

  for (const project of projects) {
    const key = getKey(project) || 'Other';
    totals.set(key, (totals.get(key) || 0) + (Number(project.recognizedRevenue) || 0));
  }

  return totals;
}

function error(res, message, status = 400) {
  return res.status(status).json({
    status: 'error',
    code: status,
    data: null,
    message
  });
}

router.get('/dashboard', analyticsRateLimiter, async (req, res) => {
  try {
    const parsed = revenueQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return error(res, 'Invalid query parameters', 400);
    }

    const { period } = parsed.data;
    const cacheKey = cache.buildCacheKey('revenue:dashboard', { period });
    const cached = cache.getCached(cacheKey);
    if (cached) return res.status(200).json(cached);

    const periodRange = analytics.parsePeriod(period);
    const periodBuckets = analytics.buildDateBuckets({
      from: periodRange.currentStart,
      to: periodRange.currentEnd,
      unit: periodRange.unit
    });
    const monthRange = getCalendarMonthRanges();
    const quarterRange = getQuarterRanges();

    const [
      periodRevenueProjects,
      previousPeriodRevenueProjects,
      currentMonthRevenueProjects,
      previousMonthRevenueProjects,
      currentQuarterRevenueProjects,
      previousQuarterRevenueProjects,
      beforePreviousQuarterRevenueProjects,
      currentMonthPendingProjects,
      previousMonthPendingProjects,
      clients
    ] = await Promise.all([
      db.getRecognizedRevenueProjectsBetween(periodRange.currentStart, periodRange.currentEnd),
      db.getRecognizedRevenueProjectsBetween(periodRange.previousStart, periodRange.previousEnd),
      db.getRecognizedRevenueProjectsBetween(monthRange.currentStart, monthRange.currentEnd),
      db.getRecognizedRevenueProjectsBetween(monthRange.previousStart, monthRange.previousEnd),
      db.getRecognizedRevenueProjectsBetween(quarterRange.currentStart, quarterRange.currentEnd),
      db.getRecognizedRevenueProjectsBetween(quarterRange.previousStart, quarterRange.previousEnd),
      db.getRecognizedRevenueProjectsBetween(quarterRange.beforePreviousStart, quarterRange.beforePreviousEnd),
      db.getPendingRevenueProjectsBetween(monthRange.currentStart, monthRange.currentEnd),
      db.getPendingRevenueProjectsBetween(monthRange.previousStart, monthRange.previousEnd),
      db.getClients()
    ]);

    const clientMap = buildClientMap(clients);
    const periodRevenueTotal = sumRecognizedRevenue(periodRevenueProjects);
    const previousPeriodRevenueTotal = sumRecognizedRevenue(previousPeriodRevenueProjects);
    const monthlyRevenueTotal = sumRecognizedRevenue(currentMonthRevenueProjects);
    const previousMonthlyRevenueTotal = sumRecognizedRevenue(previousMonthRevenueProjects);
    const currentQuarterRevenueTotal = sumRecognizedRevenue(currentQuarterRevenueProjects);
    const previousQuarterRevenueTotal = sumRecognizedRevenue(previousQuarterRevenueProjects);
    const beforePreviousQuarterRevenueTotal = sumRecognizedRevenue(beforePreviousQuarterRevenueProjects);
    const pendingPaymentsTotal = sumPendingRevenue(currentMonthPendingProjects);
    const previousPendingPaymentsTotal = sumPendingRevenue(previousMonthPendingProjects);
    const growthRate = analytics.percentageChange(currentQuarterRevenueTotal, previousQuarterRevenueTotal);
    const previousGrowthRate = analytics.percentageChange(previousQuarterRevenueTotal, beforePreviousQuarterRevenueTotal);
    const growthRateChange = growthRate - previousGrowthRate;

    const revenueSeries = periodBuckets.map((bucket) => {
      const total = periodRevenueProjects.reduce((sum, project) => {
        const recognizedAt = Number(project.recognizedAt || 0);
        return recognizedAt >= bucket.start && recognizedAt <= bucket.end
          ? sum + (Number(project.recognizedRevenue) || 0)
          : sum;
      }, 0);
      return roundMoney(total);
    });

    const sourceTotals = groupRevenueBy(periodRevenueProjects, (project) => getProjectSource(project, clientMap));
    const serviceTotals = groupRevenueBy(periodRevenueProjects, getProjectService);
    const clientTotals = groupRevenueBy(periodRevenueProjects, (project) => project.clientId || project.client || 'unknown');

    const revenueBySource = sortByAmountDesc([...sourceTotals.entries()].map(([source, amount]) => ({
      source,
      amount: roundMoney(amount)
    })));

    const revenueByService = sortByAmountDesc([...serviceTotals.entries()].map(([service, amount]) => ({
      service,
      amount: roundMoney(amount),
      percentage: roundPercent(analytics.safeRate(amount, periodRevenueTotal, 0))
    })));

    const topClients = sortByAmountDesc([...clientTotals.entries()].map(([clientId, amount]) => {
      const client = clientMap.get(clientId);
      return {
        clientId,
        clientName: client?.companyName || client?.fullName || 'Unknown Client',
        amount: roundMoney(amount),
        percentage: roundPercent(analytics.safeRate(amount, periodRevenueTotal, 0)),
        logoUrl: client?.logoUrl || client?.avatarUrl || null
      };
    })).slice(0, 5);

    const response = {
      status: 'success',
      code: 200,
      data: {
        summary: {
          totalRevenue: toSummaryMetric(
            periodRevenueTotal,
            periodRevenueTotal,
            previousPeriodRevenueTotal,
            'vs previous period'
          ),
          monthlyRevenue: toSummaryMetric(
            monthlyRevenueTotal,
            monthlyRevenueTotal,
            previousMonthlyRevenueTotal,
            'vs last month'
          ),
          growthRate: {
            value: roundPercent(growthRate),
            changePct: roundPercent(growthRateChange),
            direction: analytics.getTrendDirection(growthRateChange),
            compareLabel: 'vs last quarter'
          },
          pendingPayments: toSummaryMetric(
            pendingPaymentsTotal,
            pendingPaymentsTotal,
            previousPendingPaymentsTotal,
            'vs last month'
          )
        },
        revenueOverTime: {
          labels: periodBuckets.map((bucket) => bucket.label),
          series: revenueSeries
        },
        revenueBySource,
        revenueByService,
        topClients
      },
      message: 'Revenue dashboard fetched successfully'
    };

    cache.setCached(cacheKey, response, REVENUE_CACHE_TTL_MS);
    return res.status(200).json(response);
  } catch (errorObj) {
    logger('REVENUE_DASHBOARD_ROUTE').error(errorObj);
    return error(res, 'Failed to fetch revenue dashboard', 500);
  }
});

router.get('/', analyticsRateLimiter, async (req, res) => {
  try {
    const parsed = revenueQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return error(res, 'Invalid query parameters', 400);
    }

    const { period } = parsed.data;
    const cacheKey = cache.buildCacheKey('revenue:summary', { period });
    const cached = cache.getCached(cacheKey);
    if (cached) return res.status(200).json(cached);

    const range = analytics.parsePeriod(period);
    const buckets = analytics.buildDateBuckets({ from: range.currentStart, to: range.currentEnd, unit: range.unit });

    const recognizedRevenueProjects = await db.getRecognizedRevenueProjectsBetween(range.currentStart, range.currentEnd);

    const revenueSeries = buckets.map((bucket) => {
      const total = recognizedRevenueProjects.reduce((sum, project) => {
        const recognizedAt = Number(new Date(project.recognizedAt).valueOf());
        const amount = Number(project.recognizedRevenue) || 0;
        return recognizedAt >= bucket.start && recognizedAt <= bucket.end ? sum + amount : sum;
      }, 0);
      return Number(total.toFixed(2));
    });

    const response = {
      status: 'success',
      code: 200,
      data: {
        period,
        labels: buckets.map((bucket) => bucket.label),
        revenueSeries
      },
      message: 'Request successful'
    };

    cache.setCached(cacheKey, response, REVENUE_CACHE_TTL_MS);
    return res.status(200).json(response);
  } catch (errorObj) {
    logger('REVENUE_ROUTE').error(errorObj);
    return error(res, 'Failed to fetch revenue data', 500);
  }
});

module.exports = router;
