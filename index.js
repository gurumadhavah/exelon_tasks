// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db'); // Imports the pool

// Import routes
const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallets');
const transactionRoutes = require('./routes/transactions');
const budgetRoutes = require('./routes/budgets');
const reportRoutes = require('./routes/report');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/report', reportRoutes);

// Simple health check route
app.get('/', (req, res) => {
  res.send('Personal Finance Management API is running.');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});