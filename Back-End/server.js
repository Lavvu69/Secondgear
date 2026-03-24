// server.js
const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const dns = require('dns');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

const session = require('express-session');
const app = express();
const cors = require('cors');
app.use(cors());
const activeAdminSessions = new Set();
let buyMaintenanceEnabled = false;

// Prefer IPv4 to avoid ENETUNREACH with IPv6-only SMTP routes on some hosts.
try {
    dns.setDefaultResultOrder('ipv4first');
} catch (err) {
    console.warn('DNS ipv4first not supported in this Node version:', err?.message || err);
}
function getDbSslConfig() {
    const caPath = process.env.DB_SSL_CA_PATH;
    if (!caPath) return undefined;
    return {
        ca: fs.readFileSync(caPath),
        rejectUnauthorized: true
    };
}

// MySQL connection (move to top)
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'secondgeardb',
    ssl: getDbSslConfig()
});

db.connect(err => {
    if (err) console.error('? DB Error:', err);
    else console.log('? Connected To SecondGearDB');
});

// --- Email Configuration (Nodemailer) ---
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER || 'secondgearproject01@gmail.com',
        pass: process.env.EMAIL_PASS || ''
    },
    family: 4
});

// Test email connection
transporter.verify((err, success) => {
    if (err) {
        console.error('? Email configuration error:', err);
    } else {
        console.log('? Email service ready');
    }
});

// Session middleware
app.use(session({
    secret: 'secondgear_secret_key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// --- Multer setup for car image uploads ---
const multer = require('multer');
const uploadDir = path.join(__dirname, '../Front-End/images/cars');
const verificationUploadDir = path.join(__dirname, '../Front-End/images/verification');
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}
ensureDir(uploadDir);
ensureDir(verificationUploadDir);
const allowedCarMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/heic',
    'image/heif'
]);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!allowedCarMimeTypes.has(file.mimetype)) {
            return cb(new Error('Only image files are allowed.'));
        }
        return cb(null, true);
    }
});
const verificationStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, verificationUploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const allowedVerificationMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
]);
const verificationUpload = multer({
    storage: verificationStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!allowedVerificationMimeTypes.has(file.mimetype)) {
            return cb(new Error('Only images or PDF files are allowed.'));
        }
        return cb(null, true);
    }
});

const cloudinaryConfigured =
    !!process.env.CLOUDINARY_CLOUD_NAME &&
    !!process.env.CLOUDINARY_API_KEY &&
    !!process.env.CLOUDINARY_API_SECRET;

if (cloudinaryConfigured) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
    });
} else {
    console.warn('Cloudinary is not configured. Car image uploads will fail until env vars are set.');
}

async function uploadCarImageToCloudinary(file) {
    if (!file) return null;
    if (!cloudinaryConfigured) {
        throw new Error('Cloudinary is not configured.');
    }
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    const result = await cloudinary.uploader.upload(dataUri, {
        folder: 'secondgear/cars',
        resource_type: 'image'
    });
    return result.secure_url;
}

// --- Chat conversation closures ---
db.query(
    `CREATE TABLE IF NOT EXISTS chat_conversation_closures (
        conversation_id INT NOT NULL,
        closed_by INT NOT NULL,
        closed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        reason VARCHAR(255) DEFAULT NULL,
        PRIMARY KEY (conversation_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    (err) => {
        if (err) console.error('Error creating chat_conversation_closures table:', err);
    }
);

// --- Car images gallery ---
db.query(
    `CREATE TABLE IF NOT EXISTS car_images (
        id INT NOT NULL AUTO_INCREMENT,
        car_id INT NOT NULL,
        image_url VARCHAR(512) NOT NULL,
        is_main TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_car_images_car (car_id),
        CONSTRAINT fk_car_images_car
            FOREIGN KEY (car_id) REFERENCES cars(id)
            ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    (err) => {
        if (err) console.error('Error creating car_images table:', err);
    }
);

// --- Wishlists ---
db.query(
    `CREATE TABLE IF NOT EXISTS wishlists (
        id INT NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        car_id INT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_wishlist_user_car (user_id, car_id),
        KEY idx_wishlist_user_id (user_id),
        KEY idx_wishlist_car_id (car_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
    (err) => {
        if (err) console.error('Error creating wishlists table:', err);
    }
);

function createUserNotification({ userId, type = 'system', title, message, link = null }) {
    if (!userId || !title || !message) return;
    db.query(
        'INSERT INTO user_notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)',
        [userId, type, title, message, link],
        (err) => {
            if (err) console.error('Failed to insert user notification:', err);
        }
    );
}

function createUserNotificationByEmail(email, payload) {
    if (!email) return;
    db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email], (err, results) => {
        if (err || !results || !results.length) return;
        createUserNotification({ ...payload, userId: results[0].id });
    });
}

function isNewsletterSubscriber(email, cb) {
    if (!email) return cb(null, false);
    db.query('SELECT id FROM newsletter_subscribers WHERE email = ? LIMIT 1', [email], (err, rows) => {
        if (err) return cb(err);
        cb(null, rows && rows.length > 0);
    });
}

// ------------------
// Mock Payments Helpers (no real money, realistic flow)
const MOCK_PAYMENT_FINALIZE_MIN_MS = 1500;
const MOCK_PAYMENT_FINALIZE_MAX_MS = 4000;
const MOCK_PAYMENT_FAIL_RATE = 0.12;
const DELIVERY_FEE = 2000;
const DOCUMENT_FEE = 1500;
const REGISTRATION_TRANSFER_FEE = 2500;
const INSPECTION_FEE = 1200;
const PLATFORM_FEE = 1500;
const INSURANCE_ADDON_FEE = 6000;
const WARRANTY_EXTENSION_FEE = 8000;
const ACCESSORY_BUNDLE_FEE = 4500;

function toAmount(value) {
    const num = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.round(num * 100) / 100;
}

function computeTotalWithFees(baseAmount, options = {}) {
    const base = toAmount(baseAmount);
    if (!Number.isFinite(base)) return { base: null, delivery: null, doc: null, total: null };
    const delivery = toAmount(DELIVERY_FEE);
    const doc = toAmount(DOCUMENT_FEE);
    const registration = toAmount(REGISTRATION_TRANSFER_FEE);
    const inspection = toAmount(INSPECTION_FEE);
    const platform = toAmount(PLATFORM_FEE);
    const insurance = options.insurance ? toAmount(INSURANCE_ADDON_FEE) : 0;
    const warranty = options.warranty ? toAmount(WARRANTY_EXTENSION_FEE) : 0;
    const accessory = options.accessory ? toAmount(ACCESSORY_BUNDLE_FEE) : 0;
    const total = toAmount(base + delivery + doc + registration + inspection + platform + insurance + warranty + accessory);
    return { base, delivery, doc, registration, inspection, platform, insurance, warranty, accessory, total };
}

function formatINR(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return '₹0';
    return `₹${num.toLocaleString('en-IN')}`;
}

const PDF_RUPEE_FONTS = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'Nirmala.ttf'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'NirmalaB.ttf'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'SegoeUI.ttf'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'Arial.ttf')
];

function getPdfRupeeFontPath() {
    for (const fontPath of PDF_RUPEE_FONTS) {
        if (fs.existsSync(fontPath)) return fontPath;
    }
    return null;
}

function generateClientSecret() {
    return `mp_cs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateReceiptNo() {
    return `RCPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function randomFailureReason() {
    const reasons = [
        'insufficient_funds',
        'invalid_cvv',
        'expired_card',
        'suspected_fraud',
        'processing_error'
    ];
    return reasons[Math.floor(Math.random() * reasons.length)];
}

function createMockPaymentEvent(paymentId, event, payload) {
    db.query(
        'INSERT INTO mock_payment_events (payment_id, event, payload) VALUES (?, ?, ?)',
        [paymentId, event, payload ? JSON.stringify(payload) : null],
        (err) => {
            if (err) console.error('Error inserting mock payment event:', err);
        }
    );
}

function updateMockPaymentStatus(paymentId, status, extra = {}) {
    const { failure_reason, receipt_no } = extra;
    db.query(
        'UPDATE mock_payments SET status = ?, failure_reason = ?, receipt_no = ? WHERE id = ?',
        [status, failure_reason || null, receipt_no || null, paymentId],
        (err) => {
            if (err) console.error('Error updating mock payment status:', err);
            createMockPaymentEvent(paymentId, `payment.${status}`, { status, ...extra });
        }
    );
}

function scheduleMockPaymentFinalize(paymentId, options = {}) {
    const delay =
        MOCK_PAYMENT_FINALIZE_MIN_MS +
        Math.floor(Math.random() * (MOCK_PAYMENT_FINALIZE_MAX_MS - MOCK_PAYMENT_FINALIZE_MIN_MS));

    setTimeout(() => {
        db.query('SELECT status FROM mock_payments WHERE id = ? LIMIT 1', [paymentId], (err, rows) => {
            if (err || !rows.length) return;
            if (rows[0].status !== 'processing') return;

            const forceFail = !!options.forceFail;
            const shouldFail = forceFail || Math.random() < MOCK_PAYMENT_FAIL_RATE;
            if (shouldFail) {
                updateMockPaymentStatus(paymentId, 'failed', { failure_reason: randomFailureReason() });
                return;
            }
            updateMockPaymentStatus(paymentId, 'succeeded', { receipt_no: generateReceiptNo() });
        });
    }, delay);
}

// ================================
// Chatbot (Local Rule-Based)
// ================================
let CHATBOT_KB = null;
try {
    const kbPath = path.resolve(__dirname, './chatbot_kb.json');
    CHATBOT_KB = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
} catch (err) {
    console.error('Failed to load chatbot_kb.json:', err);
    CHATBOT_KB = { intents: [], fallbacks: [], followups: {}, suggested_topics: [] };
}

function normalizeText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(text) {
    return normalizeText(text).split(' ').filter(Boolean);
}

function scoreIntent(message, intent) {
    const text = normalizeText(message);
    const tokens = tokenize(text);
    const keywords = (intent.keywords || []).map(k => normalizeText(k));
    let score = 0;

    keywords.forEach(k => {
        if (!k) return;
        if (text.includes(k)) score += 3;
        if (tokens.includes(k)) score += 2;
    });

    const overlap = keywords.filter(k => tokens.includes(k)).length;
    score += overlap;

    if (intent.title && text.includes(normalizeText(intent.title))) score += 2;

    return score;
}

function getBestIntent(message) {
    let best = null;
    let bestScore = 0;
    (CHATBOT_KB.intents || []).forEach(intent => {
        const score = scoreIntent(message, intent);
        if (score > bestScore) {
            bestScore = score;
            best = intent;
        }
    });
    return { intent: best, score: bestScore };
}

function getFallback() {
    const fallbacks = CHATBOT_KB.fallbacks || [];
    if (!fallbacks.length) return 'How can I help with SecondGear or automobile questions?';
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

function getLocalChatbotReply(message) {
    const { intent, score } = getBestIntent(message);
    if (intent && score >= 3) {
        return {
            reply: intent.answer,
            matched: intent.id,
            confidence: score
        };
    }

    return {
        reply: CHATBOT_KB.followups?.generic || getFallback(),
        matched: null,
        confidence: score
    };
}

const VEHICLE_CHAT_KEYWORDS = new Set([
    'car', 'cars', 'vehicle', 'vehicles', 'auto', 'automobile', 'bike', 'scooter', 'truck', 'suv', 'sedan',
    'hatchback', 'coupe', 'van', 'jeep', 'model', 'make', 'year', 'variant', 'trim',
    'price', 'pricing', 'cost', 'offer', 'deal', 'negotiation', 'negotiate', 'counter',
    'availability', 'available', 'listing', 'book', 'booking', 'buy', 'sell', 'purchase', 'checkout',
    'km', 'kms', 'kilometer', 'kilometre', 'mileage', 'odometer', 'service', 'maintenance', 'repair',
    'inspection', 'test', 'drive', 'condition', 'accident', 'damage', 'history',
    'color', 'fuel', 'petrol', 'diesel', 'cng', 'electric', 'ev', 'hybrid', 'battery',
    'transmission', 'automatic', 'manual', 'engine', 'brake', 'tyre', 'tire',
    'insurance', 'registration', 'rc', 'documents', 'paperwork', 'vin', 'number', 'owner', 'owners',
    'delivery', 'pickup', 'handover', 'payment', 'finance', 'loan', 'emi', 'warranty', 'spare', 'parts'
]);

const VEHICLE_CHAT_PHRASES = [
    'test drive',
    'service history',
    'number of owners',
    'registration number',
    'rc book',
    'maintenance record',
    'vehicle condition',
    'car condition'
];

function isVehicleRelatedMessage(message, carMeta = {}) {
    const normalized = normalizeText(message);
    if (!normalized) return false;
    const tokens = new Set(normalized.split(' ').filter(Boolean));
    for (const kw of VEHICLE_CHAT_KEYWORDS) {
        if (tokens.has(kw)) return true;
    }
    for (const phrase of VEHICLE_CHAT_PHRASES) {
        if (normalized.includes(phrase)) return true;
    }
    if (carMeta) {
        const carFields = ['make', 'model', 'type', 'fuel_type', 'transmission'];
        for (const field of carFields) {
            const value = carMeta[field];
            if (!value) continue;
            const needle = normalizeText(value);
            if (needle && normalized.includes(needle)) return true;
        }
        if (carMeta.year && normalized.includes(String(carMeta.year))) return true;
    }
    return false;
}

// --- Admin: Add Holiday ---
app.post('/admin/holidays', (req, res) => {
    const { date, description } = req.body;
    if (!date) return res.status(400).json({ message: 'Date is required' });
    db.query('INSERT INTO holidays (date, description) VALUES (?, ?)', [date, description], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ message: 'Holiday Added.' });
            }
            return res.status(500).json({ message: 'DB error', error: err });
        }
        res.json({ message: 'Holiday added!', id: result.insertId });
    });
});

// --- Admin: Get All Holidays ---
app.get('/admin/holidays', (req, res) => {
    db.query('SELECT * FROM holidays ORDER BY date ASC', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results);
    });
});

// --- Admin: Delete Holiday ---
app.delete('/admin/holidays/:id', (req, res) => {
    const { id } = req.params;
    db.query('DELETE FROM holidays WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Holiday not found' });
        res.json({ message: 'Holiday deleted' });
    });
});

// --- Get All Holidays (for public use) ---
app.get('/api/holidays', (req, res) => {
    db.query('SELECT date FROM holidays', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results.map(r => r.date));
    });
});

// --- Get Security Question by Email ---
app.get('/user/security-question', (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email required' });
    db.query('SELECT security_question1 FROM users WHERE email = ?', [email], (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (!results.length) return res.status(404).json({ message: 'No user found' });
        res.json({ question: results[0].security_question1 });
    });
});
// --- Admin: Update car price ---
app.put('/admin/car/:id/price', (req, res) => {
    const carId = req.params.id;
    let price = req.body.price;
    if (typeof price === 'string') price = parseFloat(price);
    if (typeof price !== 'number' || isNaN(price) || price < 0) {
        return res.status(400).json({ message: 'Invalid car id or price.', body: req.body });
    }
    db.query('UPDATE cars SET price = ? WHERE id = ?', [price, carId], (err, result) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        if (result.affectedRows === 0) return res.status(404).json({ message: 'Car not found.' });
        res.json({ message: 'Price updated successfully.' });
    });
});

// --- Forgot Password Request (user submits answer and new password) ---
app.post('/user/forgot-password-request', async (req, res) => {
    const { email, answer, newPassword } = req.body;
    if (!email || !answer || !newPassword) return res.status(400).json({ message: 'Missing fields' });
    db.query('SELECT security_answer1 FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (!results.length) return res.status(404).json({ message: 'No user found' });
        const correctAnswer = results[0].security_answer1;
        const isCorrect = (answer.trim().toLowerCase() === (correctAnswer || '').trim().toLowerCase());
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        db.query('INSERT INTO password_reset_requests (email, answer_attempt, new_password, is_answer_correct) VALUES (?, ?, ?, ?)',
            [email, answer, hashedNewPassword, isCorrect ? 1 : 0],
            (err2) => {
                if (err2) return res.status(500).json({ message: 'DB error' });
                createUserNotificationByEmail(email, {
                    type: 'security',
                    title: 'Password Reset Request Submitted',
                    message: 'Your password reset request has been submitted and is awaiting admin review.',
                    link: 'profile.html'
                });
                res.json({ message: 'Request submitted for admin approval.' });
            }
        );
    });
});

// --- ADMIN: GET ALL BANNED USERS ---
// --- ADMIN: GET ALL PASSWORD RESET REQUESTS ---
app.get('/admin/password-reset-requests', (req, res) => {
    // Join with users to get user id for each email
    const sql = `
        SELECT r.*, u.id AS user_id
        FROM password_reset_requests r
        LEFT JOIN users u ON r.email = u.email
        ORDER BY r.created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results);
    });
});

// --- ADMIN: APPROVE PASSWORD RESET REQUEST ---
app.post('/admin/password-reset-requests/:id/approve', async (req, res) => {
    const id = req.params.id;
    // Get the request
    db.query('SELECT * FROM password_reset_requests WHERE id = ?', [id], (err, results) => {
        if (err || !results.length) return res.status(404).json({ message: 'Request not found' });
        const reqData = results[0];
        if (reqData.status !== 'pending') return res.status(400).json({ message: 'Request already processed' });
        if (!reqData.is_answer_correct) return res.status(400).json({ message: 'Cannot approve: answer is incorrect' });
        // Update user's password
        db.query('UPDATE users SET password = ? WHERE email = ?', [reqData.new_password, reqData.email], (err2) => {
            if (err2) return res.status(500).json({ message: 'DB error updating password' });
            // Mark request as approved
            db.query('UPDATE password_reset_requests SET status = \'approved\', reviewed_at = NOW() WHERE id = ?', [id], (err3) => {
                if (err3) return res.status(500).json({ message: 'DB error updating request' });
                createUserNotificationByEmail(reqData.email, {
                    type: 'security',
                    title: 'Password Reset Approved',
                    message: 'Your password reset request was approved. You can now login with your new password.',
                    link: '/user'
                });
                
                // SEND EMAIL TO USER
                const mailOptions = {
                    from: 'secondgearproject01@gmail.com',
                    to: reqData.email,
                    subject: 'Password Reset Approved - SecondGear',
                    html: `
                        <div style="font-family: Arial, sans-serif; color: #333; background: #f9f9f9; padding: 20px;">
                            <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                                <h2 style="color: #2d6cdf;">✓ Password Reset Approved</h2>
                                <p>Dear User,</p>
                                <p>Your password reset request has been <strong>approved</strong> by our admin team.</p>
                                <p style="background: #e8f4f8; padding: 12px; border-left: 4px solid #2d6cdf; border-radius: 4px;">
                                    <strong>Your new password is now active.</strong> You can login with your new credentials.
                                </p>
                                <p><strong>Next Steps:</strong></p>
                                <ul>
                                    <li>Go to SecondGear login page</li>
                                    <li>Use your email and new password to login</li>
                                    <li>Recommended: Change your password again for security</li>
                                </ul>
                                <p style="color: #666; font-size: 12px; margin-top: 20px;">If you did not request this password reset, please contact support immediately.</p>
                                <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                                <p style="color: #888; font-size: 12px;">© 2026 SecondGear. All rights reserved.</p>
                            </div>
                        </div>
                    `
                };

                transporter.sendMail(mailOptions, (err, info) => {
                    if (err) {
                        console.error('Email sending failed:', err);
                        return res.json({ message: 'Password approved but email failed to send', warning: true });
                    }
                    console.log('✅ Email sent to ' + reqData.email);
                    res.json({ message: 'Password reset approved and email sent.' });
                });
            });
        });
    });
});

// --- ADMIN: REJECT PASSWORD RESET REQUEST ---
app.post('/admin/password-reset-requests/:id/reject', (req, res) => {
    const id = req.params.id;
    db.query('SELECT * FROM password_reset_requests WHERE id = ?', [id], (err, results) => {
        if (err || !results.length) return res.status(404).json({ message: 'Request not found' });
        const reqData = results[0];
        if (reqData.status !== 'pending') return res.status(400).json({ message: 'Request already processed' });
        db.query('UPDATE password_reset_requests SET status = \'rejected\', reviewed_at = NOW() WHERE id = ?', [id], (err2) => {
            if (err2) return res.status(500).json({ message: 'DB error updating request' });
            createUserNotificationByEmail(reqData.email, {
                type: 'security',
                title: 'Password Reset Rejected',
                message: 'Your password reset request was rejected. Please verify your security answer and try again.',
                link: '/user'
            });
            
            // SEND REJECTION EMAIL TO USER
            const mailOptions = {
                from: 'secondgearproject01@gmail.com',
                to: reqData.email,
                subject: 'Password Reset Request - Rejected - SecondGear',
                html: `
                    <div style="font-family: Arial, sans-serif; color: #333; background: #f9f9f9; padding: 20px;">
                        <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                            <h2 style="color: #e74c3c;">Password Reset Request - Rejected</h2>
                            <p>Dear User,</p>
                            <p>Unfortunately, your password reset request has been <strong>rejected</strong> by our admin team.</p>
                            <p style="background: #fadbd8; padding: 12px; border-left: 4px solid #e74c3c; border-radius: 4px;">
                                <strong>Reason:</strong> The answer to your security question was incorrect.
                            </p>
                            <p><strong>What to do next:</strong></p>
                            <ul>
                                <li>If you remember your password, login normally</li>
                                <li>You can submit another password reset request with the correct security answer</li>
                                <li>Contact our support team if you need further assistance</li>
                            </ul>
                            <p style="color: #666; font-size: 12px; margin-top: 20px;">If you have any questions, please reach out to our support team.</p>
                            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                            <p style="color: #888; font-size: 12px;">© 2026 SecondGear. All rights reserved.</p>
                        </div>
                    </div>
                `
            };

            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    console.error('Email sending failed:', err);
                    return res.json({ message: 'Request rejected but email failed to send', warning: true });
                }
                console.log('✅ Rejection email sent to ' + reqData.email);
                res.json({ message: 'Password reset request rejected and email sent.' });
            });
        });
    });
});
app.get('/admin/banned-users', (req, res) => {
    db.query('SELECT * FROM banned_users ORDER BY banned_at DESC', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results);
    });
});
// Unban user in users table (soft unban)
app.post('/admin/unban-user-soft', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Missing email' });
    db.query('UPDATE users SET is_banned = 0 WHERE email = ?', [email], (err) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        res.json({ message: 'User unbanned (soft)' });
    });
});

app.post('/admin/user-notifications/send', (req, res) => {
    const { email, title, message, link } = req.body || {};
    if (!email || !title || !message) {
        return res.status(400).json({ message: 'Email, title, and message are required.' });
    }

    db.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email], (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (!results || !results.length) {
            return res.status(404).json({ message: 'No user found with this email.' });
        }

        const userId = results[0].id;
        db.query(
            'INSERT INTO user_notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)',
            [userId, 'admin_message', title, message, link || null],
            (insertErr) => {
                if (insertErr) return res.status(500).json({ message: 'Failed to save message.' });
                res.json({ success: true, message: 'Message sent successfully.' });
            }
        );
    });
});


// --- ADMIN: UNBAN USER ---
app.post('/admin/unban-user', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ message: 'Missing id' });
    db.query('DELETE FROM banned_users WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json({ message: 'User unbanned' });
    });
});

// --- ADMIN: BAN USER ---
app.post('/admin/ban-user', (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ message: 'Missing user_id' });
    // Get user info
    db.query('SELECT email, phone FROM users WHERE id = ?', [user_id], (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        if (!results.length) return res.status(404).json({ message: 'User not found' });
        const { email, phone } = results[0];
        // Insert into banned_users
        db.query('INSERT IGNORE INTO banned_users (email, phone) VALUES (?, ?)', [email, phone], (err2) => {
            if (err2) return res.status(500).json({ message: 'DB error banning user', error: err2 });
            // Soft delete: set is_banned=1
            db.query('UPDATE users SET is_banned = 1 WHERE id = ?', [user_id], (err3) => {
                if (err3) {
                    console.error('Error soft-banning user:', err3);
                    return res.status(500).json({ message: 'DB error banning user', error: err3 });
                }
                res.json({ message: 'User banned (soft delete)' });
            });
        });
    });
});

// --- ADMIN: DELETE USER (no ban) ---
app.post('/admin/delete-user', (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ message: 'Missing user_id' });
    db.query('DELETE FROM users WHERE id = ?', [user_id], (err) => {
        if (err) return res.status(500).json({ message: 'DB error deleting user' });
        res.json({ message: 'User deleted' });
    });
});

