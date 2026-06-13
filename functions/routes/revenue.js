const express = require('express');
const { z } = require('zod');

const middlewares = require('../middlewares');
const { logger, analytics } = require('../helpers');
const db = require('../db');

const router = express.Router();
const { analyticsRead } = middlewares.rateLimiters;

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

function sumPayments(payments = []) {
  return payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
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

function buildMap(items = []) {
  return new Map(items.map((item) => [item.id, item]));
}

function getPaymentSource(payment, clientMap, projectMap) {
  if (payment.source) return payment.source;
  const project = projectMap.get(payment.projectId || '');
  if (project?.source) return project.source;
  const client = clientMap.get(payment.clientId || '');
  return client?.leadSource || 'Direct';
}

function getPaymentService(payment, projectMap) {
  const project = projectMap.get(payment.projectId || '');
  return project?.service || project?.category || project?.type || 'Other';
}

function sortByAmountDesc(items) {
  return items.sort((a, b) => b.amount - a.amount);
}

function groupRevenueBy(payments, getKey) {
  const totals = new Map();

  for (const payment of payments) {
    const key = getKey(payment) || 'Other';
    totals.set(key, (totals.get(key) || 0) + (Number(payment.amount) || 0));
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

router.get('/dashboard', analyticsRead, async (req, res) => {
  try {
    const parsed = revenueQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return error(res, 'Invalid query parameters', 400);
    }

    const { period } = parsed.data;

    const periodRange = analytics.parsePeriod(period);
    const periodBuckets = analytics.buildDateBuckets({
      from: periodRange.currentStart,
      to: periodRange.currentEnd,
      unit: periodRange.unit
    });
    const monthRange = getCalendarMonthRanges();
    const quarterRange = getQuarterRanges();

    const [
      periodRevenuePayments,
      previousPeriodRevenuePayments,
      currentMonthRevenuePayments,
      previousMonthRevenuePayments,
      currentQuarterRevenuePayments,
      previousQuarterRevenuePayments,
      beforePreviousQuarterRevenuePayments,
      currentMonthPendingPayments,
      previousMonthPendingPayments,
      clients,
      projects
    ] = await Promise.all([
      db.getPaidPaymentsBetween(periodRange.currentStart, periodRange.currentEnd),
      db.getPaidPaymentsBetween(periodRange.previousStart, periodRange.previousEnd),
      db.getPaidPaymentsBetween(monthRange.currentStart, monthRange.currentEnd),
      db.getPaidPaymentsBetween(monthRange.previousStart, monthRange.previousEnd),
      db.getPaidPaymentsBetween(quarterRange.currentStart, quarterRange.currentEnd),
      db.getPaidPaymentsBetween(quarterRange.previousStart, quarterRange.previousEnd),
      db.getPaidPaymentsBetween(quarterRange.beforePreviousStart, quarterRange.beforePreviousEnd),
      db.getPendingPaymentsBetween(monthRange.currentStart, monthRange.currentEnd),
      db.getPendingPaymentsBetween(monthRange.previousStart, monthRange.previousEnd),
      db.getClients(),
      db.getProjects()
    ]);

    const clientMap = buildMap(clients);
    const projectMap = buildMap(projects);
    const periodRevenueTotal = sumPayments(periodRevenuePayments);
    const previousPeriodRevenueTotal = sumPayments(previousPeriodRevenuePayments);
    const monthlyRevenueTotal = sumPayments(currentMonthRevenuePayments);
    const previousMonthlyRevenueTotal = sumPayments(previousMonthRevenuePayments);
    const currentQuarterRevenueTotal = sumPayments(currentQuarterRevenuePayments);
    const previousQuarterRevenueTotal = sumPayments(previousQuarterRevenuePayments);
    const beforePreviousQuarterRevenueTotal = sumPayments(beforePreviousQuarterRevenuePayments);
    const pendingPaymentsTotal = sumPayments(currentMonthPendingPayments);
    const previousPendingPaymentsTotal = sumPayments(previousMonthPendingPayments);
    const growthRate = analytics.percentageChange(currentQuarterRevenueTotal, previousQuarterRevenueTotal);
    const previousGrowthRate = analytics.percentageChange(previousQuarterRevenueTotal, beforePreviousQuarterRevenueTotal);
    const growthRateChange = growthRate - previousGrowthRate;

    const revenueSeries = periodBuckets.map((bucket) => {
      const total = periodRevenuePayments.reduce((sum, payment) => {
        const paymentDate = Number(payment.date || 0);
        return paymentDate >= bucket.start && paymentDate <= bucket.end
          ? sum + (Number(payment.amount) || 0)
          : sum;
      }, 0);
      return roundMoney(total);
    });

    const sourceTotals = groupRevenueBy(periodRevenuePayments, (payment) => getPaymentSource(payment, clientMap, projectMap));
    const serviceTotals = groupRevenueBy(periodRevenuePayments, (payment) => getPaymentService(payment, projectMap));
    const clientTotals = groupRevenueBy(periodRevenuePayments, (payment) => payment.clientId || 'unknown');

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

    return res.status(200).json(response);
  } catch (errorObj) {
    logger('REVENUE_DASHBOARD_ROUTE').error(errorObj);
    return error(res, 'Failed to fetch revenue dashboard', 500);
  }
});

router.get('/', analyticsRead, async (req, res) => {
  try {
    const parsed = revenueQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return error(res, 'Invalid query parameters', 400);
    }

    const { period } = parsed.data;
    const range = analytics.parsePeriod(period);
    const buckets = analytics.buildDateBuckets({ from: range.currentStart, to: range.currentEnd, unit: range.unit });

    const recognizedRevenuePayments = await db.getPaidPaymentsBetween(range.currentStart, range.currentEnd);

    const revenueSeries = buckets.map((bucket) => {
      const total = recognizedRevenuePayments.reduce((sum, payment) => {
        const paymentDate = Number(payment.date || 0);
        const amount = Number(payment.amount) || 0;
        return paymentDate >= bucket.start && paymentDate <= bucket.end ? sum + amount : sum;
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

    return res.status(200).json(response);
  } catch (errorObj) {
    logger('REVENUE_ROUTE').error(errorObj);
    return error(res, 'Failed to fetch revenue data', 500);
  }
});

module.exports = router;
