const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/Payment');
const Order = require('../models/Order');

const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    try {
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Create Payment Intent (Stripe)
router.post('/create-intent', authMiddleware, async (req, res) => {
    try {
        const { amount, currency, orderId, method, returnUrl } = req.body;
        
        if (method === 'stripe') {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(amount * 100),
                currency: currency.toLowerCase(),
                metadata: { orderId, userId: req.user.id },
                return_url: returnUrl || 'https://cityfind.zass.website'
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
            const payment = new Payment({
                orderId,
                amount,
                currency,
                method: 'nmb',
                transactionId: 'NMB' + Date.now() + Math.floor(Math.random() * 10000),
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
                    reference: payment.transactionId,
                    amount: amount,
                    currency: currency
                },
                paymentId: payment._id
            });
            
        } else if (method === 'pesapal') {
            // Pesapal integration placeholder
            const payment = new Payment({
                orderId,
                amount,
                currency,
                method: 'pesapal',
                transactionId: 'PESA' + Date.now(),
                status: 'pending'
            });
            await payment.save();
            
            res.json({
                pesapalUrl: `https://www.pesapal.com/api/PostPesapalDirectOrderV4`,
                paymentId: payment._id,
                merchantReference: payment.transactionId
            });
        } else {
            res.status(400).json({ error: 'Unsupported payment method' });
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Confirm Payment
router.post('/confirm', authMiddleware, async (req, res) => {
    try {
        const { paymentId, transactionReference } = req.body;
        const payment = await Payment.findById(paymentId);
        if (!payment) return res.status(404).json({ error: 'Payment not found' });
        
        payment.status = 'completed';
        payment.transactionId = transactionReference || payment.transactionId;
        await payment.save();
        
        if (payment.orderId) {
            await Order.findByIdAndUpdate(payment.orderId, { paymentStatus: 'escrow' });
        }
        
        res.json({ success: true, payment });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get Payment History
router.get('/history', authMiddleware, async (req, res) => {
    try {
        const payments = await Payment.find().sort({ createdAt: -1 });
        res.json(payments);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Stripe Webhook
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        await Payment.findOneAndUpdate(
            { transactionId: paymentIntent.id },
            { status: 'completed' }
        );
        
        const payment = await Payment.findOne({ transactionId: paymentIntent.id });
        if (payment && payment.orderId) {
            await Order.findByIdAndUpdate(payment.orderId, { paymentStatus: 'escrow' });
        }
    }
    
    res.json({ received: true });
});

module.exports = router;
