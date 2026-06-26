const express = require('express');
const router = express.Router();

let transactions = [
  { id: 1, userId: 1, amount: 45000, status: 'completed', date: '2026-06-20' },
  { id: 2, userId: 2, amount: 120000, status: 'pending', date: '2026-06-21' }
];

router.get('/transactions', (req, res) => {
  res.json({ success: true, data: transactions });
});

router.post('/transaction', (req, res) => {
  const { userId, amount, description } = req.body;
  if (!userId || !amount) {
    return res.status(400).json({ success: false, message: 'User ID and amount required' });
  }
  
  const newTransaction = {
    id: transactions.length + 1,
    userId,
    amount,
    description: description || 'Payment',
    status: 'pending',
    date: new Date().toISOString().split('T')[0]
  };
  
  transactions.push(newTransaction);
  res.status(201).json({ success: true, data: newTransaction });
});

router.put('/transaction/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = transactions.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Transaction not found' });
  }
  transactions[index].status = req.body.status || transactions[index].status;
  res.json({ success: true, data: transactions[index] });
});

router.get('/summary', (req, res) => {
  const total = transactions.reduce((sum, t) => sum + (t.status === 'completed' ? t.amount : 0), 0);
  const pending = transactions.filter(t => t.status === 'pending').length;
  
  res.json({
    success: true,
    data: {
      totalRevenue: total,
      pendingTransactions: pending,
      totalTransactions: transactions.length
    }
  });
});

module.exports = router;
