require('dotenv').config();

const express = require('express');
const app = express();
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

// Normalize client URL to ensure it has https:// or http://
let normalizedClientUrl = clientUrl;
if (clientUrl && !/^https?:\/\//i.test(clientUrl)) {
    normalizedClientUrl = `https://${clientUrl}`;
}

const allowedOrigins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    normalizedClientUrl
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, postman)
        if (!origin) return callback(null, true);
        
        const isLocalhost = /^http:\/\/localhost:\d+$/.test(origin);
        
        let isVercel = false;
        try {
            const hostname = new URL(origin).hostname;
            isVercel = /\.vercel\.app$/i.test(hostname) || hostname === 'vercel.app';
        } catch (e) {
            // Invalid URL format in origin
        }
        
        const isAllowed = allowedOrigins.includes(origin);
        
        if (isLocalhost || isVercel || isAllowed) {
            callback(null, true);
        } else {
            console.warn(`Blocked by CORS: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

const getCookieOptions = (maxAge) => {
    const opts = {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
         domain: undefined
    };
    if (maxAge !== undefined) {
        opts.maxAge = maxAge;
    }
    return opts;
};



app.use(express.json());
app.use(cookieParser());

const port = process.env.PORT || 2006;
const uri = process.env.MongoDB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let collection, requestsCollection, usersCollection;

const ensureDBConnection = async (req, res, next) => {
    try {
        if (collection && requestsCollection && usersCollection) {
            return next();
        }
        
        await client.connect();
        const Data = client.db('Pets');
        collection = Data.collection('all_pets');
        requestsCollection = Data.collection('adoption_requests');
        usersCollection = Data.collection('user'); 
        
        console.log('MongoDB database connection established successfully!');
        next();
    } catch (error) {
        console.error("MongoDB initialization error in middleware:", error);
        res.status(500).send({ message: "Database connection failed", error: error.message });
    }
};

app.use(ensureDBConnection);

// --- CUSTOM JWT AUTHENTICATION MIDDLEWARE ---
const verifyToken = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.status(401).send({ message: "Unauthorized access. Please login first." });
    }
    try {
        const jwtSecret = process.env.JWT_SECRET || 'pet_adoption_platform_secret_2026_xyz';
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded;
        next();
    } catch (error) {
        console.error("JWT verification failed:", error);
        return res.status(401).send({ message: "Unauthorized access. Invalid or expired token." });
    }
};

// --- BASE ROUTE ---
app.get('/', (req, res) => {
    res.send('Pet Adoption Platform Project server live Now');
});

// --- JWT AUTHENTICATION ENDPOINTS ---

app.post('/auth/register', async (req, res) => {
    try {
        const { email, password, name, image } = req.body;
        if (!email || !password || !name) {
            return res.status(400).send({ message: "Name, email, and password are required." });
        }
        if (password.length < 6) {
            return res.status(400).send({ message: "Password must be at least 6 characters long." });
        }

        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
            return res.status(400).send({ message: "An account with this email already exists." });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = {
            name,
            email,
            password: hashedPassword,
            image: image || "",
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const insertResult = await usersCollection.insertOne(newUser);
        const userId = insertResult.insertedId;

        const jwtSecret = process.env.JWT_SECRET || 'pet_adoption_platform_secret_2026_xyz';
        const token = jwt.sign(
            { id: userId.toString(), email: newUser.email, name: newUser.name },
            jwtSecret,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, getCookieOptions(7 * 24 * 60 * 60 * 1000));

        res.status(201).send({
            user: {
                id: userId,
                name: newUser.name,
                email: newUser.email,
                image: newUser.image
            }
        });
    } catch (error) {
        console.error("Error registering user:", error);
        res.status(500).send({ message: "Failed to register user", error: error.message });
    }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).send({ message: "Email and password are required." });
        }

        const user = await usersCollection.findOne({ email });
        if (!user) {
            return res.status(400).send({ message: "Invalid email or password." });
        }

        if (!user.password) {
            return res.status(400).send({ message: "This account uses social authentication. Please use social login." });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).send({ message: "Invalid email or password." });
        }

        const jwtSecret = process.env.JWT_SECRET || 'pet_adoption_platform_secret_2026_xyz';
        const token = jwt.sign(
            { id: user._id.toString(), email: user.email, name: user.name },
            jwtSecret,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, getCookieOptions(7 * 24 * 60 * 60 * 1000));

        res.send({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                image: user.image
            }
        });
    } catch (error) {
        console.error("Error logging in:", error);
        res.status(500).send({ message: "Failed to login", error: error.message });
    }
});

app.post('/auth/logout', async (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: true,
        sameSite: 'none'
    });
    res.send({ success: true, message: "Logged out successfully." });
});

app.get('/auth/me', async (req, res) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).send({ message: "No active session." });
        }

        const jwtSecret = process.env.JWT_SECRET || 'pet_adoption_platform_secret_2026_xyz';
        const decoded = jwt.verify(token, jwtSecret);

        const user = await usersCollection.findOne({ _id: new ObjectId(decoded.id) });
        if (!user) {
            return res.status(401).send({ message: "Session user not found." });
        }

        res.send({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                image: user.image
            }
        });
    } catch (error) {
        console.error("Session verification error:", error);
        res.status(401).send({ message: "Invalid or expired session token." });
    }
});

app.get('/auth/social/google', async (req, res) => {
    try {
        const callbackURL = Array.isArray(req.query.callbackURL) ? req.query.callbackURL[0] : req.query.callbackURL;
        const serverBaseUrl = process.env.BETTER_AUTH_URL || `https://${req.headers.host}`;
        const redirectUri = `${serverBaseUrl}/auth/social/google/callback`;
        const state = callbackURL ? encodeURIComponent(callbackURL) : encodeURIComponent(`${clientUrl}/`);

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', 'openid email profile');
        authUrl.searchParams.set('access_type', 'offline');
        authUrl.searchParams.set('prompt', 'select_account');
        authUrl.searchParams.set('state', state);

        return res.redirect(authUrl.toString());
    } catch (error) {
        console.error('Google social login redirect failed:', error);
        return res.status(500).send({ message: 'Google login failed. Please try again later.' });
    }
});

