app.get('/auth/social/google', async (req, res) => {
    try {
        const callbackURL = req.query.callbackURL;
        
        const serverBaseUrl = process.env.SERVER_URL || "http://localhost:2006";
        
        const redirectUri = `${serverBaseUrl}/auth/social/google/callback`;
        
        const state = callbackURL ? encodeURIComponent(callbackURL) : encodeURIComponent(clientUrl);

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
        return res.status(500).send({ message: 'Google login failed.' });
    }
});

app.get('/auth/social/google/callback', async (req, res) => {
    try {
        const code = req.query.code;
        const state = req.query.state;

        if (!code) {
            return res.status(400).send({ message: 'Google authentication failed. No code returned.' });
        }

        const serverBaseUrl = process.env.SERVER_URL || "http://localhost:2006";
        const redirectUri = `${serverBaseUrl}/auth/social/google/callback`;

        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri,
            }).toString(),
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok) {
            return res.status(500).send({ message: 'Google token exchange failed.' });
        }

        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        const profileData = await profileResponse.json();
        
        let user = await usersCollection.findOne({ email: profileData.email });
        if (!user) {
            const newUser = {
                name: profileData.name,
                email: profileData.email,
                image: profileData.picture || '',
                password: null,
                provider: 'google',
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const insertResult = await usersCollection.insertOne(newUser);
            user = { ...newUser, _id: insertResult.insertedId };
        }

        const jwtSecret = process.env.JWT_SECRET || 'pet_adoption_platform_secret_2026_xyz';
        const token = jwt.sign(
            { id: user._id.toString(), email: user.email, name: user.name },
            jwtSecret,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: true,     
            sameSite: 'none',
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        const redirectTo = state ? decodeURIComponent(state) : clientUrl;
        return res.redirect(redirectTo);

    } catch (error) {
        console.error('Google callback error:', error);
        return res.status(500).send({ message: 'Google authentication callback failed.' });
    }
});