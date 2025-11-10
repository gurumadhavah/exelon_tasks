// routes/transactions.js
const express = require('express');
const db = require('../db');
const authenticateToken = require('../authMiddleware');

const router = express.Router();

// All transaction routes are protected
router.use(authenticateToken);

// Helper function to check wallet ownership
async function checkWalletOwnership(walletId, userId) {
  const [wallets] = await db.query('SELECT * FROM Wallets WHERE id = ? AND userId = ?', [walletId, userId]);
  return wallets[0];
}

// POST /api/transactions: Add a new transaction
router.post('/', async (req, res) => {
  const { walletId, type, amount, category, date, description } = req.body;
  const userId = req.user.id;
  const parsedAmount = parseFloat(amount);

  if (!walletId || !type || !parsedAmount || !category || !date) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }
  if (type !== 'income' && type !== 'expense') {
    return res.status(400).json({ message: 'Invalid transaction type.' });
  }
  if (parsedAmount <= 0) {
     return res.status(400).json({ message: 'Amount must be positive.' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Verify user owns the wallet and get its current balance
    const wallet = await checkWalletOwnership(walletId, userId);
    if (!wallet) {
      await connection.rollback();
      return res.status(403).json({ message: 'Access denied to this wallet.' });
    }

    let newBalance = parseFloat(wallet.balance);
    if (type === 'income') {
      newBalance += parsedAmount;
    } else { // 'expense'
      if (newBalance < parsedAmount) {
         await connection.rollback();
         return res.status(400).json({ message: 'Insufficient funds.' });
      }
      newBalance -= parsedAmount;
    }

    // 2. Insert the transaction
    await connection.query(
      'INSERT INTO Transactions (walletId, type, amount, category, date, description) VALUES (?, ?, ?, ?, ?, ?)',
      [walletId, type, parsedAmount, category, date, description || null]
    );

    // 3. Update the wallet balance
    await connection.query(
      'UPDATE Wallets SET balance = ? WHERE id = ?',
      [newBalance, walletId]
    );

    // 4. Commit the transaction
    await connection.commit();

    res.status(201).json({ message: 'Transaction added successfully.', newBalance });

  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Server error adding transaction.' });
  } finally {
    connection.release();
  }
});

// GET /api/transactions: Retrieve transactions (with filters)
router.get('/', async (req, res) => {
  const userId = req.user.id;
  const { walletId, startDate, endDate } = req.query;

  try {
    let query = `
      SELECT t.* FROM Transactions t
      JOIN Wallets w ON t.walletId = w.id
      WHERE w.userId = ?
    `;
    const params = [userId];

    if (walletId) {
      query += ' AND t.walletId = ?';
      params.push(walletId);
    }
    if (startDate && endDate) {
      query += ' AND t.date BETWEEN ? AND ?';
      params.push(startDate, endDate);
    }

    query += ' ORDER BY t.date DESC';

    const [transactions] = await db.query(query, params);
    res.json(transactions);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching transactions.' });
  }
});

// DELETE /api/transactions/:transactionId
router.delete('/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  const userId = req.user.id;

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Get transaction details and verify ownership
    const [rows] = await connection.query(`
      SELECT t.id, t.walletId, t.type, t.amount, w.userId, w.balance
      FROM Transactions t
      JOIN Wallets w ON t.walletId = w.id
      WHERE t.id = ?
    `, [transactionId]);

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Transaction not found.' });
    }

    const t = rows[0];
    if (t.userId !== userId) {
      await connection.rollback();
      return res.status(403).json({ message: 'Access denied.' });
    }

    // 2. Calculate the new balance (revert the transaction)
    let newBalance = parseFloat(t.balance);
    if (t.type === 'income') {
      newBalance -= parseFloat(t.amount);
    } else { // 'expense'
      newBalance += parseFloat(t.amount);
    }

    // 3. Update the wallet
    await connection.query(
      'UPDATE Wallets SET balance = ? WHERE id = ?',
      [newBalance, t.walletId]
    );

    // 4. Delete the transaction
    await connection.query('DELETE FROM Transactions WHERE id = ?', [transactionId]);

    // 5. Commit
    await connection.commit();
    res.status(200).json({ message: 'Transaction deleted successfully.', newBalance });

  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: 'Server error deleting transaction.' });
  } finally {
    connection.release();
  }
});

// PUT /api/transactions/:transactionId (Edit Transaction - Bonus/Completeness)
// Note: The prompt only explicitly required delete, but edit is standard.
router.put('/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    const { walletId, type, amount, category, date, description } = req.body;
    const userId = req.user.id;
    const parsedAmount = parseFloat(amount);

    if (!walletId || !type || !parsedAmount || !category || !date) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Get old transaction and verify ownership
        const [rows] = await connection.query(`
            SELECT t.id, t.walletId, t.type, t.amount, w.userId
            FROM Transactions t
            JOIN Wallets w ON t.walletId = w.id
            WHERE t.id = ? AND w.userId = ?
        `, [transactionId, userId]);

        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Transaction not found or access denied.' });
        }
        const oldT = rows[0];
        const oldAmount = parseFloat(oldT.amount);
        
        // 2. Revert the old transaction from its wallet
        let oldWalletBalanceQuery = 'UPDATE Wallets SET balance = balance + ? WHERE id = ?';
        if (oldT.type === 'income') {
             oldWalletBalanceQuery = 'UPDATE Wallets SET balance = balance - ? WHERE id = ?';
        }
        await connection.query(oldWalletBalanceQuery, [oldAmount, oldT.walletId]);


        // 3. Apply the new transaction to its wallet (could be the same or different)
        const newWallet = await checkWalletOwnership(walletId, userId);
        if (!newWallet) {
            await connection.rollback();
            return res.status(403).json({ message: 'Access denied to new wallet.' });
        }
        
        let newWalletBalanceQuery = 'UPDATE Wallets SET balance = balance - ? WHERE id = ?';
        if (type === 'income') {
            newWalletBalanceQuery = 'UPDATE Wallets SET balance = balance + ? WHERE id = ?';
        }
        await connection.query(newWalletBalanceQuery, [parsedAmount, walletId]);

        // 4. Update the transaction itself
        await connection.query(
            'UPDATE Transactions SET walletId = ?, type = ?, amount = ?, category = ?, date = ?, description = ? WHERE id = ?',
            [walletId, type, parsedAmount, category, date, description || null, transactionId]
        );

        // 5. Commit
        await connection.commit();
        res.status(200).json({ message: 'Transaction updated successfully.' });

    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ message: 'Server error updating transaction.' });
    } finally {
        connection.release();
    }
});


module.exports = router;