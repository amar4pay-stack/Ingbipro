import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { ArrowRight, Loader2 } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { motion } from 'motion/react';

export default function TeacherOnboarding({ user }: { user: UserProfile }) {
  const [fullName, setFullName] = useState(user.displayName || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: fullName,
        onboarded: true // Internal flag to track if they filled the form
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center p-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white/5 rounded-[2.5rem] shadow-2xl overflow-hidden border border-white/10 backdrop-blur-xl"
      >
        <div className="aspect-video w-full relative">
          <img 
            src="https://picsum.photos/seed/onboarding/800/450?grayscale" 
            alt="Onboarding" 
            className="w-full h-full object-cover opacity-60"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-dark-bg via-dark-bg/20 to-transparent flex flex-col items-center justify-end pb-8">
            <p className="text-white text-[10px] font-black uppercase tracking-[0.5em] opacity-80 mb-2">FACULTY ONBOARDING</p>
            <div className="h-0.5 w-8 bg-neon-cyan mb-4"></div>
          </div>
        </div>
        <div className="p-10 text-center">
          <header className="mb-10">
            <h1 className="text-3xl font-black italic uppercase tracking-tighter text-white leading-none">Complete Profile</h1>
            <p className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mt-2 italic">Professional Identity</p>
          </header>
          
          <p className="text-stone-400 text-sm mb-10 font-medium leading-relaxed">
            Welcome to the faculty! Please provide your full professional name to continue to the approval process.
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="text-left">
              <label className="block text-[10px] font-black text-stone-500 uppercase tracking-widest mb-2 ml-4">FULL NAME</label>
              <input 
                type="text" 
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="E.G. DR. JANE SMITH"
                className="w-full px-6 py-5 bg-stone-50 border border-stone-100 rounded-[1.5rem] text-black font-black placeholder:text-stone-300 focus:ring-4 focus:ring-neon-cyan/5 focus:border-neon-cyan outline-none transition-all"
              />
            </div>
            <button 
              disabled={loading || !fullName}
              className="w-full bg-neon-blue text-white py-5 rounded-[1.5rem] font-black uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-neon-blue/90 transition-all disabled:opacity-50 shadow-lg shadow-neon-blue/20"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : (
                <>
                  SUBMIT PROFILE <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