// ------------------
// API: Get all sold cars with buyer and car details
app.get('/api/sold-cars', (req, res) => {
    const withComplaintsSql = `
        SELECT 
            purchases.id AS purchase_id,
            cars.make,
            cars.model,
            cars.year,
            cars.price,
            COALESCE(purchases.final_price, cars.price) AS sold_price,
            cars.image_url,
            purchases.first_name,
            purchases.last_name,
            purchases.address,
            purchases.city,
            purchases.zip,
            purchases.payment_method,
            purchases.purchase_date,
            users.email,
            users.phone,
            pc.id AS complaint_id,
            pc.subject AS complaint_subject,
            pc.message AS complaint_message,
            pc.status AS complaint_status,
            pc.admin_response AS complaint_admin_response,
            pc.created_at AS complaint_created_at,
            pc.responded_at AS complaint_responded_at
        FROM purchases
        JOIN cars ON purchases.car_id = cars.id
        JOIN users ON purchases.user_id = users.id
        LEFT JOIN purchase_complaints pc ON pc.purchase_id = purchases.id
        ORDER BY (pc.id IS NOT NULL) DESC, purchases.purchase_date DESC
    `;
    const fallbackSql = `
        SELECT 
            purchases.id AS purchase_id,
            cars.make,
            cars.model,
            cars.year,
            cars.price,
            COALESCE(purchases.final_price, cars.price) AS sold_price,
            cars.image_url,
            purchases.first_name,
            purchases.last_name,
            purchases.address,
            purchases.city,
            purchases.zip,
            purchases.payment_method,
            purchases.purchase_date,
            users.email,
            users.phone
        FROM purchases
        JOIN cars ON purchases.car_id = cars.id
        JOIN users ON purchases.user_id = users.id
        ORDER BY purchases.purchase_date DESC
    `;

    const formatRows = (rows) => rows.map(row => ({
        purchaseId: row.purchase_id,
        car: `${row.make} ${row.model} (${row.year})`,
        buyerName: `${row.first_name} ${row.last_name}`,
        contact: `${row.email} / ${row.phone}`,
        soldAt: row.purchase_date,
        address: `${row.address}, ${row.city}, ${row.zip}`,
        paymentMethod: row.payment_method,
        image: row.image_url,
        soldPrice: row.sold_price,
        complaint: row.complaint_id ? {
            id: row.complaint_id,
            subject: row.complaint_subject,
            message: row.complaint_message,
            status: row.complaint_status,
            adminResponse: row.complaint_admin_response,
            createdAt: row.complaint_created_at,
            respondedAt: row.complaint_responded_at
        } : null
    }));

    db.query(withComplaintsSql, (err, results) => {
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            return db.query(fallbackSql, (fallbackErr, fallbackResults) => {
                if (fallbackErr) return res.status(500).json({ error: 'Database error', details: fallbackErr });
                res.json(formatRows(fallbackResults));
            });
        }
        if (err) return res.status(500).json({ error: 'Database error', details: err });
        res.json(formatRows(results));
    });
});

// Admin: respond to a purchase complaint
app.post('/admin/purchase-complaints/:id/respond', requireAdmin, (req, res) => {
    const complaintId = parseInt(req.params.id, 10);
    const { response, status } = req.body;
    if (!complaintId || !response) {
        return res.status(400).json({ message: 'Complaint id and response are required.' });
    }
    const nextStatus = status === 'closed' ? 'closed' : 'responded';
    db.query(
        'SELECT * FROM purchase_complaints WHERE id = ? LIMIT 1',
        [complaintId],
        (err, rows) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            if (!rows.length) return res.status(404).json({ message: 'Complaint not found.' });
            const complaint = rows[0];
            db.query(
                'UPDATE purchase_complaints SET admin_response = ?, status = ?, responded_at = NOW() WHERE id = ?',
                [response.trim(), nextStatus, complaintId],
                (updateErr) => {
                    if (updateErr) return res.status(500).json({ message: 'DB error' });
                    if (complaint.user_id) {
                        createUserNotification({
                            userId: complaint.user_id,
                            type: 'complaint',
                            title: 'Complaint Updated',
                            message: `Your complaint for purchase #${complaint.purchase_id} has a new response.`,
                            link: 'profile.html#purchases'
                        });
                    }
                    res.json({ message: 'Complaint response saved.' });
                }
            );
        }
    );
});
// --- Admin: Get all cars (for offers selection) ---
app.get('/admin/cars', (req, res) => {
    db.query('SELECT id, make, model, year, price FROM cars WHERE available = 1 AND is_deleted = 0', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        res.json(results);
    });
});

// --- Admin: Add car as offer (auto-generate message) ---
app.post('/admin/offers/car', (req, res) => {
    const { carId, discount_type, discount_value, valid_from, valid_to } = req.body;
    if (!carId) return res.status(400).json({ message: 'Car ID required.' });
    db.query('SELECT make, model, year, price FROM cars WHERE id = ?', [carId], (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        if (!results || results.length === 0) return res.status(404).json({ message: 'Car not found.' });
        const car = results[0];
        const basePrice = Number(car.price || 0);
        const discountType = discount_type === 'percent' ? 'percent' : (discount_type === 'amount' ? 'amount' : null);
        const discountValue = discountType ? Number(discount_value) : null;
        let discountedPrice = basePrice;
        if (discountType === 'percent' && Number.isFinite(discountValue)) {
            discountedPrice = basePrice - (basePrice * Math.max(0, Math.min(discountValue, 100)) / 100);
        } else if (discountType === 'amount' && Number.isFinite(discountValue)) {
            discountedPrice = basePrice - Math.max(0, discountValue);
        }
        discountedPrice = Math.max(0, Math.round(discountedPrice * 100) / 100);
        const offerMsg = `Subscriber Deal: ${car.make} ${car.model} (${car.year}) now ${formatINR(discountedPrice)} (MRP ${formatINR(basePrice)}).`;
        db.query(
            'INSERT INTO offers (car_id, text, discount_type, discount_value, discounted_price, original_price, valid_from, valid_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [carId, offerMsg, discountType, Number.isFinite(discountValue) ? discountValue : null, discountedPrice, basePrice, valid_from || null, valid_to || null],
            (err2, result) => {
            if (err2) return res.status(500).json({ message: 'DB error', error: err2 });
            res.json({ message: 'Car offer added!', id: result.insertId });
        });
    })
});
// --- Admin: Get all offers ---
app.get('/admin/offers', (req, res) => {
    const sql = `
        SELECT o.id, o.car_id, o.text, o.discount_type, o.discount_value, o.discounted_price, o.original_price,
               o.created_at, o.valid_from, o.valid_to,
               c.make, c.model, c.year, c.price
        FROM offers o
        LEFT JOIN cars c ON c.id = o.car_id
        ORDER BY o.created_at DESC`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        res.json(results);
    });
});

// --- Public: Get active offers for users ---
app.get('/offers', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(403).json({ message: 'Login required.' });
    }
    const userEmail = req.session.user.email;
    const today = new Date().toISOString().slice(0, 10);
    const sql = `
        SELECT o.id, o.car_id, o.text, o.discount_type, o.discount_value, o.discounted_price, o.original_price,
               o.created_at, o.valid_from, o.valid_to,
               c.make, c.model, c.year, c.price, c.image_url
        FROM offers o
        JOIN cars c ON c.id = o.car_id
        WHERE (o.valid_from IS NULL OR o.valid_from <= ?)
          AND (o.valid_to IS NULL OR o.valid_to >= ?)
          AND c.available = 1
          AND c.is_deleted = 0
        ORDER BY o.created_at DESC
    `;
    isNewsletterSubscriber(userEmail, (subErr, isSubscribed) => {
        if (subErr) return res.status(500).json({ message: 'DB error' });
        if (!isSubscribed) return res.status(403).json({ message: 'Not subscribed.' });
        db.query(sql, [today, today], (err, results) => {
            if (err) return res.status(500).json({ message: 'DB error', error: err });
            const formatted = (results || []).map(row => ({
                id: row.id,
                text: row.text,
                created_at: row.created_at,
                valid_from: row.valid_from,
                valid_to: row.valid_to,
                car: {
                    id: row.car_id,
                    make: row.make,
                    model: row.model,
                    year: row.year,
                    price: row.price,
                    image_url: row.image_url
                },
                discount: {
                    type: row.discount_type,
                    value: row.discount_value,
                    original_price: row.original_price,
                    discounted_price: row.discounted_price
                },
                checkout_url: `purchase.html?car_id=${row.car_id}&newsletter_offer_id=${row.id}`
            }));
            res.json(formatted);
        });
    });
});

// --- Admin: Add new offer ---
app.post('/admin/offers', (req, res) => {
    const { text, valid_from, valid_to, car_id, discount_type, discount_value } = req.body;
    const carId = car_id ? parseInt(car_id, 10) : null;
    const discountType = discount_type === 'percent' ? 'percent' : (discount_type === 'amount' ? 'amount' : null);
    const discountValue = discountType ? Number(discount_value) : null;
    if (!text && !carId) return res.status(400).json({ message: 'Offer text or car selection required.' });

    const insertOffer = (payload, cb) => {
        db.query(
            'INSERT INTO offers (car_id, text, discount_type, discount_value, discounted_price, original_price, valid_from, valid_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            payload,
            cb
        );
    };

    if (carId) {
        db.query('SELECT make, model, year, price FROM cars WHERE id = ? LIMIT 1', [carId], (carErr, carRows) => {
            if (carErr) return res.status(500).json({ message: 'DB error', error: carErr });
            if (!carRows.length) return res.status(404).json({ message: 'Car not found.' });
            const car = carRows[0];
            const basePrice = Number(car.price || 0);
            if (!discountType || !Number.isFinite(discountValue)) {
                return res.status(400).json({ message: 'Discount type and value are required for car offers.' });
            }
            let discountedPrice = basePrice;
            if (discountType === 'percent') {
                discountedPrice = basePrice - (basePrice * Math.max(0, Math.min(discountValue, 100)) / 100);
            } else {
                discountedPrice = basePrice - Math.max(0, discountValue);
            }
            discountedPrice = Math.max(0, Math.round(discountedPrice * 100) / 100);
            const offerText = text && text.length >= 3
                ? text
                : `Subscriber Deal: ${car.make} ${car.model} (${car.year}) now ${formatINR(discountedPrice)} (MRP ${formatINR(basePrice)}).`;
            insertOffer(
                [carId, offerText, discountType, discountValue, discountedPrice, basePrice, valid_from || null, valid_to || null],
                (err, result) => {
                    if (err) return res.status(500).json({ message: 'DB error', error: err });
                    res.json({ message: 'Offer added!', id: result.insertId });
                }
            );
        });
        return;
    }

    if (!text || text.length < 3) return res.status(400).json({ message: 'Offer text required.' });
    db.query(
        'INSERT INTO offers (text, valid_from, valid_to) VALUES (?, ?, ?)',
        [text, valid_from || null, valid_to || null],
        (err, result) => {
            if (err) return res.status(500).json({ message: 'DB error', error: err });
            res.json({ message: 'Offer added!', id: result.insertId });
        }
    );
});

// --- Admin: अपडेट offer ---
app.put('/admin/offers/:id', (req, res) => {
    const offerId = parseInt(req.params.id, 10);
    if (!offerId) return res.status(400).json({ message: 'Invalid offer id.' });
    const { text, valid_from, valid_to, discount_type, discount_value } = req.body;
    const discountType = discount_type === 'percent' ? 'percent' : (discount_type === 'amount' ? 'amount' : null);
    const discountValue = discountType ? Number(discount_value) : null;

    db.query('SELECT * FROM offers WHERE id = ? LIMIT 1', [offerId], (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (!rows.length) return res.status(404).json({ message: 'Offer not found.' });
        const offer = rows[0];

        const applyUpdate = (payload) => {
            db.query(
                `UPDATE offers
                 SET text = ?, discount_type = ?, discount_value = ?, discounted_price = ?, original_price = ?, valid_from = ?, valid_to = ?
                 WHERE id = ?`,
                payload,
                (updateErr) => {
                    if (updateErr) return res.status(500).json({ message: 'DB error' });
                    res.json({ message: 'Offer updated.' });
                }
            );
        };

        if (offer.car_id) {
            db.query('SELECT make, model, year, price FROM cars WHERE id = ? LIMIT 1', [offer.car_id], (carErr, carRows) => {
                if (carErr) return res.status(500).json({ message: 'DB error' });
                if (!carRows.length) return res.status(404).json({ message: 'Car not found.' });
                const car = carRows[0];
                const basePrice = Number(car.price || 0);
                if (!discountType || !Number.isFinite(discountValue)) {
                    return res.status(400).json({ message: 'Discount type and value are required for car offers.' });
                }
                let discountedPrice = basePrice;
                if (discountType === 'percent') {
                    discountedPrice = basePrice - (basePrice * Math.max(0, Math.min(discountValue, 100)) / 100);
                } else {
                    discountedPrice = basePrice - Math.max(0, discountValue);
                }
                discountedPrice = Math.max(0, Math.round(discountedPrice * 100) / 100);
                const updatedText = text && text.length >= 3
                    ? text
                    : `Subscriber Deal: ${car.make} ${car.model} (${car.year}) now ${formatINR(discountedPrice)} (MRP ${formatINR(basePrice)}).`;
                applyUpdate([updatedText, discountType, discountValue, discountedPrice, basePrice, valid_from || null, valid_to || null, offerId]);
            });
            return;
        }

        const updatedText = text && text.length >= 3 ? text : offer.text;
        applyUpdate([updatedText, null, null, null, null, valid_from || offer.valid_from || null, valid_to || offer.valid_to || null, offerId]);
    });
});

// --- Admin: Delete offer ---
// Auto-delete expired offers every hour
setInterval(() => {
    const today = new Date().toISOString().slice(0, 10);
    // Only move expired offers (not all offers)
    db.query('SELECT * FROM offers WHERE valid_to IS NOT NULL AND valid_to < ?', [today], (err, results) => {
        if (err) return;
        results.forEach(offer => {
            db.query(
                'INSERT INTO previous_offers (car_id, text, discount_type, discount_value, discounted_price, original_price, created_at, valid_from, valid_to, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
                [offer.car_id || null, offer.text, offer.discount_type || null, offer.discount_value || null, offer.discounted_price || null, offer.original_price || null, offer.created_at, offer.valid_from || null, offer.valid_to || null],
                (err2) => {
                    if (!err2) {
                        db.query('DELETE FROM offers WHERE id = ?', [offer.id]);
                    }
                }
            );
        });
    });
}, 1000 * 60 * 60); // every hour
// Move offer to previous_offers instead of deleting
app.delete('/admin/offers/:id', (req, res) => {
    const { id } = req.params;
    // Get the offer first
    db.query('SELECT * FROM offers WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        if (!results || results.length === 0) return res.status(404).json({ message: 'Offer not found.' });
        const offer = results[0];
        // Insert into previous_offers with all relevant fields and set deleted_at
        db.query(
            'INSERT INTO previous_offers (car_id, text, discount_type, discount_value, discounted_price, original_price, created_at, valid_from, valid_to, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
            [offer.car_id || null, offer.text, offer.discount_type || null, offer.discount_value || null, offer.discounted_price || null, offer.original_price || null, offer.created_at, offer.valid_from || null, offer.valid_to || null],
            (err2) => {
                if (err2) return res.status(500).json({ message: 'DB error', error: err2 });
                // Delete from offers
                db.query('DELETE FROM offers WHERE id = ?', [id], (err3) => {
                    if (err3) return res.status(500).json({ message: 'DB error', error: err3 });
                    res.json({ message: 'Offer moved to previous offers.' });
                });
            }
        );
    });
});

// Admin: Get all previous offers
app.get('/admin/previous-offers', (req, res) => {
    db.query('SELECT id, text, created_at, deleted_at FROM previous_offers ORDER BY deleted_at DESC', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        res.json(results);
    });
});
// ================================
// Service Booking Endpoints
// ================================

// 1. Add a new booking
app.post('/book-service', (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ message: 'Invalid request body' });
    }

    const { 
        user_id, 
        vehicle_type, 
        service_type, 
        booking_date, 
        booking_time, 
        contact, 
        notes, 
        workshop_id, 
        mechanic_id, 
        price 
    } = req.body;

    if (!vehicle_type || !service_type || !booking_date || !booking_time || !contact) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    // Convert booking_date to YYYY-MM-DD if needed
    let formattedDate = booking_date;
    if (/\d{2}\/\d{2}\/\d{4}/.test(booking_date)) {
        const [mm, dd, yyyy] = booking_date.split('/');
        formattedDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }

    // Helper: Get random ID safely
    function getRandomMechanicByWorkshop(workshopId, cb) {
        db.query(
            `SELECT mechanic_id FROM mechanics WHERE workshop_id = ? ORDER BY RAND() LIMIT 1`,
            [workshopId],
            (err, results) => {
                if (err || results.length === 0) return cb(null);
                cb(results[0].mechanic_id);
            }
        );
    }

    function getRandomWorkshop(cb) {
        db.query(
            `SELECT workshop_id FROM workshops ORDER BY RAND() LIMIT 1`,
            (err, results) => {
                if (err || results.length === 0) return cb(null);
                cb(results[0].workshop_id);
            }
        );
    }

    function proceedWithBooking(finalMechanicId) {
        if (!finalMechanicId) {
            return res.status(400).json({
                message: 'Could not assign a mechanic. No mechanics available.'
            });
        }

        const serviceStartTime = new Date(`${formattedDate}T${booking_time}`);
        const serviceEndTime = new Date(serviceStartTime.getTime() + 2 * 60 * 60 * 1000);

        // Check mechanic schedule conflict
        db.query(
            `SELECT * FROM mechanic_schedule 
             WHERE mechanic_id = ? 
             AND (? < end_time AND ? > start_time)`,
            [finalMechanicId, serviceStartTime, serviceEndTime],
            (err, scheduleResults) => {

                if (err) {
                    console.error('Schedule Check Error:', err);
                    return res.status(500).json({ message: 'DB error checking schedule' });
                }

                if (scheduleResults.length > 0) {
                    return res.status(409).json({
                        message: 'Mechanic already booked for selected time.'
                    });
                }

                // Begin transaction
                db.beginTransaction(err => {
                    if (err) {
                        return res.status(500).json({ message: 'Transaction error' });
                    }

                    const bookingData = {
                        user_id: user_id || null,
                        vehicle_type,
                        service_type,
                        booking_date: formattedDate,
                        booking_time,
                        contact,
                        notes: notes || null,
                        status: 'pending',
                        mechanic_id: finalMechanicId,
                        price
                    };

                    db.query('INSERT INTO bookings SET ?', bookingData, (err, bookingResult) => {
                        if (err) {
                            return db.rollback(() => {
                                res.status(500).json({ message: 'Error creating booking' });
                            });
                        }

                        const newBookingId = bookingResult.insertId;

                        const scheduleData = {
                            booking_id: newBookingId,
                            mechanic_id: finalMechanicId,
                            start_time: serviceStartTime,
                            end_time: serviceEndTime
                        };

                        db.query('INSERT INTO mechanic_schedule SET ?', scheduleData, (err) => {
                            if (err) {
                                return db.rollback(() => {
                                    res.status(500).json({ message: 'Error creating schedule' });
                                });
                            }

                            db.commit(err => {
                                if (err) {
                                    return db.rollback(() => {
                                        res.status(500).json({ message: 'Commit error' });
                                    });
                                }

                                createUserNotification({
                                    userId: user_id,
                                    type: 'booking',
                                    title: 'Booking Request Submitted',
                                    message: `Your ${service_type} booking for ${formattedDate} at ${booking_time} is now pending.`,
                                    link: 'profile.html'
                                });

                                // Send confirmation email
                                // ================= SEND EMAIL USING USER_ID =================

if (!user_id) {
    return res.json({
        message: 'Booking submitted successfully!',
        booking_id: newBookingId
    });
}

db.query(
    'SELECT email FROM users WHERE id = ?',
    [user_id],
    (userErr, userResults) => {

        // If DB error or no user found
        if (userErr || !userResults || userResults.length === 0) {
            console.error('Error fetching user email:', userErr);
            return res.json({
                message: 'Booking submitted successfully!',
                booking_id: newBookingId
            });
        }

        const userEmail = userResults[0].email;

        // If email is null or empty
        if (!userEmail) {
            return res.json({
                message: 'Booking submitted successfully!',
                booking_id: newBookingId
            });
        }

        const mailOptions = {
            from: 'secondgearproject01@gmail.com',
            to: userEmail,
            subject: 'Service Booking Confirmation - SecondGear',
            html: `
                <h2>Service Booking Confirmed</h2>
                <p><strong>Booking ID:</strong> ${newBookingId}</p>
                <p><strong>Vehicle:</strong> ${vehicle_type}</p>
                <p><strong>Service:</strong> ${service_type}</p>
                <p><strong>Date:</strong> ${formattedDate}</p>
                <p><strong>Time:</strong> ${booking_time}</p>
                <p><strong>Estimated Cost:</strong> ${price ? formatINR(price) : 'TBD'}</p>
            `
        };

        transporter.sendMail(mailOptions, (mailErr) => {

            if (mailErr) {
                console.error('Email sending error:', mailErr);
            } else {
                console.log('✅Email sent to:', userEmail);
            }

            return res.json({
                message: 'Booking submitted successfully!',
                booking_id: newBookingId
            });
        });
    }
);

                            });
                        });
                    });
                });
            }
        );
    }


    // =============================
    // Mechanic / Workshop Logic
    // =============================

    if (mechanic_id) {
        proceedWithBooking(mechanic_id);

    } else if (workshop_id) {
        getRandomMechanicByWorkshop(workshop_id, (randMechanicId) => {
            proceedWithBooking(randMechanicId);
        });

    } else {
        getRandomWorkshop((randWorkshopId) => {
            if (!randWorkshopId) {
                return res.status(500).json({ message: 'No workshops available.' });
            }

            getRandomMechanicByWorkshop(randWorkshopId, (randMechanicId) => {
                proceedWithBooking(randMechanicId);
            });
        });
    }
});


// ================================
// 2. Admin: Get all bookings
// ================================
app.get('/admin/bookings', (req, res) => {
    db.query(
        'SELECT * FROM bookings ORDER BY created_at DESC',
        (err, results) => {
            if (err) {
                return res.status(500).json({ message: 'DB error' });
            }
            res.json(results);
        }
    );
});

// 2b. Admin: Add offline booking (manual entry)
app.post('/admin/bookings/offline', (req, res) => {
    if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ message: 'Invalid request body' });
    }

    const {
        user_id,
        vehicle_type,
        service_type,
        booking_date,
        booking_time,
        contact,
        notes,
        workshop_id,
        mechanic_id,
        price,
        status,
        ignore_conflicts
    } = req.body;

    if (!vehicle_type || !service_type || !booking_date || !booking_time || !contact) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    if (!mechanic_id && !workshop_id) {
        return res.status(400).json({ message: 'Select a mechanic or a workshop' });
    }

    const priceValue = Number(price);
    if (!Number.isFinite(priceValue) || priceValue < 0) {
        return res.status(400).json({ message: 'Invalid price' });
    }

    const normalizedStatus = String(status || 'fulfilled').toLowerCase();
    if (!['pending', 'fulfilled'].includes(normalizedStatus)) {
        return res.status(400).json({ message: 'Invalid status' });
    }

    // Convert booking_date to YYYY-MM-DD if needed
    let formattedDate = booking_date;
    if (/\d{2}\/\d{2}\/\d{4}/.test(booking_date)) {
        const [mm, dd, yyyy] = booking_date.split('/');
        formattedDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }

    function getRandomMechanicByWorkshop(workshopId, cb) {
        db.query(
            `SELECT mechanic_id FROM mechanics WHERE workshop_id = ? ORDER BY RAND() LIMIT 1`,
            [workshopId],
            (err, results) => {
                if (err || results.length === 0) return cb(null);
                cb(results[0].mechanic_id);
            }
        );
    }

    function getRandomWorkshop(cb) {
        db.query(
            `SELECT workshop_id FROM workshops ORDER BY RAND() LIMIT 1`,
            (err, results) => {
                if (err || results.length === 0) return cb(null);
                cb(results[0].workshop_id);
            }
        );
    }

    function insertOfflineBooking(finalMechanicId) {
        if (!finalMechanicId) {
            return res.status(400).json({ message: 'Could not assign a mechanic' });
        }

        const serviceStartTime = new Date(`${formattedDate}T${booking_time}`);
        const serviceEndTime = new Date(serviceStartTime.getTime() + 2 * 60 * 60 * 1000);
        const skipConflict = !!ignore_conflicts || (normalizedStatus === 'fulfilled' && serviceStartTime < new Date());

        const checkConflictAndInsert = () => {
            db.beginTransaction(err => {
                if (err) {
                    return res.status(500).json({ message: 'Transaction error' });
                }

                const bookingData = {
                    user_id: user_id || null,
                    vehicle_type,
                    service_type,
                    booking_date: formattedDate,
                    booking_time,
                    contact,
                    notes: notes || null,
                    status: normalizedStatus,
                    mechanic_id: finalMechanicId,
                    price: priceValue
                };

                db.query('INSERT INTO bookings SET ?', bookingData, (err, bookingResult) => {
                    if (err) {
                        return db.rollback(() => {
                            res.status(500).json({ message: 'Error creating booking' });
                        });
                    }

                    const newBookingId = bookingResult.insertId;
                    const scheduleData = {
                        booking_id: newBookingId,
                        mechanic_id: finalMechanicId,
                        start_time: serviceStartTime,
                        end_time: serviceEndTime
                    };

                    db.query('INSERT INTO mechanic_schedule SET ?', scheduleData, (err) => {
                        if (err) {
                            return db.rollback(() => {
                                res.status(500).json({ message: 'Error creating schedule' });
                            });
                        }

                        db.commit(err => {
                            if (err) {
                                return db.rollback(() => {
                                    res.status(500).json({ message: 'Commit error' });
                                });
                            }

                            res.json({
                                message: 'Offline booking added',
                                booking_id: newBookingId
                            });
                        });
                    });
                });
            });
        };

        if (skipConflict) {
            return checkConflictAndInsert();
        }

        db.query(
            `SELECT * FROM mechanic_schedule 
             WHERE mechanic_id = ? 
             AND (? < end_time AND ? > start_time)`,
            [finalMechanicId, serviceStartTime, serviceEndTime],
            (err, scheduleResults) => {
                if (err) {
                    console.error('Schedule Check Error:', err);
                    return res.status(500).json({ message: 'DB error checking schedule' });
                }

                if (scheduleResults.length > 0) {
                    return res.status(409).json({
                        message: 'Mechanic already booked for selected time.'
                    });
                }

                return checkConflictAndInsert();
            }
        );
    }

    if (mechanic_id) {
        insertOfflineBooking(mechanic_id);
    } else if (workshop_id) {
        getRandomMechanicByWorkshop(workshop_id, (randMechanicId) => {
            insertOfflineBooking(randMechanicId);
        });
    } else {
        getRandomWorkshop((randWorkshopId) => {
            if (!randWorkshopId) {
                return res.status(500).json({ message: 'No workshops available.' });
            }

            getRandomMechanicByWorkshop(randWorkshopId, (randMechanicId) => {
                insertOfflineBooking(randMechanicId);
            });
        });
    }
});
// 3. Admin: Add mechanic
app.post('/admin/add-mechanic', (req, res) => {
    // Log incoming body for debugging
    console.log('Mechanic form received:', req.body);
    const { mechanicName, mechanicPhone, workshopId } = req.body;

    if (!mechanicName || !mechanicPhone || !workshopId) {
        return res.status(400).json({ message: 'Missing required fields (name, phone, or workshop)', body: req.body });
    }

    db.query(
        'INSERT INTO mechanics (name, phone, workshop_id) VALUES (?, ?, ?)',
        [mechanicName, mechanicPhone, workshopId],
        (err, result) => {
            if (err) {
                console.error('Mechanic Insert Error:', err); // Log error for debugging
                return res.status(500).json({ message: 'DB error', error: err });
            }
            res.json({ message: 'Mechanic added', mechanic_id: result.insertId });
        }
    );
});

