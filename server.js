require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Import routes
const apiRoutes = require('./routes/api');
const botRoutes = require('./routes/bot');
const paymentRoutes = require('./routes/payments');
const trackingRoutes = require('./routes/tracking');

// API Routes
app.use('/api', apiRoutes);
app.use('/api/bot', botRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tracking', trackingRoutes);

// Serve HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard-buyer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard-buyer.html'));
});

app.get('/dashboard-sellers', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard-sellers.html'));
});

app.get('/dashboard-admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard-admin.html'));
});

app.get('/product', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'product.html'));
});

// Catch-all
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 CITYFIND server running on port ${PORT}`);
  console.log(`📱 Visit: http://localhost:${PORT}`);
  console.log(`📍 Products sorted by distance (closest first)`);
  console.log(`🔑 Admin: Click gear 5x, password: CITY2026`);
});
