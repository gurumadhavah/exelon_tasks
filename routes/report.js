// routes/report.js
const express = require('express');
const db = require('../db');
const authenticateToken = require('../authMiddleware');

const router = express.Router();

router.use(authenticateToken);

// GET /api/report: Get a simple financial summary for the current month
router.get('/', async (req, res) => {
  const userId = req.user.id;

  // Get start and end of the current month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  const monthStr = (month + 1).toString().padStart(2, '0'); // '01'-'12'
  
  const startDate = `${year}-${monthStr}-01`;
  const endDate = new Date(year, month + 1, 0).toISOString().slice(0, 10); // Last day of month
  const monthYear = `${year}-${monthStr}`; // 'YYYY-MM'

  try {
    // 1. Get Total Income and Expenses
    const [summary] = await db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS totalIncome,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS totalExpenses
      FROM Transactions t
      JOIN Wallets w ON t.walletId = w.id
      WHERE w.userId = ? AND t.date BETWEEN ? AND ?`,
      [userId, startDate, endDate]
    );

    const { totalIncome, totalExpenses } = summary[0];
    const netSavings = parseFloat(totalIncome) - parseFloat(totalExpenses);

    // 2. Get Budget vs. Spending
    const [budgetStatus] = await db.query(
      `SELECT
          b.category,
          b.amount AS budget,
          COALESCE(e.spent, 0) AS spent,
          (b.amount - COALESCE(e.spent, 0)) AS remaining
       FROM Budgets b
       LEFT JOIN (
          SELECT
            category,
            SUM(amount) AS spent
          FROM Transactions t
          JOIN Wallets w ON t.walletId = w.id
          WHERE w.userId = ? AND t.type = 'expense' AND t.date BETWEEN ? AND ?
          GROUP BY category
       ) e ON b.category = e.category
       WHERE b.userId = ? AND b.month = ?`,
       [userId, startDate, endDate, userId, monthYear]
    );
    
    // 3. Fulfill "notify" requirement by checking status
    const notifications = budgetStatus
      .filter(b => b.spent > 0 && b.spent >= b.budget * 0.9) // 90% threshold
      .map(b => {
          if (b.spent > b.budget) {
              return `You have exceeded your '${b.category}' budget by ${Math.abs(b.remaining)}.`;
          } else {
              return `You are approaching your '${b.category}' budget. Only ${b.remaining} left.`;
          }
      });

    res.json({
      totalIncome: parseFloat(totalIncome),
      totalExpenses: parseFloat(totalExpenses),
      netSavings: netSavings,
      budgetStatus: budgetStatus,
      notifications: notifications // Fulfills notification requirement
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error generating report.' });
  }
});

module.exports = router;