// 4. Admin: Get all mechanics
app.get('/admin/mechanics', (req, res) => {
    db.query(
        `SELECT m.mechanic_id, m.name, m.phone, m.workshop_id, w.name AS workshop_name, w.address AS workshop_address
         FROM mechanics m
         LEFT JOIN workshops w ON m.workshop_id = w.workshop_id`,
        (err, results) => {
        if (err) {
            console.error('Mechanics Query Error:', err);
            return res.status(500).json({ message: 'DB error', error: err });
        }
        res.json(results);
    });
});

// 5. Admin: Add workshop
app.post('/admin/add-workshop', (req, res) => {
    const { workshopName, workshopAddress, workshopPhone } = req.body;
    if (!workshopName || !workshopAddress || !workshopPhone) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    db.query(
        'INSERT INTO workshops (name, address, phone) VALUES (?, ?, ?)',
        [workshopName, workshopAddress, workshopPhone],
        (err, result) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            res.json({ message: 'Workshop added', workshop_id: result.insertId });
        }
    );
});

// 6. Admin: Get all workshops
app.get('/admin/workshops', (req, res) => {
    db.query('SELECT workshop_id, name, address, phone FROM workshops', (err, results) => {
        if (err) {
            console.error('Workshops Query Error:', err);
            return res.status(500).json({ message: 'DB error', error: err });
        }
        res.json(results);
    });
});

// Get mechanics by workshop
app.get('/api/mechanics/:workshopId', (req, res) => {
    const { workshopId } = req.params;
    if (!workshopId) {
        return res.status(400).json({ message: 'Workshop ID is required.' });
    }

    db.query('SELECT mechanic_id, name FROM mechanics WHERE workshop_id = ?', [workshopId], (err, results) => {
        if (err) {
            console.error('Error fetching mechanics by workshop:', err);
            return res.status(500).json({ message: 'Database error' });
        }
        res.json(results);
    });
});

// 7. Admin: Add service
app.post('/admin/add-service', (req, res) => {
    const { serviceName, serviceDescription, servicePrice } = req.body;
    if (!serviceName || !serviceDescription || !servicePrice) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    db.query(
        'INSERT INTO services (name, description, price) VALUES (?, ?, ?)',
        [serviceName, serviceDescription, servicePrice],
        (err, result) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            res.json({ message: 'Service added', service_id: result.insertId });
        }
    );
});
// Admin: Mark booking as fulfilled (delete from bookings)
app.post('/admin/fulfill-booking', (req, res) => {
    const bookingId = req.query.booking_id || req.body.booking_id || req.query.id || req.body.id;
    if (!bookingId) return res.status(400).json({ error: 'Missing booking_id' });
    db.query(
        'SELECT id, user_id, service_type, booking_date, booking_time FROM bookings WHERE id = ? LIMIT 1',
        [bookingId],
        (fetchErr, rows) => {
            if (fetchErr) return res.status(500).json({ error: 'Failed to fetch booking' });
            if (!rows || !rows.length) return res.status(404).json({ error: 'Booking not found' });
            const booking = rows[0];

            db.query('UPDATE bookings SET status = ? WHERE id = ?', ['fulfilled', booking.id], (err) => {
                if (err) return res.status(500).json({ error: 'Failed to update booking status' });

                createUserNotification({
                    userId: booking.user_id,
                    type: 'booking',
                    title: 'Booking Fulfilled',
                    message: `Your ${booking.service_type || 'service'} booking on ${booking.booking_date} at ${booking.booking_time} has been marked fulfilled.`,
                    link: 'profile.html'
                });

                res.json({ success: true });
            });
        }
    );
});

// 8. Admin: Get all services
app.get('/admin/services', (req, res) => {
    db.query('SELECT * FROM services', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results);
    });
});

// ------------------
// User: Submit feedback
app.post('/feedback', (req, res) => {
    const { user_email, feedback_text } = req.body;
    if (!user_email || !feedback_text) {
        return res.status(400).json({ message: 'Missing email or feedback' });
    }
    db.query(
        'INSERT INTO feedback (user_email, feedback_text, created_at) VALUES (?, ?, NOW())',
        [user_email, feedback_text],
        (err, result) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            res.json({ message: 'Feedback submitted' });
        }
    );
});
// ------------------
// Admin: Get all feedback
app.get('/admin/feedback', (req, res) => {
    db.query('SELECT id, user_email, feedback_text, created_at, approved FROM feedback ORDER BY created_at DESC', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results);
    });
});
// Admin: Unapprove feedback (set approved = 0)
app.post('/admin/feedback/unapprove', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    db.query('UPDATE feedback SET approved = 0 WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ success: true });
    });
});
// Admin: Approve feedback (set approved = 1)
app.post('/admin/feedback/approve', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing id' });
    db.query('UPDATE feedback SET approved = 1 WHERE id = ?', [id], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json({ success: true });
    });
});

// Public: Get only approved feedback for homepage
app.get('/api/feedbacks', (req, res) => {
    db.query('SELECT id, user_email, feedback_text, created_at FROM feedback WHERE approved = 1 ORDER BY created_at DESC', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results);
    });
});
// ------------------


// Admin: Delete car
app.delete('/admin/delete-car', (req, res) => {
    const carId = req.query.id;
    if (!carId) return res.status(400).json({ error: 'Missing car id' });
    db.query('UPDATE cars SET is_deleted = 1, deleted_at = NOW(), available = 0 WHERE id = ?', [carId], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to delete car' });
        res.json({ success: true });
    });
});

// Admin: Restore car
app.post('/admin/restore-car', (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Missing car id' });
    db.query('UPDATE cars SET is_deleted = 0, deleted_at = NULL, available = 1 WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to restore car' });
        res.json({ success: true });
    });
});

// Admin: get/update buy page maintenance mode
app.get('/admin/buy-maintenance', requireAdmin, (req, res) => {
    res.json({ enabled: !!buyMaintenanceEnabled });
});
app.post('/admin/buy-maintenance', requireAdmin, (req, res) => {
    const enabled = req.body && (req.body.enabled === true || req.body.enabled === 'true' || req.body.enabled === 1 || req.body.enabled === '1');
    buyMaintenanceEnabled = !!enabled;
    res.json({ enabled: buyMaintenanceEnabled });
});

// ------------------
// Serve frontend pages

// --- API ROUTES ARE DEFINED ABOVE THIS LINE ---

// Serve static files after API routes
app.use(express.static(path.resolve(__dirname, '../Front-End')));

app.get('/', (req, res) => res.sendFile(path.resolve(__dirname, '../Front-End/Home.html')));
app.get('/faq', (req, res) => res.sendFile(path.resolve(__dirname, '../Front-End/faq.html')));
app.get('/signup', (req, res) => res.sendFile(path.resolve(__dirname, '../Front-End/sign-up.html')));
app.get('/user', (req, res) => res.sendFile(path.resolve(__dirname, '../Front-End/user-login.html')));
app.get('/admin', (req, res) => res.sendFile(path.resolve(__dirname, '../Front-End/admin_login.html')));
app.get('/admin/register', (req, res) => res.sendFile(path.resolve(__dirname, '../Front-End/admin-register.html')));

// Route to serve chat page
app.get('/chat', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../Front-End/chat.html'));
});
// Route to serve the buy page
app.get('/buy', (req, res) => {
    const isAdmin = !!(req.session && req.session.admin);
    if (activeAdminSessions.size > 0 && !isAdmin) {
        return res.status(503).sendFile(path.resolve(__dirname, '../Front-End/buy-maintenance.html'));
    }
    res.sendFile(path.resolve(__dirname, '../Front-End/buy.html'));
});
// Route to serve the confirm sell request page
app.get('/admin-confirm-sell', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../Front-End/admin-confirm-sell.html'));
});
// Route to serve the sell page
app.get('/sell', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../Front-End/sell.html'));
});
app.get('/user/listings', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../Front-End/my-listings.html'));
});
// Route to serve admin bookings page
app.get('/admin/bookings', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../Front-End/admin-bookings.html'));
});

// --- AUTH MIDDLEWARE ---
function requireLogin(req, res, next) {
    if (req.session && req.session.user && req.session.user.id) {
        next();
    } else {
        res.status(401).json({ message: 'Not logged in' });
    }
}

function requireAdmin(req, res, next) {
    if (req.session && req.session.admin) {
        return next();
    }
    return res.status(401).json({ message: 'Admin login required' });
}

// ================================
// Chatbot Endpoint (logged-in users only)
// ================================
app.post('/chatbot', requireLogin, async (req, res) => {
    const { message, history } = req.body || {};
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        return res.status(400).json({ message: 'Message is required.' });
    }
    if (trimmed.length > 800) {
        return res.status(400).json({ message: 'Message too long.' });
    }

    const result = getLocalChatbotReply(trimmed, history);
    const replyText = result.reply;
    const userId = req.session.user.id;

    db.query(
        'INSERT INTO chatbot_history (user_id, role, message) VALUES (?, ?, ?), (?, ?, ?)',
        [userId, 'user', trimmed, userId, 'assistant', replyText],
        (err) => {
            if (err) console.error('Chatbot history insert error:', err);
            res.json({
                reply: replyText,
                matched: result.matched,
                confidence: result.confidence,
                suggestions: CHATBOT_KB.suggested_topics || []
            });
        }
    );
});

// Chatbot history: last 20 messages
app.get('/chatbot/history', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    db.query(
        'SELECT role, message, created_at FROM chatbot_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
        [userId],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            res.json(results.reverse());
        }
    );
});

// ------------------
// User Signup
// --- USER PROFILE ENDPOINTS ---
// Get logged-in user's profile
app.get('/user/profile', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    db.query('SELECT id, first_name, last_name, email, phone, created_at, is_verified, verified_at FROM users WHERE id = ?', [userId], (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (!results.length) return res.status(404).json({ message: 'User not found' });
        res.json(results[0]);
    });
});

// Update logged-in user's profile (name, phone, password)
app.post('/user/profile', requireLogin, async (req, res) => {
    const userId = req.session.user.id;
    const { first_name, last_name, phone, password } = req.body;
    // Only update provided fields
    let updates = [];
    let params = [];
    if (first_name) { updates.push('first_name = ?'); params.push(first_name); }
    if (last_name) { updates.push('last_name = ?'); params.push(last_name); }
    if (phone) { updates.push('phone = ?'); params.push(phone); }
    if (password) {
        const hashed = await bcrypt.hash(password, 10);
        updates.push('password = ?'); params.push(hashed);
    }
    if (!updates.length) return res.status(400).json({ message: 'No fields to update' });
    params.push(userId);
    db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params, (err, result) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json({ message: 'Profile updated' });
    });
});

// ------------------
// Verified Seller: User endpoints
app.get('/user/verification/status', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    db.query(
        `SELECT is_verified, verified_at
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [userId],
        (userErr, userRows) => {
            if (userErr) return res.status(500).json({ message: 'DB error' });
            const user = userRows && userRows.length ? userRows[0] : null;
            if (!user) return res.status(404).json({ message: 'User not found' });
            db.query(
                `SELECT id, status, admin_note, created_at, reviewed_at
                 FROM seller_verification_requests
                 WHERE user_id = ?
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [userId],
                (reqErr, reqRows) => {
                    if (reqErr) return res.status(500).json({ message: 'DB error' });
                    res.json({
                        is_verified: !!user.is_verified,
                        verified_at: user.verified_at || null,
                        latest_request: reqRows && reqRows.length ? reqRows[0] : null
                    });
                }
            );
        }
    );
});

app.post(
    '/user/verification/apply',
    requireLogin,
    (req, res, next) => {
        const uploadFields = verificationUpload.fields([
            { name: 'id_doc', maxCount: 1 },
            { name: 'selfie', maxCount: 1 },
            { name: 'address_doc', maxCount: 1 }
        ]);
        uploadFields(req, res, (err) => {
            if (!err) return next();
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ message: 'Files must be 5MB or smaller.' });
            }
            return res.status(400).json({ message: err.message || 'Invalid file upload.' });
        });
    },
    (req, res) => {
        const userId = req.session.user.id;
        const fullName = String(req.body.full_name || '').trim();
        const idType = String(req.body.id_type || '').trim();
        const idNumber = String(req.body.id_number || '').trim();

        if (!fullName || !idType || !idNumber) {
            return res.status(400).json({ message: 'Full name, ID type, and ID number are required.' });
        }

        db.query('SELECT is_verified FROM users WHERE id = ? LIMIT 1', [userId], (userErr, userRows) => {
            if (userErr) return res.status(500).json({ message: 'DB error' });
            if (!userRows.length) return res.status(404).json({ message: 'User not found' });
            if (userRows[0].is_verified) {
                return res.status(409).json({ message: 'You are already verified.' });
            }

            db.query(
                `SELECT id, status
                 FROM seller_verification_requests
                 WHERE user_id = ?
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [userId],
                (reqErr, reqRows) => {
                    if (reqErr) return res.status(500).json({ message: 'DB error' });
                    if (reqRows.length && reqRows[0].status === 'pending') {
                        return res.status(409).json({ message: 'Your verification request is already pending.' });
                    }

                    const idDoc = req.files?.id_doc?.[0];
                    const selfieDoc = req.files?.selfie?.[0];
                    const addressDoc = req.files?.address_doc?.[0];
                    const idDocUrl = idDoc ? `images/verification/${idDoc.filename}` : null;
                    const selfieUrl = selfieDoc ? `images/verification/${selfieDoc.filename}` : null;
                    const addressDocUrl = addressDoc ? `images/verification/${addressDoc.filename}` : null;

                    if (!idDocUrl) {
                        return res.status(400).json({ message: 'ID document upload is required.' });
                    }

                    db.query(
                        `INSERT INTO seller_verification_requests
                         (user_id, full_name, id_type, id_number, id_doc_url, selfie_url, address_doc_url, status)
                         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
                        [userId, fullName, idType, idNumber, idDocUrl, selfieUrl, addressDocUrl],
                        (insertErr, result) => {
                            if (insertErr) return res.status(500).json({ message: 'DB error' });
                            createUserNotification({
                                userId,
                                type: 'verification',
                                title: 'Verification Submitted',
                                message: 'Your verified seller request has been submitted and is awaiting admin review.',
                                link: 'profile.html'
                            });
                            res.json({ message: 'Verification request submitted.', request_id: result.insertId });
                        }
                    );
                }
            );
        });
    }
);

// ------------------
// Verified Seller: Admin endpoints
app.get('/admin/verification/requests', requireAdmin, (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const validStatuses = new Set(['pending', 'approved', 'rejected']);
    const useStatusFilter = validStatuses.has(status);
    const sql = `
        SELECT
            r.id, r.user_id, r.full_name, r.id_type, r.id_number, r.id_doc_url, r.selfie_url,
            r.address_doc_url, r.status, r.admin_note, r.created_at, r.reviewed_at,
            u.email, u.phone, u.first_name, u.last_name, u.is_verified, u.verified_at
        FROM seller_verification_requests r
        JOIN users u ON u.id = r.user_id
        ${useStatusFilter ? 'WHERE r.status = ?' : ''}
        ORDER BY FIELD(r.status, 'pending', 'approved', 'rejected'), r.created_at DESC
    `;
    db.query(sql, useStatusFilter ? [status] : [], (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(rows || []);
    });
});

app.post('/admin/verification/requests/:id/approve', requireAdmin, (req, res) => {
    const requestId = parseInt(req.params.id, 10);
    const adminNote = String(req.body?.admin_note || '').trim().slice(0, 500);
    if (!requestId) return res.status(400).json({ message: 'Invalid request id.' });

      db.beginTransaction((txErr) => {
          if (txErr) return res.status(500).json({ message: 'DB transaction error' });
          const rollback = (statusCode, payload) => db.rollback(() => res.status(statusCode).json(payload));
          let wishlistNotifyUserIds = [];
          let wishlistCarLabel = '';

        db.query(
            `SELECT r.*, u.is_verified
             FROM seller_verification_requests r
             JOIN users u ON u.id = r.user_id
             WHERE r.id = ?
             FOR UPDATE`,
            [requestId],
            (selectErr, rows) => {
                if (selectErr) return rollback(500, { message: 'DB error' });
                if (!rows.length) return rollback(404, { message: 'Request not found.' });
                const reqData = rows[0];
                if (reqData.status === 'approved') {
                    return rollback(409, { message: 'Request already approved.' });
                }
                if (reqData.status === 'rejected') {
                    return rollback(409, { message: 'Request already rejected.' });
                }

                db.query(
                    `UPDATE seller_verification_requests
                     SET status = 'approved', admin_note = ?, reviewed_at = NOW()
                     WHERE id = ?`,
                    [adminNote || 'Approved', requestId],
                    (updateErr) => {
                        if (updateErr) return rollback(500, { message: 'DB error' });
                        db.query(
                            `UPDATE users
                             SET is_verified = 1, verified_at = NOW()
                             WHERE id = ?`,
                            [reqData.user_id],
                            (userErr) => {
                                if (userErr) return rollback(500, { message: 'DB error' });
                                db.commit((commitErr) => {
                                    if (commitErr) return rollback(500, { message: 'Commit failed' });
                                    createUserNotification({
                                        userId: reqData.user_id,
                                        type: 'verification',
                                        title: 'Verified Seller Approved',
                                        message: 'Your verified seller request has been approved. Your listings now show the verified badge.',
                                        link: 'profile.html'
                                    });
                                    res.json({ message: 'Verification approved.' });
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});

app.post('/admin/verification/requests/:id/reject', requireAdmin, (req, res) => {
    const requestId = parseInt(req.params.id, 10);
    const adminNote = String(req.body?.admin_note || '').trim().slice(0, 500);
    if (!requestId) return res.status(400).json({ message: 'Invalid request id.' });

    db.query(
        `SELECT r.*, u.is_verified
         FROM seller_verification_requests r
         JOIN users u ON u.id = r.user_id
         WHERE r.id = ?
         LIMIT 1`,
        [requestId],
        (selectErr, rows) => {
            if (selectErr) return res.status(500).json({ message: 'DB error' });
            if (!rows.length) return res.status(404).json({ message: 'Request not found.' });
            const reqData = rows[0];
            if (reqData.status === 'approved') {
                return res.status(409).json({ message: 'Request already approved.' });
            }
            if (reqData.status === 'rejected') {
                return res.status(409).json({ message: 'Request already rejected.' });
            }
            db.query(
                `UPDATE seller_verification_requests
                 SET status = 'rejected', admin_note = ?, reviewed_at = NOW()
                 WHERE id = ?`,
                [adminNote || 'Rejected', requestId],
                (updateErr) => {
                    if (updateErr) return res.status(500).json({ message: 'DB error' });
                    createUserNotification({
                        userId: reqData.user_id,
                        type: 'verification',
                        title: 'Verified Seller Rejected',
                        message: 'Your verified seller request was rejected. You can re-apply with updated details.',
                        link: 'profile.html'
                    });
                    res.json({ message: 'Verification rejected.' });
                }
            );
        }
    );
});

app.get('/user/notifications', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    db.query(
        `SELECT id, type, title, message, link, is_read, created_at
         FROM user_notifications
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 100`,
        [userId],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            res.json(results);
        }
    );
});

app.post('/user/notifications/:id/read', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const notificationId = req.params.id;
    db.query(
        'UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
        [notificationId, userId],
        (err, result) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Notification not found' });
            }
            res.json({ success: true });
        }
    );
});

app.post('/user/notifications/read-all', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    db.query(
        'UPDATE user_notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
        [userId],
        (err) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            res.json({ success: true });
        }
    );
});

// --- Wishlist ---
app.get('/user/wishlist', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    db.query(
        `SELECT w.car_id, w.created_at, c.*
         FROM wishlists w
         JOIN cars c ON c.id = w.car_id
         WHERE w.user_id = ? AND c.is_deleted = 0`,
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            res.json(rows || []);
        }
    );
});

app.post('/user/wishlist', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const carId = parseInt(req.body.car_id, 10);
    if (!carId) return res.status(400).json({ message: 'Invalid car id.' });

    db.query('SELECT id, available, is_deleted FROM cars WHERE id = ? LIMIT 1', [carId], (carErr, carRows) => {
        if (carErr) return res.status(500).json({ message: 'DB error' });
        if (!carRows.length) return res.status(404).json({ message: 'Car not found.' });
        const car = carRows[0];
        if (car.is_deleted || !car.available) {
            return res.status(409).json({ message: 'This car is no longer available.' });
        }

        db.query(
            'INSERT IGNORE INTO wishlists (user_id, car_id) VALUES (?, ?)',
            [userId, carId],
            (insertErr, result) => {
                if (insertErr) return res.status(500).json({ message: 'DB error' });
                if (!result.affectedRows) {
                    return res.json({ message: 'Already in wishlist.' });
                }
                res.json({ message: 'Added to wishlist.' });
            }
        );
    });
});

app.delete('/user/wishlist/:carId', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const carId = parseInt(req.params.carId, 10);
    if (!carId) return res.status(400).json({ message: 'Invalid car id.' });
    db.query('DELETE FROM wishlists WHERE user_id = ? AND car_id = ?', [userId, carId], (err) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json({ message: 'Removed from wishlist.' });
    });
});

