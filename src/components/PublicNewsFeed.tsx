import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { NewsItem } from '../types';
import { Newspaper, Calendar, Megaphone, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function PublicNewsFeed() {
  const [publicNews, setPublicNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'news'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as NewsItem[];
      
      const filtered = items.filter(item => item.audience === 'public');
      setPublicNews(filtered);
      setLoading(false);
    }, (error) => {
      console.warn('Error fetching public news:', error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-neon-cyan" />
        <p className="text-xs font-black text-stone-500 uppercase tracking-widest">Loading Public Announcements...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Banner */}
      <div className="text-center space-y-3 relative">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 shadow-[0_0_30px_rgba(0,229,255,0.2)] mb-1">
          <Megaphone className="w-8 h-8 text-neon-cyan animate-pulse" />
        </div>
        <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">
          PUBLIC ANNOUNCEMENTS
        </h2>
        <div className="flex items-center justify-center gap-2 text-[10px] font-black text-stone-400 uppercase tracking-[0.3em]">
          <Sparkles className="w-3.5 h-3.5 text-neon-cyan" />
          <span>Ingibi High School Public News Feed</span>
        </div>
      </div>

      {/* News Feed List */}
      {publicNews.length === 0 ? (
        <div className="bg-black/60 rounded-3xl p-12 text-center border border-white/10 space-y-3 backdrop-blur-md shadow-2xl">
          <Newspaper className="w-12 h-12 text-stone-700 mx-auto opacity-40" />
          <h3 className="text-sm font-black uppercase text-stone-400 tracking-wider">No Public Announcements</h3>
          <p className="text-xs font-semibold text-stone-600 max-w-sm mx-auto">
            Public news items published by the Principal will appear here for students, parents, and visitors.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {publicNews.map((item, index) => (
            <motion.article 
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              className="bg-black/60 border border-white/10 rounded-3xl overflow-hidden backdrop-blur-md hover:border-neon-cyan/30 transition-all shadow-xl group"
            >
              {item.imageUrl && (
                <div 
                  className="relative h-64 sm:h-80 w-full overflow-hidden bg-black cursor-pointer group/img"
                  onClick={() => setSelectedImage(item.imageUrl || null)}
                >
                  <img 
                    src={item.imageUrl} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80" />
                  <span className="absolute bottom-4 right-4 px-3 py-1 bg-black/70 backdrop-blur-md border border-white/20 rounded-xl text-[9px] font-black text-stone-300 uppercase tracking-widest">
                    Click to view image
                  </span>
                </div>
              )}

              <div className="p-6 sm:p-8 space-y-4">
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                  <span className="px-3 py-1 bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-[9px] font-black rounded-full uppercase tracking-widest">
                    Public News
                  </span>
                  <div className="flex items-center gap-1.5 text-stone-400 text-[10px] font-black uppercase tracking-wider">
                    <Calendar className="w-3.5 h-3.5 text-neon-cyan" />
                    <span>{new Date(item.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>

                <h3 className="text-xl sm:text-2xl font-black italic uppercase text-white tracking-tight group-hover:text-neon-cyan transition-colors">
                  {item.title}
                </h3>

                <p className="text-sm font-medium text-stone-300 leading-relaxed whitespace-pre-line">
                  {item.content}
                </p>
              </div>
            </motion.article>
          ))}
        </div>
      )}

      {/* Image Lightbox Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedImage(null)}
            className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-lg flex items-center justify-center p-4 cursor-pointer"
          >
            <motion.img 
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={selectedImage} 
              alt="Expanded view" 
              className="max-w-full max-h-[90vh] rounded-2xl object-contain border border-white/20 shadow-2xl"
              referrerPolicy="no-referrer"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
