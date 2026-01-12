
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail,
  onAuthStateChanged,
  User as FirebaseUser 
} from 'firebase/auth';
import { User } from '../types';

// --- FIREBASE CONFIGURATION INSTRUCTIONS ---
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project.
// 3. Enable "Authentication" -> "Sign-in method" -> "Email/Password".
// 4. Go to Project Settings (Gear icon) -> General -> "Your apps" -> Web App.
// 5. Copy the config values below.

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "REPLACE_WITH_YOUR_API_KEY",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "REPLACE_WITH_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "REPLACE_WITH_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "REPLACE_WITH_SENDER_ID",
  appId: process.env.FIREBASE_APP_ID || "REPLACE_WITH_APP_ID"
};

// Initialize Firebase safely
let auth: any;
try {
    // Check if config is still default placeholder
    if (firebaseConfig.apiKey.includes("REPLACE_WITH")) {
        console.warn("%c FIREBASE CONFIG MISSING ", "background: #f00; color: #fff; font-size: 14px; padding: 4px;");
        console.warn("Please update services/authService.ts with your Firebase project keys.");
    } else {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
    }
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}

// Helper to map Firebase User to App User
const mapUser = (fbUser: FirebaseUser): User => {
    // We store premium status locally for this version of the app since Firebase Auth
    // doesn't support custom fields without a database.
    const storedPremium = localStorage.getItem(`chronos_premium_${fbUser.email}`);
    
    return {
        id: fbUser.uid,
        email: fbUser.email || '',
        name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
        isPremium: storedPremium === 'true'
    };
};

export const authService = {
  
  // Real Login
  login: async (email: string, password: string): Promise<User> => {
    if (!auth) throw new Error("Firebase not configured. See console for instructions.");
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        return mapUser(result.user);
    } catch (error: any) {
        if (error.code === 'auth/invalid-api-key') {
            throw new Error("Invalid Firebase API Key. Please check authService.ts");
        }
        throw new Error(error.message || "Login failed");
    }
  },

  // Real Signup
  signup: async (name: string, email: string, password: string): Promise<User> => {
    if (!auth) throw new Error("Firebase not configured. See console for instructions.");
    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        // Note: In a full app, you would use updateProfile to set the displayName here
        return mapUser(result.user);
    } catch (error: any) {
        throw new Error(error.message || "Signup failed");
    }
  },

  // Real Password Reset Email
  requestPasswordReset: async (email: string): Promise<void> => {
      if (!auth) throw new Error("Firebase not initialized.");
      try {
          await sendPasswordResetEmail(auth, email);
          console.log(`Password reset email sent to ${email}`);
      } catch (error: any) {
          throw new Error(error.message || "Failed to send reset email");
      }
  },

  // Real Logout
  logout: async (): Promise<void> => {
      if (!auth) return;
      await signOut(auth);
      localStorage.removeItem('chronos_active_user'); // Clear local cache if any
  },

  // Subscribe to Auth State Changes (Session Restore)
  subscribe: (callback: (user: User | null) => void): () => void => {
      if (!auth) {
          callback(null);
          return () => {};
      }
      
      const unsubscribe = onAuthStateChanged(auth, (fbUser: FirebaseUser | null) => {
          if (fbUser) {
              const user = mapUser(fbUser);
              callback(user);
          } else {
              callback(null);
          }
      });
      return unsubscribe;
  },

  // Simulated Payment (Persisted Locally)
  upgradeToPremium: async (user: User): Promise<User> => {
      return new Promise((resolve) => {
          setTimeout(() => {
              const updatedUser = { ...user, isPremium: true };
              localStorage.setItem(`chronos_premium_${user.email}`, 'true');
              resolve(updatedUser);
          }, 1500);
      });
  },

  // Legacy synchronous getter
  getCurrentUser: (): User | null => {
      if (auth?.currentUser) {
          return mapUser(auth.currentUser);
      }
      return null;
  }
};