// ------------------
// Chat Requests & Conversations
app.post('/chat/request', requireLogin, (req, res) => {
    const buyerId = req.session.user.id;
    const carId = parseInt(req.body?.car_id, 10);
    if (!carId) return res.status(400).json({ message: 'Invalid car id.' });

    db.query('SELECT id, seller_user_id, make, model, year FROM cars WHERE id = ? LIMIT 1', [carId], (carErr, carRows) => {
        if (carErr) return res.status(500).json({ message: 'DB error' });
        if (!carRows.length) return res.status(404).json({ message: 'Car not found.' });
        const car = carRows[0];
        const sellerId = car.seller_user_id ? Number(car.seller_user_id) : null;
        if (!sellerId) return res.status(409).json({ message: 'This listing does not have a seller to chat with.' });
        if (Number(buyerId) === Number(sellerId)) {
            return res.status(409).json({ message: 'You cannot chat with your own listing.' });
        }

        db.query(
            `SELECT id, status
             FROM chat_requests
             WHERE buyer_id = ? AND seller_id = ? AND car_id = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            [buyerId, sellerId, carId],
            (reqErr, reqRows) => {
                if (reqErr) return res.status(500).json({ message: 'DB error' });
                if (reqRows.length) {
                    const status = reqRows[0].status;
                    if (['pending_admin', 'admin_approved', 'seller_accepted'].includes(status)) {
                        return res.status(409).json({ message: 'A chat request is already active for this car.' });
                    }
                }

                db.query(
                    `INSERT INTO chat_requests (car_id, buyer_id, seller_id, status)
                     VALUES (?, ?, ?, 'pending_admin')`,
                    [carId, buyerId, sellerId],
                    (insertErr, result) => {
                        if (insertErr) return res.status(500).json({ message: 'DB error' });
                        createUserNotification({
                            userId: buyerId,
                            type: 'chat',
                            title: 'Chat Request Submitted',
                            message: `Your chat request for ${car.make} ${car.model} (${car.year}) was sent to admin for approval.`,
                            link: 'chat.html'
                        });
                        res.json({ message: 'Chat request sent to admin for approval.', request_id: result.insertId });
                    }
                );
            }
        );
    });
});

app.get('/chat/requests', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const sql = `
        SELECT
            r.id, r.car_id, r.buyer_id, r.seller_id, r.status, r.admin_note, r.seller_note,
            r.created_at, r.admin_reviewed_at, r.seller_reviewed_at,
            c.make, c.model, c.year, c.image_url,
            bu.first_name AS buyer_first_name, bu.last_name AS buyer_last_name,
            su.first_name AS seller_first_name, su.last_name AS seller_last_name,
            conv.id AS conversation_id
        FROM chat_requests r
        JOIN cars c ON c.id = r.car_id
        JOIN users bu ON bu.id = r.buyer_id
        JOIN users su ON su.id = r.seller_id
        LEFT JOIN chat_conversations conv
            ON conv.car_id = r.car_id AND conv.buyer_id = r.buyer_id AND conv.seller_id = r.seller_id
        WHERE r.buyer_id = ? OR r.seller_id = ?
        ORDER BY r.created_at DESC
    `;
    db.query(sql, [userId, userId], (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(rows || []);
    });
});

app.post('/chat/requests/:id/respond', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const requestId = parseInt(req.params.id, 10);
    const action = String(req.body?.action || '').trim().toLowerCase();
    const sellerNote = String(req.body?.seller_note || '').trim().slice(0, 500);
    if (!requestId) return res.status(400).json({ message: 'Invalid request id.' });
    if (!['accept', 'decline'].includes(action)) {
        return res.status(400).json({ message: 'Action must be accept or decline.' });
    }

    db.beginTransaction((txErr) => {
        if (txErr) return res.status(500).json({ message: 'DB transaction error' });
        const rollback = (statusCode, payload) => db.rollback(() => res.status(statusCode).json(payload));

        db.query(
            `SELECT r.*, c.make, c.model, c.year
             FROM chat_requests r
             JOIN cars c ON c.id = r.car_id
             WHERE r.id = ? FOR UPDATE`,
            [requestId],
            (selectErr, rows) => {
                if (selectErr) return rollback(500, { message: 'DB error' });
                if (!rows.length) return rollback(404, { message: 'Request not found.' });
                const reqData = rows[0];
                if (Number(reqData.seller_id) !== Number(userId)) {
                    return rollback(403, { message: 'You are not allowed to respond to this request.' });
                }
                if (reqData.status !== 'admin_approved') {
                    return rollback(409, { message: 'Request is not awaiting seller response.' });
                }

                if (action === 'decline') {
                    return db.query(
                        `UPDATE chat_requests
                         SET status = 'seller_declined', seller_note = ?, seller_reviewed_at = NOW()
                         WHERE id = ?`,
                        [sellerNote || 'Seller declined.', requestId],
                        (updateErr) => {
                            if (updateErr) return rollback(500, { message: 'DB error' });
                            db.commit((commitErr) => {
                                if (commitErr) return rollback(500, { message: 'Commit failed' });
                                createUserNotification({
                                    userId: reqData.buyer_id,
                                    type: 'chat',
                                    title: 'Chat Request Declined',
                                    message: `The seller declined your chat request for ${reqData.make} ${reqData.model} (${reqData.year}).`,
                                    link: 'chat.html'
                                });
                                res.json({ message: 'Chat request declined.' });
                            });
                        }
                    );
                }

                db.query(
                    `SELECT id FROM chat_conversations
                     WHERE car_id = ? AND buyer_id = ? AND seller_id = ? LIMIT 1`,
                    [reqData.car_id, reqData.buyer_id, reqData.seller_id],
                    (convErr, convRows) => {
                        if (convErr) return rollback(500, { message: 'DB error' });
                        const existingConvId = convRows.length ? convRows[0].id : null;

                        const finalizeAccept = (conversationId) => {
                            db.query(
                                `UPDATE chat_requests
                                 SET status = 'seller_accepted', seller_note = ?, seller_reviewed_at = NOW()
                                 WHERE id = ?`,
                                [sellerNote || 'Seller accepted.', requestId],
                                (updateErr) => {
                                    if (updateErr) return rollback(500, { message: 'DB error' });
                                    db.commit((commitErr) => {
                                        if (commitErr) return rollback(500, { message: 'Commit failed' });
                                        createUserNotification({
                                            userId: reqData.buyer_id,
                                            type: 'chat',
                                            title: 'Chat Request Accepted',
                                            message: `Seller accepted your chat request for ${reqData.make} ${reqData.model} (${reqData.year}).`,
                                            link: 'chat.html'
                                        });
                                        res.json({ message: 'Chat request accepted.', conversation_id: conversationId });
                                    });
                                }
                            );
                        };

                        if (existingConvId) {
                            return finalizeAccept(existingConvId);
                        }

                        db.query(
                            `INSERT INTO chat_conversations (car_id, buyer_id, seller_id, created_at, last_message_at)
                             VALUES (?, ?, ?, NOW(), NOW())`,
                            [reqData.car_id, reqData.buyer_id, reqData.seller_id],
                            (createErr, createRes) => {
                                if (createErr) return rollback(500, { message: 'DB error' });
                                finalizeAccept(createRes.insertId);
                            }
                        );
                    }
                );
            }
        );
    });
});

app.get('/chat/conversations', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const sql = `
        SELECT
            c.id, c.car_id, c.buyer_id, c.seller_id, c.created_at, c.last_message_at,
            IF(cl.conversation_id IS NULL, 0, 1) AS is_closed,
            cl.closed_by, cl.closed_at, cl.reason AS closed_reason,
            car.make, car.model, car.year, car.image_url,
            bu.first_name AS buyer_first_name, bu.last_name AS buyer_last_name,
            su.first_name AS seller_first_name, su.last_name AS seller_last_name,
            (SELECT message FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM chat_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) AS last_message_time,
            (SELECT COUNT(*) FROM chat_messages m WHERE m.conversation_id = c.id AND m.is_read = 0 AND m.sender_id <> ?) AS unread_count
        FROM chat_conversations c
        JOIN cars car ON car.id = c.car_id
        JOIN users bu ON bu.id = c.buyer_id
        JOIN users su ON su.id = c.seller_id
        LEFT JOIN chat_conversation_closures cl ON cl.conversation_id = c.id
        WHERE c.buyer_id = ? OR c.seller_id = ?
        ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
    `;
    db.query(sql, [userId, userId, userId], (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(rows || []);
    });
});

app.get('/chat/conversations/:id/messages', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const conversationId = parseInt(req.params.id, 10);
    if (!conversationId) return res.status(400).json({ message: 'Invalid conversation id.' });

    db.query(
        `SELECT id, buyer_id, seller_id FROM chat_conversations WHERE id = ? LIMIT 1`,
        [conversationId],
        (convErr, convRows) => {
            if (convErr) return res.status(500).json({ message: 'DB error' });
            if (!convRows.length) return res.status(404).json({ message: 'Conversation not found.' });
            const conv = convRows[0];
            if (Number(conv.buyer_id) !== Number(userId) && Number(conv.seller_id) !== Number(userId)) {
                return res.status(403).json({ message: 'Access denied.' });
            }
            db.query(
                `SELECT conversation_id, closed_by, closed_at, reason
                 FROM chat_conversation_closures
                 WHERE conversation_id = ? LIMIT 1`,
                [conversationId],
                (closeErr, closeRows) => {
                    if (closeErr) return res.status(500).json({ message: 'DB error' });
                    const closure = closeRows && closeRows.length ? closeRows[0] : null;
                    db.query(
                        `SELECT id, sender_id, message, created_at, is_read
                         FROM chat_messages
                         WHERE conversation_id = ?
                         ORDER BY created_at ASC`,
                        [conversationId],
                        (msgErr, msgRows) => {
                            if (msgErr) return res.status(500).json({ message: 'DB error' });
                            res.json({
                                messages: msgRows || [],
                                closed: !!closure,
                                closed_by: closure ? closure.closed_by : null,
                                closed_at: closure ? closure.closed_at : null,
                                closed_reason: closure ? closure.reason : null
                            });
                        }
                    );
                }
            );
        }
    );
});

app.post('/chat/conversations/:id/messages', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const conversationId = parseInt(req.params.id, 10);
    const message = String(req.body?.message || '').trim().slice(0, 2000);
    if (!conversationId) return res.status(400).json({ message: 'Invalid conversation id.' });
    if (!message) return res.status(400).json({ message: 'Message cannot be empty.' });

    db.query(
        `SELECT id, buyer_id, seller_id, car_id FROM chat_conversations WHERE id = ? LIMIT 1`,
        [conversationId],
        (convErr, convRows) => {
            if (convErr) return res.status(500).json({ message: 'DB error' });
            if (!convRows.length) return res.status(404).json({ message: 'Conversation not found.' });
            const conv = convRows[0];
            if (Number(conv.buyer_id) !== Number(userId) && Number(conv.seller_id) !== Number(userId)) {
                return res.status(403).json({ message: 'Access denied.' });
            }
            const otherUserId = Number(conv.buyer_id) === Number(userId) ? conv.seller_id : conv.buyer_id;
            db.query(
                `SELECT conversation_id FROM chat_conversation_closures WHERE conversation_id = ? LIMIT 1`,
                [conversationId],
                (closeErr, closeRows) => {
                    if (closeErr) return res.status(500).json({ message: 'DB error' });
                    if (closeRows && closeRows.length) {
                        return res.status(409).json({ message: 'This chat is closed. You can still read messages, but you cannot send new ones.' });
                    }
                    db.query(
                        `INSERT INTO chat_messages (conversation_id, sender_id, message)
                         VALUES (?, ?, ?)`,
                        [conversationId, userId, message],
                        (insertErr) => {
                            if (insertErr) return res.status(500).json({ message: 'DB error' });
                            db.query(
                                `UPDATE chat_conversations SET last_message_at = NOW() WHERE id = ?`,
                                [conversationId],
                                () => {}
                            );
                            createUserNotification({
                                userId: otherUserId,
                                type: 'chat',
                                title: 'New Chat Message',
                                message: 'You received a new message.',
                                link: 'chat.html'
                            });
                            res.json({ message: 'Message sent.' });
                        }
                    );
                }
            );
        }
    );
});

app.post('/chat/conversations/:id/close', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const conversationId = parseInt(req.params.id, 10);
    const reason = String(req.body?.reason || '').trim().slice(0, 255);
    if (!conversationId) return res.status(400).json({ message: 'Invalid conversation id.' });

    db.query(
        `SELECT id, buyer_id, seller_id FROM chat_conversations WHERE id = ? LIMIT 1`,
        [conversationId],
        (convErr, convRows) => {
            if (convErr) return res.status(500).json({ message: 'DB error' });
            if (!convRows.length) return res.status(404).json({ message: 'Conversation not found.' });
            const conv = convRows[0];
            if (Number(conv.buyer_id) !== Number(userId) && Number(conv.seller_id) !== Number(userId)) {
                return res.status(403).json({ message: 'Access denied.' });
            }
            const otherUserId = Number(conv.buyer_id) === Number(userId) ? conv.seller_id : conv.buyer_id;
            db.query(
                `SELECT conversation_id FROM chat_conversation_closures WHERE conversation_id = ? LIMIT 1`,
                [conversationId],
                (closeErr, closeRows) => {
                    if (closeErr) return res.status(500).json({ message: 'DB error' });
                    if (closeRows && closeRows.length) {
                        return res.status(409).json({ message: 'This chat is already closed.' });
                    }
                    db.query(
                        `INSERT INTO chat_conversation_closures (conversation_id, closed_by, reason)
                         VALUES (?, ?, ?)`,
                        [conversationId, userId, reason || null],
                        (insertErr) => {
                            if (insertErr) return res.status(500).json({ message: 'DB error' });
                            createUserNotification({
                                userId: otherUserId,
                                type: 'chat',
                                title: 'Chat Closed',
                                message: 'The other user closed this chat. You can still read messages but cannot send new ones.',
                                link: 'chat.html'
                            });
                            res.json({ message: 'Chat closed.' });
                        }
                    );
                }
            );
        }
    );
});

app.post('/chat/conversations/:id/read', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const conversationId = parseInt(req.params.id, 10);
    if (!conversationId) return res.status(400).json({ message: 'Invalid conversation id.' });
    db.query(
        `UPDATE chat_messages
         SET is_read = 1
         WHERE conversation_id = ? AND sender_id <> ?`,
        [conversationId, userId],
        (err) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            res.json({ success: true });
        }
    );
});

// Admin: chat request moderation
app.get('/admin/chat-requests', requireAdmin, (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const validStatuses = new Set(['pending_admin', 'admin_approved', 'admin_rejected', 'seller_accepted', 'seller_declined']);
    const useStatusFilter = validStatuses.has(status);
    const sql = `
        SELECT
            r.id, r.status, r.admin_note, r.seller_note, r.created_at, r.admin_reviewed_at, r.seller_reviewed_at,
            r.car_id, r.buyer_id, r.seller_id,
            c.make, c.model, c.year,
            bu.first_name AS buyer_first_name, bu.last_name AS buyer_last_name, bu.email AS buyer_email,
            su.first_name AS seller_first_name, su.last_name AS seller_last_name, su.email AS seller_email
        FROM chat_requests r
        JOIN cars c ON c.id = r.car_id
        JOIN users bu ON bu.id = r.buyer_id
        JOIN users su ON su.id = r.seller_id
        ${useStatusFilter ? 'WHERE r.status = ?' : ''}
        ORDER BY FIELD(r.status, 'pending_admin', 'admin_approved', 'seller_accepted', 'seller_declined', 'admin_rejected'), r.created_at DESC
    `;
    db.query(sql, useStatusFilter ? [status] : [], (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(rows || []);
    });
});

app.post('/admin/chat-requests/:id/approve', requireAdmin, (req, res) => {
    const requestId = parseInt(req.params.id, 10);
    const adminNote = String(req.body?.admin_note || '').trim().slice(0, 500);
    if (!requestId) return res.status(400).json({ message: 'Invalid request id.' });

    db.query(
        `SELECT r.*, c.make, c.model, c.year
         FROM chat_requests r
         JOIN cars c ON c.id = r.car_id
         WHERE r.id = ? LIMIT 1`,
        [requestId],
        (selectErr, rows) => {
            if (selectErr) return res.status(500).json({ message: 'DB error' });
            if (!rows.length) return res.status(404).json({ message: 'Request not found.' });
            const reqData = rows[0];
            if (reqData.status !== 'pending_admin') {
                return res.status(409).json({ message: 'Request is not pending admin approval.' });
            }
            db.query(
                `UPDATE chat_requests
                 SET status = 'admin_approved', admin_note = ?, admin_reviewed_at = NOW()
                 WHERE id = ?`,
                [adminNote || 'Approved', requestId],
                (updateErr) => {
                    if (updateErr) return res.status(500).json({ message: 'DB error' });
                    createUserNotification({
                        userId: reqData.buyer_id,
                        type: 'chat',
                        title: 'Chat Request Approved',
                        message: `Admin approved your chat request for ${reqData.make} ${reqData.model} (${reqData.year}). Waiting for seller response.`,
                        link: 'chat.html'
                    });
                    createUserNotification({
                        userId: reqData.seller_id,
                        type: 'chat',
                        title: 'New Chat Request',
                        message: `A buyer wants to chat about your ${reqData.make} ${reqData.model} (${reqData.year}).`,
                        link: 'chat.html'
                    });
                    res.json({ message: 'Chat request approved.' });
                }
            );
        }
    );
});

app.post('/admin/chat-requests/:id/reject', requireAdmin, (req, res) => {
    const requestId = parseInt(req.params.id, 10);
    const adminNote = String(req.body?.admin_note || '').trim().slice(0, 500);
    if (!requestId) return res.status(400).json({ message: 'Invalid request id.' });

    db.query(
        `SELECT r.*, c.make, c.model, c.year
         FROM chat_requests r
         JOIN cars c ON c.id = r.car_id
         WHERE r.id = ? LIMIT 1`,
        [requestId],
        (selectErr, rows) => {
            if (selectErr) return res.status(500).json({ message: 'DB error' });
            if (!rows.length) return res.status(404).json({ message: 'Request not found.' });
            const reqData = rows[0];
            if (reqData.status !== 'pending_admin') {
                return res.status(409).json({ message: 'Request is not pending admin approval.' });
            }
            db.query(
                `UPDATE chat_requests
                 SET status = 'admin_rejected', admin_note = ?, admin_reviewed_at = NOW()
                 WHERE id = ?`,
                [adminNote || 'Rejected', requestId],
                (updateErr) => {
                    if (updateErr) return res.status(500).json({ message: 'DB error' });
                    createUserNotification({
                        userId: reqData.buyer_id,
                        type: 'chat',
                        title: 'Chat Request Rejected',
                        message: `Admin rejected your chat request for ${reqData.make} ${reqData.model} (${reqData.year}).`,
                        link: 'chat.html'
                    });
                    res.json({ message: 'Chat request rejected.' });
                }
            );
        }
    );
});

app.post('/user/car-offers', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const { car_id, offered_price, message } = req.body;
    const carId = parseInt(car_id, 10);
    const offeredPrice = parseFloat(offered_price);
    const userMessage = typeof message === 'string' ? message.trim().slice(0, 500) : null;

    if (!carId || Number.isNaN(offeredPrice) || offeredPrice <= 0) {
        return res.status(400).json({ message: 'Invalid car or offered price.' });
    }

    db.query('SELECT id, price, available, make, model FROM cars WHERE id = ? LIMIT 1', [carId], (carErr, carRows) => {
        if (carErr) return res.status(500).json({ message: 'DB error' });
        if (!carRows.length) return res.status(404).json({ message: 'Car not found.' });
        const car = carRows[0];
        if (!car.available) return res.status(400).json({ message: 'Car is no longer available.' });

        // Keep offers realistic and prevent accidental bad input.
        const minAllowed = Number(car.price) * 0.4;
        const maxAllowed = Number(car.price) * 1.3;
        if (offeredPrice < minAllowed || offeredPrice > maxAllowed) {
            return res.status(400).json({
                message: `Offer must be between ${formatINR(Math.round(minAllowed))} and ${formatINR(Math.round(maxAllowed))}.`
            });
        }

        db.query(
            'SELECT id FROM car_offers WHERE car_id = ? AND user_id = ? AND status IN (\'pending\', \'countered\') LIMIT 1',
            [carId, userId],
            (existingErr, existingRows) => {
                if (existingErr) return res.status(500).json({ message: 'DB error' });
                if (existingRows.length) {
                    return res.status(409).json({ message: 'You already have an active offer for this car.' });
                }

                db.query(
                    `INSERT INTO car_offers
                    (car_id, user_id, listed_price, offered_price, user_message, status)
                    VALUES (?, ?, ?, ?, ?, 'pending')`,
                    [carId, userId, car.price, offeredPrice, userMessage || null],
                    (insertErr, result) => {
                        if (insertErr) return res.status(500).json({ message: 'DB error' });
                        createUserNotification({
                            userId,
                            type: 'offer',
                            title: 'Offer Submitted',
                            message: `Your offer for ${car.make} ${car.model} has been sent for admin review.`,
                            link: 'profile.html'
                        });
                        res.json({ message: 'Offer submitted successfully.', id: result.insertId });
                    }
                );
            }
        );
    });
});

app.get('/user/car-offers', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    db.query(
        `SELECT
            o.id, o.car_id, o.listed_price, o.offered_price, o.counter_price, o.status,
            o.user_message, o.admin_response, o.created_at, o.updated_at,
            c.make, c.model, c.year, c.image_url, c.available
         FROM car_offers o
         JOIN cars c ON c.id = o.car_id
         WHERE o.user_id = ?
         ORDER BY o.created_at DESC`,
        [userId],
        (err, rows) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            res.json(rows);
        }
    );
});

app.get('/user/offer-checkout/:id', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const offerId = parseInt(req.params.id, 10);
    if (!offerId) return res.status(400).json({ message: 'Invalid offer id.' });

    db.query(
        `SELECT
            o.id, o.car_id, o.status, o.offered_price, o.counter_price,
            c.id AS car_db_id, c.make, c.model, c.year, c.price, c.available
         FROM car_offers o
         JOIN cars c ON c.id = o.car_id
         WHERE o.id = ? AND o.user_id = ?
         LIMIT 1`,
        [offerId, userId],
        (err, rows) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            if (!rows.length) return res.status(404).json({ message: 'Offer not found.' });
            const row = rows[0];
            if (row.status !== 'accepted') {
                return res.status(409).json({ message: `Offer is ${row.status}. Only accepted offers can be checked out.` });
            }
            if (!row.available) {
                return res.status(409).json({ message: 'Car is no longer available.' });
            }
            const agreedPrice = Number(row.counter_price || row.offered_price || row.price);
            res.json({
                offer_id: row.id,
                car: {
                    id: row.car_db_id,
                    make: row.make,
                    model: row.model,
                    year: row.year,
                    list_price: row.price
                },
                agreed_price: agreedPrice
            });
        }
    );
});

app.post('/user/car-offers/:id/withdraw', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const offerId = parseInt(req.params.id, 10);
    if (!offerId) return res.status(400).json({ message: 'Invalid offer id.' });

    db.query(
        `UPDATE car_offers
         SET status = 'withdrawn', admin_response = COALESCE(admin_response, 'Offer withdrawn by user.')
         WHERE id = ? AND user_id = ? AND status IN ('pending', 'countered')`,
        [offerId, userId],
        (err, result) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            if (!result.affectedRows) return res.status(404).json({ message: 'Active offer not found.' });
            res.json({ message: 'Offer withdrawn.' });
        }
    );
});

app.post('/user/car-offers/:id/counter-response', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const offerId = parseInt(req.params.id, 10);
    const action = typeof req.body.action === 'string' ? req.body.action.trim().toLowerCase() : '';
    if (!offerId) return res.status(400).json({ message: 'Invalid offer id.' });
    if (!['accept', 'reject'].includes(action)) {
        return res.status(400).json({ message: 'Action must be accept or reject.' });
    }

    db.beginTransaction((txErr) => {
        if (txErr) return res.status(500).json({ message: 'DB transaction error' });
        const rollback = (statusCode, payload) => db.rollback(() => res.status(statusCode).json(payload));

        db.query(
            `SELECT o.id, o.car_id, o.user_id, o.status, o.counter_price, c.available, c.make, c.model
             FROM car_offers o
             JOIN cars c ON c.id = o.car_id
             WHERE o.id = ? AND o.user_id = ? FOR UPDATE`,
            [offerId, userId],
            (selectErr, rows) => {
                if (selectErr) return rollback(500, { message: 'DB error' });
                if (!rows.length) return rollback(404, { message: 'Offer not found.' });
                const offer = rows[0];

                if (offer.status !== 'countered') {
                    return rollback(409, { message: `Only countered offers can be responded to. Current status: ${offer.status}.` });
                }

                if (action === 'accept') {
                    if (!offer.available) return rollback(409, { message: 'Car is no longer available.' });
                    db.query(
                        `UPDATE car_offers
                         SET status = 'accepted',
                             admin_response = COALESCE(admin_response, 'User accepted the counter-offer.')
                         WHERE id = ? AND user_id = ? AND status = 'countered'`,
                        [offerId, userId],
                        (updateErr, result) => {
                            if (updateErr) return rollback(500, { message: 'DB error' });
                            if (!result.affectedRows) return rollback(409, { message: 'Offer was already updated.' });
                            db.commit((commitErr) => {
                                if (commitErr) return rollback(500, { message: 'Commit failed' });
                                createUserNotification({
                                    userId,
                                    type: 'offer',
                                    title: 'Counter Offer Accepted',
                                    message: `You accepted the counter-offer for ${offer.make} ${offer.model}. Complete your purchase now.`,
                                    link: `purchase.html?car_id=${offer.car_id}&offer_id=${offer.id}`
                                });
                                res.json({ message: 'Counter-offer accepted. Proceed to purchase.' });
                            });
                        }
                    );
                    return;
                }

                db.query(
                    `UPDATE car_offers
                     SET status = 'rejected',
                         admin_response = COALESCE(admin_response, 'Counter-offer declined by user.')
                     WHERE id = ? AND user_id = ? AND status = 'countered'`,
                    [offerId, userId],
                    (updateErr, result) => {
                        if (updateErr) return rollback(500, { message: 'DB error' });
                        if (!result.affectedRows) return rollback(409, { message: 'Offer was already updated.' });
                        db.commit((commitErr) => {
                            if (commitErr) return rollback(500, { message: 'Commit failed' });
                            res.json({ message: 'Counter-offer rejected.' });
                        });
                    }
                );
            }
        );
    });
});

app.get('/user/newsletter-offer-checkout/:id', requireLogin, (req, res) => {
    const userEmail = req.session.user.email;
    const offerId = parseInt(req.params.id, 10);
    if (!offerId) return res.status(400).json({ message: 'Invalid offer id.' });
    isNewsletterSubscriber(userEmail, (subErr, isSubscribed) => {
        if (subErr) return res.status(500).json({ message: 'DB error' });
        if (!isSubscribed) return res.status(403).json({ message: 'Newsletter subscription required.' });
        const today = new Date().toISOString().slice(0, 10);
        const sql = `
            SELECT o.id, o.car_id, o.discount_type, o.discount_value, o.discounted_price, o.original_price,
                   o.valid_from, o.valid_to,
                   c.id AS car_db_id, c.make, c.model, c.year, c.price, c.available, c.is_deleted
            FROM offers o
            JOIN cars c ON c.id = o.car_id
            WHERE o.id = ?
              AND (o.valid_from IS NULL OR o.valid_from <= ?)
              AND (o.valid_to IS NULL OR o.valid_to >= ?)
            LIMIT 1`;
        db.query(sql, [offerId, today, today], (err, rows) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            if (!rows.length) return res.status(404).json({ message: 'Offer not found or expired.' });
            const row = rows[0];
            if (row.is_deleted || !row.available) {
                return res.status(409).json({ message: 'Car is no longer available.' });
            }
            res.json({
                offer_id: row.id,
                car: {
                    id: row.car_db_id,
                    make: row.make,
                    model: row.model,
                    year: row.year,
                    list_price: row.price
                },
                discount: {
                    type: row.discount_type,
                    value: row.discount_value,
                    original_price: row.original_price,
                    discounted_price: row.discounted_price
                },
                agreed_price: row.discounted_price
            });
        });
    });
});

// --- USER PURCHASES ---
app.get('/user/purchases', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const withComplaintsSql = `
        SELECT purchases.*, cars.make, cars.model, cars.year, cars.price, cars.image_url,
               COALESCE(purchases.final_price, cars.price) AS purchase_price,
               pc.id AS complaint_id,
               pc.subject AS complaint_subject,
               pc.message AS complaint_message,
               pc.status AS complaint_status,
               pc.admin_response AS complaint_admin_response,
               pc.created_at AS complaint_created_at,
               pc.responded_at AS complaint_responded_at
        FROM purchases
        JOIN cars ON purchases.car_id = cars.id
        LEFT JOIN purchase_complaints pc ON pc.purchase_id = purchases.id
        WHERE purchases.user_id = ?
        ORDER BY purchases.purchase_date DESC`;
    const fallbackSql = `
        SELECT purchases.*, cars.make, cars.model, cars.year, cars.price, cars.image_url,
               COALESCE(purchases.final_price, cars.price) AS purchase_price
        FROM purchases
        JOIN cars ON purchases.car_id = cars.id
        WHERE purchases.user_id = ?
        ORDER BY purchases.purchase_date DESC`;

    db.query(withComplaintsSql, [userId], (err, results) => {
        if (err && err.code === 'ER_NO_SUCH_TABLE') {
            return db.query(fallbackSql, [userId], (fallbackErr, fallbackResults) => {
                if (fallbackErr) return res.status(500).json({ message: 'DB error' });
                res.json(fallbackResults);
            });
        }
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results);
    });
});

// Create a complaint for a purchased car
app.post('/user/purchases/:id/complaints', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const purchaseId = parseInt(req.params.id, 10);
    const { subject, message } = req.body;
    if (!purchaseId) return res.status(400).json({ message: 'Invalid purchase id.' });
    if (!subject || !message) return res.status(400).json({ message: 'Subject and message are required.' });

    db.query(
        `SELECT p.id, p.car_id, c.make, c.model, c.year
         FROM purchases p
         JOIN cars c ON p.car_id = c.id
         WHERE p.id = ? AND p.user_id = ?
         LIMIT 1`,
        [purchaseId, userId],
        (purchaseErr, purchaseRows) => {
            if (purchaseErr) return res.status(500).json({ message: 'DB error' });
            if (!purchaseRows.length) return res.status(404).json({ message: 'Purchase not found.' });
            const purchase = purchaseRows[0];

            db.query(
                'SELECT id FROM purchase_complaints WHERE purchase_id = ? LIMIT 1',
                [purchaseId],
                (checkErr, checkRows) => {
                    if (checkErr) return res.status(500).json({ message: 'DB error' });
                    if (checkRows.length) {
                        return res.status(409).json({ message: 'Complaint already submitted for this purchase.' });
                    }
                    db.query(
                        `INSERT INTO purchase_complaints (purchase_id, car_id, user_id, subject, message)
                         VALUES (?, ?, ?, ?, ?)`,
                        [purchaseId, purchase.car_id, userId, subject.trim(), message.trim()],
                        (insertErr) => {
                            if (insertErr) return res.status(500).json({ message: 'DB error' });
                            createUserNotification({
                                userId,
                                type: 'complaint',
                                title: 'Complaint Submitted',
                                message: `Your complaint for ${purchase.make} ${purchase.model} (${purchase.year}) has been received.`,
                                link: 'profile.html#purchases'
                            });
                            res.json({ message: 'Complaint submitted successfully.' });
                        }
                    );
                }
            );
        }
    );
});

app.get('/user/purchases/:id/receipt', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const purchaseId = parseInt(req.params.id, 10);
    if (!purchaseId) return res.status(400).json({ message: 'Invalid purchase id.' });
    const format = String(req.query.format || 'html').toLowerCase();

    const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    const receiptQuery = `
        SELECT p.*, c.make, c.model, c.year, c.image_url,
               COALESCE(p.final_price, c.price) AS purchase_price,
               u.first_name, u.last_name, u.email, u.phone
        FROM purchases p
        JOIN cars c ON p.car_id = c.id
        JOIN users u ON p.user_id = u.id
        WHERE p.id = ? AND p.user_id = ?
        LIMIT 1
    `;

    db.query(receiptQuery, [purchaseId, userId], (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (!rows.length) return res.status(404).json({ message: 'Purchase not found.' });

        const purchase = rows[0];
        const paymentDetails = String(purchase.payment_details || '');
        const mockMatch = paymentDetails.match(/MockPayment:(\d+)/i);
        const mockPaymentId = mockMatch ? parseInt(mockMatch[1], 10) : null;

        const renderReceiptPdf = (mockPayment) => {
            const receiptNo = mockPayment?.receipt_no || purchase.receipt_no || `SG-${purchase.id}`;
            const paymentStatus = mockPayment?.status || 'completed';
            const paymentMethod = purchase.payment_method || 'N/A';
            const totalAmount = Number(purchase.purchase_price || 0);
            const deliveryAmount = toAmount(DELIVERY_FEE);
            const docAmount = toAmount(DOCUMENT_FEE);
            const registrationAmount = toAmount(REGISTRATION_TRANSFER_FEE);
            const inspectionAmount = toAmount(INSPECTION_FEE);
            const platformAmount = toAmount(PLATFORM_FEE);
            const insuranceAmount = purchase.insurance_addon ? toAmount(INSURANCE_ADDON_FEE) : 0;
            const warrantyAmount = purchase.warranty_extension ? toAmount(WARRANTY_EXTENSION_FEE) : 0;
            const accessoryAmount = purchase.accessory_bundle ? toAmount(ACCESSORY_BUNDLE_FEE) : 0;
            const baseAmount = toAmount(totalAmount - deliveryAmount - docAmount - registrationAmount - inspectionAmount - platformAmount - insuranceAmount - warrantyAmount - accessoryAmount);
            const purchaseDate = purchase.purchase_date ? new Date(purchase.purchase_date) : new Date();
            const invoiceDate = purchaseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            const buyerName = `${purchase.first_name || ''} ${purchase.last_name || ''}`.trim() || 'SecondGear Customer';
            const vehicleName = `${purchase.year || ''} ${purchase.make || ''} ${purchase.model || ''}`.trim() || `Car #${purchase.car_id}`;
            const address = [purchase.address, purchase.city, purchase.zip].filter(Boolean).join(', ') || 'Address on file';
            const currency = mockPayment?.currency || 'INR';

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="SecondGear-Receipt-${purchase.id}.pdf"`);

            const doc = new PDFDocument({ size: 'A4', margin: 50 });
            doc.pipe(res);
            const rupeeFontPath = getPdfRupeeFontPath();
            if (rupeeFontPath) doc.font(rupeeFontPath);

            doc.fontSize(20).fillColor('#1d4ed8').text('SecondGear', { align: 'left' });
            doc.fontSize(11).fillColor('#475569').text('Official Payment Receipt', { align: 'left' });
            doc.moveDown();

            doc.fontSize(12).fillColor('#0f172a');
            doc.text(`Receipt #: ${receiptNo}`);
            doc.text(`Purchase ID: ${purchase.id}`);
            doc.text(`Date: ${invoiceDate}`);
            doc.moveDown(0.6);
            doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#d7e4f5').stroke();
            doc.moveDown();

            doc.fontSize(12).fillColor('#1d4ed8').text('Bill To', { underline: true });
            doc.fontSize(11).fillColor('#0f172a');
            doc.text(buyerName);
            if (purchase.email) doc.text(purchase.email);
            if (purchase.phone) doc.text(purchase.phone);
            doc.text(address);
            doc.moveDown();

            doc.fontSize(12).fillColor('#1d4ed8').text('Vehicle', { underline: true });
            doc.fontSize(11).fillColor('#0f172a');
            doc.text(vehicleName);
            doc.text(`Vehicle ID: ${purchase.car_id}`);
            doc.text(`Purchase Date: ${invoiceDate}`);
            doc.moveDown();

            doc.fontSize(12).fillColor('#1d4ed8').text('Payment', { underline: true });
            doc.fontSize(11).fillColor('#0f172a');
            doc.text(`Method: ${paymentMethod}`);
            doc.text(`Status: ${paymentStatus}`);
            doc.text(`Currency: ${currency}`);
            doc.moveDown();

            doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#d7e4f5').stroke();
            doc.moveDown();

            doc.fontSize(12).fillColor('#0f172a').text(`Base Price: ${formatINR(baseAmount || 0)}`, { align: 'right' });
            doc.text(`Delivery Fee: ${formatINR(deliveryAmount || 0)}`, { align: 'right' });
            doc.text(`Documentation Fee: ${formatINR(docAmount || 0)}`, { align: 'right' });
            doc.text(`Registration Transfer Fee: ${formatINR(registrationAmount || 0)}`, { align: 'right' });
            doc.text(`Inspection / Certification Fee: ${formatINR(inspectionAmount || 0)}`, { align: 'right' });
            doc.text(`Platform / Service Fee: ${formatINR(platformAmount || 0)}`, { align: 'right' });
            doc.text(`Insurance Add-on: ${formatINR(insuranceAmount || 0)}`, { align: 'right' });
            doc.text(`Warranty Extension: ${formatINR(warrantyAmount || 0)}`, { align: 'right' });
            doc.text(`Accessory Bundle: ${formatINR(accessoryAmount || 0)}`, { align: 'right' });
            doc.fontSize(14).fillColor('#1d4ed8').text(`Total Paid: ${formatINR(totalAmount || 0)}`, { align: 'right' });

            doc.moveDown(1.2);
            doc.fontSize(10).fillColor('#475569')
                .text('This receipt confirms your payment was recorded by SecondGear. Keep it for your records.');

            doc.end();
        };

        const renderReceiptHtml = (mockPayment) => {
            const receiptNo = mockPayment?.receipt_no || purchase.receipt_no || `SG-${purchase.id}`;
            const paymentStatus = mockPayment?.status || 'completed';
            const paymentMethod = purchase.payment_method || 'N/A';
            const totalAmount = Number(purchase.purchase_price || 0);
            const deliveryAmount = toAmount(DELIVERY_FEE);
            const docAmount = toAmount(DOCUMENT_FEE);
            const registrationAmount = toAmount(REGISTRATION_TRANSFER_FEE);
            const inspectionAmount = toAmount(INSPECTION_FEE);
            const platformAmount = toAmount(PLATFORM_FEE);
            const insuranceAmount = purchase.insurance_addon ? toAmount(INSURANCE_ADDON_FEE) : 0;
            const warrantyAmount = purchase.warranty_extension ? toAmount(WARRANTY_EXTENSION_FEE) : 0;
            const accessoryAmount = purchase.accessory_bundle ? toAmount(ACCESSORY_BUNDLE_FEE) : 0;
            const baseAmount = toAmount(totalAmount - deliveryAmount - docAmount - registrationAmount - inspectionAmount - platformAmount - insuranceAmount - warrantyAmount - accessoryAmount);
            const purchaseDate = purchase.purchase_date ? new Date(purchase.purchase_date) : new Date();
            const invoiceDate = purchaseDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            const buyerName = `${purchase.first_name || ''} ${purchase.last_name || ''}`.trim() || 'SecondGear Customer';
            const vehicleName = `${purchase.year || ''} ${purchase.make || ''} ${purchase.model || ''}`.trim() || `Car #${purchase.car_id}`;
            const address = [purchase.address, purchase.city, purchase.zip].filter(Boolean).join(', ');

            const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SecondGear Receipt #${escapeHtml(receiptNo)}</title>
    <style>
        :root {
            --ink: #0f172a;
            --muted: #475569;
            --brand: #1d4ed8;
            --accent: #0ea5e9;
            --panel: #ffffff;
            --border: #d7e4f5;
            --bg: #f5f8ff;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
            background: var(--bg);
            color: var(--ink);
            padding: 30px 16px 40px;
        }
        .receipt-shell {
            max-width: 820px;
            margin: 0 auto;
            background: var(--panel);
            border: 1px solid var(--border);
            border-radius: 18px;
            box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12);
            padding: 28px;
        }
        .receipt-header {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            flex-wrap: wrap;
            border-bottom: 2px solid var(--border);
            padding-bottom: 18px;
            margin-bottom: 18px;
        }
        .receipt-brand h1 {
            margin: 0;
            font-size: 1.6rem;
            color: var(--brand);
            letter-spacing: 0.3px;
        }
        .receipt-brand p {
            margin: 6px 0 0;
            color: var(--muted);
            font-size: 0.92rem;
        }
        .receipt-meta {
            text-align: right;
            font-size: 0.9rem;
            color: var(--muted);
        }
        .receipt-meta strong {
            color: var(--ink);
            display: block;
            font-size: 1.1rem;
        }
        .receipt-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 16px;
            margin-bottom: 18px;
        }
        .panel {
            border: 1px solid var(--border);
            border-radius: 14px;
            padding: 14px 16px;
            background: #f9fbff;
        }
        .panel h3 {
            margin: 0 0 8px;
            font-size: 0.95rem;
            color: var(--brand);
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }
        .panel p {
            margin: 0;
            font-size: 0.92rem;
            color: var(--muted);
            line-height: 1.5;
        }
        .summary {
            border-top: 1px dashed var(--border);
            padding-top: 18px;
        }
        .summary-row {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
            font-size: 0.95rem;
        }
        .summary-row strong {
            color: var(--ink);
        }
        .total {
            font-size: 1.2rem;
            font-weight: 700;
            color: var(--brand);
        }
        .footer-note {
            margin-top: 22px;
            padding: 12px 14px;
            background: linear-gradient(90deg, rgba(29,78,216,0.1), rgba(14,165,233,0.12));
            border-radius: 12px;
            color: var(--muted);
            font-size: 0.9rem;
        }
        @media print {
            body { background: #fff; padding: 0; }
            .receipt-shell { box-shadow: none; border: none; }
        }
    </style>
</head>
<body>
    <div class="receipt-shell">
        <div class="receipt-header">
            <div class="receipt-brand">
                <h1>SecondGear</h1>
                <p>Official Payment Receipt</p>
            </div>
            <div class="receipt-meta">
                <strong>Receipt #${escapeHtml(receiptNo)}</strong>
                <span>Purchase ID: ${escapeHtml(purchase.id)}</span><br>
                <span>Date: ${escapeHtml(invoiceDate)}</span>
            </div>
        </div>

        <div class="receipt-grid">
            <div class="panel">
                <h3>Bill To</h3>
                <p>${escapeHtml(buyerName)}</p>
                <p>${escapeHtml(purchase.email || '')}</p>
                <p>${escapeHtml(purchase.phone || '')}</p>
                <p>${escapeHtml(address || 'Address on file')}</p>
            </div>
            <div class="panel">
                <h3>Vehicle</h3>
                <p>${escapeHtml(vehicleName)}</p>
                <p>Vehicle ID: ${escapeHtml(purchase.car_id)}</p>
                <p>Purchase Date: ${escapeHtml(invoiceDate)}</p>
            </div>
            <div class="panel">
                <h3>Payment</h3>
                <p>Method: ${escapeHtml(paymentMethod)}</p>
                <p>Status: ${escapeHtml(paymentStatus)}</p>
                <p>Currency: ${escapeHtml(mockPayment?.currency || 'INR')}</p>
            </div>
        </div>

            <div class="summary">
            <div class="summary-row">
                <span>Base Price</span>
                <strong>${escapeHtml(formatINR(Number(baseAmount || 0)))}</strong>
            </div>
            <div class="summary-row">
                <span>Delivery Fee</span>
                <strong>${escapeHtml(formatINR(Number(deliveryAmount || 0)))}</strong>
            </div>
            <div class="summary-row">
                <span>Documentation Fee</span>
                <strong>${escapeHtml(formatINR(Number(docAmount || 0)))}</strong>
            </div>
            <div class="summary-row">
                <span>Registration Transfer Fee</span>
                <strong>${escapeHtml(formatINR(Number(registrationAmount || 0)))}</strong>
            </div>
            <div class="summary-row">
                <span>Inspection / Certification Fee</span>
                <strong>${escapeHtml(formatINR(Number(inspectionAmount || 0)))}</strong>
            </div>
            <div class="summary-row">
                <span>Platform / Service Fee</span>
                <strong>${escapeHtml(formatINR(Number(platformAmount || 0)))}</strong>
            </div>
            <div class="summary-row">
                <span>Insurance Add-on</span>
                <strong>${escapeHtml(formatINR(Number(insuranceAmount || 0)))}</strong>
            </div>
            <div class="summary-row">
                <span>Warranty Extension</span>
                <strong>${escapeHtml(formatINR(Number(warrantyAmount || 0)))}</strong>
            </div>
            <div class="summary-row">
                <span>Accessory Bundle</span>
                <strong>${escapeHtml(formatINR(Number(accessoryAmount || 0)))}</strong>
            </div>
            <div class="summary-row total">
                <span>Total Paid</span>
                <span>${escapeHtml(formatINR(Number(totalAmount || 0)))}</span>
            </div>
        </div>

        <div class="footer-note">
            This receipt confirms your payment was recorded by SecondGear. Keep it for your records.
        </div>
    </div>
</body>
</html>`;

            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="SecondGear-Receipt-${purchase.id}.html"`);
            res.send(html);
        };

        if (!mockPaymentId) {
            if (format === 'pdf') {
                return renderReceiptPdf(null);
            }
            return renderReceiptHtml(null);
        }

        db.query('SELECT * FROM mock_payments WHERE id = ? LIMIT 1', [mockPaymentId], (payErr, payRows) => {
            if (payErr) return res.status(500).json({ message: 'DB error' });
            const mockPayment = payRows && payRows.length ? payRows[0] : null;
            if (format === 'pdf') {
                return renderReceiptPdf(mockPayment);
            }
            return renderReceiptHtml(mockPayment);
        });
    });
});

