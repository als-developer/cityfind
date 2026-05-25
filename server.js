const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const axios = require('axios');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============ DATABASE SCHEMAS ============
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// User Schema
const userSchema = new mongoose.Schema({
    fullName: String,
    email: { type: String, unique: true },
    password: String,
    phone: String,
    role: { type: String, enum: ['admin', 'company', 'provider', 'receiver', 'viewer'], default: 'viewer' },
    companyName: String,
    isVerified: { type: Boolean, default: false },
    walletBalance: { type: Number, default: 0 },
    rating: { type: Number, default: 5 },
    totalDeliveries: { type: Number, default: 0 },
    location: { lat: Number, lng: Number },
    createdAt: { type: Date, default: Date.now }
});

// Ad Schema
const adSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    description: String,
    mediaUrls: [String],
    mediaType: { type: String, enum: ['image', 'video', 'pdf', 'animation'] },
    category: String,
    adType: { type: String, enum: ['banner', 'featured', 'sidebar', 'sponsored'] },
    price: Number,
    currency: { type: String, default: 'USD' },
    status: { type: String, enum: ['pending', 'active', 'expired', 'rejected'], default: 'pending' },
    expiryDate: Date,
    galaxyAnimation: String,
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

// Product/Order Schema (For Logistics)
const orderSchema = new mongoose.Schema({
    orderNumber: { type: String, unique: true },
    productName: String,
    productQR: String,
    productBarcode: String,
    productImage: String,
    quantity: Number,
    qualitySpecs: [String],
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { 
        type: String, 
        enum: ['pending', 'scanning', 'in_transit', 'quality_check', 'delivered', 'disputed', 'completed'],
        default: 'pending'
    },
    currentLocation: { lat: Number, lng: Number, address: String },
    trackingHistory: [{
        location: { lat: Number, lng: Number },
        status: String,
        timestamp: Date,
        videoUrl: String
    }],
    qualityCheckVideo: String,
    qualityCheckPhotos: [String],
    qualityPassed: { type: Boolean, default: false },
    paymentAmount: Number,
    paymentStatus: { type: String, enum: ['pending', 'escrow', 'released', 'refunded'], default: 'pending' },
    deliveryFee: Number,
    distance: Number,
    estimatedDelivery: Date,
    actualDelivery: Date,
    createdAt: { type: Date, default: Date.now }
});

// Payment Schema
const paymentSchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad' },
    amount: Number,
    currency: String,
    method: { type: String, enum: ['stripe', 'pesapal', 'nmb', 'card'] },
    transactionId: String,
    status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
    senderAccount: String,
    receiverAccount: String,
    createdAt: { type: Date, default: Date.now }
});

// Chat/Video Call Schema
const chatSchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: String,
    messageType: { type: String, enum: ['text', 'voice', 'video', 'image'], default: 'text' },
    mediaUrl: String,
    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Ad = mongoose.model('Ad', adSchema);
