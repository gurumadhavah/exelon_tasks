// routes/budgets.js
const express = require('express');
const db = require('../db');
const authenticateToken = require('../authMiddleware');

const router = express.Router();

router.use(authenticateToken);

// Helper to get current month in 'YYYY-MM' format
const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

// POST /api/budgets: Set or update a budget for a category
router.post('/', async (req, res) => {
  const { category, amount, month } = req.body;
  const userId = req.user.id;
  
  // Default to current month if not provided
  const budgetMonth = month || getCurrentMonth(); 
  const parsedAmount = parseFloat(amount);

  if (!category || !parsedAmount || parsedAmount <= 0) {
    return res.status(400).json({ message: 'Category and a positive amount are required.' });
  }

  try {
    // Use INSERT ... ON DUPLICATE KEY UPDATE to create or update the budget
    const [result] = await db.query(
      `INSERT INTO Budgets (userId, category, amount, month) 
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE amount = ?`,
      [userId, category, parsedAmount, budgetMonth, parsedAmount]
    );

    if (result.insertId > 0) {
        res.status(201).json({ message: 'Budget set successfully.' });
    } else {
        res.status(200).json({ message: 'Budget updated successfully.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error setting budget.' });
  }
});

// GET /api/budgets: View all budgets for the current month
router.get('/', async (req, res) => {
  const userId = req.user.id;
  const currentMonth = getCurrentMonth();

  try {
    const [budgets] = await db.query(
      'SELECT category, amount FROM Budgets WHERE userId = ? AND month = ?',
      [userId, currentMonth]
    );
    res.json(budgets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching budgets.' });
  }
});

module.exports = router;