app.get('/user/my-listings', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const userEmail = req.session.user.email;

    const pendingSql = `
        SELECT id, make, model, year, km_driven, type, estimated_price, image_url, status, created_at,
               admin_offer_price, seller_response, seller_counter_price, final_agreed_price
        FROM sell_requests
        WHERE (user_id = ? OR email = ?)
        ORDER BY created_at DESC
    `;

    const rejectedSql = `
        SELECT id, make, model, year, km_driven, type, estimated_price, status, created_at
        FROM rejected_requests
        WHERE email = ?
        ORDER BY created_at DESC
    `;

    const activeSql = `
        SELECT id, make, model, year, price, image_url, available, created_at
        FROM cars
        WHERE (seller_user_id = ? OR seller_email = ?) AND available = 1
        ORDER BY created_at DESC
    `;

    const soldSql = `
        SELECT c.id, c.make, c.model, c.year, c.price, c.image_url, p.purchase_date
        FROM purchases p
        JOIN cars c ON p.car_id = c.id
        WHERE (c.seller_user_id = ? OR c.seller_email = ?)
        ORDER BY p.purchase_date DESC
    `;

    db.query(pendingSql, [userId, userEmail], (pendingErr, pendingRows) => {
        if (pendingErr) return res.status(500).json({ message: 'DB error' });
        db.query(rejectedSql, [userEmail], (rejectedErr, rejectedRows) => {
            if (rejectedErr) return res.status(500).json({ message: 'DB error' });
            db.query(activeSql, [userId, userEmail], (activeErr, activeRows) => {
                if (activeErr) return res.status(500).json({ message: 'DB error' });
                db.query(soldSql, [userId, userEmail], (soldErr, soldRows) => {
                    if (soldErr) return res.status(500).json({ message: 'DB error' });
                    res.json({
                        pending: pendingRows || [],
                        rejected: rejectedRows || [],
                        active: activeRows || [],
                        sold: soldRows || []
                    });
                });
            });
        });
    });
});

// --- USER BOOKINGS ---
app.get('/user/bookings', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    db.query('SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC', [userId], (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results);
    });
});

// USER: Cancel a booking
app.post('/user/bookings/cancel/:id', requireLogin, (req, res) => {
    const bookingId = req.params.id;
    // Ensure the booking belongs to the user
    db.query('UPDATE bookings SET status = \'Cancelled\' WHERE id = ? AND user_id = ?', [bookingId, req.session.user.id], (err, result) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Booking not found or not owned by user.' });
        }
        createUserNotification({
            userId: req.session.user.id,
            type: 'booking',
            title: 'Booking Cancelled',
            message: `Your booking #${bookingId} has been cancelled.`,
            link: 'profile.html'
        });
        res.json({ success: true, message: 'Booking cancelled.' });
    });
});

// USER: Reschedule a booking
app.post('/user/bookings/reschedule/:id', requireLogin, (req, res) => {
    const bookingId = req.params.id;
    const { booking_date, booking_time } = req.body;

    if (!booking_date || !booking_time) {
        return res.status(400).json({ message: 'New date and time are required.' });
    }

    // Ensure the booking belongs to the user
    db.query('UPDATE bookings SET booking_date = ?, booking_time = ?, status = \'Rescheduled\' WHERE id = ? AND user_id = ?', [booking_date, booking_time, bookingId, req.session.user.id], (err, result) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Booking not found or not owned by user.' });
        }
        createUserNotification({
            userId: req.session.user.id,
            type: 'booking',
            title: 'Booking Rescheduled',
            message: `Your booking #${bookingId} has been rescheduled to ${booking_date} at ${booking_time}.`,
            link: 'profile.html'
        });
        res.json({ success: true, message: 'Booking rescheduled.' });
    });
});

app.post('/signup', async (req, res) => {
    const { 'first-name': firstName, 'last-name': lastName, email, phone, password, 'confirm-password': confirmPassword, 'security-question': securityQuestion, 'security-answer': securityAnswer, 'terms-accepted': termsAcceptedRaw } = req.body;
    const termsAccepted = termsAcceptedRaw === true || termsAcceptedRaw === 'true' || termsAcceptedRaw === 'on' || termsAcceptedRaw === 1 || termsAcceptedRaw === '1';

    if (!termsAccepted) {
        return res.status(400).json({ message: 'You must accept the Terms & Conditions to sign up.' });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ message: 'Passwords do not match' });
    }
    if (!securityQuestion || !securityAnswer) {
        return res.status(400).json({ message: 'Security question and answer are required' });
    }

    // Check banned_users first
    db.query('SELECT * FROM banned_users WHERE email = ? OR phone = ?', [email, phone], async (err, banned) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (banned.length > 0) return res.status(403).json({ message: 'You are banned from registering.' });
        db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            if (results.length > 0) return res.status(400).json({ message: 'Email already registered' });

            const hashedPassword = await bcrypt.hash(password, 10);

            db.query(
                'INSERT INTO users (first_name, last_name, email, phone, password, security_question1, security_answer1) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [firstName, lastName, email, phone, hashedPassword, securityQuestion, securityAnswer],
                (err, results) => {
                    if (err) return res.status(500).json({ message: 'DB error' });
                    // redirect user to login page after signup
                    res.json({ message: 'Signup successful', redirect: '/user' });
                }
            );
        });
    });
});

// ------------------
// User Login
app.post('/user/login', (req, res) => {
    const { email, password } = req.body;

    db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (results.length === 0) return res.status(401).json({ message: 'User not found. Please sign up first.' });

        const user = results[0];
        if (user.is_banned) {
            return res.status(403).json({ message: 'Your account has been banned. Please contact support if you believe this is a mistake.' });
        }
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ message: 'Incorrect password' });

        // Set session
        req.session.user = {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email
        };

        res.json({ message: 'Login successful', user: req.session.user });
    });
});

// ------------------
// Admin Login
app.post('/admin/login', (req, res) => {
    const { email, password, adminCode } = req.body;

    db.query('SELECT * FROM admins WHERE username = ?', [email], async (err, results) => {
        if (err) return res.status(500).json({ message: 'DB Error' });

        if (results.length > 0) {
            if (adminCode !== '7410') {
                return res.status(401).json({ message: 'Invalid admin code' });
            }

            const admin = results[0];
            const storedPassword = admin.password || '';
            let passwordMatch = false;

            try {
                if (storedPassword.startsWith('$2')) {
                    passwordMatch = await bcrypt.compare(password, storedPassword);
                } else {
                    // Backward compatibility for existing plain-text admin entries.
                    passwordMatch = storedPassword === password;
                }
            } catch (e) {
                return res.status(500).json({ message: 'Password verification failed' });
            }

            if (!passwordMatch) {
                return res.status(401).json({ message: 'Invalid email or password' });
            }

            req.session.admin = { username: admin.username };
            activeAdminSessions.add(req.sessionID);
            return res.json({ message: 'Login successful' });
        }

        res.status(401).json({ message: 'Invalid email or password' });
    });
});

app.get('/admin/session', (req, res) => {
    if (req.session && req.session.admin) {
        return res.json({ loggedIn: true, admin: req.session.admin });
    }
    res.json({ loggedIn: false });
});

app.post('/admin/logout', (req, res) => {
    activeAdminSessions.delete(req.sessionID);
    if (req.session) {
        delete req.session.admin;
        return req.session.save(err => {
            if (err) return res.status(500).json({ message: 'Logout failed' });
            res.json({ message: 'Admin logged out' });
        });
    }
    res.json({ message: 'Admin logged out' });
});

app.get('/admin/admins', requireAdmin, (req, res) => {
    const primaryQuery = 'SELECT id, username, created_by, created_at FROM Admins ORDER BY created_at DESC';
    db.query(primaryQuery, (err, results) => {
        if (!err) return res.json(results);

        // Backward compatibility: older Admins tables may not have id/created_by/created_at.
        if (err.code === 'ER_BAD_FIELD_ERROR') {
            return db.query('SELECT username FROM Admins', (fallbackErr, fallbackResults) => {
                if (fallbackErr) return res.status(500).json({ message: 'DB error' });
                const normalized = (fallbackResults || []).map((row, idx) => ({
                    id: idx + 1,
                    username: row.username,
                    created_by: 'System',
                    created_at: null
                }));
                res.json(normalized);
            });
        }

        return res.status(500).json({ message: 'DB error' });
    });
});

