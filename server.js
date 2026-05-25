const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const QRCode = require('qrcode');
const bwipjs = require('bwip-js');
const path = require('path');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');

dotenv.config();

// ============ INITIALIZE APP FIRST ============
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });
app.set('io', io);

// ============ MIDDLEWARE (AFTER APP IS DEFINED) ============
app.use(compression());
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ============ RATE LIMITING ============
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});

const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    message: { error: 'Too many login attempts, please try again after 1 minute.' }
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ============ CLOUDINARY CONFIG ============
let upload;
let cloudinaryConfigured = false;

try {
    if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
        });
        
        const storage = new CloudinaryStorage({
            cloudinary: cloudinary,
            params: {
                folder: 'cityfind',
                allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'mp4', 'pdf'],
                transformation: [{ width: 1200, height: 800, crop: 'limit' }]
            }
        });
        upload = multer({ storage: storage });
        cloudinaryConfigured = true;
        console.log('✅ Cloudinary configured successfully');
    } else {
        console.log('⚠️ Cloudinary credentials missing, using memory storage');
        const memoryStorage = multer.memoryStorage();
        upload = multer({ storage: memoryStorage });
    }
} catch (error) {
    console.error('❌ Cloudinary configuration error:', error.message);
    const memoryStorage = multer.memoryStorage();
    upload = multer({ storage: memoryStorage });
}

// ============ DATABASE SCHEMAS ============
const userSchema = new mongoose.Schema({
    fullName: String,
    email: { type: String, unique: true },
    password: String,
    phone: String,
    role: { type: String, enum: ['admin', 'company', 'provider', 'receiver', 'viewer'], default: 'viewer' },
    companyName: String,
    logoUrl: String,
    isVerified: { type: Boolean, default: false },
    walletBalance: { type: Number, default: 0 },
    rating: { type: Number, default: 5 },
    totalDeliveries: { type: Number, default: 0 },
    location: { lat: Number, lng: Number, address: String },
    freeTierUsed: { type: Boolean, default: false },
    freeTierExpiry: { type: Date },
    isPremium: { type: Boolean, default: false },
    premiumExpiry: { type: Date },
    savedAds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Ad' }],
    createdAt: { type: Date, default: Date.now }
});

const adSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    description: String,
    mediaUrls: [String],
    mediaType: { type: String, enum: ['image', 'video', 'pdf', 'animation'], default: 'image' },
    category: String,
    adType: { type: String, enum: ['banner', 'featured', 'sidebar', 'sponsored'], default: 'banner' },
    price: Number,
    currency: { type: String, default: 'USD' },
    status: { type: String, enum: ['pending', 'active', 'expired', 'rejected'], default: 'pending' },
    expiryDate: Date,
    galaxyAnimation: String,
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

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
        location: { lat: Number, lng: Number, address: String },
        status: String,
        timestamp: Date,
        videoUrl: String,
        photoUrls: [String]
    }],
    qualityCheckVideo: String,
    qualityCheckPhotos: [String],
    qualityPassed: { type: Boolean, default: false },
    qualityIssues: String,
    paymentAmount: { type: Number, default: 0 },
    paymentCurrency: { type: String, default: 'USD' },
    paymentStatus: { type: String, enum: ['pending', 'escrow', 'released', 'refunded'], default: 'pending' },
    deliveryFee: { type: Number, default: 10 },
    distance: { type: Number, default: 0 },
    estimatedDelivery: Date,
    actualDelivery: Date,
    createdAt: { type: Date, default: Date.now }
});

const paymentSchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    adId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ad' },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: Number,
    currency: { type: String, default: 'USD' },
    method: { type: String, enum: ['stripe', 'pesapal', 'nmb', 'card', 'crypto', 'bank_transfer'] },
    transactionId: String,
    status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
    senderAccount: String,
    receiverAccount: String,
    senderName: String,
    receiverName: String,
    phoneNumber: String,
    screenshotUrl: String,
    verifiedAt: Date,
    rejectionReason: String,
    createdAt: { type: Date, default: Date.now }
});

const companyRatingSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    rating: { type: Number, min: 1, max: 5 },
    comment: String,
    deliveryOnTime: Boolean,
    qualityMatched: Boolean,
    communication: { type: Number, min: 1, max: 5 },
    createdAt: { type: Date, default: Date.now }
});

const activityLogSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: String,
    details: String,
    ipAddress: String,
    createdAt: { type: Date, default: Date.now }
});

const promoCodeSchema = new mongoose.Schema({
    code: { type: String, unique: true },
    discountPercent: Number,
    validUntil: Date,
    maxUses: Number,
    usedCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true }
});

const newsletterSchema = new mongoose.Schema({
    email: { type: String, unique: true },
    subscribedAt: { type: Date, default: Date.now }
});

const analyticsSchema = new mongoose.Schema({
    page: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ip: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Ad = mongoose.model('Ad', adSchema);
const Order = mongoose.model('Order', orderSchema);
const Payment = mongoose.model('Payment', paymentSchema);
const CompanyRating = mongoose.model('CompanyRating', companyRatingSchema);
const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);
const PromoCode = mongoose.model('PromoCode', promoCodeSchema);
const Newsletter = mongoose.model('Newsletter', newsletterSchema);
const Analytics = mongoose.model('Analytics', analyticsSchema);

// ============ CONNECT TO MONGODB ============
const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000
}).then(() => {
    console.log('✅ MongoDB connected successfully');
}).catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
});

// ============ AUTH MIDDLEWARE ============
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
        res.json({ token, user: { id: user._id, email, role: user.role, fullName: user.fullName, phone: user.phone } });
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
app.post('/api/ads/create', authMiddleware, upload.array('media', 10), async (req, res) => {
    try {
        const { title, description, mediaType, category, adType, price, currency, expiryDate } = req.body;
        
        let mediaUrls = [];
        if (req.files && req.files.length > 0) {
            if (cloudinaryConfigured) {
                mediaUrls = req.files.map(f => f.path);
            } else {
                mediaUrls = req.files.map(f => f.buffer ? `data:${f.mimetype};base64,${f.buffer.toString('base64')}` : '');
            }
        }
        
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
            mediaUrls: mediaUrls,
            mediaType: mediaType || 'image',
            category,
            adType: adType || 'banner',
            price: price || (adType === 'banner' ? 100 : adType === 'featured' ? 500 : 1000),
            currency: currency || 'USD',
            expiryDate: expiryDate ? new Date(expiryDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            galaxyAnimation: galaxyAnimations[adType] || 'standard_galaxy',
            status: 'pending'
        });
        
        await ad.save();
        res.json({ success: true, ad });
    } catch (error) {
        console.error('Ad creation error:', error);
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/ads', async (req, res) => {
    try {
        const { category, type, search } = req.query;
        let query = { status: 'active' };
        if (category && category !== 'all') query.category = category;
        if (type) query.adType = type;
        if (search) query.title = { $regex: search, $options: 'i' };
        
        const ads = await Ad.find(query).populate('companyId', 'companyName logoUrl rating').sort({ createdAt: -1 });
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

app.put('/api/ads/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const ad = await Ad.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
        res.json({ success: true, ad });
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

// ============ ORDER & TRACKING ROUTES ============
app.post('/api/orders/create', authMiddleware, async (req, res) => {
    try {
        const { productName, quantity, qualitySpecs, receiverId, productImage, deliveryFee } = req.body;
        
        const orderNumber = 'ORD' + Date.now() + Math.floor(Math.random() * 10000);
        
        const qrData = JSON.stringify({ orderNumber, productName, senderId: req.user.id, timestamp: Date.now() });
        const qrImage = await QRCode.toDataURL(qrData);
        
        let barcodeBase64 = '';
        try {
            const barcodeBuffer = await bwipjs.toBuffer({
                bcid: 'code128',
                text: orderNumber,
                scale: 3,
                height: 10,
                includetext: true,
                textxalign: 'center'
            });
            barcodeBase64 = barcodeBuffer.toString('base64');
        } catch (barcodeErr) {
            console.error('Barcode error:', barcodeErr);
        }
        
        const order = new Order({
            orderNumber,
            productName,
            quantity: quantity || 1,
            qualitySpecs: qualitySpecs ? qualitySpecs.split(',') : [],
            productImage,
            senderId: req.user.id,
            receiverId: receiverId || req.user.id,
            productQR: qrImage,
            productBarcode: barcodeBase64,
            deliveryFee: deliveryFee || 10,
            status: 'pending',
            paymentStatus: 'pending'
        });
        
        await order.save();
        res.json({ success: true, order, qrCode: qrImage });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/orders', authMiddleware, async (req, res) => {
    try {
        const orders = await Order.find({
            $or: [
                { senderId: req.user.id },
                { receiverId: req.user.id },
                { providerId: req.user.id }
            ]
        }).populate('senderId receiverId providerId', 'fullName phone companyName rating').sort({ createdAt: -1 });
        res.json(orders);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/orders/:orderNumber', async (req, res) => {
    try {
        const order = await Order.findOne({ orderNumber: req.params.orderNumber })
            .populate('senderId receiverId providerId', 'fullName phone companyName rating');
        if (!order) return res.status(404).json({ error: 'Order not found' });
        res.json(order);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/orders/scan', authMiddleware, async (req, res) => {
    try {
        const { orderNumber, location, videoUrl, photoUrls } = req.body;
        const order = await Order.findOne({ orderNumber });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        order.trackingHistory.push({
            location,
            status: order.status,
            timestamp: new Date(),
            videoUrl,
            photoUrls: photoUrls || []
        });
        
        if (order.status === 'pending') {
            order.status = 'scanning';
            order.providerId = req.user.id;
        } else if (order.status === 'scanning') {
            order.status = 'in_transit';
        } else if (order.status === 'in_transit') {
            order.status = 'quality_check';
        }
        
        order.currentLocation = location;
        await order.save();
        
        io.emit('order-update', { orderNumber, status: order.status, location, timestamp: new Date() });
        
        res.json({ success: true, order });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

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

app.post('/api/orders/quality-check', authMiddleware, async (req, res) => {
    try {
        const { orderNumber, qualityPassed, videoUrl, photos, issues } = req.body;
        const order = await Order.findOne({ orderNumber });
        if (!order) return res.status(404).json({ error: 'Order not found' });
        
        order.qualityCheckVideo = videoUrl;
        order.qualityCheckPhotos = photos || [];
        order.qualityPassed = qualityPassed;
        
        if (qualityPassed) {
            order.status = 'completed';
            order.actualDelivery = new Date();
            await Payment.findOneAndUpdate({ orderId: order._id }, { status: 'completed' });
        } else {
            order.status = 'disputed';
            order.qualityIssues = issues;
        }
        
        await order.save();
        io.emit('quality-check-result', { orderNumber, qualityPassed, issues });
        
        res.json({ success: true, order });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ PAYMENT ROUTES ============
app.post('/api/payments/create-intent', authMiddleware, async (req, res) => {
    try {
        const { amount, currency, orderId, method } = req.body;
        
        const payment = new Payment({
            orderId,
            amount,
            currency: currency || 'USD',
            method: method || 'nmb',
            transactionId: (method === 'nmb' ? 'NMB' : 'TXN') + Date.now() + Math.floor(Math.random() * 10000),
            status: 'pending',
            receiverAccount: process.env.NMB_ACCOUNT || '5161480052318274',
            senderName: req.user.fullName,
            receiverName: 'City Tech Holdings'
        });
        await payment.save();
        
        if (method === 'nmb') {
            res.json({ 
                bankDetails: {
                    bank: 'NMB Bank Tanzania',
                    accountName: 'City Tech Holdings',
                    accountNumber: process.env.NMB_ACCOUNT || '5161480052318274',
                    swiftCode: 'NMBCTZTZ',
                    reference: payment.transactionId,
                    amount: amount,
                    currency: currency || 'USD'
                },
                paymentId: payment._id
            });
        } else {
            res.json({ 
                message: 'Payment initiated',
                paymentId: payment._id,
                transactionId: payment.transactionId
            });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/payments/confirm', authMiddleware, async (req, res) => {
    try {
        const { paymentId, transactionReference } = req.body;
        const payment = await Payment.findById(paymentId);
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        
        payment.status = 'completed';
        payment.transactionId = transactionReference || payment.transactionId;
        await payment.save();
        
        if (payment.orderId) {
            await Order.findByIdAndUpdate(payment.orderId, { paymentStatus: 'escrow', paymentAmount: payment.amount });
        }
        
        res.json({ success: true, payment });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/payments/history', authMiddleware, async (req, res) => {
    try {
        const payments = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(payments);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ FREE TIER & PAYMENT VERIFICATION ROUTES ============

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
            user.isPremium = false;
            await user.save();
            return res.json({ hasFreeTier: true, expiresAt: user.freeTierExpiry });
        }
        
        res.json({ hasFreeTier: false });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/payments/upload-screenshot', authMiddleware, upload.single('screenshot'), async (req, res) => {
    try {
        const { amount, phoneNumber, transactionId } = req.body;
        let screenshotUrl = null;
        
        if (req.file) {
            if (cloudinaryConfigured && req.file.path) {
                screenshotUrl = req.file.path;
            } else if (req.file.buffer) {
                screenshotUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
            }
        }
        
        const payment = new Payment({
            userId: req.user.id,
            amount: amount || 0,
            currency: 'TZS',
            method: 'bank_transfer',
            transactionId: transactionId || 'PENDING_' + Date.now(),
            status: 'pending',
            screenshotUrl: screenshotUrl,
            phoneNumber: phoneNumber,
            senderName: req.user.fullName,
            receiverName: 'City Tech Holdings',
            receiverAccount: process.env.NMB_ACCOUNT || '5161480052318274'
        });
        
        await payment.save();
        console.log(`📱 Payment uploaded by ${req.user.fullName}: ${amount} TZS`);
        
        res.json({ success: true, paymentId: payment._id, message: "Payment screenshot uploaded! Our team will verify within 24 hours." });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/payments/status', authMiddleware, async (req, res) => {
    try {
        const payments = await Payment.find({ userId: req.user.id }).sort({ createdAt: -1 });
        const user = await User.findById(req.user.id);
        
        res.json({
            payments: payments.map(p => ({ amount: p.amount, status: p.status, createdAt: p.createdAt })),
            isPremium: user.isPremium || false,
            premiumExpiry: user.premiumExpiry,
            freeTierUsed: user.freeTierUsed,
            freeTierExpiry: user.freeTierExpiry
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/admin/verify-payment', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { paymentId, action, reason } = req.body;
        const payment = await Payment.findById(paymentId).populate('userId');
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        
        if (action === 'approve') {
            payment.status = 'completed';
            payment.verifiedAt = new Date();
            await payment.save();
            
            if (payment.userId) {
                payment.userId.isPremium = true;
                payment.userId.premiumExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                await payment.userId.save();
                console.log(`✅ Premium activated for ${payment.userId.email}`);
            }
            res.json({ success: true, message: "Payment verified! User premium activated for 30 days." });
        } else if (action === 'reject') {
            payment.status = 'failed';
            payment.rejectionReason = reason;
            await payment.save();
            res.json({ success: true, message: "Payment rejected." });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/admin/pending-payments', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const pendingPayments = await Payment.find({ status: 'pending' }).sort({ createdAt: -1 }).populate('userId', 'fullName email phone');
        res.json(pendingPayments);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ RATINGS & REVIEWS ROUTES ============
app.post('/api/ratings/company', authMiddleware, async (req, res) => {
    try {
        const { companyId, orderId, rating, comment, deliveryOnTime, qualityMatched, communication } = req.body;
        
        const existingRating = await CompanyRating.findOne({ 
            companyId: companyId, 
            reviewerId: req.user.id,
            orderId: orderId 
        });
        
        if (existingRating) {
            return res.status(400).json({ error: 'You have already rated this company for this order' });
        }
        
        const ratingRecord = new CompanyRating({
            companyId,
            reviewerId: req.user.id,
            orderId: orderId || 'manual_' + Date.now(),
            rating: parseInt(rating),
            comment: comment || '',
            deliveryOnTime: deliveryOnTime !== undefined ? deliveryOnTime : true,
            qualityMatched: qualityMatched !== undefined ? qualityMatched : true,
            communication: communication || parseInt(rating)
        });
        
        await ratingRecord.save();
        
        const avgRating = await CompanyRating.aggregate([
            { $match: { companyId: companyId } },
            { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]);
        
        const newAvgRating = avgRating[0]?.avg || rating;
        await User.findByIdAndUpdate(companyId, { rating: newAvgRating });
        
        res.json({ success: true, message: `Thank you for your ${rating}-star rating!`, averageRating: newAvgRating });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/ratings/company/:companyId', async (req, res) => {
    try {
        const ratings = await CompanyRating.find({ companyId: req.params.companyId })
            .populate('reviewerId', 'fullName')
            .sort({ createdAt: -1 });
        
        const company = await User.findById(req.params.companyId).select('companyName fullName rating');
        res.json({ company, ratings, averageRating: company?.rating || 0, totalRatings: ratings.length });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/ratings/my', authMiddleware, async (req, res) => {
    try {
        const ratings = await CompanyRating.find({ reviewerId: req.user.id })
            .populate('companyId', 'companyName fullName')
            .sort({ createdAt: -1 });
        res.json(ratings);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ DASHBOARD STATS ROUTES ============
app.get('/api/company/stats', authMiddleware, async (req, res) => {
    try {
        const totalAds = await Ad.countDocuments({ companyId: req.user.id });
        const activeAds = await Ad.countDocuments({ companyId: req.user.id, status: 'active' });
        const totalOrders = await Order.countDocuments({ senderId: req.user.id });
        const completedOrders = await Order.countDocuments({ senderId: req.user.id, status: 'completed' });
        const user = await User.findById(req.user.id);
        
        res.json({ ads: { total: totalAds, active: activeAds }, orders: { total: totalOrders, completed: completedOrders }, spent: user?.walletBalance || 0, rating: user?.rating || 5 });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/provider/stats', authMiddleware, async (req, res) => {
    try {
        const totalDeliveries = await Order.countDocuments({ providerId: req.user.id });
        const completedDeliveries = await Order.countDocuments({ providerId: req.user.id, status: 'completed' });
        const pendingDeliveries = await Order.countDocuments({ providerId: req.user.id, status: { $in: ['pending', 'scanning', 'in_transit'] } });
        const user = await User.findById(req.user.id);
        
        res.json({ deliveries: { total: totalDeliveries, completed: completedDeliveries, pending: pendingDeliveries }, earnings: user?.walletBalance || 0, rating: user?.rating || 5 });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/receiver/stats', authMiddleware, async (req, res) => {
    try {
        const totalOrders = await Order.countDocuments({ receiverId: req.user.id });
        const receivedOrders = await Order.countDocuments({ receiverId: req.user.id, status: 'completed' });
        const pendingOrders = await Order.countDocuments({ receiverId: req.user.id, status: { $in: ['pending', 'scanning', 'in_transit'] } });
        const user = await User.findById(req.user.id);
        
        res.json({ orders: { total: totalOrders, received: receivedOrders, pending: pendingOrders }, spent: user?.walletBalance || 0 });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalCompanies = await User.countDocuments({ role: 'company' });
        const totalProviders = await User.countDocuments({ role: 'provider' });
        const totalReceivers = await User.countDocuments({ role: 'receiver' });
        const totalAds = await Ad.countDocuments();
        const activeAds = await Ad.countDocuments({ status: 'active' });
        const totalOrders = await Order.countDocuments();
        const completedOrders = await Order.countDocuments({ status: 'completed' });
        const totalRevenue = await Payment.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
        
        res.json({ users: { total: totalUsers, companies: totalCompanies, providers: totalProviders, receivers: totalReceivers }, ads: { total: totalAds, active: activeAds }, orders: { total: totalOrders, completed: completedOrders }, revenue: totalRevenue[0]?.total || 0 });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ AI BOT ROUTE ============
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

app.post('/api/bot/chat', async (req, res) => {
    try {
        const { message, language } = req.body;
        console.log('🤖 User asked:', message);
        
        const apiUrl = "https://api.deepseek.com/v1/chat/completions";
        const response = await axios.post(apiUrl, {
            model: "deepseek-chat",
            messages: [{ role: "system", content: `You are City Find AI Assistant. COMPANY: City Find. CONTACT: +255796323348. BANK: NMB - 5161480052318274. PRICING: Banner $100, Featured $500, Sponsored $1000/month. Answer in ${language === 'sw' ? 'Swahili' : 'English'}.` }, { role: "user", content: message }],
            temperature: 0.7, max_tokens: 2000
        }, { headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 });
        
        if (response.data && response.data.choices && response.data.choices[0]) {
            return res.json({ reply: response.data.choices[0].message.content });
        }
        throw new Error('No response from DeepSeek');
    } catch (error) {
        console.error('❌ DeepSeek API Error:', error.message);
        const lowerMsg = (message || '').toLowerCase();
        let fallbackReply = "";
        
        if (lowerMsg.includes('flower')) fallbackReply = "🌸 I can help you create a beautiful flower animation with HTML/CSS!";
        else if (lowerMsg.includes('car')) fallbackReply = "🚗 I can create a car animation for you!";
        else if (lowerMsg.includes('music')) fallbackReply = "🎵 I can create a music player website for you!";
        else fallbackReply = "👋 Hello! I'm City Find AI Assistant.\n\n💰 Ads: $100-$1000/month\n📞 WhatsApp: +255796323348\n🏦 NMB Bank: 5161480052318274\n\nHow can I help you today?";
        
        res.json({ reply: fallbackReply });
    }
});

// ============ WISHLIST ROUTES ============
app.post('/api/wishlist/add', authMiddleware, async (req, res) => {
    try {
        const { adId } = req.body;
        const user = await User.findById(req.user.id);
        if (!user.savedAds) user.savedAds = [];
        if (!user.savedAds.includes(adId)) {
            user.savedAds.push(adId);
            await user.save();
        }
        res.json({ success: true, message: "Ad saved to wishlist" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/wishlist/remove/:adId', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.savedAds = user.savedAds.filter(id => id.toString() !== req.params.adId);
        await user.save();
        res.json({ success: true, message: "Ad removed from wishlist" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/wishlist', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('savedAds');
        res.json(user.savedAds || []);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ PROMO CODE ROUTES ============
app.post('/api/promo/apply', authMiddleware, async (req, res) => {
    try {
        const { code, amount } = req.body;
        const promo = await PromoCode.findOne({ code: code.toUpperCase(), isActive: true, validUntil: { $gt: new Date() }, $expr: { $lt: ["$usedCount", "$maxUses"] } });
        if (!promo) return res.status(404).json({ error: "Invalid or expired promo code" });
        const discount = (amount * promo.discountPercent) / 100;
        promo.usedCount += 1;
        await promo.save();
        res.json({ success: true, discount, finalAmount: amount - discount, message: `${promo.discountPercent}% discount applied!` });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/admin/promo/create', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { code, discountPercent, validUntil, maxUses } = req.body;
        const promo = new PromoCode({ code: code.toUpperCase(), discountPercent, validUntil: new Date(validUntil), maxUses: maxUses || 100 });
        await promo.save();
        res.json({ success: true, promo });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ EXPORT DATA ============
app.get('/api/export/orders', authMiddleware, async (req, res) => {
    try {
        const orders = await Order.find({ senderId: req.user.id }).populate('receiverId', 'fullName phone');
        const csvData = orders.map(order => ({ 'Order Number': order.orderNumber, 'Product': order.productName, 'Quantity': order.quantity, 'Status': order.status, 'Payment Status': order.paymentStatus, 'Date': order.createdAt.toISOString().split('T')[0] }));
        const csvString = [['Order Number', 'Product', 'Quantity', 'Status', 'Payment Status', 'Date'], ...csvData.map(row => Object.values(row))].map(row => row.join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
        res.send(csvString);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ VISITOR COUNTER ============
let visitorCount = 0;
const visitorIps = new Set();

app.get('/api/visitor-count', (req, res) => {
    const clientIp = req.ip || req.connection.remoteAddress;
    if (!visitorIps.has(clientIp)) { visitorIps.add(clientIp); visitorCount++; }
    res.json({ count: visitorCount, unique: visitorIps.size });
});

app.get('/api/admin/visitor-stats', authMiddleware, adminMiddleware, (req, res) => {
    res.json({ totalVisitors: visitorCount, uniqueVisitors: visitorIps.size, lastUpdated: new Date() });
});

// ============ ACTIVITY LOGS ============
async function logActivity(userId, action, details, ipAddress) {
    try {
        const log = new ActivityLog({ userId, action, details, ipAddress });
        await log.save();
    } catch (error) { console.error('Activity log error:', error); }
}

app.get('/api/admin/activity-logs', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { limit = 50, userId } = req.query;
        let query = {};
        if (userId) query.userId = userId;
        const logs = await ActivityLog.find(query).populate('userId', 'fullName email').sort({ createdAt: -1 }).limit(parseInt(limit));
        res.json(logs);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ BULK AD MANAGEMENT ============
app.post('/api/admin/bulk-delete-expired', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await Ad.deleteMany({ expiryDate: { $lt: new Date() }, status: 'expired' });
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/admin/bulk-approve', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { adIds } = req.body;
        const result = await Ad.updateMany({ _id: { $in: adIds } }, { status: 'active' });
        res.json({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/admin/ads-stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const stats = await Ad.aggregate([{ $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 }, revenue: { $sum: "$price" } } }, { $sort: { _id: -1 } }, { $limit: 30 }]);
        res.json(stats);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ SEO ROUTES ============
app.get('/sitemap.xml', async (req, res) => {
    try {
        const baseUrl = 'https://cityfind.zass.website';
        const today = new Date().toISOString().split('T')[0];
        const ads = await Ad.find({ status: 'active' }).limit(500);
        let urls = `<url><loc>${baseUrl}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url><url><loc>${baseUrl}/dashboard-company.html</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`;
        for (const ad of ads) { urls += `<url><loc>${baseUrl}/product.html?id=${ad._id}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`; }
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
        res.header('Content-Type', 'application/xml');
        res.send(sitemap);
        axios.get('https://www.google.com/ping?sitemap=' + encodeURIComponent(`${baseUrl}/sitemap.xml`)).catch(() => {});
    } catch (error) {
        res.status(500).send('Error generating sitemap');
    }
});

app.get('/robots.txt', (req, res) => {
    res.header('Content-Type', 'text/plain');
    res.send(`User-agent: *\nAllow: /\nSitemap: https://cityfind.zass.website/sitemap.xml\nDisallow: /api/admin/\nDisallow: /dashboard-admin.html\nCrawl-delay: 1`);
});

app.get('/api/product/:id/schema', async (req, res) => {
    try {
        const ad = await Ad.findById(req.params.id).populate('companyId', 'companyName rating');
        if (!ad) return res.status(404).json({ error: 'Product not found' });
        res.json({ "@context": "https://schema.org", "@type": "Product", "name": ad.title, "description": ad.description, "image": ad.mediaUrls?.[0] || '', "offers": { "@type": "Offer", "price": ad.price, "priceCurrency": ad.currency, "availability": "https://schema.org/InStock" }, "brand": { "@type": "Brand", "name": ad.companyId?.companyName || 'City Find' }, "aggregateRating": { "@type": "AggregateRating", "ratingValue": ad.companyId?.rating || 5, "reviewCount": 1 } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ CONTACT & NEWSLETTER ============
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, message, phone } = req.body;
        const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.ADMIN_EMAIL, pass: process.env.EMAIL_PASSWORD } });
        await transporter.sendMail({ from: `"City Find Contact" <${process.env.ADMIN_EMAIL}>`, to: process.env.ADMIN_EMAIL, subject: `New Contact Form Message from ${name}`, html: `<h2>New Contact Form Submission</h2><p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Phone:</strong> ${phone || 'Not provided'}</p><p><strong>Message:</strong></p><p>${message}</p>` });
        res.json({ success: true, message: "Message sent successfully!" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/newsletter/subscribe', async (req, res) => {
    try {
        const { email } = req.body;
        const existing = await Newsletter.findOne({ email });
        if (existing) return res.status(400).json({ error: 'Email already subscribed' });
        const subscriber = new Newsletter({ email });
        await subscriber.save();
        res.json({ success: true, message: "Subscribed to newsletter!" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ ANALYTICS ============
app.post('/api/analytics/track', async (req, res) => {
    try {
        const { page, userId } = req.body;
        const analytics = new Analytics({ page, userId: userId || null, ip: req.ip, userAgent: req.headers['user-agent'] });
        await analytics.save();
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/admin/analytics', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const totalVisits = await Analytics.countDocuments();
        const uniqueVisitors = await Analytics.distinct('ip');
        const pageViews = await Analytics.aggregate([{ $group: { _id: '$page', count: { $sum: 1 } } }, { $sort: { count: -1 } }]);
        res.json({ totalVisits, uniqueVisitors: uniqueVisitors.length, pageViews, last30Days: await Analytics.countDocuments({ timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }) });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ BACKUP ============
app.get('/api/admin/backup', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        const ads = await Ad.find();
        const orders = await Order.find();
        const payments = await Payment.find();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=cityfind-backup.json');
        res.json({ generatedAt: new Date(), users, ads, orders, payments });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date(), mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

app.get('/api/admin/system-stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalCompanies = await User.countDocuments({ role: 'company' });
        const totalProviders = await User.countDocuments({ role: 'provider' });
        const totalReceivers = await User.countDocuments({ role: 'receiver' });
        const totalAds = await Ad.countDocuments();
        const activeAds = await Ad.countDocuments({ status: 'active' });
        const totalOrders = await Order.countDocuments();
        const completedOrders = await Order.countDocuments({ status: 'completed' });
        const totalRevenue = await Payment.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
        res.json({ users: { total: totalUsers, companies: totalCompanies, providers: totalProviders, receivers: totalReceivers }, ads: { total: totalAds, active: activeAds }, orders: { total: totalOrders, completed: completedOrders }, revenue: totalRevenue[0]?.total || 0, system: { nodeVersion: process.version, platform: process.platform, memoryUsage: process.memoryUsage(), uptime: process.uptime() } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ PWA SERVICE WORKER ============
app.get('/sw.js', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'sw.js')); });
app.get('/manifest.json', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'manifest.json')); });

// ============ SCHEDULED SITEMAP PING ============
setInterval(() => {
    axios.get('https://www.google.com/ping?sitemap=' + encodeURIComponent('https://cityfind.zass.website/sitemap.xml')).catch(() => {});
    console.log('🔄 Sitemap pinged to Google');
}, 24 * 60 * 60 * 1000);

// ============ SERVE HTML FILES ============
app.get('/dashboard-admin.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'dashboard-admin.html')); });
app.get('/dashboard-company.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'dashboard-company.html')); });
app.get('/dashboard-provider.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'dashboard-provider.html')); });
app.get('/dashboard-receiver.html', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'dashboard-receiver.html')); });

// ============ ROOT ROUTE ============
app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

// ============ SOCKET.IO ============
const connectedUsers = new Map();

io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);
    socket.on('register-user', (userId) => { connectedUsers.set(userId, socket.id); socket.userId = userId; });
    socket.on('call-user', ({ from, to, signalData, type }) => { const targetSocket = connectedUsers.get(to); if (targetSocket) { io.to(targetSocket).emit('incoming-call', { from, signalData, type }); } });
    socket.on('answer-call', ({ to, signalData }) => { const targetSocket = connectedUsers.get(to); if (targetSocket) { io.to(targetSocket).emit('call-answered', { signalData }); } });
    socket.on('end-call', ({ to }) => { const targetSocket = connectedUsers.get(to); if (targetSocket) { io.to(targetSocket).emit('call-ended'); } });
    socket.on('voice-message', ({ to, audioUrl, duration }) => { const targetSocket = connectedUsers.get(to); if (targetSocket) { io.to(targetSocket).emit('new-voice-message', { from: socket.userId, audioUrl, duration }); } });
    socket.on('disconnect', () => { for (let [userId, sockId] of connectedUsers.entries()) { if (sockId === socket.id) { connectedUsers.delete(userId); console.log(`🔌 User ${userId} disconnected`); } } console.log('🔌 Client disconnected:', socket.id); });
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 City Find Platform running on port ${PORT}`);
    console.log(`📱 Admin Email: ${process.env.ADMIN_EMAIL || 'citytechuk@gmail.com'}`);
    console.log(`📞 Admin Phone: ${process.env.ADMIN_PHONE || '+255796323348'}`);
    console.log(`🏦 NMB Account: ${process.env.NMB_ACCOUNT || '5161480052318274'}`);
});
