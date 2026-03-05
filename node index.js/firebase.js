const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
let firebaseApp;

const initializeFirebase = () => {
    try {
        // Skip Firebase initialization if using demo credentials
        if (process.env.FIREBASE_PROJECT_ID === 'demo-project' || 
            process.env.FIREBASE_CLIENT_EMAIL === 'demo@demo-project.iam.gserviceaccount.com') {
            console.log('⚠️ Using demo Firebase credentials - Firebase features disabled');
            return;
        }

        // Check if Firebase Admin is already initialized
        if (admin.apps.length === 0) {
            const serviceAccount = {
                type: "service_account",
                project_id: process.env.FIREBASE_PROJECT_ID,
                private_key_id: "demo-key-id",
                private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                client_email: process.env.FIREBASE_CLIENT_EMAIL,
                client_id: "demo-client-id",
                auth_uri: "https://accounts.google.com/o/oauth2/auth",
                token_uri: "https://oauth2.googleapis.com/token",
                auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
                client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(process.env.FIREBASE_CLIENT_EMAIL)}`
            };

            firebaseApp = admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                projectId: process.env.FIREBASE_PROJECT_ID
            });

            console.log('✅ Firebase Admin initialized successfully');
        }
        // If already initialized, set firebaseApp reference
        if (!firebaseApp && admin.apps.length > 0) {
            firebaseApp = admin.app();
        }
    } catch (error) {
        console.error('❌ Firebase Admin initialization error:', error.message);
        console.warn('⚠️ Firebase features will be disabled. Check your environment variables.');
    }
};

module.exports = {
    initializeFirebase,
    getFirebaseApp: () => firebaseApp || (admin.apps.length ? admin.app() : undefined)
};

