const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Ad = require('../models/Ad');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const CompanyRating = require('../models/CompanyRating');

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

const adminMiddleware = async (req, res, next) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
};

// ============ AUTH ROUTES ============
router.post('/auth/register', async (req, res) => {
    try {
        const { fullName, email, password, phone, role, companyName } = req.body;
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'Email already registered' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ fullName, email, password: hashedPassword, phone, role, companyName });
        await user.save();
        
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
        res.json({ token, user: { id: user._id, email, role, fullName, phone } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(401).json({ error: 'User not found' });
        
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return res.status(401).json({ error: 'Invalid password' });
        
        const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
        res.json({ token, user: { id: user._id, email, role: user.role, fullName: user.fullName, phone: user.phone } });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ ADS ROUTES ============
router.post('/ads/create', authMiddleware, async (req, res) => {
    try {
        const { title, description, mediaUrls, mediaType, category, adType, price, currency, expiryDate } = req.body;
        
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
            mediaUrls: mediaUrls || [],
            mediaType: mediaType || 'image',
            category,
            adType,
            price,
            currency: currency || 'USD',
            expiryDate: expiryDate ? new Date(expiryDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            galaxyAnimation: galaxyAnimations[adType] || 'standard_galaxy',
            status: 'pending'
        });
        
        await ad.save();
        res.json({ success: true, ad });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/ads', async (req, res) => {
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

router.get('/ads/my', authMiddleware, async (req, res) => {
    try {
        const ads = await Ad.find({ companyId: req.user.id });
        res.json(ads);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/ads/:id/approve', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const ad = await Ad.findByIdAndUpdate(req.params.id, { status: 'active' }, { new: true });
        res.json({ success: true, ad });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/ads/:id', authMiddleware, async (req, res) => {
    try {
        await Ad.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ RATINGS ============
router.post('/ratings/company', authMiddleware, async (req, res) => {
    try {
        const { companyId, orderId, rating, comment, deliveryOnTime, qualityMatched, communication } = req.body;
        
        const ratingRecord = new CompanyRating({
            companyId,
            reviewerId: req.user.id,
            orderId,
            rating,
            comment,
            deliveryOnTime,
            qualityMatched,
            communication
        });
        await ratingRecord.save();
        
        const avgRating = await CompanyRating.aggregate([
            { $match: { companyId: companyId } },
            { $group: { _id: null, avg: { $avg: '$rating' } } }
        ]);
        
        await User.findByIdAndUpdate(companyId, { rating: avgRating[0]?.avg || 5 });
        
        res.json({ success: true, rating: ratingRecord });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/ratings/company/:companyId', async (req, res) => {
    try {
        const ratings = await CompanyRating.find({ companyId: req.params.companyId })
            .populate('reviewerId', 'fullName')
            .sort({ createdAt: -1 });
        res.json(ratings);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ ADMIN ROUTES ============
router.get('/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/admin/users/:id/verify', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { isVerified: true }, { new: true });
        res.json({ success: true, user });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ DASHBOARD STATS ============
router.get('/company/stats', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'company') return res.status(403).json({ error: 'Company access required' });
        
        const totalAds = await Ad.countDocuments({ companyId: req.user.id });
        const activeAds = await Ad.countDocuments({ companyId: req.user.id, status: 'active' });
        const totalOrders = await Order.countDocuments({ senderId: req.user.id });
        const completedOrders = await Order.countDocuments({ senderId: req.user.id, status: 'completed' });
        
        const totalSpent = await Payment.aggregate([
            { $match: { senderName: req.user.fullName, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const companyRating = await CompanyRating.aggregate([
            { $match: { companyId: req.user.id } },
            { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
        ]);
        
        res.json({
            ads: { total: totalAds, active: activeAds },
            orders: { total: totalOrders, completed: completedOrders },
            spent: totalSpent[0]?.total || 0,
            rating: companyRating[0]?.avg || 5,
            ratingCount: companyRating[0]?.count || 0
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/provider/stats', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'provider') return res.status(403).json({ error: 'Provider access required' });
        
        const totalDeliveries = await Order.countDocuments({ providerId: req.user.id });
        const completedDeliveries = await Order.countDocuments({ providerId: req.user.id, status: 'completed' });
        const pendingDeliveries = await Order.countDocuments({ providerId: req.user.id, status: { $in: ['pending', 'scanning', 'in_transit'] } });
        
        const totalEarnings = await Payment.aggregate([
            { $match: { receiverName: req.user.fullName, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        res.json({
            deliveries: { total: totalDeliveries, completed: completedDeliveries, pending: pendingDeliveries },
            earnings: totalEarnings[0]?.total || 0,
            rating: req.user.rating
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/receiver/stats', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'receiver') return res.status(403).json({ error: 'Receiver access required' });
        
        const totalOrders = await Order.countDocuments({ receiverId: req.user.id });
        const receivedOrders = await Order.countDocuments({ receiverId: req.user.id, status: 'completed' });
        const pendingOrders = await Order.countDocuments({ receiverId: req.user.id, status: { $in: ['pending', 'scanning', 'in_transit'] } });
        
        const totalSpent = await Payment.aggregate([
            { $match: { senderName: req.user.fullName, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        res.json({
            orders: { total: totalOrders, received: receivedOrders, pending: pendingOrders },
            spent: totalSpent[0]?.total || 0
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
