// routes/wallets.js
const express = require('express');
const db = require('../db');
const authenticateToken = require('../authMiddleware');

const router = express.Router();

// All wallet routes are protected
router.use(authenticateToken);

// POST /api/wallets: Create a new wallet
router.post('/', async (req, res) => {
  const { name } = req.body;
  const userId = req.user.id; // From authMiddleware

  if (!name) {
    return res.status(400).json({ message: 'Wallet name is required.' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO Wallets (userId, name, balance) VALUES (?, ?, ?)',
      [userId, name, 0.00] // Initial balance is 0
    );
    res.status(201).json({ id: result.insertId, userId, name, balance: 0.00 });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error creating wallet.' });
  }
});

// GET /api/wallets: List all wallets for the logged-in user
router.get('/', async (req, res) => {
  const userId = req.user.id;

  try {
    const [wallets] = await db.query('SELECT * FROM Wallets WHERE userId = ?', [userId]);
    res.json(wallets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching wallets.' });
  }
});

// DELETE /api/wallets/:walletId: Delete a wallet
router.delete('/:walletId', async (req, res) => {
  const { walletId } = req.params;
  const userId = req.user.id;

  // Note: Deleting a wallet will cascade and delete all associated transactions
  // due to the FOREIGN KEY ... ON DELETE CASCADE constraint in the schema.
  try {
    const [result] = await db.query(
      'DELETE FROM Wallets WHERE id = ? AND userId = ?', 
      [walletId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Wallet not found or user not authorized.' });
    }

    res.status(200).json({ message: 'Wallet deleted successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error deleting wallet.' });
  }
});

module.exports = router;