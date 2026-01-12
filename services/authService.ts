
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

// --- CONFIGURATION ---
// REPLACE THESE VALUES WITH YOUR FIREBASE PROJECT CONFIG
// Access 'process' in the browser causes a crash, so we use string literals here.
const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID"
};

// Initialize Firebase safely
let auth: any;

// Helper to check if config is valid
const isConfigConfigured = !firebaseConfig.apiKey.includes("REPLACE_WITH");

try {
    if (!isConfigConfigured) {
        console.warn("%c FIREBASE CONFIG MISSING ", "background: #f00; color: #fff; font-size: 14px; padding: 4px; border-radius: 4px;");
        console.warn("Authentication will not work until you update services/authService.ts with your Firebase keys.");
    } else {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
    }
} catch (e) {
    console.error("Firebase Initialization Error. Check your config object in services/authService.ts", e);
}

// Helper to map Firebase User to App User
const mapUser = (fbUser: FirebaseUser): User => {
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
    if (!auth) throw new Error("Firebase not configured. Please see console for instructions.");
    try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        return mapUser(result.user);
    } catch (error: any) {
        if (error.code === 'auth/invalid-api-key') {
            throw new Error("Invalid Firebase API Key in authService.ts");
        }
        throw new Error(error.message || "Login failed");
    }
  },

  // Real Signup
  signup: async (name: string, email: string, password: string): Promise<User> => {
    if (!auth) throw new Error("Firebase not configured. Please see console for instructions.");
    try {
        const result = await createUserWithEmailAndPassword(auth, email, password);
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
      localStorage.removeItem('chronos_active_user'); 
  },

  // Subscribe to Auth State Changes
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

  // Simulated Payment
  upgradeToPremium: async (user: User): Promise<User> => {
      return new Promise((resolve) => {
          setTimeout(() => {
              const updatedUser = { ...user, isPremium: true };
              localStorage.setItem(`chronos_premium_${user.email}`, 'true');
              resolve(updatedUser);
          }, 1500);
      });
  },

  getCurrentUser: (): User | null => {
      if (auth?.currentUser) {
          return mapUser(auth.currentUser);
      }
      return null;
  }
};
