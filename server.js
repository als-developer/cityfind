// ============ COMPRESSION (Kasi zaidi) ============
const compression = require('compression');
app.use(compression());

// ============ HELMET (Usalama) ============
const helmet = require('helmet');
app.use(helmet({
    contentSecurityPolicy: false,
}));

// ============ RATE LIMITING (Kuzuia DDOS) ============
const rateLimit = require('express-rate-limit');

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

// ============ DYNAMIC SITEMAP GENERATOR (SEO) ============
app.get('/sitemap.xml', async (req, res) => {
    try {
        const baseUrl = 'https://cityfind.zass.website';
        const today = new Date().toISOString().split('T')[0];
        
        const ads = await Ad.find({ status: 'active' }).limit(500);
        
        let urls = `
        <url>
            <loc>${baseUrl}/</loc>
            <lastmod>${today}</lastmod>
            <changefreq>daily</changefreq>
            <priority>1.0</priority>
        </url>
        <url>
            <loc>${baseUrl}/dashboard-company.html</loc>
            <lastmod>${today}</lastmod>
            <changefreq>weekly</changefreq>
            <priority>0.8</priority>
        </url>`;
        
        for (const ad of ads) {
            urls += `
        <url>
            <loc>${baseUrl}/product.html?id=${ad._id}</loc>
            <lastmod>${today}</lastmod>
            <changefreq>weekly</changefreq>
            <priority>0.6</priority>
        </url>`;
        }
        
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
        
        res.header('Content-Type', 'application/xml');
        res.send(sitemap);
        
        // Ping Google
        axios.get('https://www.google.com/ping?sitemap=' + encodeURIComponent(`${baseUrl}/sitemap.xml`))
            .catch(() => {});
    } catch (error) {
        res.status(500).send('Error generating sitemap');
    }
});

// ============ ROBOTS.TXT ============
app.get('/robots.txt', (req, res) => {
    const robots = `User-agent: *
Allow: /
Sitemap: https://cityfind.zass.website/sitemap.xml
Disallow: /api/admin/
Disallow: /dashboard-admin.html
Crawl-delay: 1`;
    res.header('Content-Type', 'text/plain');
    res.send(robots);
});

// ============ RICH SNIPPETS (Schema.org) FOR PRODUCTS ============
app.get('/api/product/:id/schema', async (req, res) => {
    try {
        const ad = await Ad.findById(req.params.id).populate('companyId', 'companyName rating');
        if (!ad) return res.status(404).json({ error: 'Product not found' });
        
        const schema = {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": ad.title,
            "description": ad.description,
            "image": ad.mediaUrls?.[0] || '',
            "offers": {
                "@type": "Offer",
                "price": ad.price,
                "priceCurrency": ad.currency,
                "availability": "https://schema.org/InStock"
            },
            "brand": {
                "@type": "Brand",
                "name": ad.companyId?.companyName || 'City Find'
            },
            "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": ad.companyId?.rating || 5,
                "reviewCount": 1
            }
        };
        res.json(schema);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ CONTACT FORM (Email) ============
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, message, phone } = req.body;
        
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.ADMIN_EMAIL,
                pass: process.env.EMAIL_PASSWORD
            }
        });
        
        await transporter.sendMail({
            from: `"City Find Contact" <${process.env.ADMIN_EMAIL}>`,
            to: process.env.ADMIN_EMAIL,
            subject: `New Contact Form Message from ${name}`,
            html: `
                <h2>New Contact Form Submission</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
                <p><strong>Message:</strong></p>
                <p>${message}</p>
            `
        });
        
        res.json({ success: true, message: "Message sent successfully!" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ NEWSLETTER SUBSCRIPTION ============
const newsletterSchema = new mongoose.Schema({
    email: { type: String, unique: true },
    subscribedAt: { type: Date, default: Date.now }
});
const Newsletter = mongoose.model('Newsletter', newsletterSchema);

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

// ============ ANALYTICS TRACKING ============
const analyticsSchema = new mongoose.Schema({
    page: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ip: String,
    userAgent: String,
    timestamp: { type: Date, default: Date.now }
});
const Analytics = mongoose.model('Analytics', analyticsSchema);

app.post('/api/analytics/track', async (req, res) => {
    try {
        const { page, userId } = req.body;
        const analytics = new Analytics({
            page,
            userId: userId || null,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });
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
        const pageViews = await Analytics.aggregate([
            { $group: { _id: '$page', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        
        res.json({
            totalVisits,
            uniqueVisitors: uniqueVisitors.length,
            pageViews,
            last30Days: await Analytics.countDocuments({ timestamp: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } })
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ BACKUP DATABASE (Admin only) ============
app.get('/api/admin/backup', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        const ads = await Ad.find();
        const orders = await Order.find();
        const payments = await Payment.find();
        
        const backup = {
            generatedAt: new Date(),
            users,
            ads,
            orders,
            payments
        };
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=cityfind-backup.json');
        res.json(backup);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ============ SYSTEM STATS (Admin only) ============
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
        const totalRevenue = await Payment.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        res.json({
            users: { total: totalUsers, companies: totalCompanies, providers: totalProviders, receivers: totalReceivers },
            ads: { total: totalAds, active: activeAds },
            orders: { total: totalOrders, completed: completedOrders },
            revenue: totalRevenue[0]?.total || 0,
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                memoryUsage: process.memoryUsage(),
                uptime: process.uptime()
            }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ============ PWA SERVICE WORKER ROUTE ============
app.get('/sw.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sw.js'));
});

app.get('/manifest.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'manifest.json'));
});

// ============ SCHEDULED SITEMAP PING (Every 24 hours) ============
setInterval(() => {
    const baseUrl = 'https://cityfind.zass.website';
    axios.get('https://www.google.com/ping?sitemap=' + encodeURIComponent(`${baseUrl}/sitemap.xml`))
        .catch(() => {});
    console.log('🔄 Sitemap pinged to Google');
}, 24 * 60 * 60 * 1000);
