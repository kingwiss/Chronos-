
import React, { useState } from 'react';
import { User } from '../types';
import { authService } from '../services/authService';

interface AuthScreenProps {
  onLogin: (user: User) => void;
  onClose?: () => void;
  mode?: 'auth' | 'premium'; // 'auth' = login/signup, 'premium' = upgrade paywall
  user?: User | null; // Needed for upgrade
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onLogin, onClose, mode = 'auth', user }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  
  // Forgot Password State
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
        let authenticatedUser: User;
        if (isLogin) {
            authenticatedUser = await authService.login(email, password);
        } else {
            authenticatedUser = await authService.signup(name, email, password);
        }
        onLogin(authenticatedUser);
    } catch (err) {
        setError('Invalid credentials. Password must be > 5 chars.');
    } finally {
        setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setIsLoading(true);
      try {
          await authService.requestPasswordReset(resetEmail);
          setResetSuccess(true);
      } catch (err: any) {
          setError(err.message || "Failed to send reset link.");
      } finally {
          setIsLoading(false);
      }
  };

  const handleSubscribe = async () => {
      if (!user) return;
      setIsLoading(true);
      try {
          const upgradedUser = await authService.upgradeToPremium(user);
          onLogin(upgradedUser); // Update app state
      } catch (e) {
          setError("Payment failed. Try again.");
      } finally {
          setIsLoading(false);
      }
  };

  const switchToLogin = () => {
      setIsForgotPassword(false);
      setResetSuccess(false);
      setResetEmail('');
      setError('');
      setIsLogin(true);
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 relative w-full h-full">
      {onClose && (
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-white/50 hover:bg-white rounded-full text-slate-500 transition-all z-20"
        >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      )}

      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8 z-10 animate-in fade-in zoom-in-95 duration-500">
        
        {/* --- PREMIUM UPGRADE MODE --- */}
        {mode === 'premium' ? (
            <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mb-6 shadow-xl shadow-indigo-200 animate-bounce">
                    <span className="text-4xl">👑</span>
                </div>
                <h1 className="text-2xl font-black text-slate-800 tracking-tight mb-2">Upgrade to Unlimited</h1>
                <p className="text-slate-500 mb-8">
                    You've hit your weekly limit of 5 smart actions. Unlock the full power of Chronos.
                </p>

                <div className="w-full bg-slate-50 border border-indigo-100 rounded-2xl p-6 mb-6">
                    <div className="flex items-baseline justify-center gap-1 mb-4">
                        <span className="text-4xl font-black text-slate-900">$6.99</span>
                        <span className="text-slate-500 font-medium">/month</span>
                    </div>
                    <ul className="space-y-3 text-left">
                        <li className="flex items-center gap-3 text-sm font-medium text-slate-700">
                            <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                            Unlimited AI Chat & Voice
                        </li>
                        <li className="flex items-center gap-3 text-sm font-medium text-slate-700">
                            <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                            Unlimited Step & Food Tracking
                        </li>
                        <li className="flex items-center gap-3 text-sm font-medium text-slate-700">
                            <svg className="w-5 h-5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                            Generate AI Illustrations
                        </li>
                    </ul>
                </div>

                <button 
                    onClick={handleSubscribe}
                    disabled={isLoading}
                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
                >
                    {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                    Subscribe Now
                </button>
                <button 
                    onClick={onClose}
                    className="mt-4 text-sm font-bold text-slate-400 hover:text-slate-600"
                >
                    Maybe Later
                </button>
            </div>
        ) : isForgotPassword ? (
            /* --- FORGOT PASSWORD MODE --- */
            <div className="flex flex-col items-center">
                 <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mb-6">
                    <svg className="w-8 h-8 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                 </div>
                 
                 {resetSuccess ? (
                     <div className="text-center animate-in fade-in slide-in-from-bottom-2">
                         <h2 className="text-2xl font-black text-slate-800 mb-2">Check your email</h2>
                         <p className="text-slate-500 mb-6">We've sent password reset instructions to <br/><span className="font-bold text-slate-700">{resetEmail}</span></p>
                         <button 
                            onClick={switchToLogin}
                            className="w-full py-3 bg-indigo-50 text-indigo-600 font-bold rounded-xl hover:bg-indigo-100 transition-colors"
                         >
                            Back to Log In
                         </button>
                     </div>
                 ) : (
                    <>
                        <h2 className="text-2xl font-black text-slate-800 mb-2">Reset Password</h2>
                        <p className="text-slate-500 mb-6 text-center text-sm">Enter the email associated with your account and we'll send you a link to reset your password.</p>
                        
                        <form onSubmit={handleResetSubmit} className="w-full space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Email</label>
                                <input 
                                    type="email" 
                                    value={resetEmail}
                                    onChange={e => setResetEmail(e.target.value)}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-700"
                                    placeholder="name@example.com"
                                    required
                                    autoFocus
                                />
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 text-red-600 text-sm font-medium rounded-xl flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    {error}
                                </div>
                            )}

                            <button 
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
                            >
                                {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                                Send Reset Link
                            </button>
                        </form>
                        <button 
                            onClick={switchToLogin}
                            className="mt-6 text-sm font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                            Back to Log In
                        </button>
                    </>
                 )}
            </div>
        ) : (
        /* --- AUTH LOGIN/SIGNUP MODE --- */
            <>
                <div className="flex flex-col items-center mb-6">
                    <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-200">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">Chronos</h1>
                    <p className="text-slate-400 font-medium mt-1">
                        {isLogin ? 'Welcome back' : 'Create your free account'}
                    </p>
                </div>

                {/* Free Plan Clarification */}
                {!isLogin && (
                    <div className="mb-6 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                        <h3 className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-2">Free Plan Includes:</h3>
                        <ul className="space-y-1 text-sm text-amber-700">
                            <li className="flex items-center gap-2">✔ Unlimited Text Notes</li>
                            <li className="flex items-center gap-2">
                                <span className="font-bold">⚠ 5 Smart Actions</span> per week
                            </li>
                        </ul>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                    <div className="space-y-1 animate-in slide-in-from-top-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Name</label>
                        <input 
                            type="text" 
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-700"
                            placeholder="Your name"
                            required
                        />
                    </div>
                )}

                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Email</label>
                    <input 
                        type="email" 
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-700"
                        placeholder="name@example.com"
                        required
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Password</label>
                    <input 
                        type="password" 
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-medium text-slate-700"
                        placeholder="••••••••"
                        required
                    />
                    {isLogin && (
                        <div className="flex justify-end pt-1">
                            <button 
                                type="button"
                                onClick={() => { setIsForgotPassword(true); setError(''); }}
                                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                                Forgot Password?
                            </button>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="p-3 bg-red-50 text-red-600 text-sm font-medium rounded-xl flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        {error}
                    </div>
                )}

                <button 
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2 mt-4"
                >
                    {isLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>}
                    {isLogin ? 'Sign In' : 'Create Free Account'}
                </button>
                </form>

                <div className="mt-8 text-center">
                    <p className="text-slate-500 text-sm">
                        {isLogin ? "Don't have an account? " : "Already have an account? "}
                        <button 
                        onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        className="font-bold text-indigo-600 hover:underline"
                        >
                            {isLogin ? 'Sign Up' : 'Log In'}
                        </button>
                    </p>
                </div>
            </>
        )}
      </div>
    </div>
  );
};

export default AuthScreen;
