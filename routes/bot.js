const express = require('express');
const router = express.Router();
const axios = require('axios');

const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;

// Business information for context
const BUSINESS_INFO = {
    name: 'City Find',
    company: 'City Tech Holdings',
    email: 'citytechuk@gmail.com',
    phone: '+255796323348',
    whatsapp: '+255796323348',
    website: 'https://cityfind.zass.website',
    bank: {
        name: 'NMB Bank Tanzania',
        accountName: 'City Tech Holdings',
        accountNumber: '5161480052318274',
        swiftCode: 'NMBCTZTZ'
    },
    services: [
        'Business Advertising (banners, featured spots, sponsored content)',
        'Logistics & Delivery with GPS tracking',
        'QR/Barcode scanning for product verification',
        'Quality Check System with video verification',
        'Escrow Payment Protection',
        'Global Business Directory'
    ],
    pricing: {
        banner: '$100/month',
        featured: '$500/month',
        sponsored: '$1,000/month',
        deliveryFee: '$10 base + $0.50/km'
    }
};

// Language prompts
const LANGUAGE_PROMPTS = {
    en: 'Respond in English',
    sw: 'Respond in Kiswahili (Swahili)',
    fr: 'Respond in French',
    es: 'Respond in Spanish',
    ar: 'Respond in Arabic',
    zh: 'Respond in Chinese',
    hi: 'Respond in Hindi',
    pt: 'Respond in Portuguese',
    ru: 'Respond in Russian',
    de: 'Respond in German',
    ja: 'Respond in Japanese',
    ko: 'Respond in Korean',
    it: 'Respond in Italian',
    tr: 'Respond in Turkish'
};

// Quick responses for common questions (to save API calls)
const QUICK_RESPONSES = {
    'price': `Our pricing:\n- Banner Ads: ${BUSINESS_INFO.pricing.banner}\n- Featured Ads: ${BUSINESS_INFO.pricing.featured}\n- Sponsored Ads: ${BUSINESS_INFO.pricing.sponsored}\n- Delivery: ${BUSINESS_INFO.pricing.deliveryFee}`,
    'contact': `You can reach us at:\n📧 Email: ${BUSINESS_INFO.email}\n📞 Phone: ${BUSINESS_INFO.phone}\n💬 WhatsApp: ${BUSINESS_INFO.whatsapp}`,
    'bank': `Bank details for payment:\nBank: ${BUSINESS_INFO.bank.name}\nAccount Name: ${BUSINESS_INFO.bank.accountName}\nAccount Number: ${BUSINESS_INFO.bank.accountNumber}\nSWIFT: ${BUSINESS_INFO.bank.swiftCode}`,
    'services': `We offer:\n${BUSINESS_INFO.services.map(s => `• ${s}`).join('\n')}`,
    'track': 'To track your order, go to the Tracking section on our website and enter your order number (e.g., ORD1234567890)',
    'advertise': 'To advertise your business, register as a Company, then go to Dashboard and click "Create New Ad". Our team will approve within 24 hours.',
    'delivery': 'Delivery process: 1) Order created → 2) Provider scans QR → 3) In transit with live GPS → 4) Quality check by receiver → 5) Payment released',
    'quality': 'Quality check process: Record a video of the product, take photos, verify if matches specifications. If issues found, dispute is raised for admin review.'
};

// Main chat endpoint
router.post('/chat', async (req, res) => {
    try {
        const { message, context, language } = req.body;
        const userMessage = message.toLowerCase().trim();
        
        // Check for quick responses first
        for (const [key, response] of Object.entries(QUICK_RESPONSES)) {
            if (userMessage.includes(key)) {
                return res.json({ reply: response, quick: true });
            }
        }
        
        // Check for order tracking
        const orderMatch = userMessage.match(/ord\d+/i);
        if (orderMatch) {
            return res.json({ 
                reply: `I see you're asking about order ${orderMatch[0]}. Please visit our Tracking page to see real-time location and status of your delivery. You can also contact our support at ${BUSINESS_INFO.whatsapp} for immediate assistance.`
            });
        }
        
        // Use Google Gemini AI for complex queries
        const languagePrompt = LANGUAGE_PROMPTS[language] || LANGUAGE_PROMPTS.en;
        
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GOOGLE_AI_API_KEY}`,
            {
                contents: [{
                    parts: [{
                        text: `You are a professional business assistant for ${BUSINESS_INFO.name} by ${BUSINESS_INFO.company}.
                        
                        BUSINESS INFORMATION:
                        - Website: ${BUSINESS_INFO.website}
                        - Email: ${BUSINESS_INFO.email}
                        - Phone/WhatsApp: ${BUSINESS_INFO.phone}
                        - Bank: ${BUSINESS_INFO.bank.name} - Account: ${BUSINESS_INFO.bank.accountNumber}
                        
                        SERVICES OFFERED:
                        ${BUSINESS_INFO.services.map(s => `- ${s}`).join('\n')}
                        
                        PRICING:
                        - Banner Ads: ${BUSINESS_INFO.pricing.banner}
                        - Featured Ads: ${BUSINESS_INFO.pricing.featured}
                        - Sponsored Ads: ${BUSINESS_INFO.pricing.sponsored}
                        - Delivery Fee: ${BUSINESS_INFO.pricing.deliveryFee}
                        
                        INSTRUCTIONS:
                        ${languagePrompt}
                        Be helpful, professional, and concise.
                        If user wants to place an ad, guide them to register as a Company.
                        If user wants to track an order, guide them to use the tracking feature.
                        If user asks about payment, provide bank details.
                        If user has a dispute, advise them to contact support via WhatsApp.
                        
                        USER CONTEXT:
                        - Role: ${context?.userRole || 'Guest'}
                        - Email: ${context?.userEmail || 'Not logged in'}
                        
                        USER QUESTION: ${message}
                        
                        Respond in a friendly, professional manner.`
                    }]
                }]
            }
        );
        
        const botReply = response.data.candidates[0].content.parts[0].text;
        res.json({ reply: botReply });
        
    } catch (error) {
        console.error('Bot API Error:', error.response?.data || error.message);
        
        // Fallback response
        res.json({ 
            reply: `Thank you for your message! I'm here to help with any questions about ${BUSINESS_INFO.name}.

For immediate assistance:
📧 Email: ${BUSINESS_INFO.email}
📞 Phone/WhatsApp: ${BUSINESS_INFO.phone}

How can I help you today? You can ask me about:
- Advertising prices
- Delivery tracking
- Payment methods
- Quality check process
- Dispute resolution`,
            fallback: true
        });
    }
});

// Health check endpoint
router.get('/health', (req, res) => {
    res.json({ 
        status: 'online', 
        botName: 'City Find AI Assistant',
        version: '2.0.0',
        services: BUSINESS_INFO.services.length
    });
});

// Get business info endpoint
router.get('/info', (req, res) => {
    res.json({
        name: BUSINESS_INFO.name,
        company: BUSINESS_INFO.company,
        contact: {
            email: BUSINESS_INFO.email,
            phone: BUSINESS_INFO.phone,
            whatsapp: BUSINESS_INFO.whatsapp
        },
        bank: BUSINESS_INFO.bank,
        services: BUSINESS_INFO.services,
        pricing: BUSINESS_INFO.pricing
    });
});

module.exports = router;
