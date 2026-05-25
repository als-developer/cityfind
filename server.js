const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============ MONGODB CONNECTION ============
const MONGODB_URI = process.env.MONGODB_URI;
console.log('🔄 Connecting to MongoDB...');

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ MongoDB connected successfully');
}).catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
});

// ============ SCHEMAS ============
const userSchema = new mongoose.Schema({
    fullName: String,
    email: { type: String, unique: true },
    password: String,
    phone: String,
    role: { type: String, default: 'viewer' },
    companyName: String,
    isVerified: { type: Boolean, default: false },
    walletBalance: { type: Number, default: 0 },
    rating: { type: Number, default: 5 },
    freeTierUsed: { type: Boolean, default: false },
    freeTierExpiry: { type: Date },
    isPremium: { type: Boolean, default: false },
    premiumExpiry: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

const adSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    description: String,
    category: String,
    adType: String,
    price: Number,
    currency: { type: String, default: 'USD' },
    status: { type: String, default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
    orderNumber: { type: String, unique: true },
    productName: String,
    quantity: Number,
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, default: 'pending' },
    paymentStatus: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const paymentSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: Number,
    currency: String,
    method: String,
    transactionId: String,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const ratingSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: Number,
    comment: String,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Ad = mongoose.model('Ad', adSchema);
const Order = mongoose.model('Order', orderSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const Rating = mongoose.model('Rating', ratingSchema);

// ============ MIDDLEWARE ============
const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'citytech_secret_key');
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

const adminMiddleware = async (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
};

// ============ AUTH ROUTES ============
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, password, phone, role, companyName } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'Email already registered' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, password: hashedPassword, phone, role, companyName });
        await user.save();
        
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'citytech_secret_key');
        res.json({ token, user: { id: user._id, email, role, fullName, phone } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'User not found' });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid password' });
        
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'citytech_secret_key');
        res.json({ token, user: { id: user._id, email, role, fullName: user.fullName, phone: user.phone } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ ADS ROUTES ============
app.post('/api/ads/create', authMiddleware, async (req, res) => {
    try {
        const { title, description, category, adType, price } = req.body;
        const ad = new Ad({
            companyId: req.user.id,
            title,
            description,
            category,
            adType: adType || 'banner',
            price: price || 100
        });
        await ad.save();
        res.json({ success: true, ad });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/ads', async (req, res) => {
    try {
        const ads = await Ad.find({ status: 'active' }).populate('companyId', 'companyName rating').sort({ createdAt: -1 });
        res.json(ads);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/ads/my', authMiddleware, async (req, res) => {
    try {
        const ads = await Ad.find({ companyId: req.user.id });
        res.json(ads);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/ads/:id', authMiddleware, async (req, res) => {
    try {
        await Ad.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ ORDER ROUTES ============
app.post('/api/orders/create', authMiddleware, async (req, res) => {
    try {
        const { productName, quantity, receiverId } = req.body;
        const orderNumber = 'ORD' + Date.now() + Math.floor(Math.random() * 10000);
        const order = new Order({
            orderNumber,
            productName,
            quantity: quantity || 1,
            senderId: req.user.id,
            receiverId: receiverId || req.user.id
        });
        await order.save();
        res.json({ success: true, order });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/orders', authMiddleware, async (req, res) => {
    try {
        const orders = await Order.find({
            $or: [{ senderId: req.user.id }, { receiverId: req.user.id }]
        }).populate('senderId receiverId', 'fullName phone');
        res.json(orders);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/orders/:orderNumber', async (req, res) => {
    try {
        const order = await Order.findOne({ orderNumber: req.params.orderNumber })
            .populate('senderId receiverId', 'fullName phone');
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json(order);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ FREE TIER ROUTE ============
app.get('/api/check-free-tier', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const now = new Date();
        
        if (user.freeTierExpiry && user.freeTierExpiry > now) {
            return res.json({ hasFreeTier: true, expiresAt: user.freeTierExpiry });
        }
        
        if (!user.freeTierUsed) {
            user.freeTierUsed = true;
            user.freeTierExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
            await user.save();
            return res.json({ hasFreeTier: true, expiresAt: user.freeTierExpiry });
        }
        
        res.json({ hasFreeTier: false });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ PAYMENT ROUTES ============
app.post('/api/payments/upload-screenshot', authMiddleware, async (req, res) => {
    try {
        const { amount, phoneNumber, transactionId } = req.body;
        const payment = new Payment({
            userId: req.user.id,
            amount: amount || 0,
            currency: 'TZS',
            method: 'bank_transfer',
            transactionId: transactionId || 'PENDING_' + Date.now(),
            status: 'pending'
        });
        await payment.save();
        res.json({ success: true, message: "Payment uploaded! Pending verification." });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/payments/status', authMiddleware, async (req, res) => {
    try {
        const payments = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 });
        const user = await User.findById(req.user.id);
        res.json({
            payments: payments,
            isPremium: user.isPremium || false,
            premiumExpiry: user.premiumExpiry,
            freeTierUsed: user.freeTierUsed,
            freeTierExpiry: user.freeTierExpiry
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ RATINGS ROUTE ============
app.post('/api/ratings/company', authMiddleware, async (req, res) => {
    try {
        const { companyId, rating, comment } = req.body;
        const ratingRecord = new Rating({
            companyId,
            reviewerId: req.user.id,
            rating: parseInt(rating),
            comment: comment || ''
        });
        await ratingRecord.save();
        
        const avgRating = await Rating.aggregate([
            { $match: { companyId: companyId } },
            { $group: { _id: null, avg: { $avg: '$rating' } } }
        ]);
        await User.findByIdAndUpdate(companyId, { rating: avgRating[0]?.avg || rating });
        
        res.json({ success: true, message: "Rating submitted!" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ DASHBOARD STATS ============
app.get('/api/company/stats', authMiddleware, async (req, res) => {
    try {
        const totalAds = await Ad.countDocuments({ companyId: req.user.id });
        const activeAds = await Ad.countDocuments({ companyId: req.user.id, status: 'active' });
        const totalOrders = await Order.countDocuments({ senderId: req.user.id });
        res.json({ ads: { total: totalAds, active: activeAds }, orders: { total: totalOrders } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ BOT ROUTE ============
app.post('/api/bot/chat', async (req, res) => {
    const { message, language } = req.body;
    const lowerMsg = (message || '').toLowerCase();
    let reply = '';
    
    if (lowerMsg.includes('bei') || lowerMsg.includes('price')) {
        reply = "💰 **Bei za Matangazo:**\n• Banner: $100 kwa mwezi\n• Featured: $500 kwa mwezi\n• Sponsored: $1,000 kwa mwezi";
    } else if (lowerMsg.includes('lipa') || lowerMsg.includes('payment')) {
        reply = "🏦 **Malipo:** NMB Bank, Akaunti: 5161480052318274, Jina: City Tech Holdings";
    } else if (lowerMsg.includes('simu') || lowerMsg.includes('phone')) {
        reply = "📞 WhatsApp: +255796323348 | Email: citytechuk@gmail.com";
    } else {
        reply = "👋 Hello! I'm City Find AI Assistant.\n\n💰 Ads: $100-$1000/month\n📞 WhatsApp: +255796323348\n🏦 NMB: 5161480052318274\n\nHow can I help?";
    }
    res.json({ reply: reply });
});

// ============ SERVE HTML ============
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Admin Email: ${process.env.ADMIN_EMAIL || 'citytechuk@gmail.com'}`);
    console.log(`📞 Admin Phone: ${process.env.ADMIN_PHONE || '+255796323348'}`);
});