app.get('/auth/social/google/callback', async (req, res) => {
    try {
        const code = Array.isArray(req.query.code) ? req.query.code[0] : req.query.code;
        const state = Array.isArray(req.query.state) ? req.query.state[0] : req.query.state;

        if (!code) {
            return res.status(400).send({ message: 'Google authentication failed. No code returned.' });
        }

        const serverBaseUrl = process.env.BETTER_AUTH_URL || `https://${req.headers.host}`;
        const redirectUri = `${serverBaseUrl}/auth/social/google/callback`;

        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
            }).toString(),
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenData.access_token) {
            console.error('Google token exchange failed:', tokenData);
            return res.status(500).send({ message: 'Google token exchange failed.' });
        }

        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
            },
        });

        const profileData = await profileResponse.json();
        if (!profileData.email) {
            return res.status(400).send({ message: 'Google did not return an email address.' });
        }

        const now = new Date();
        let user = await usersCollection.findOne({ email: profileData.email });
        if (!user) {
            const newUser = {
                name: profileData.name || profileData.email.split('@')[0],
                email: profileData.email,
                image: profileData.picture || '',
                password: null,
                provider: 'google',
                createdAt: now,
                updatedAt: now,
            };
            const insertResult = await usersCollection.insertOne(newUser);
            user = { ...newUser, _id: insertResult.insertedId };
        } else {
            const updates = {};
            if (!user.name && profileData.name) updates.name = profileData.name;
            if (!user.image && profileData.picture) updates.image = profileData.picture;
            if (Object.keys(updates).length > 0) {
                updates.updatedAt = now;
                await usersCollection.updateOne({ _id: user._id }, { $set: updates });
                user = await usersCollection.findOne({ _id: user._id });
            }
        }

        const jwtSecret = process.env.JWT_SECRET || 'pet_adoption_platform_secret_2026_xyz';
        const token = jwt.sign(
            { id: user._id.toString(), email: user.email, name: user.name },
            jwtSecret,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, getCookieOptions(7 * 24 * 60 * 60 * 1000));

        const redirectTo = state ? decodeURIComponent(state) : `${clientUrl}/`;
        return res.redirect(redirectTo);
    } catch (error) {
        console.error('Google social login callback failed:', error);
        return res.status(500).send({ message: 'Google authentication callback failed.' });
    }
});

// --- PETS ENDPOINTS ---