app.post('/admin/admins', requireAdmin, async (req, res) => {
    const { email, password, adminCode } = req.body;
    const normalizedEmail = (email || '').trim().toLowerCase();
    const rawPassword = (password || '').trim();

    if (!normalizedEmail || !rawPassword || !adminCode) {
        return res.status(400).json({ message: 'Email, password and admin code are required' });
    }

    if (adminCode !== '7410') {
        return res.status(401).json({ message: 'Invalid admin code' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ message: 'Invalid email format' });
    }

    if (rawPassword.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    try {
        const hashedPassword = await bcrypt.hash(rawPassword, 10);
        const createdBy = req.session.admin.username || null;
        const primaryInsert = 'INSERT INTO Admins (username, password, created_by) VALUES (?, ?, ?)';
        db.query(primaryInsert, [normalizedEmail, hashedPassword, createdBy], (err) => {
            if (!err) return res.json({ message: 'Admin account created successfully' });

            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ message: 'Admin with this email already exists' });
            }

            // Backward compatibility for older Admins table without created_by.
            if (err.code === 'ER_BAD_FIELD_ERROR') {
                return db.query(
                    'INSERT INTO Admins (username, password) VALUES (?, ?)',
                    [normalizedEmail, hashedPassword],
                    (fallbackErr) => {
                        if (fallbackErr) {
                            if (fallbackErr.code === 'ER_DUP_ENTRY') {
                                return res.status(409).json({ message: 'Admin with this email already exists' });
                            }
                            return res.status(500).json({ message: 'Failed to create admin' });
                        }
                        return res.json({ message: 'Admin account created successfully' });
                    }
                );
            }

            return res.status(500).json({ message: 'Failed to create admin' });
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create admin' });
    }
});

// ------------------
// Admin: Get all users
app.get('/admin/users', (req, res) => {
    db.query('SELECT id, first_name, last_name, email, phone, created_at, is_verified, verified_at FROM users WHERE is_banned = 0', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results);
    });
});

app.get('/admin/customer-offers', requireAdmin, (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const validStatuses = new Set(['pending', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired']);
    const useStatusFilter = validStatuses.has(status);
    const sql = `
        SELECT
            o.id, o.car_id, o.user_id, o.listed_price, o.offered_price, o.counter_price, o.status,
            o.user_message, o.admin_response, o.created_at, o.updated_at,
            c.make, c.model, c.year, c.price AS current_price, c.available,
            u.first_name, u.last_name, u.email
        FROM car_offers o
        JOIN cars c ON c.id = o.car_id
        JOIN users u ON u.id = o.user_id
        ${useStatusFilter ? 'WHERE o.status = ?' : ''}
        ORDER BY FIELD(o.status, 'pending', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired'), o.created_at DESC
    `;
    db.query(sql, useStatusFilter ? [status] : [], (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(rows);
    });
});

app.post('/admin/customer-offers/:id/respond', requireAdmin, (req, res) => {
    const offerId = parseInt(req.params.id, 10);
    const action = typeof req.body.action === 'string' ? req.body.action.trim().toLowerCase() : '';
    const responseMessage = typeof req.body.response_message === 'string' ? req.body.response_message.trim().slice(0, 500) : null;
    const counterPrice = req.body.counter_price === null || typeof req.body.counter_price === 'undefined'
        ? null
        : parseFloat(req.body.counter_price);

    if (!offerId) return res.status(400).json({ message: 'Invalid offer id.' });
    if (!['accept', 'reject', 'counter'].includes(action)) {
        return res.status(400).json({ message: 'Action must be accept, reject, or counter.' });
    }
    if (action === 'counter' && (!Number.isFinite(counterPrice) || counterPrice <= 0)) {
        return res.status(400).json({ message: 'Valid counter price is required.' });
    }

    db.beginTransaction((txErr) => {
        if (txErr) return res.status(500).json({ message: 'DB transaction error' });

        const rollback = (statusCode, payload) => {
            db.rollback(() => res.status(statusCode).json(payload));
        };

        db.query(
            `SELECT o.*, c.make, c.model, c.available
             FROM car_offers o
             JOIN cars c ON c.id = o.car_id
             WHERE o.id = ? FOR UPDATE`,
            [offerId],
            (selectErr, offerRows) => {
                if (selectErr) return rollback(500, { message: 'DB error' });
                if (!offerRows.length) return rollback(404, { message: 'Offer not found.' });

                const offer = offerRows[0];
                if (!['pending', 'countered'].includes(offer.status)) {
                    return rollback(409, { message: `Offer is already ${offer.status}.` });
                }

                if (action === 'counter') {
                    db.query(
                        `UPDATE car_offers
                         SET status = 'countered', counter_price = ?, admin_response = ?
                         WHERE id = ?`,
                        [counterPrice, responseMessage || 'Admin sent a counter-offer.', offerId],
                        (updateErr) => {
                            if (updateErr) return rollback(500, { message: 'DB error' });
                            db.commit((commitErr) => {
                                if (commitErr) return rollback(500, { message: 'Commit failed' });
                                createUserNotification({
                                    userId: offer.user_id,
                                    type: 'offer',
                                    title: 'Counter Offer Received',
                                    message: `Admin countered your offer for ${offer.make} ${offer.model} at ${formatINR(counterPrice)}.`,
                                    link: 'profile.html#offers'
                                });
                                res.json({ message: 'Counter-offer sent.' });
                            });
                        }
                    );
                    return;
                }

                if (action === 'reject') {
                    db.query(
                        `UPDATE car_offers
                         SET status = 'rejected', admin_response = ?
                         WHERE id = ?`,
                        [responseMessage || 'Your offer was rejected.', offerId],
                        (updateErr) => {
                            if (updateErr) return rollback(500, { message: 'DB error' });
                            db.commit((commitErr) => {
                                if (commitErr) return rollback(500, { message: 'Commit failed' });
                                createUserNotification({
                                    userId: offer.user_id,
                                    type: 'offer',
                                    title: 'Offer Rejected',
                                    message: `Your offer for ${offer.make} ${offer.model} was rejected.`,
                                    link: 'profile.html#offers'
                                });
                                res.json({ message: 'Offer rejected.' });
                            });
                        }
                    );
                    return;
                }

                if (!offer.available) {
                    return rollback(409, { message: 'Car is no longer available.' });
                }

                db.query(
                    `SELECT id, user_id
                     FROM car_offers
                     WHERE car_id = ? AND id <> ? AND status IN ('pending', 'countered')
                     FOR UPDATE`,
                    [offer.car_id, offerId],
                    (othersErr, othersRows) => {
                        if (othersErr) return rollback(500, { message: 'DB error' });
                        const otherUserIds = [...new Set(othersRows.map(row => row.user_id))];

                        db.query(
                            `UPDATE car_offers
                             SET status = 'accepted', admin_response = ?, counter_price = NULL
                             WHERE id = ?`,
                            [responseMessage || 'Your offer has been accepted. Proceed to purchase to complete checkout.', offerId],
                            (acceptErr) => {
                                if (acceptErr) return rollback(500, { message: 'DB error' });

                                db.query(
                                    `UPDATE car_offers
                                     SET status = 'rejected',
                                         admin_response = COALESCE(admin_response, 'Another offer was accepted for this car.')
                                     WHERE car_id = ? AND id <> ? AND status IN ('pending', 'countered')`,
                                    [offer.car_id, offerId],
                                    (rejectOthersErr) => {
                                        if (rejectOthersErr) return rollback(500, { message: 'DB error' });

                                        db.commit((commitErr) => {
                                            if (commitErr) return rollback(500, { message: 'Commit failed' });
                                            createUserNotification({
                                                userId: offer.user_id,
                                                type: 'offer',
                                                title: 'Offer Accepted',
                                                message: `Your offer for ${offer.make} ${offer.model} has been accepted. Complete your purchase now.`,
                                                link: `purchase.html?car_id=${offer.car_id}&offer_id=${offer.id}`
                                            });
                                            otherUserIds.forEach(otherUserId => {
                                                createUserNotification({
                                                userId: otherUserId,
                                                type: 'offer',
                                                title: 'Offer Closed',
                                                message: `Your offer for ${offer.make} ${offer.model} was closed because another offer was accepted.`,
                                                link: 'profile.html#offers'
                                            });
                                        });
                                        res.json({ message: 'Offer accepted and other active offers closed.' });
                                    });
                                }
                                );
                            }
                        );
                    }
                );
            }
        );
    });
});

// ------------------
// Mock Payments (realistic flow, no real money)
app.post('/mock-payments/intent', (req, res) => {
    const {
        user_id,
        car_id,
        amount,
        currency,
        payment_method,
        idempotency_key,
        simulate_action,
        simulate_fail
    } = req.body;

    const userId = parseInt(user_id, 10);
    const carId = parseInt(car_id, 10);
    const amt = toAmount(amount);

    if (!userId || !carId || !amt || amt <= 0 || !payment_method) {
        return res.status(400).json({ message: 'Invalid payment intent request.' });
    }

    const method = String(payment_method).toLowerCase();
    const cur = (currency || 'INR').toUpperCase();
    const requiresAction =
        !!simulate_action ||
        (method === 'card' && amt >= 50000) ||
        Math.random() < 0.2;

    const finalizeWithFail = !!simulate_fail;

    const returnIntent = (row) => {
        res.json({
            payment_id: row.id,
            client_secret: row.client_secret,
            status: row.status,
            requires_action: !!row.simulated_3ds_required,
            next_action: row.simulated_3ds_required
                ? { type: '3ds', url: 'mock://3ds-auth' }
                : null
        });
    };

    const createIntent = () => {
        const clientSecret = generateClientSecret();
        const status = requiresAction ? 'requires_action' : 'processing';
        const simulated3ds = requiresAction ? 1 : 0;

        db.query(
            `INSERT INTO mock_payments
             (user_id, car_id, amount, currency, payment_method, status, client_secret, idempotency_key, simulated_3ds_required)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, carId, amt, cur, method, status, clientSecret, idempotency_key || null, simulated3ds],
            (err, result) => {
                if (err) return res.status(500).json({ message: 'DB error creating intent' });
                const paymentId = result.insertId;
                createMockPaymentEvent(paymentId, 'payment.created', {
                    amount: amt,
                    currency: cur,
                    status
                });
                if (!requiresAction) scheduleMockPaymentFinalize(paymentId, { forceFail: finalizeWithFail });
                db.query('SELECT * FROM mock_payments WHERE id = ? LIMIT 1', [paymentId], (rowErr, rows) => {
                    if (rowErr || !rows.length) return res.status(500).json({ message: 'DB error' });
                    returnIntent(rows[0]);
                });
            }
        );
    };

    if (idempotency_key) {
        db.query(
            'SELECT * FROM mock_payments WHERE idempotency_key = ? LIMIT 1',
            [idempotency_key],
            (findErr, rows) => {
                if (findErr) return res.status(500).json({ message: 'DB error' });
                if (rows && rows.length) return returnIntent(rows[0]);
                createIntent();
            }
        );
        return;
    }

    createIntent();
});

app.post('/mock-payments/confirm', (req, res) => {
    const { payment_id, action_passed, simulate_fail } = req.body;
    const paymentId = parseInt(payment_id, 10);
    if (!paymentId) return res.status(400).json({ message: 'Invalid payment id.' });

    db.query('SELECT * FROM mock_payments WHERE id = ? LIMIT 1', [paymentId], (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (!rows.length) return res.status(404).json({ message: 'Payment not found.' });

        const payment = rows[0];
        if (payment.status !== 'requires_action') {
            return res.json({ payment_id: payment.id, status: payment.status });
        }

        if (action_passed === false || action_passed === 'false') {
            updateMockPaymentStatus(payment.id, 'failed', { failure_reason: '3ds_auth_failed' });
            return res.json({ payment_id: payment.id, status: 'failed' });
        }

        updateMockPaymentStatus(payment.id, 'processing');
        scheduleMockPaymentFinalize(payment.id, { forceFail: !!simulate_fail });
        res.json({ payment_id: payment.id, status: 'processing' });
    });
});

app.get('/mock-payments/:id', (req, res) => {
    const paymentId = parseInt(req.params.id, 10);
    if (!paymentId) return res.status(400).json({ message: 'Invalid payment id.' });
    db.query('SELECT * FROM mock_payments WHERE id = ? LIMIT 1', [paymentId], (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (!rows.length) return res.status(404).json({ message: 'Payment not found.' });
        const p = rows[0];
        res.json({
            payment_id: p.id,
            status: p.status,
            amount: p.amount,
            currency: p.currency,
            failure_reason: p.failure_reason,
            receipt_no: p.receipt_no,
            requires_action: !!p.simulated_3ds_required
        });
    });
});

app.post('/mock-payments/:id/cancel', (req, res) => {
    const paymentId = parseInt(req.params.id, 10);
    if (!paymentId) return res.status(400).json({ message: 'Invalid payment id.' });
    db.query('SELECT status FROM mock_payments WHERE id = ? LIMIT 1', [paymentId], (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (!rows.length) return res.status(404).json({ message: 'Payment not found.' });
        const status = rows[0].status;
        if (status === 'succeeded' || status === 'failed') {
            return res.status(409).json({ message: 'Cannot cancel finalized payment.' });
        }
        updateMockPaymentStatus(paymentId, 'canceled');
        res.json({ payment_id: paymentId, status: 'canceled' });
    });
});

// ------------------
// Car Queries (User + Admin)
app.post('/user/car-queries', requireLogin, (req, res) => {
    const { car_id, subject, message } = req.body;
    const userId = req.session.user.id;
    const userEmail = req.session.user.email;
    if (!car_id || !subject || !message) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }
    const carId = parseInt(car_id, 10);
    if (!carId) return res.status(400).json({ message: 'Invalid car id.' });

    db.query('SELECT id, make, model, year, is_deleted FROM cars WHERE id = ? LIMIT 1', [carId], (carErr, carRows) => {
        if (carErr) return res.status(500).json({ message: 'DB error' });
        if (!carRows.length || carRows[0].is_deleted) {
            return res.status(404).json({ message: 'Car not found.' });
        }
        const car = carRows[0];
        db.query(
            `INSERT INTO car_queries (car_id, user_id, user_email, subject, message)
             VALUES (?, ?, ?, ?, ?)`,
            [carId, userId, userEmail, subject.trim(), message.trim()],
            (err, result) => {
                if (err) return res.status(500).json({ message: 'DB error' });
                createUserNotification({
                    userId,
                    type: 'query',
                    title: 'Query Submitted',
                    message: `Your query for ${car.make} ${car.model} (${car.year}) has been received. We will reply shortly.`,
                    link: 'profile.html#queries'
                });
                res.json({ message: 'Query submitted successfully.' });
            }
        );
    });
});

app.get('/admin/car-queries', requireAdmin, (req, res) => {
    const sql = `
        SELECT q.*, c.make, c.model, c.year, c.image_url
        FROM car_queries q
        LEFT JOIN cars c ON c.id = q.car_id
        ORDER BY q.created_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results || []);
    });
});

app.post('/admin/car-queries/:id/respond', requireAdmin, (req, res) => {
    const queryId = parseInt(req.params.id, 10);
    const { response, status } = req.body;
    if (!queryId || !response) {
        return res.status(400).json({ message: 'Missing response.' });
    }
    const newStatus = status === 'closed' ? 'closed' : 'responded';
    db.query('SELECT * FROM car_queries WHERE id = ? LIMIT 1', [queryId], (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (!rows.length) return res.status(404).json({ message: 'Query not found.' });
        const query = rows[0];
        db.query(
            'UPDATE car_queries SET admin_response = ?, status = ?, responded_at = NOW() WHERE id = ?',
            [response.trim(), newStatus, queryId],
            (updateErr) => {
                if (updateErr) return res.status(500).json({ message: 'DB error' });
                if (query.user_id) {
                    createUserNotification({
                        userId: query.user_id,
                        type: 'query',
                        title: 'Query Updated',
                        message: `Your query about car #${query.car_id} has a new response from admin.`,
                        link: 'profile.html#queries'
                    });
                }
                res.json({ message: 'Response sent.' });
            }
        );
    });
});

// User: Get own car queries
app.get('/user/car-queries', requireLogin, (req, res) => {
    const userId = req.session.user.id;
    const sql = `
        SELECT q.*, c.make, c.model, c.year
        FROM car_queries q
        LEFT JOIN cars c ON c.id = q.car_id
        WHERE q.user_id = ?
        ORDER BY q.created_at DESC
    `;
    db.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results || []);
    });
});

// ------------------
// Buy Vehicle
// Get all cars for buy page
app.get('/cars', (req, res) => {
    const isAdmin = !!(req.session && req.session.admin);
    if (activeAdminSessions.size > 0 && !isAdmin) {
        return res.status(503).json({ message: 'Buy page is under maintenance by admin.' });
    }
    const sql = isAdmin
        ? `SELECT c.*, u.is_verified AS seller_is_verified, u.verified_at AS seller_verified_at
           FROM cars c
           LEFT JOIN users u ON u.id = c.seller_user_id`
        : `SELECT c.*, u.is_verified AS seller_is_verified, u.verified_at AS seller_verified_at
           FROM cars c
           LEFT JOIN users u ON u.id = c.seller_user_id
           WHERE c.available = 1 AND c.is_deleted = 0`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results);
    });
});

// Get a single car by ID
app.get('/cars/:id', (req, res) => {
    const isAdmin = !!(req.session && req.session.admin);
    if (activeAdminSessions.size > 0 && !isAdmin) {
        return res.status(503).json({ message: 'Buy page is under maintenance by admin.' });
    }
    const carId = req.params.id;
    const sql = isAdmin
        ? `SELECT c.*, u.is_verified AS seller_is_verified, u.verified_at AS seller_verified_at
           FROM cars c
           LEFT JOIN users u ON u.id = c.seller_user_id
           WHERE c.id = ?`
        : `SELECT c.*, u.is_verified AS seller_is_verified, u.verified_at AS seller_verified_at
           FROM cars c
           LEFT JOIN users u ON u.id = c.seller_user_id
           WHERE c.id = ? AND c.is_deleted = 0`;
    db.query(sql, [carId], (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        if (results.length === 0) {
            return res.status(404).json({ message: 'Car not found' });
        }
        res.json(results[0]);
    });
});

