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

// ============================================================
// ROUTES ZILIZORAHA (Zisizohitaji files za nje)
// ============================================================

// API Products - Mock data
app.get('/api/products', (req, res) => {
    const products = [
        { id: 1, name: 'Premium Organic Coffee Beans', price: 18.00, category: 'food', stock: 50, lat: -3.3667, lng: 36.6833 },
        { id: 2, name: 'Organic Avocado Oil', price: 12.00, category: 'food', stock: 30, lat: -1.2921, lng: 36.8219 },
        { id: 3, name: 'Premium Leather Jacket', price: 187.50, category: 'fashion', stock: 15, lat: 5.6037, lng: -0.1870 }
    ];
    res.json({ success: true, data: products });
});

app.get('/api/products/:id', (req, res) => {
    const products = [
        { id: 1, name: 'Premium Organic Coffee Beans', price: 18.00, category: 'food', stock: 50, lat: -3.3667, lng: 36.6833 },
        { id: 2, name: 'Organic Avocado Oil', price: 12.00, category: 'food', stock: 30, lat: -1.2921, lng: 36.8219 },
        { id: 3, name: 'Premium Leather Jacket', price: 187.50, category: 'fashion', stock: 15, lat: 5.6037, lng: -0.1870 }
    ];
    const product = products.find(p => p.id === parseInt(req.params.id));
    if (!product) {
        return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, data: product });
});

// API Users
app.get('/api/users', (req, res) => {
    const users = [
        { id: 1, name: 'Ali Hassan', email: 'ali@cityfind.com', role: 'admin' },
        { id: 2, name: 'Sarah K.', email: 'sarah@cityfind.com', role: 'seller' },
        { id: 3, name: 'John M.', email: 'john@cityfind.com', role: 'buyer' }
    ];
    res.json({ success: true, data: users });
});

// API Stats
app.get('/api/stats', (req, res) => {
    res.json({
        success: true,
        data: {
            totalUsers: 12847,
            totalProducts: 3892,
            totalRevenue: 89000000,
            totalOrders: 1234
        }
    });
});

// API Bot Chat
app.post('/api/bot/chat', (req, res) => {
    const { message } = req.body;
    if (!message) {
        return res.status(400).json({ success: false, message: 'Message is required' });
    }
    
    const responses = [
        "Asante kwa swali lako! Tutakusaidia.",
        "Nakuelewa. Hebu nikupe maelezo zaidi.",
        "Hiyo ni swali zuri! Natafuta jibu.",
        "Tunaweza kukusaidia na hilo. Subiri kidogo.",
        "Ndiyo, bidhaa hiyo inapatikana kwa bei nzuri."
    ];
    
    let reply = responses[Math.floor(Math.random() * responses.length)];
    
    if (message.toLowerCase().includes('price') || message.toLowerCase().includes('bei')) {
        reply = "Bei zetu ni nafuu na zinashindana. Tuna ofa maalum kwa bidhaa nyingi!";
    } else if (message.toLowerCase().includes('delivery') || message.toLowerCase().includes('usafirishaji')) {
        reply = "Tunatoa huduma ya usafirishaji bure kwa maagizo zaidi ya TZS 100,000.";
    } else if (message.toLowerCase().includes('stock') || message.toLowerCase().includes('hisa')) {
        reply = "Bidhaa zetu zote ziko stock. Tunaweza kuthibitisha upatikanaji wa bidhaa yoyote.";
    }
    
    res.json({ success: true, data: { reply, timestamp: new Date().toISOString() } });
});

// API Bot Status
app.get('/api/bot/status', (req, res) => {
    res.json({ success: true, data: { status: 'online', version: '1.0.0' } });
});

// API Payments - Transactions
app.get('/api/payments/transactions', (req, res) => {
    const transactions = [
        { id: 1, userId: 1, amount: 45000, status: 'completed', date: '2026-06-20' },
        { id: 2, userId: 2, amount: 120000, status: 'pending', date: '2026-06-21' }
    ];
    res.json({ success: true, data: transactions });
});

app.post('/api/payments/transaction', (req, res) => {
    const { userId, amount, description } = req.body;
    if (!userId || !amount) {
        return res.status(400).json({ success: false, message: 'User ID and amount required' });
    }
    const newTransaction = {
        id: Date.now(),
        userId,
        amount,
        description: description || 'Payment',
        status: 'pending',
        date: new Date().toISOString().split('T')[0]
    };
    res.status(201).json({ success: true, data: newTransaction });
});

app.get('/api/payments/summary', (req, res) => {
    res.json({
        success: true,
        data: {
            totalRevenue: 89456,
            pendingTransactions: 5,
            totalTransactions: 1234
        }
    });
});

// API Tracking - Deliveries
app.get('/api/tracking/deliveries', (req, res) => {
    const deliveries = [
        { id: 1, orderId: 101, status: 'pending', location: 'Mikocheni', eta: '12 min' },
        { id: 2, orderId: 102, status: 'in-transit', location: 'Oysterbay', eta: '25 min' },
        { id: 3, orderId: 103, status: 'delivered', location: 'Mlimani City', eta: '0 min' }
    ];
    res.json({ success: true, data: deliveries });
});

app.get('/api/tracking/stats', (req, res) => {
    res.json({
        success: true,
        data: {
            total: 45,
            pending: 12,
            inTransit: 18,
            delivered: 15
        }
    });
});

// ============================================================
// SERVE HTML FILES
// ============================================================

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

app.get('/manifest.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

app.get('/sitemap.xml', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

// Catch-all - Serve index.html for any other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log(`🚀 CITYFIND server running on port ${PORT}`);
    console.log(`📱 Visit: http://localhost:${PORT}`);
    console.log(`📍 Products sorted by distance (closest first)`);
    console.log(`🔑 Admin: Click gear 5x, password: CITY2026`);
});