app.get('/pets', async (req, res) => {
    try {
        const { email, search, species, sortBy, sortOrder } = req.query;
        let query = {};

        if (email) {
            query.email = email;
        }

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        if (species) {
            const speciesList = species.split(',').map(s => s.trim()).filter(Boolean);
            if (speciesList.length > 0) {
                query.species = { 
                    $in: speciesList.map(s => new RegExp(`^${s}$`, 'i'))
                };
            }
        }

        let sortDoc = {};
        if (sortBy) {
            const order = sortOrder === 'desc' ? -1 : 1;
            if (sortBy === 'adoptionFee') {
                sortDoc.adoptionFee = order;
            } else if (sortBy === 'age') {
                sortDoc.age = order;
            } else if (sortBy === 'name') {
                sortDoc.name = order;
            } else {
                sortDoc[sortBy] = order;
            }
        } else {
            sortDoc._id = -1;
        }

        const cursor = collection.find(query).sort(sortDoc);
        const result = await cursor.toArray();
        res.send(result);
    } catch (error) {
        console.error("Error fetching pets:", error);
        res.status(500).send({ message: "Failed to fetch pets", error: error.message });
    }
});

app.post('/pets', verifyToken, async (req, res) => {
    try {
        const petData = req.body;
        const result = await collection.insertOne(petData);
        res.status(201).send(result);
    } catch (error) {
        console.error("Error inserting pet:", error);
        res.status(500).send({ message: "Failed to add pet", error: error.message });
    }
});

app.delete('/pets/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await collection.deleteOne(query);
        res.send(result);
    } catch (error) {
        console.error("Error deleting pet:", error);
        res.status(500).send({ message: "Failed to delete pet", error: error.message });
    }
});

app.put('/pets/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const petData = req.body;
        const { _id, ...updateData } = petData;
        const query = { _id: new ObjectId(id) };
        const updateDoc = {
            $set: updateData,
            };
        const result = await collection.updateOne(query, updateDoc);
        res.send(result);
    } catch (error) {
        console.error("Error updating pet:", error);
        res.status(500).send({ message: "Failed to update pet", error: error.message });
    }
});

// --- ADOPTION REQUESTS ENDPOINTS ---

app.post('/adoption-requests', verifyToken, async (req, res) => {
    try {
        const requestData = req.body;
        const existing = await requestsCollection.findOne({
            petId: requestData.petId,
            requesterEmail: requestData.requesterEmail
        });
        if (existing) {
            return res.status(400).send({ message: "You have already applied for this pet!" });
        }
        const result = await requestsCollection.insertOne(requestData);
        res.status(201).send(result);
    } catch (error) {
        console.error("Error creating adoption request:", error);
        res.status(500).send({ message: "Failed to submit request", error: error.message });
    }
});

app.get('/adoption-requests', verifyToken, async (req, res) => {
    try {
        const { petId, requesterEmail } = req.query;
        let query = {};
        if (petId) {
            query.petId = petId;
        }
        if (requesterEmail) {
            query.requesterEmail = requesterEmail;
        }
        const result = await requestsCollection.find(query).toArray();
        res.send(result);
    } catch (error) {
        console.error("Error fetching adoption requests:", error);
        res.status(500).send({ message: "Failed to fetch requests", error: error.message });
    }
});

app.put('/adoption-requests/:id/approve', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const request = await requestsCollection.findOne({ _id: new ObjectId(id) });
        if (!request) {
            return res.status(404).send({ message: "Request not found" });
        }
        const petId = request.petId;

        await requestsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: 'approved' } }
        );

        await requestsCollection.updateMany(
            { petId: petId, _id: { $ne: new ObjectId(id) } },
            { $set: { status: 'rejected' } }
        );

        await collection.updateOne(
            { _id: new ObjectId(petId) },
            { $set: { status: 'Adopted' } }
        );

        res.send({ message: "Request approved and others rejected successfully!" });
    } catch (error) {
        console.error("Error approving request:", error);
        res.status(500).send({ message: "Failed to approve request", error: error.message });
    }
});

app.put('/adoption-requests/:id/reject', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const result = await requestsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { status: 'rejected' } }
        );
        res.send(result);
    } catch (error) {
        console.error("Error rejecting request:", error);
        res.status(500).send({ message: "Failed to reject request", error: error.message });
    }
});

app.delete('/adoption-requests/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await requestsCollection.deleteOne(query);
        res.send(result);
    } catch (error) {
        console.error("Error deleting request:", error);
        res.status(500).send({ message: "Failed to delete request", error: error.message });
    }
});


if (!process.env.VERCEL) {
    app.listen(port, () => {
        console.log(`Server is running on port ${port}`);
    });
}

module.exports = app;