// Improved purchase route with transaction safety and optional accepted-offer pricing.
app.post('/buy', (req, res) => {
    const isAdmin = !!(req.session && req.session.admin);
    if (activeAdminSessions.size > 0 && !isAdmin) {
        return res.status(503).json({ message: 'Buy page is under maintenance by admin.' });
    }

    const {
        car_id,
        user_id,
        first_name,
        last_name,
        address,
        city,
        zip,
        payment_method,
        payment_details,
        payment_id,
        offer_id,
        newsletter_offer_id,
        insurance_addon,
        warranty_extension,
        accessory_bundle
    } = req.body;

    if (!car_id || !user_id || !first_name || !last_name || !address || !city || !zip || !payment_method) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    const carId = parseInt(car_id, 10);
    const userId = parseInt(user_id, 10);
    const paymentId = payment_id ? parseInt(payment_id, 10) : null;
    const requestedOfferId = offer_id ? parseInt(offer_id, 10) : null;
    const requestedNewsletterOfferId = newsletter_offer_id ? parseInt(newsletter_offer_id, 10) : null;
    if (!carId || !userId) return res.status(400).json({ message: 'Invalid car or user id.' });
    if (payment_id && !paymentId) return res.status(400).json({ message: 'Invalid payment id.' });
    if (requestedOfferId && requestedNewsletterOfferId) {
        return res.status(400).json({ message: 'Cannot combine customer offer with newsletter offer.' });
    }

    db.beginTransaction((txErr) => {
        if (txErr) return res.status(500).json({ message: 'DB transaction error' });
        const rollback = (statusCode, payload) => db.rollback(() => res.status(statusCode).json(payload));

        db.query('SELECT * FROM cars WHERE id = ? FOR UPDATE', [carId], (carErr, carRows) => {
            if (carErr) return rollback(500, { message: 'DB error' });
            if (!carRows.length) return rollback(404, { message: 'Car not found.' });

              const car = carRows[0];
              wishlistCarLabel = `${car.make} ${car.model} (${car.year})`;
              if (car.is_deleted) return rollback(404, { message: 'Car not found.' });
            if (!car.available) return rollback(409, { message: 'This car is already sold.' });

            const applyOfferAndInsert = (appliedOffer, newsletterOffer) => {
                const basePrice = newsletterOffer
                    ? Number(newsletterOffer.discounted_price || car.price)
                    : appliedOffer
                        ? Number(appliedOffer.counter_price || appliedOffer.offered_price || car.price)
                        : Number(car.price);
                const options = {
                    insurance: String(insurance_addon) === 'true' || insurance_addon === true,
                    warranty: String(warranty_extension) === 'true' || warranty_extension === true,
                    accessory: String(accessory_bundle) === 'true' || accessory_bundle === true
                };
                const { total: finalPrice } = computeTotalWithFees(basePrice, options);
                if (!Number.isFinite(Number(finalPrice))) {
                    return rollback(500, { message: 'Invalid pricing calculation.' });
                }
                const appliedOfferId = appliedOffer ? appliedOffer.id : null;
                const appliedNewsletterOfferId = newsletterOffer ? newsletterOffer.id : null;
                const enforceMockPayment = process.env.MOCK_PAYMENT_ENFORCE === '1';
                const paymentDetailsSafe = payment_details || (paymentId ? `MockPayment:${paymentId}` : '');

                const continueWithPurchase = () => {
                    db.query(
                        `INSERT INTO purchases
                        (car_id, user_id, first_name, last_name, address, city, zip, payment_method, payment_details, final_price, offer_id, newsletter_offer_id, insurance_addon, warranty_extension, accessory_bundle, purchase_date)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                        [carId, userId, first_name, last_name, address, city, zip, payment_method, paymentDetailsSafe, finalPrice, appliedOfferId, appliedNewsletterOfferId, options.insurance ? 1 : 0, options.warranty ? 1 : 0, options.accessory ? 1 : 0],
                        (purchaseErr) => {
                            if (purchaseErr) return rollback(500, { message: 'DB error inserting purchase' });

                            db.query('UPDATE cars SET available = 0 WHERE id = ? AND available = 1', [carId], (availabilityErr, availabilityResult) => {
                                if (availabilityErr) return rollback(500, { message: 'DB error updating car availability' });
                                if (!availabilityResult.affectedRows) return rollback(409, { message: 'Car is already sold.' });

                                const deactivateOffers = appliedOfferId
                                    ? `UPDATE car_offers
                                   SET status = 'rejected',
                                       admin_response = COALESCE(admin_response, 'Car was sold to another buyer.')
                                   WHERE car_id = ? AND id <> ? AND status IN ('pending', 'countered', 'accepted')`
                                    : `UPDATE car_offers
                                   SET status = 'rejected',
                                       admin_response = COALESCE(admin_response, 'Car was sold.')
                                   WHERE car_id = ? AND status IN ('pending', 'countered', 'accepted')`;
                                const deactivateParams = appliedOfferId ? [carId, appliedOfferId] : [carId];

                                const finishCommit = () => {
                                    db.commit((commitErr) => {
                                        if (commitErr) return rollback(500, { message: 'Commit failed' });

                                        createUserNotification({
                                            userId,
                                            type: 'purchase',
                                            title: 'Purchase Completed',
                                            message: `Your purchase for ${car.make} ${car.model} is confirmed.`,
                                            link: 'profile.html'
                                        });

                                        db.query('SELECT user_id FROM wishlists WHERE car_id = ? AND user_id <> ?', [carId, userId], (wishlistErr, wishlistRows) => {
                                            if (!wishlistErr && wishlistRows && wishlistRows.length) {
                                                wishlistRows.forEach(row => {
                                                        createUserNotification({
                                                            userId: row.user_id,
                                                            type: 'wishlist',
                                                            title: 'Wishlist Update',
                                                            message: `${wishlistCarLabel} was purchased by another user and removed from your wishlist.`,
                                                            link: 'profile.html#wishlist'
                                                        });
                                                });
                                            }

                                            db.query('DELETE FROM wishlists WHERE car_id = ?', [carId], (wishlistDelErr) => {
                                                if (wishlistErr || wishlistDelErr) {
                                                    console.error('Wishlist cleanup failed:', wishlistErr || wishlistDelErr);
                                                }
                                            });
                                        });

                                        db.query('SELECT email FROM users WHERE id = ?', [userId], (userErr, userResults) => {
                                            const userEmail = userResults && userResults.length > 0 ? userResults[0].email : null;
                                            const respondSuccess = () => {
                                                if (!res.headersSent) {
                                                    res.json({ message: 'Purchase successful' });
                                                }
                                            };
                                            if (!userEmail) return respondSuccess();

                                            const invoiceDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                                            const mailOptions = {
                                                from: 'secondgearproject01@gmail.com',
                                                to: userEmail,
                                                subject: `Purchase Invoice - ${car.make} ${car.model} - SecondGear`,
                                                html: `
                                                <div style="font-family: Arial, sans-serif; color: #333; background: #f9f9f9; padding: 20px;">
                                                    <div style="max-width: 700px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                                                        <div style="border-bottom: 3px solid #2d6cdf; padding-bottom: 20px; margin-bottom: 20px;">
                                                            <h1 style="color: #2d6cdf; margin: 0;">PURCHASE INVOICE</h1>
                                                            <p style="color: #666; margin: 5px 0;">SecondGear - Your Trusted Car Platform</p>
                                                        </div>
                                                        <p>Dear ${first_name} ${last_name},</p>
                                                        <p>Thank you for your purchase! Your vehicle purchase has been successfully completed and recorded.</p>
                                                        <h3 style="color: #2d6cdf; margin-top: 25px;">Vehicle Details:</h3>
                                                        <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #2d6cdf; border-radius: 4px;">
                                                            <table style="width: 100%; border-collapse: collapse;">
                                                                <tr><td style="padding: 8px; font-weight: bold; width: 40%;">Vehicle:</td><td style="padding: 8px;">${car.year} ${car.make} ${car.model}</td></tr>
                                                                <tr style="background: white;"><td style="padding: 8px; font-weight: bold;">Fuel Type:</td><td style="padding: 8px;">${car.fuel_type || 'N/A'}</td></tr>
                                                                <tr><td style="padding: 8px; font-weight: bold;">Mileage:</td><td style="padding: 8px;">${car.km_driven || 'N/A'} km</td></tr>
                                                                <tr style="background: white;"><td style="padding: 8px; font-weight: bold;">VIN:</td><td style="padding: 8px;">${car.vin || 'N/A'}</td></tr>
                                                            </table>
                                                        </div>
                                                        <h3 style="color: #2d6cdf; margin-top: 25px;">Purchase Information:</h3>
                                                        <div style="background: #e8f4f8; padding: 15px; border-radius: 4px;">
                                                            <table style="width: 100%; border-collapse: collapse;">
                                                                <tr>
                                                                    <td style="padding: 10px; font-weight: bold; width: 40%;">Purchase Price:</td>
                                                                    <td style="padding: 10px; font-size: 18px; font-weight: bold; color: #27ae60;">${formatINR(finalPrice)}</td>
                                                                </tr>
                                                                <tr style="background: white;"><td style="padding: 10px; font-weight: bold;">Payment Method:</td><td style="padding: 10px;">${payment_method}</td></tr>
                                                                <tr><td style="padding: 10px; font-weight: bold;">Purchase Date:</td><td style="padding: 10px;">${invoiceDate}</td></tr>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </div>
                                                `
                                            };
                                            // Respond immediately; email send should not block checkout.
                                            respondSuccess();
                                            transporter.sendMail(mailOptions, (emailErr) => {
                                                if (emailErr) console.error('Purchase invoice email failed:', emailErr);
                                            });
                                        });
                                    });
                                };

                                if (appliedOfferId) {
                                    db.query(
                                        `UPDATE car_offers
                                         SET status = 'accepted',
                                             admin_response = COALESCE(admin_response, 'Offer fulfilled via completed purchase.')
                                         WHERE id = ?`,
                                        [appliedOfferId],
                                        (offerUpdateErr) => {
                                            if (offerUpdateErr) return rollback(500, { message: 'DB error' });
                                            db.query(deactivateOffers, deactivateParams, (deactivateErr) => {
                                                if (deactivateErr) return rollback(500, { message: 'DB error' });
                                                finishCommit();
                                            });
                                        }
                                    );
                                } else {
                                    db.query(deactivateOffers, deactivateParams, (deactivateErr) => {
                                        if (deactivateErr) return rollback(500, { message: 'DB error' });
                                        finishCommit();
                                    });
                                }
                            });
                        }
                    );
                };

                if (!enforceMockPayment && !paymentId) {
                    return continueWithPurchase();
                }

                db.query('SELECT * FROM mock_payments WHERE id = ? LIMIT 1', [paymentId], (payErr, payRows) => {
                    if (payErr) return rollback(500, { message: 'DB error verifying payment' });
                    if (!payRows.length) return rollback(404, { message: 'Payment not found.' });
                    const pay = payRows[0];
                    const payAmount = toAmount(pay.amount);
                    if (pay.status !== 'succeeded') {
                        return rollback(402, { message: 'Payment not completed.', status: pay.status });
                    }
                    if (pay.user_id !== userId || pay.car_id !== carId) {
                        return rollback(400, { message: 'Payment does not match user or car.' });
                    }
                    if (payAmount !== toAmount(finalPrice)) {
                        return rollback(400, { message: 'Payment amount does not match final price.' });
                    }
                    continueWithPurchase();
                });
            };

            if (requestedNewsletterOfferId) {
                const sessionUser = req.session && req.session.user;
                if (!sessionUser || sessionUser.id !== userId) {
                    return rollback(403, { message: 'Newsletter offers require a logged-in subscriber.' });
                }
                return isNewsletterSubscriber(sessionUser.email, (subErr, isSubscribed) => {
                    if (subErr) return rollback(500, { message: 'DB error' });
                    if (!isSubscribed) return rollback(403, { message: 'Newsletter subscription required.' });
                    const today = new Date().toISOString().slice(0, 10);
                    const offerSql = `
                        SELECT o.*
                        FROM offers o
                        WHERE o.id = ? AND o.car_id = ?
                          AND (o.valid_from IS NULL OR o.valid_from <= ?)
                          AND (o.valid_to IS NULL OR o.valid_to >= ?)
                        LIMIT 1`;
                    db.query(offerSql, [requestedNewsletterOfferId, carId, today, today], (offerErr, offerRows) => {
                        if (offerErr) return rollback(500, { message: 'DB error' });
                        if (!offerRows.length) return rollback(404, { message: 'Offer not found or expired.' });
                        const offer = offerRows[0];
                        if (!offer.discounted_price) {
                            return rollback(409, { message: 'Offer pricing not available.' });
                        }
                        applyOfferAndInsert(null, offer);
                    });
                });
            }

            if (requestedOfferId) {
                db.query(
                    `SELECT id, offered_price, counter_price
                     FROM car_offers
                     WHERE id = ? AND car_id = ? AND user_id = ? AND status = 'accepted'
                     LIMIT 1`,
                    [requestedOfferId, carId, userId],
                    (offerErr, offerRows) => {
                        if (offerErr) return rollback(500, { message: 'DB error' });
                        if (!offerRows.length) return rollback(400, { message: 'Accepted offer not found for this purchase.' });
                        applyOfferAndInsert(offerRows[0], null);
                    }
                );
                return;
            }

            db.query(
                `SELECT id, offered_price, counter_price
                 FROM car_offers
                 WHERE car_id = ? AND user_id = ? AND status = 'accepted'
                 ORDER BY updated_at DESC
                 LIMIT 1`,
                [carId, userId],
                (offerErr, offerRows) => {
                    if (offerErr) return rollback(500, { message: 'DB error' });
                    applyOfferAndInsert(offerRows.length ? offerRows[0] : null, null);
                }
            );
        });
    });
});

app.post('/buy-legacy', (req, res) => {
        const isAdmin = !!(req.session && req.session.admin);
        if (activeAdminSessions.size > 0 && !isAdmin) {
            return res.status(503).json({ message: 'Buy page is under maintenance by admin.' });
        }
        console.log('Received /buy POST body:', req.body);
        const missing = [];
        if (!req.body.car_id) missing.push('car_id');
        if (!req.body.user_id) missing.push('user_id');
        if (!req.body.first_name) missing.push('first_name');
        if (!req.body.last_name) missing.push('last_name');
        if (!req.body.address) missing.push('address');
        if (!req.body.city) missing.push('city');
        if (!req.body.zip) missing.push('zip');
        if (!req.body.payment_method) missing.push('payment_method');
        if (missing.length) {
            console.log('Missing fields:', missing);
        }
    const {
        car_id,
        user_id,
        first_name,
        last_name,
        address,
        city,
        zip,
        payment_method,
        payment_details
    } = req.body;

    if (!car_id || !user_id || !first_name || !last_name || !address || !city || !zip || !payment_method) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    db.query(
        'INSERT INTO purchases (car_id, user_id, first_name, last_name, address, city, zip, payment_method, payment_details, purchase_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())',
        [car_id, user_id, first_name, last_name, address, city, zip, payment_method, payment_details],
        (err) => {
            if (err) return res.status(500).json({ message: 'DB error inserting purchase' });

            // Get car and user details for email
            db.query('SELECT * FROM cars WHERE id = ?', [car_id], (carErr, carResults) => {
                if (carErr || !carResults.length) {
                    return db.query('UPDATE cars SET available = 0 WHERE id = ?', [car_id], (err2) => {
                        if (err2) return res.status(500).json({ message: 'DB error updating car availability' });
                        res.json({ message: 'Purchase successful' });
                    });
                }

                const car = carResults[0];

                // Get user email
                db.query('SELECT email FROM users WHERE id = ?', [user_id], (userErr, userResults) => {
                    const userEmail = userResults && userResults.length > 0 ? userResults[0].email : null;

                    // Update car availability
                    db.query('UPDATE cars SET available = 0 WHERE id = ?', [car_id], (err2) => {
                        if (err2) return res.status(500).json({ message: 'DB error updating car availability' });

                        // SEND PURCHASE INVOICE EMAIL
                        if (userEmail) {
                            const invoiceDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                            const mailOptions = {
                                from: 'secondgearproject01@gmail.com',
                                to: userEmail,
                                subject: `Purchase Invoice - ${car.make} ${car.model} - SecondGear`,
                                html: `
                                    <div style="font-family: Arial, sans-serif; color: #333; background: #f9f9f9; padding: 20px;">
                                        <div style="max-width: 700px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                                            <div style="border-bottom: 3px solid #2d6cdf; padding-bottom: 20px; margin-bottom: 20px;">
                                                <h1 style="color: #2d6cdf; margin: 0;">PURCHASE INVOICE</h1>
                                                <p style="color: #666; margin: 5px 0;">SecondGear - Your Trusted Car Platform</p>
                                            </div>
                                            
                                            <p>Dear ${first_name} ${last_name},</p>
                                            <p>Thank you for your purchase! Your vehicle purchase has been successfully completed and recorded.</p>
                                            
                                            <h3 style="color: #2d6cdf; margin-top: 25px;">Vehicle Details:</h3>
                                            <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #2d6cdf; border-radius: 4px;">
                                                <table style="width: 100%; border-collapse: collapse;">
                                                    <tr>
                                                        <td style="padding: 8px; font-weight: bold; width: 40%;">Vehicle:</td>
                                                        <td style="padding: 8px;">${car.year} ${car.make} ${car.model}</td>
                                                    </tr>
                                                    <tr style="background: white;">
                                                        <td style="padding: 8px; font-weight: bold;">Vehicle Type:</td>
                                                        <td style="padding: 8px;">${car.type || 'N/A'}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px; font-weight: bold;">Fuel Type:</td>
                                                        <td style="padding: 8px;">${car.fuel_type || 'N/A'}</td>
                                                    </tr>
                                                    <tr style="background: white;">
                                                        <td style="padding: 8px; font-weight: bold;">Mileage:</td>
                                                        <td style="padding: 8px;">${car.km_driven || 'N/A'} km</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px; font-weight: bold;">VIN:</td>
                                                        <td style="padding: 8px;">${car.vin || 'N/A'}</td>
                                                    </tr>
                                                </table>
                                            </div>
                                            
                                            <h3 style="color: #2d6cdf; margin-top: 25px;">Purchase Information:</h3>
                                            <div style="background: #e8f4f8; padding: 15px; border-radius: 4px;">
                                                <table style="width: 100%; border-collapse: collapse;">
                                                    <tr>
                                                        <td style="padding: 10px; font-weight: bold; width: 40%;">Purchase Price:</td>
                                                        <td style="padding: 10px; font-size: 18px; font-weight: bold; color: #27ae60;">${formatINR(car.price)}</td>
                                                    </tr>
                                                    <tr style="background: white;">
                                                        <td style="padding: 10px; font-weight: bold;">Payment Method:</td>
                                                        <td style="padding: 10px;">${payment_method}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 10px; font-weight: bold;">Purchase Date:</td>
                                                        <td style="padding: 10px;">${invoiceDate}</td>
                                                    </tr>
                                                </table>
                                            </div>
                                            
                                            <h3 style="color: #2d6cdf; margin-top: 25px;">Delivery Address:</h3>
                                            <div style="background: #f9f9f9; padding: 15px; border-left: 4px solid #27ae60; border-radius: 4px;">
                                                <p style="margin: 5px 0;">${first_name} ${last_name}</p>
                                                <p style="margin: 5px 0;">${address}</p>
                                                <p style="margin: 5px 0;">${city}, ${zip}</p>
                                            </div>
                                            
                                            <p style="margin-top: 25px; color: #666;"><strong>Next Steps:</strong></p>
                                            <ul style="color: #666;">
                                                <li>Your vehicle will be prepared and delivered within 3-5 business days</li>
                                                <li>You will receive a confirmation call from our team</li>
                                                <li>Keep this invoice for your records and warranty claims</li>
                                            </ul>
                                            
                                            <p style="color: #666; font-size: 12px; margin-top: 25px;">If you have any questions or concerns, please contact our support team at support@secondgear.com</p>
                                            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                                            <p style="color: #888; font-size: 12px;">© 2026 SecondGear. All rights reserved.</p>
                                        </div>
                                    </div>
                                `
                            };

                            transporter.sendMail(mailOptions, (emailErr, info) => {
                                if (emailErr) {
                                    console.error('Purchase invoice email failed:', emailErr);
                                } else {
                                    console.log('✅ Purchase invoice email sent to ' + userEmail);
                                }
                                res.json({ message: 'Purchase successful' });
                            });
                        } else {
                            res.json({ message: 'Purchase successful' });
                        }
                    });
                });
            });
        }
    );
});


// ------------------
// Admin: Add new car
app.post('/admin/add-car', upload.single('image_file'), async (req, res) => {
    const {
        make, model, year, price, description, available,
        color, fuel_type, mileage, num_owners, registration_city, registration_number,
        transmission, vin, insurance_validity
    } = req.body;
    let image_url = req.body.image_url || null;
    if (req.file) {
        try {
            image_url = await uploadCarImageToCloudinary(req.file);
        } catch (err) {
            console.error('Car image upload failed:', err);
            return res.status(500).json({ message: 'Image upload failed' });
        }
    }
    // Always set available to 1 by default (unless explicitly unchecked and sent as 0)
    const availableValue = (typeof available === 'undefined' || available === 'on' || available === true || available === 1) ? 1 : 0;
    if (!make || !model || !year || !price || !image_url) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    db.query(
        `INSERT INTO cars (
            make, model, year, price, description, image_url, available, color, fuel_type, mileage, num_owners, registration_city, registration_number, transmission, vin, insurance_validity, seller_user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
            make, model, year, price, description, image_url, availableValue,
            color, fuel_type, mileage, num_owners, registration_city, registration_number,
            transmission, vin, insurance_validity, null
        ],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'DB error', error: err });
            res.json({ message: 'Car added!' });
        }
    );
});

// Admin: Get all cars (including deleted)
app.get('/admin/cars/all', (req, res) => {
    console.log('GET /admin/cars/all called');
    db.query('SELECT * FROM cars', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results);
    });
});

// --- Car images: ensure gallery entries exist ---
function ensureCarImages(carId, cb) {
    db.query('SELECT id, image_url, is_main FROM car_images WHERE car_id = ? ORDER BY is_main DESC, created_at ASC', [carId], (err, rows) => {
        if (err) return cb(err);
        if (rows && rows.length) return cb(null, rows);
        db.query('SELECT image_url FROM cars WHERE id = ? LIMIT 1', [carId], (err2, carRows) => {
            if (err2) return cb(err2);
            const baseImage = carRows && carRows[0] ? carRows[0].image_url : null;
            if (!baseImage) return cb(null, []);
            db.query('INSERT INTO car_images (car_id, image_url, is_main) VALUES (?, ?, 1)', [carId, baseImage], (err3, result) => {
                if (err3) return cb(err3);
                cb(null, [{ id: result.insertId, image_url: baseImage, is_main: 1 }]);
            });
        });
    });
}

// Public: get car images for gallery
app.get('/cars/:id/images', (req, res) => {
    const carId = Number(req.params.id);
    if (!carId) return res.status(400).json({ message: 'Invalid car id' });
    ensureCarImages(carId, (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        res.json(rows || []);
    });
});

// Admin: get car images
app.get('/admin/cars/:id/images', requireAdmin, (req, res) => {
    const carId = Number(req.params.id);
    if (!carId) return res.status(400).json({ message: 'Invalid car id' });
    ensureCarImages(carId, (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        res.json(rows || []);
    });
});

// Admin: upload multiple images for a car (Cloudinary)
app.post('/admin/cars/:id/images', requireAdmin, upload.array('images', 8), async (req, res) => {
    const carId = Number(req.params.id);
    if (!carId) return res.status(400).json({ message: 'Invalid car id' });
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: 'No images uploaded' });

    try {
        const uploads = [];
        for (const file of files) {
            const url = await uploadCarImageToCloudinary(file);
            if (url) uploads.push(url);
        }
        if (!uploads.length) return res.status(500).json({ message: 'Image upload failed' });

        db.query('SELECT id FROM car_images WHERE car_id = ? AND is_main = 1 LIMIT 1', [carId], (err, mainRows) => {
            if (err) return res.status(500).json({ message: 'DB error', error: err });
            const hasMain = mainRows && mainRows.length > 0;
            const rowsToInsert = uploads.map((url, idx) => [carId, url, (!hasMain && idx === 0) ? 1 : 0]);
            db.query('INSERT INTO car_images (car_id, image_url, is_main) VALUES ?', [rowsToInsert], (err2) => {
                if (err2) return res.status(500).json({ message: 'DB error', error: err2 });
                if (!hasMain) {
                    db.query('UPDATE cars SET image_url = ? WHERE id = ?', [uploads[0], carId], () => {});
                }
                ensureCarImages(carId, (err3, rows) => {
                    if (err3) return res.status(500).json({ message: 'DB error', error: err3 });
                    res.json({ success: true, images: rows || [] });
                });
            });
        });
    } catch (err) {
        console.error('Admin upload images failed:', err);
        res.status(500).json({ message: 'Image upload failed' });
    }
});

// Admin: set main image
app.put('/admin/cars/:carId/images/:imageId/main', requireAdmin, (req, res) => {
    const carId = Number(req.params.carId);
    const imageId = Number(req.params.imageId);
    if (!carId || !imageId) return res.status(400).json({ message: 'Invalid ids' });

    db.query('UPDATE car_images SET is_main = 0 WHERE car_id = ?', [carId], (err) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        db.query('UPDATE car_images SET is_main = 1 WHERE id = ? AND car_id = ?', [imageId, carId], (err2) => {
            if (err2) return res.status(500).json({ message: 'DB error', error: err2 });
            db.query('SELECT image_url FROM car_images WHERE id = ? AND car_id = ? LIMIT 1', [imageId, carId], (err3, rows) => {
                if (err3 || !rows || !rows.length) return res.status(500).json({ message: 'DB error', error: err3 });
                const mainUrl = rows[0].image_url;
                db.query('UPDATE cars SET image_url = ? WHERE id = ?', [mainUrl, carId], () => {});
                res.json({ success: true, image_url: mainUrl });
            });
        });
    });
});

// Admin: delete an image
app.delete('/admin/cars/:carId/images/:imageId', requireAdmin, (req, res) => {
    const carId = Number(req.params.carId);
    const imageId = Number(req.params.imageId);
    if (!carId || !imageId) return res.status(400).json({ message: 'Invalid ids' });

    db.query('SELECT is_main FROM car_images WHERE id = ? AND car_id = ? LIMIT 1', [imageId, carId], (err, rows) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        if (!rows || !rows.length) return res.status(404).json({ message: 'Image not found' });
        const wasMain = !!rows[0].is_main;

        db.query('DELETE FROM car_images WHERE id = ? AND car_id = ?', [imageId, carId], (err2) => {
            if (err2) return res.status(500).json({ message: 'DB error', error: err2 });
            if (!wasMain) return res.json({ success: true, image_url: null });

            db.query('SELECT image_url FROM car_images WHERE car_id = ? ORDER BY is_main DESC, created_at ASC LIMIT 1', [carId], (err3, nextRows) => {
                if (err3) return res.status(500).json({ message: 'DB error', error: err3 });
                if (nextRows && nextRows.length) {
                    const nextUrl = nextRows[0].image_url;
                    db.query('UPDATE car_images SET is_main = 0 WHERE car_id = ?', [carId], () => {
                        db.query('UPDATE car_images SET is_main = 1 WHERE car_id = ? AND image_url = ? LIMIT 1', [carId, nextUrl], () => {});
                    });
                    db.query('UPDATE cars SET image_url = ? WHERE id = ?', [nextUrl, carId], () => {});
                    return res.json({ success: true, image_url: nextUrl });
                }
                db.query('UPDATE cars SET image_url = NULL WHERE id = ?', [carId], () => {});
                return res.json({ success: true, image_url: null });
            });
        });
    });
});

// Admin: Toggle featured car
app.post('/admin/cars/:id/feature', requireAdmin, (req, res) => {
    const carId = parseInt(req.params.id, 10);
    const featured = req.body && typeof req.body.featured !== 'undefined' ? req.body.featured : null;
    if (!carId) return res.status(400).json({ message: 'Invalid car id' });
    if (featured === null) return res.status(400).json({ message: 'Missing featured flag' });
    const value = featured === true || featured === 'true' || featured === 1 || featured === '1' ? 1 : 0;
    db.query('UPDATE cars SET featured = ? WHERE id = ?', [value, carId], (err) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json({ success: true, featured: value });
    });
});

// Public: Get featured cars for homepage
app.get('/featured-cars', (req, res) => {
    db.query(
        'SELECT id, make, model, year, price, image_url, type, fuel_type, transmission, km_driven FROM cars WHERE featured = 1 AND available = 1 AND is_deleted = 0 ORDER BY created_at DESC LIMIT 3',
        (err, results) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            res.json(results || []);
        }
    );
});
// ------------------

// --- SESSION ENDPOINTS ---
// Check user session
app.get('/user/session', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

// User logout
app.post('/user/logout', (req, res) => {
    if (req.session) {
        delete req.session.user;
        return req.session.save(err => {
            if (err) return res.status(500).json({ message: 'Logout failed' });
            res.json({ message: 'Logout successful' });
        });
    }
    res.json({ message: 'Logout successful' });
});

// ------------------
// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    const url = `http://localhost:${PORT}`;
    // Most terminals will make this clickable
    console.log(`🚀 SecondGear is Online: \x1b[36m${url}\x1b[0m`);
});
// ------------------
// Sell Requests Endpoints
// Admin: Get all rejected requests
app.get('/admin/rejected-requests', (req, res) => {
    db.query('SELECT * FROM rejected_requests', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results);
    });
});