const Order = mongoose.model('Order', orderSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const Chat = mongoose.model('Chat', chatSchema);

// ============ AUTH MIDDLEWARE ============
const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// ============ API ROUTES ============

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullName, email, password, phone, role, companyName } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, password: hashedPassword, phone, role, companyName });
        await user.save();
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
        res.json({ token, user: { id: user._id, email, role, fullName } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'User not found' });
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid password' });
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
        res.json({ token, user: { id: user._id, email, role: user.role, fullName: user.fullName } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Create Ad (with Galaxy Animation Auto-Generation)
app.post('/api/ads/create', authMiddleware, async (req, res) => {
    try {
        const { title, description, mediaUrls, mediaType, category, adType, price, currency, expiryDate } = req.body;
        
        // Auto-generate galaxy animation based on ad type
        const galaxyAnimations = {
            banner: 'spiral_galaxy',
            featured: 'exploding_stars',
            sidebar: 'nebula_cloud',
            sponsored: 'black_hole_pulse'
        };
        
        const ad = new Ad({
            companyId: req.user.id,
            title,
            description,
            mediaUrls,
            mediaType,
            category,
            adType,
            price,
            currency,
            expiryDate,
            galaxyAnimation: galaxyAnimations[adType] || 'standard_galaxy'
        });
        
        await ad.save();
        res.json({ success: true, ad });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get All Ads (with galaxy animations)
app.get('/api/ads', async (req, res) => {
    try {
        const ads = await Ad.find({ status: 'active' }).populate('companyId', 'companyName logoUrl');
        res.json(ads);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ LOGISTICS & TRACKING ============

// Create Order with QR/Barcode
app.post('/api/orders/create', authMiddleware, async (req, res) => {
    try {
        const { productName, quantity, qualitySpecs, receiverId, productImage } = req.body;
        
        const orderNumber = 'ORD' + Date.now() + Math.floor(Math.random() * 1000);
        
        // Generate QR Code
        const qrData = JSON.stringify({ orderNumber, productName, senderId: req.user.id });
        const qrImage = await QRCode.toDataURL(qrData);
        
        // Generate Barcode
        const barcodeBuffer = await bwipjs.toBuffer({
            bcid: 'code128',
            text: orderNumber,
            scale: 3,
            height: 10,
            includetext: true,
            textxalign: 'center'
        });
        
        const order = new Order({
            orderNumber,
            productName,
            quantity,
            qualitySpecs,
            productImage,
            senderId: req.user.id,
            receiverId,
            productQR: qrImage,
            productBarcode: barcodeBuffer.toString('base64'),
            status: 'pending'
        });
        
        await order.save();
        res.json({ success: true, order, qrCode: qrImage });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Scan Product (QR/Barcode)
app.post('/api/orders/scan', authMiddleware, async (req, res) => {
    try {
        const { orderNumber, location, videoUrl } = req.body;
        const order = await Order.findOne({ orderNumber });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        order.trackingHistory.push({
            location,
            status: order.status,
            timestamp: new Date(),
            videoUrl
        });
        
        if (order.status === 'pending') order.status = 'scanning';
        else if (order.status === 'scanning') order.status = 'in_transit';
        
        order.currentLocation = location;
        await order.save();
        
        // Emit real-time update via Socket.io
        io.emit('order-update', { orderNumber, status: order.status, location });
        
        res.json({ success: true, order });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Quality Check (Receiver)
app.post('/api/orders/quality-check', authMiddleware, async (req, res) => {
    try {
        const { orderNumber, qualityPassed, videoUrl, photos, issues } = req.body;
        const order = await Order.findOne({ orderNumber });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        order.qualityCheckVideo = videoUrl;
        order.qualityCheckPhotos = photos;
        order.qualityPassed = qualityPassed;
        
        if (qualityPassed) {
            order.status = 'completed';
            // Release payment from escrow
            await Payment.findOneAndUpdate(
                { orderId: order._id },
                { status: 'completed' }
            );
        } else {
            order.status = 'disputed';
            // Log issues for dispute resolution
            order.disputeReason = issues;
        }
        
        await order.save();
        res.json({ success: true, order });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Update GPS Location (Provider)
app.post('/api/orders/update-location', authMiddleware, async (req, res) => {
    try {
        const { orderNumber, lat, lng, address } = req.body;
        const order = await Order.findOne({ orderNumber });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        order.currentLocation = { lat, lng, address };
        order.trackingHistory.push({
            location: { lat, lng, address },
            status: order.status,
            timestamp: new Date()
        });
        
        await order.save();
        io.emit('location-update', { orderNumber, lat, lng, address });
        
        res.json({ success: true, location: order.currentLocation });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ PAYMENT SYSTEM ============

// Create Stripe Payment Intent
app.post('/api/payments/create-intent', authMiddleware, async (req, res) => {
    try {
        const { amount, currency, orderId, method } = req.body;
        
        if (method === 'stripe') {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(amount * 100),
                currency: currency.toLowerCase(),
                metadata: { orderId, userId: req.user.id }
            });
            
            const payment = new Payment({
                orderId,
                amount,
                currency,
                method: 'stripe',
                transactionId: paymentIntent.id,
                status: 'pending'
            });
            await payment.save();
            
            res.json({ clientSecret: paymentIntent.client_secret, paymentId: payment._id });
        } else if (method === 'nmb') {
            // NMB Bank integration
            const payment = new Payment({
                orderId,
                amount,
                currency,
                method: 'nmb',
                transactionId: 'NMB' + Date.now(),
                status: 'pending',
                receiverAccount: process.env.NMB_ACCOUNT
            });
            await payment.save();
            
            res.json({ 
                bankDetails: {
                    bank: 'NMB Bank Tanzania',
                    accountName: 'City Tech Holdings',
                    accountNumber: process.env.NMB_ACCOUNT,
                    swiftCode: 'NMBCTZTZ',
                    reference: payment.transactionId
                },
                paymentId: payment._id
            });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Confirm Payment
app.post('/api/payments/confirm', authMiddleware, async (req, res) => {
    try {
        const { paymentId, transactionReference } = req.body;
        const payment = await Payment.findById(paymentId);
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        
        payment.status = 'completed';
        payment.transactionId = transactionReference || payment.transactionId;
        await payment.save();
        
        // Update order payment status
        if (payment.orderId) {
            await Order.findByIdAndUpdate(payment.orderId, { paymentStatus: 'escrow' });
        }
        
        res.json({ success: true, payment });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ AI BUSINESS BOT ============
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;

app.post('/api/bot/chat', async (req, res) => {
    try {
        const { message, context } = req.body;
        
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GOOGLE_AI_API_KEY}`,
            {
                contents: [{
                    parts: [{
                        text: `You are a professional business assistant for City Find global platform. 
                        Help with: ads, logistics, payments, deliveries, quality checks.
                        User context: ${JSON.stringify(context)}
                        User message: ${message}
                        
                        Respond professionally and helpfully.`
                    }]
                }]
            }
        );
        
        const botReply = response.data.candidates[0].content.parts[0].text;
        res.json({ reply: botReply });
    } catch (error) {
        res.status(400).json({ error: error.message, reply: "I'm here to help! Please contact support at +255796323348 for urgent matters." });
    }
});

// ============ VIDEO CALL & VOICE FEATURE (WebRTC Signaling) ============
const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('register-user', (userId) => {
        connectedUsers.set(userId, socket.id);
    });
    
    socket.on('call-user', ({ from, to, signalData, type }) => {
        const targetSocket = connectedUsers.get(to);
        if (targetSocket) {
            io.to(targetSocket).emit('incoming-call', { from, signalData, type });
        }
    });
    
    socket.on('answer-call', ({ to, signalData }) => {
        const targetSocket = connectedUsers.get(to);
        if (targetSocket) {
            io.to(targetSocket).emit('call-answered', { signalData });
        }
    });
    
    socket.on('voice-message', ({ to, audioUrl }) => {
        const targetSocket = connectedUsers.get(to);
        if (targetSocket) {
            io.to(targetSocket).emit('new-voice-message', { from: socket.userId, audioUrl });
        }
    });
    
    socket.on('disconnect', () => {
        for (let [userId, sockId] of connectedUsers.entries()) {
            if (sockId === socket.id) connectedUsers.delete(userId);
        }
    });
});

// ============ DASHBOARD STATS ============
app.get('/api/admin/stats', authMiddleware, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    
    const totalUsers = await User.countDocuments();
    const totalAds = await Ad.countDocuments();
    const activeAds = await Ad.countDocuments({ status: 'active' });
    const totalOrders = await Order.countDocuments();
    const completedOrders = await Order.countDocuments({ status: 'completed' });
    const totalRevenue = await Payment.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const pendingPayments = await Payment.countDocuments({ status: 'pending' });
    
    res.json({
        totalUsers,
        totalAds,
        activeAds,
        totalOrders,
        completedOrders,
        totalRevenue: totalRevenue[0]?.total || 0,
        pendingPayments
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 City Find Global Platform running on port ${PORT}`));