// 1. User submits sell request
app.post('/sell-request', upload.single('image'), async (req, res) => {
    const {
        email,
        make,
        model,
        year,
        km_driven,
        type,
        estimated_price,
        color,
        fuel_type,
        mileage,
        num_owners,
        registration_city,
        registration_number,
        transmission,
        vin,
        insurance_validity,
        description
    } = req.body;
    if (!email || !make || !model || !year || !km_driven || !type || !estimated_price || !color || !fuel_type ||
        !mileage || !num_owners || !registration_city || !registration_number || !transmission || !vin ||
        !insurance_validity || !description) {
        return res.status(400).json({ message: 'All fields are required' });
    }
    const loggedInUserId = req.session && req.session.user ? req.session.user.id : null;
    let image_url = null;
    if (req.file) {
        try {
            image_url = await uploadCarImageToCloudinary(req.file);
        } catch (err) {
            console.error('Sell request image upload failed:', err);
            return res.status(500).json({ message: 'Image upload failed' });
        }
    }
    if (!image_url) {
        return res.status(400).json({ message: 'Image is required' });
    }
    db.query(
        `INSERT INTO sell_requests (
            email, user_id, make, model, year, km_driven, type, estimated_price, image_url, status,
            color, fuel_type, mileage, num_owners, registration_city, registration_number, transmission, vin, insurance_validity, description, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
            email, loggedInUserId, make, model, year, km_driven, type, estimated_price, image_url, 'pending',
            color, fuel_type, mileage, num_owners, registration_city, registration_number, transmission, vin, insurance_validity, description
        ],
        (err, result) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            if (loggedInUserId) {
                createUserNotification({
                    userId: loggedInUserId,
                    type: 'sell_request',
                    title: 'Sell Request Submitted',
                    message: `Your request for ${year} ${make} ${model} is pending admin review.`,
                    link: 'my-listings.html'
                });
            } else {
                createUserNotificationByEmail(email, {
                    type: 'sell_request',
                    title: 'Sell Request Submitted',
                    message: `Your request for ${year} ${make} ${model} is pending admin review.`,
                    link: 'my-listings.html'
                });
            }
            res.json({ success: true, id: result.insertId });
        }
    );
});

// 2. Admin views all sell requests
app.get('/admin/sell-requests', (req, res) => {
    db.query('SELECT * FROM sell_requests', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error' });
        res.json(results);
    });
});

// 2b. User views a specific sell request (with ownership check)
app.get('/user/sell-request/:id', requireLogin, (req, res) => {
    const id = req.params.id;
    const userId = req.session.user.id;
    const userEmail = req.session.user.email;
    db.query(
        'SELECT * FROM sell_requests WHERE id = ? AND (user_id = ? OR email = ?) LIMIT 1',
        [id, userId, userEmail],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            if (!results.length) return res.status(404).json({ message: 'Sell request not found' });
            res.json(results[0]);
        }
    );
});

// 2c. Admin sends offer to seller (price + optional message)
app.post('/admin/sell-request/:id/offer', requireAdmin, (req, res) => {
    const id = req.params.id;
    let { price, message } = req.body || {};
    if (typeof price === 'string') price = parseFloat(price);
    if (!price || Number.isNaN(price) || price <= 0) {
        return res.status(400).json({ message: 'Valid offer price is required' });
    }
    db.query('SELECT * FROM sell_requests WHERE id = ?', [id], (err, results) => {
        if (err || !results.length) return res.status(404).json({ message: 'Sell request not found' });
        const reqData = results[0];
        db.query(
            `UPDATE sell_requests
             SET admin_offer_price = ?, admin_offer_message = ?, seller_response = NULL,
                 seller_counter_price = NULL, seller_message = NULL, final_agreed_price = NULL
             WHERE id = ?`,
            [price, message || null, id],
            (updateErr) => {
                if (updateErr) return res.status(500).json({ message: 'DB error' });
                db.query(
                    'INSERT INTO sell_request_messages (request_id, sender, message) VALUES (?, ?, ?)',
                    [id, 'admin', message || `Admin offered ${formatINR(price)}.`],
                    () => {}
                );
                createUserNotificationByEmail(reqData.email, {
                    type: 'sell_request',
                    title: 'New Admin Offer',
                    message: `Admin has offered ${formatINR(price)} for your ${reqData.year} ${reqData.make} ${reqData.model}.`,
                    link: `sell-status.html?request_id=${id}`
                });
                res.json({ success: true });
            }
        );
    });
});

// 2d. Admin sends a question/message to seller
app.post('/admin/sell-request/:id/message', requireAdmin, (req, res) => {
    const id = req.params.id;
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ message: 'Message is required' });
    db.query('SELECT * FROM sell_requests WHERE id = ?', [id], (err, results) => {
        if (err || !results.length) return res.status(404).json({ message: 'Sell request not found' });
        const reqData = results[0];
        db.query(
            'INSERT INTO sell_request_messages (request_id, sender, message) VALUES (?, ?, ?)',
            [id, 'admin', message],
            (msgErr) => {
                if (msgErr) return res.status(500).json({ message: 'DB error' });
                createUserNotificationByEmail(reqData.email, {
                    type: 'sell_request',
                    title: 'Admin Question',
                    message: 'Admin asked a question about your sell request. Tap to respond.',
                    link: `sell-status.html?request_id=${id}`
                });
                res.json({ success: true });
            }
        );
    });
});

// 2d-1. Admin views messages for a sell request
app.get('/admin/sell-request/:id/messages', requireAdmin, (req, res) => {
    const id = req.params.id;
    db.query(
        'SELECT * FROM sell_request_messages WHERE request_id = ? ORDER BY created_at ASC',
        [id],
        (msgErr, messages) => {
            if (msgErr) return res.status(500).json({ message: 'DB error' });
            res.json(messages || []);
        }
    );
});

// 2e. Admin accepts or rejects a seller counter
app.post('/admin/sell-request/:id/counter-response', requireAdmin, (req, res) => {
    const id = req.params.id;
    const action = String(req.body?.action || '').toLowerCase();
    const adminMessage = String(req.body?.message || '').trim();
    if (!['accept', 'reject'].includes(action)) {
        return res.status(400).json({ message: 'Invalid action' });
    }
    db.query('SELECT * FROM sell_requests WHERE id = ?', [id], (err, results) => {
        if (err || !results.length) return res.status(404).json({ message: 'Sell request not found' });
        const reqData = results[0];
        if (reqData.seller_response !== 'countered' || !reqData.seller_counter_price) {
            return res.status(409).json({ message: 'No counter offer to respond to' });
        }
        if (action === 'accept') {
            const finalPrice = reqData.seller_counter_price;
            db.query(
                `UPDATE sell_requests
                 SET seller_response = 'accepted', admin_offer_price = ?, final_agreed_price = ?,
                     admin_offer_message = COALESCE(?, admin_offer_message)
                 WHERE id = ?`,
                [finalPrice, finalPrice, adminMessage || null, id],
                (updateErr) => {
                    if (updateErr) return res.status(500).json({ message: 'DB error' });
                    db.query(
                        'INSERT INTO sell_request_messages (request_id, sender, message) VALUES (?, ?, ?)',
                        [id, 'admin', adminMessage || `Admin accepted the counter offer at ${formatINR(finalPrice)}.`],
                        () => {}
                    );
                    createUserNotificationByEmail(reqData.email, {
                        type: 'sell_request',
                        title: 'Counter Accepted',
                        message: `Admin accepted your counter offer of ${formatINR(finalPrice)}.`,
                        link: `sell-status.html?request_id=${id}`
                    });
                    res.json({ success: true });
                }
            );
            return;
        }
        db.query(
            `UPDATE sell_requests
             SET seller_response = 'rejected', admin_offer_message = COALESCE(?, admin_offer_message)
             WHERE id = ?`,
            [adminMessage || null, id],
            (updateErr) => {
                if (updateErr) return res.status(500).json({ message: 'DB error' });
                db.query(
                    'INSERT INTO sell_request_messages (request_id, sender, message) VALUES (?, ?, ?)',
                    [id, 'admin', adminMessage || 'Admin rejected the counter offer.'],
                    () => {}
                );
                createUserNotificationByEmail(reqData.email, {
                    type: 'sell_request',
                    title: 'Counter Rejected',
                    message: 'Admin declined your counter offer.',
                    link: `sell-status.html?request_id=${id}`
                });
                res.json({ success: true });
            }
        );
    });
});

// 2f. Admin deletes a rejected sell request (moves to rejected_requests)
app.post('/admin/sell-request/:id/delete', requireAdmin, (req, res) => {
    const id = req.params.id;
    db.query('SELECT * FROM sell_requests WHERE id = ?', [id], (err, results) => {
        if (err || !results.length) return res.status(404).json({ message: 'Sell request not found' });
        const reqData = results[0];
        if (reqData.seller_response !== 'rejected') {
            return res.status(409).json({ message: 'Only rejected deals can be deleted' });
        }
        db.query(
            'INSERT INTO rejected_requests (id, email, make, model, year, km_driven, type, estimated_price, image_url, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [reqData.id, reqData.email || null, reqData.make, reqData.model, reqData.year, reqData.km_driven, reqData.type, reqData.estimated_price, reqData.image_url || null, 'seller_rejected', reqData.created_at],
            (insertErr) => {
                if (insertErr) return res.status(500).json({ message: 'DB error inserting rejected request' });
                db.query('DELETE FROM sell_requests WHERE id = ?', [id], (delErr) => {
                    if (delErr) return res.status(500).json({ message: 'DB error deleting sell request' });
                    db.query('DELETE FROM sell_request_messages WHERE request_id = ?', [id], () => {});
                    res.json({ success: true });
                });
            }
        );
    });
});

// 2g. Messages for a sell request (user view)
app.get('/user/sell-request/:id/messages', requireLogin, (req, res) => {
    const id = req.params.id;
    const userId = req.session.user.id;
    const userEmail = req.session.user.email;
    db.query(
        'SELECT id FROM sell_requests WHERE id = ? AND (user_id = ? OR email = ?) LIMIT 1',
        [id, userId, userEmail],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            if (!results.length) return res.status(404).json({ message: 'Sell request not found' });
            db.query(
                'SELECT * FROM sell_request_messages WHERE request_id = ? ORDER BY created_at ASC',
                [id],
                (msgErr, messages) => {
                    if (msgErr) return res.status(500).json({ message: 'DB error' });
                    res.json(messages || []);
                }
            );
        }
    );
});

// 2h. Seller posts a message or response note
app.post('/user/sell-request/:id/messages', requireLogin, (req, res) => {
    const id = req.params.id;
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ message: 'Message is required' });
    const userId = req.session.user.id;
    const userEmail = req.session.user.email;
    db.query(
        'SELECT * FROM sell_requests WHERE id = ? AND (user_id = ? OR email = ?) LIMIT 1',
        [id, userId, userEmail],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            if (!results.length) return res.status(404).json({ message: 'Sell request not found' });
            db.query(
                'INSERT INTO sell_request_messages (request_id, sender, message) VALUES (?, ?, ?)',
                [id, 'seller', message],
                (msgErr) => {
                    if (msgErr) return res.status(500).json({ message: 'DB error' });
                    res.json({ success: true });
                }
            );
        }
    );
});

// 2i. Seller responds to admin offer (accept/counter/reject)
app.post('/user/sell-request/:id/respond', requireLogin, (req, res) => {
    const id = req.params.id;
    const action = String(req.body?.action || '').toLowerCase();
    let counterPrice = req.body?.counter_price;
    const message = String(req.body?.message || '').trim();
    const userId = req.session.user.id;
    const userEmail = req.session.user.email;

    if (!['accept', 'counter', 'reject'].includes(action)) {
        return res.status(400).json({ message: 'Invalid action' });
    }
    if (action === 'counter') {
        if (typeof counterPrice === 'string') counterPrice = parseFloat(counterPrice);
        if (!counterPrice || Number.isNaN(counterPrice) || counterPrice <= 0) {
            return res.status(400).json({ message: 'Valid counter price is required' });
        }
    }

    db.query(
        'SELECT * FROM sell_requests WHERE id = ? AND (user_id = ? OR email = ?) LIMIT 1',
        [id, userId, userEmail],
        (err, results) => {
            if (err) return res.status(500).json({ message: 'DB error' });
            if (!results.length) return res.status(404).json({ message: 'Sell request not found' });
            const reqData = results[0];
            if (!reqData.admin_offer_price) {
                return res.status(409).json({ message: 'No admin offer to respond to yet' });
            }

            let updateSql = '';
            let updateParams = [];
            if (action === 'accept') {
                updateSql = `UPDATE sell_requests
                             SET seller_response = 'accepted', final_agreed_price = ?, seller_message = ?, seller_counter_price = NULL
                             WHERE id = ?`;
                updateParams = [reqData.admin_offer_price, message || null, id];
            } else if (action === 'counter') {
                updateSql = `UPDATE sell_requests
                             SET seller_response = 'countered', seller_counter_price = ?, seller_message = ?, final_agreed_price = NULL
                             WHERE id = ?`;
                updateParams = [counterPrice, message || null, id];
            } else {
                updateSql = `UPDATE sell_requests
                             SET seller_response = 'rejected', seller_message = ?, final_agreed_price = NULL
                             WHERE id = ?`;
                updateParams = [message || null, id];
            }

            db.query(updateSql, updateParams, (updateErr) => {
                if (updateErr) return res.status(500).json({ message: 'DB error' });
                const autoMessage =
                    action === 'accept' ? 'Seller accepted the offer.' :
                    action === 'reject' ? 'Seller rejected the offer.' :
                    `Seller countered with ${formatINR(counterPrice)}.`;
                const finalMessage = message || autoMessage;
                db.query(
                    'INSERT INTO sell_request_messages (request_id, sender, message) VALUES (?, ?, ?)',
                    [id, 'seller', finalMessage],
                    () => res.json({ success: true })
                );
            });
        }
    );
});

// 3. Admin confirms a request (uploads image, sets price, moves to cars table)
app.post('/admin/sell-request/:id/confirm', upload.single('image'), async (req, res) => {
    const id = req.params.id;
    // Support both JSON and multipart/form-data
    let carDetails = {};
    if (req.is('application/json')) {
        carDetails = req.body;
    } else {
        // fallback for form-data
        carDetails.price = req.body.price;
    }
    // Use uploaded file if present, else use image_url from body or sell_request
    let image = carDetails.image_url || null;
    if (req.file) {
        try {
            image = await uploadCarImageToCloudinary(req.file);
        } catch (err) {
            console.error('Confirm listing image upload failed:', err);
            return res.status(500).json({ message: 'Image upload failed' });
        }
    }
    const toBool = (value, defaultValue = true) => {
        if (value === undefined || value === null || value === '') return defaultValue;
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value === 1;
        const normalized = String(value).toLowerCase();
        if (['false', '0', 'off', 'no'].includes(normalized)) return false;
        return true;
    };
    db.query('SELECT * FROM sell_requests WHERE id = ?', [id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ message: 'Sell request not found' });
        const reqData = results[0];
        if (!image) {
            image = reqData.image_url || null;
        }
        if (image && !image.startsWith('/')) {
            image = '/' + image;
        }
        // Use values from the sell request; admin can only hide/show fields
        const make = reqData.make;
        const model = reqData.model;
        const year = reqData.year;
        const km_driven = reqData.km_driven;
        const type = reqData.type;
        const agreedPrice = reqData.final_agreed_price || null;
        if (!agreedPrice) {
            return res.status(409).json({ message: 'Seller has not accepted an offer yet.' });
        }
        const price = carDetails.price || agreedPrice || reqData.estimated_price;
        const show_color = toBool(carDetails.show_color, true);
        const show_fuel_type = toBool(carDetails.show_fuel_type, true);
        const show_mileage = toBool(carDetails.show_mileage, true);
        const show_num_owners = toBool(carDetails.show_num_owners, true);
        const show_registration_city = toBool(carDetails.show_registration_city, true);
        const show_registration_number = toBool(carDetails.show_registration_number, true);
        const show_transmission = toBool(carDetails.show_transmission, true);
        const show_vin = toBool(carDetails.show_vin, true);
        const show_insurance_validity = toBool(carDetails.show_insurance_validity, true);
        const show_description = toBool(carDetails.show_description, true);
        const description = show_description ? (reqData.description || `From Sell Request: ${id}`) : null;
        const color = show_color ? (reqData.color || null) : null;
        const fuel_type = show_fuel_type ? (reqData.fuel_type || null) : null;
        const mileage = show_mileage ? (reqData.mileage || null) : null;
        const num_owners = show_num_owners ? (reqData.num_owners || null) : null;
        const registration_city = show_registration_city ? (reqData.registration_city || null) : null;
        const registration_number = show_registration_number ? (reqData.registration_number || null) : null;
        const transmission = show_transmission ? (reqData.transmission || null) : null;
        const vin = show_vin ? (reqData.vin || null) : null;
        const insurance_validity = show_insurance_validity ? (reqData.insurance_validity || null) : null;
        const seller_email = reqData.email || null;
        const seller_user_id = reqData.user_id || null;
        // Insert into cars table with all fields
        db.query(
            `INSERT INTO cars (
                make, model, year, price, description, image_url, available, color, fuel_type, mileage, num_owners, registration_city, registration_number, transmission, vin, insurance_validity, km_driven, type, seller_email, seller_user_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                make, model, year, price, description, image, 1,
                color, fuel_type, mileage, num_owners, registration_city, registration_number,
                transmission, vin, insurance_validity, km_driven, type, seller_email, seller_user_id
            ],
            (err2, result2) => {
                if (err2) {
                    console.error('SQL Error on /admin/sell-request/:id/confirm:', err2);
                    return res.status(500).json({ message: 'DB error adding car', error: err2 });
                }
                // Delete sell request after confirming
                db.query('DELETE FROM sell_requests WHERE id = ?', [id], (err3) => {
                    if (err3) return res.status(500).json({ message: 'DB error deleting request' });
                    db.query('DELETE FROM sell_request_messages WHERE request_id = ?', [id], () => {});
                    createUserNotificationByEmail(reqData.email, {
                        type: 'sell_request',
                        title: 'Sell Request Approved',
                        message: `Your ${year} ${make} ${model} request has been approved and listed at ${formatINR(price)}.`,
                        link: 'my-listings.html'
                    });
                    
                    // SEND SELL REQUEST APPROVED EMAIL
                    const mailOptions = {
                        from: 'secondgearproject01@gmail.com',
                        to: reqData.email,
                        subject: 'Sell Request Approved - SecondGear',
                        html: `
                            <div style="font-family: Arial, sans-serif; color: #333; background: #f9f9f9; padding: 20px;">
                                <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                                    <h2 style="color: #27ae60;">✓ Your Vehicle Listing is Live!</h2>
                                    <p>Dear Seller,</p>
                                    <p>Great news! Your vehicle has been approved and is now listed on SecondGear for buyers to view.</p>
                                    
                                    <div style="background: #e8f8f0; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #27ae60;">
                                        <h3 style="color: #27ae60; margin-top: 0;">Vehicle Details:</h3>
                                        <table style="width: 100%; border-collapse: collapse;">
                                            <tr>
                                                <td style="padding: 8px; font-weight: bold;">Vehicle:</td>
                                                <td style="padding: 8px;">${year} ${make} ${model}</td>
                                            </tr>
                                            <tr style="background: white;">
                                                <td style="padding: 8px; font-weight: bold;">Type:</td>
                                                <td style="padding: 8px;">${type}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px; font-weight: bold;">Mileage:</td>
                                                <td style="padding: 8px;">${km_driven} km</td>
                                            </tr>
                                            <tr style="background: white;">
                                                <td style="padding: 8px; font-weight: bold;">Listed Price:</td>
                                                <td style="padding: 8px; font-weight: bold; color: #27ae60; font-size: 16px;">${formatINR(price)}</td>
                                            </tr>
                                        </table>
                                    </div>
                                    
                                    <p><strong>What's Next?</strong></p>
                                    <ul>
                                        <li>Your vehicle is now visible to interested buyers on SecondGear</li>
                                        <li>Buyers can contact you directly through our platform</li>
                                        <li>You will receive notifications when buyers express interest</li>
                                        <li>Our team is ready to assist with documentation and final sale</li>
                                    </ul>
                                    
                                    <p style="background: #fff3cd; padding: 12px; border-left: 4px solid #ffc107; border-radius: 4px;">
                                        <strong>Tip:</strong> Keep your contact info updated so interested buyers can reach you promptly. Early responses lead to successful sales!
                                    </p>
                                    
                                    <p style="color: #666; font-size: 12px; margin-top: 20px;">If you have any questions about your listing, please contact our support team.</p>
                                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                                    <p style="color: #888; font-size: 12px;">© 2026 SecondGear. All rights reserved.</p>
                                </div>
                            </div>
                        `
                    };

                    transporter.sendMail(mailOptions, (emailErr, info) => {
                        if (emailErr) {
                            console.error('Sell approval email failed:', emailErr);
                        } else {
                            console.log('✅ Sell approval email sent to ' + reqData.email);
                        }
                        res.json({ success: true });
                    });
                });
            }
        );
    });
});

// 4. Admin rejects a request
app.post('/admin/sell-request/:id/reject', (req, res) => {
    const id = req.params.id;
    // Get request details
    db.query('SELECT * FROM sell_requests WHERE id = ?', [id], (err, results) => {
        if (err || results.length === 0) return res.status(404).json({ message: 'Sell request not found' });
        const reqData = results[0];
        // Insert into rejected_requests table
        db.query(
            'INSERT INTO rejected_requests (id, email, make, model, year, km_driven, type, estimated_price, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [reqData.id, reqData.email || null, reqData.make, reqData.model, reqData.year, reqData.km_driven, reqData.type, reqData.estimated_price, 'rejected', reqData.created_at],
            (err2) => {
                if (err2) return res.status(500).json({ message: 'DB error inserting rejected request' });
                // Remove from sell_requests
                db.query('DELETE FROM sell_requests WHERE id = ?', [id], (err3) => {
                    if (err3) return res.status(500).json({ message: 'DB error deleting from sell_requests' });
                    db.query('DELETE FROM sell_request_messages WHERE request_id = ?', [id], () => {});
                    createUserNotificationByEmail(reqData.email, {
                        type: 'sell_request',
                        title: 'Sell Request Rejected',
                        message: `Your ${reqData.year} ${reqData.make} ${reqData.model} request was not approved at this time.`,
                        link: 'my-listings.html'
                    });
                    
                    // SEND SELL REQUEST REJECTION EMAIL
                    const mailOptions = {
                        from: 'secondgearproject01@gmail.com',
                        to: reqData.email,
                        subject: 'Sell Request Update - SecondGear',
                        html: `
                            <div style="font-family: Arial, sans-serif; color: #333; background: #f9f9f9; padding: 20px;">
                                <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                                    <h2 style="color: #e74c3c;">Sell Request Update</h2>
                                    <p>Dear Seller,</p>
                                    <p>Thank you for submitting your vehicle to SecondGear. Unfortunately, we're unable to list your vehicle at this time.</p>
                                    
                                    <div style="background: #fadbd8; padding: 20px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #e74c3c;">
                                        <h3 style="color: #c0392b; margin-top: 0;">Vehicle Details:</h3>
                                        <table style="width: 100%; border-collapse: collapse;">
                                            <tr>
                                                <td style="padding: 8px; font-weight: bold;">Vehicle:</td>
                                                <td style="padding: 8px;">${reqData.year} ${reqData.make} ${reqData.model}</td>
                                            </tr>
                                            <tr style="background: white;">
                                                <td style="padding: 8px; font-weight: bold;">Type:</td>
                                                <td style="padding: 8px;">${reqData.type}</td>
                                            </tr>
                                            <tr>
                                                <td style="padding: 8px; font-weight: bold;">Mileage:</td>
                                                <td style="padding: 8px;">${reqData.km_driven} km</td>
                                            </tr>
                                        </table>
                                    </div>
                                    
                                    <p style="color: #666;"><strong>Possible Reasons:</strong></p>
                                    <ul style="color: #666;">
                                        <li>Vehicle condition does not meet our quality standards</li>
                                        <li>Market price is significantly below or above fair value</li>
                                        <li>Documentation requirements not met</li>
                                        <li>Vehicle category not currently in demand</li>
                                    </ul>
                                    
                                    <p style="background: #e8f4f8; padding: 12px; border-left: 4px solid #3498db; border-radius: 4px;">
                                        <strong>Next Steps:</strong> You can contact our support team to discuss your specific vehicle or submit a different vehicle for consideration.
                                    </p>
                                    
                                    <p style="color: #666; font-size: 12px; margin-top: 20px;">We appreciate your interest in SecondGear. Please feel free to reach out if you have any questions.</p>
                                    <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                                    <p style="color: #888; font-size: 12px;">© 2026 SecondGear. All rights reserved.</p>
                                </div>
                            </div>
                        `
                    };

                    transporter.sendMail(mailOptions, (emailErr, info) => {
                        if (emailErr) {
                            console.error('Sell rejection email failed:', emailErr);
                        } else {
                            console.log('✅ Sell rejection email sent to ' + reqData.email);
                        }
                        res.json({ success: true });
                    });
                });
            }
        );
    });
});
// Newsletter Subscription Endpoint
app.post('/subscribe', (req, res) => {
    const { email } = req.body;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ message: 'Invalid email address.' });
    }
    // Insert email
    db.query(
        'INSERT IGNORE INTO newsletter_subscribers (email) VALUES (?)',
        [email],
        (err2, result) => {
            if (err2) return res.status(500).json({ message: 'DB error', error: err2 });
            if (result.affectedRows === 0) {
                return res.json({ message: 'You are already subscribed!' });
            }
            const mailOptions = {
                from: 'secondgearproject01@gmail.com',
                to: email,
                subject: 'Subscription Confirmed - SecondGear',
                html: `
                    <div style="font-family: Arial, sans-serif; color: #0f172a; background: #f4f7fb; padding: 20px;">
                        <div style="max-width: 640px; margin: 0 auto; background: #ffffff; padding: 28px; border-radius: 12px; box-shadow: 0 8px 24px rgba(15,23,42,0.08);">
                            <h2 style="margin: 0 0 12px; color: #0f3d57;">You're subscribed to SecondGear updates</h2>
                            <p style="margin: 0 0 12px;">Thanks for subscribing. You’ll receive updates on new listings, price drops, and service offers.</p>
                            <p style="margin: 0; color: #475569; font-size: 13px;">No spam. You can unsubscribe anytime from the footer on the website.</p>
                        </div>
                    </div>
                `
            };

            transporter.sendMail(mailOptions, (emailErr) => {
                if (emailErr) {
                    console.error('Newsletter confirmation email failed:', emailErr);
                }
                res.json({ message: 'Thanks! Check your email to confirm.' });
            });
        }
    );
});

// Newsletter Unsubscribe Endpoint
app.post('/unsubscribe', (req, res) => {
    const { email } = req.body;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ message: 'Invalid email address.' });
    }
    db.query('DELETE FROM newsletter_subscribers WHERE email = ?', [email], (err, result) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        if (!result.affectedRows) {
            return res.json({ message: 'You are not subscribed.' });
        }
        res.json({ message: 'You have been unsubscribed.' });
    });
});

// Admin: Get all newsletter subscribers
app.get('/admin/newsletter-subscribers', (req, res) => {
    db.query('SELECT id, email, subscribed_at FROM newsletter_subscribers ORDER BY subscribed_at DESC', (err, results) => {
        if (err) return res.status(500).json({ message: 'DB error', error: err });
        res.json(results);
    });
});

// --- ADMIN STATS ---
app.get('/admin/stats', (req, res) => {
    const { startDate, endDate } = req.query;
    const stats = {};

    // Build WHERE clauses if dates are provided
    const carWhereClause = startDate && endDate ? `WHERE p.purchase_date BETWEEN ? AND ?` : '';
    const bookingWhereClause = startDate && endDate ? `AND b.created_at BETWEEN ? AND ?` : '';
    const params = startDate && endDate ? [startDate, endDate] : [];

    // Get total car revenue from purchases
    const carRevenueQuery = `
        SELECT SUM(c.price) AS totalCarRevenue 
        FROM purchases p 
        JOIN cars c ON p.car_id = c.id
        ${carWhereClause}
    `;
    db.query(carRevenueQuery, params, (err, carResults) => {
        if (err) {
            return res.status(500).json({ message: 'DB error getting car revenue', error: err });
        }
        stats.carRevenue = carResults[0].totalCarRevenue || 0;

        // Get total service revenue from fulfilled bookings
        const serviceRevenueQuery = `
            SELECT SUM(b.price) AS totalServiceRevenue 
            FROM bookings b
            WHERE b.status = 'fulfilled'
            ${bookingWhereClause}
        `;
        db.query(serviceRevenueQuery, params, (err, serviceResults) => {
            if (err) {
                return res.status(500).json({ message: 'DB error getting service revenue', error: err });
            }
            stats.serviceRevenue = serviceResults[0].totalServiceRevenue || 0;
            res.json(stats);
        });
    });
});


// ------------------
// Serve frontend pages

// --- API ROUTES ARE DEFINED ABOVE THIS LINE ---

// Serve static files after API routes
app.use(express.static(path.resolve(__dirname, '../Front-End')));
