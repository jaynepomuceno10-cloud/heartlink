'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Song {
  id: string;
  title: string;
  url: string;
}

interface Post {
  id: string;
  sender: string;
  image: string;
  caption: string;
  date: string;
}

interface ScheduleItem {
  id: string;
  title: string;
  time: string;
  sign: string;
}

interface Message {
  sender: string;
  text: string;
  timestamp: number;
}

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [coupleCodeInput, setCoupleCodeInput] = useState('');
  const [myCoupleCode, setMyCoupleCode] = useState('');
  const [isPaired, setIsPaired] = useState(false);
  const [pairingAction, setPairingAction] = useState<'enter' | null>(null);
  const [loading, setLoading] = useState(false);

  // Active Tab state
  const [activeTab, setActiveTab] = useState('taps');
  
  const [tapMeanings, setTapMeanings] = useState({
    tap1: 'I miss you',
    tap2: 'I need you',
    tap3: 'I love you',
    hold5s: "I'm so sorry"
  });
  const [showSettings, setShowSettings] = useState(false);
  const [tempMeanings, setTempMeanings] = useState(tapMeanings);

  const [tapCount, setTapCount] = useState(0);
  const [lastReceived, setLastReceived] = useState('');
  const [isHolding, setIsHolding] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Moments States
  const [posts, setPosts] = useState<Post[]>([]);
  const [postCaption, setPostCaption] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Music Portal States
  const [playlist, setPlaylist] = useState<Song[]>([]);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSyncedMusic, setIsSyncedMusic] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);
  const musicInputRef = useRef<HTMLInputElement>(null);

  // Schedule & Milestones States
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newSign, setNewSign] = useState('📌');
  const [relationshipStartDate, setRelationshipStartDate] = useState('2026-05-23');
  const [relTimeText, setRelTimeText] = useState('');

  // Wallpaper, Map Avatars & Telemetry States
  const [sharedBgImage, setSharedBgImage] = useState('');
  const [batteryLevel, setBatteryLevel] = useState(85);
  const [distanceKm, setDistanceKm] = useState('10,240 km');
  const [partnerLocalTime, setPartnerLocalTime] = useState('');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);

  const ROOM_NAME = myCoupleCode ? `room-${myCoupleCode}` : 'heartlink-default';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.email) checkCoupleStatus(session.user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.email) checkCoupleStatus(session.user.email);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const updateTimer = () => {
      try {
        const swedenTime = new Date().toLocaleTimeString('en-US', {
          timeZone: 'Europe/Stockholm',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true
        });
        setPartnerLocalTime(swedenTime);
      } catch (e) {
        setPartnerLocalTime('Sweden Time Active');
      }

      try {
        const now = new Date();
        const start = new Date(relationshipStartDate);
        const diffTime = Math.abs(now.getTime() - start.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const months = Math.floor(diffDays / 30);
        const days = diffDays % 30;
        setRelTimeText(`${months} Months, ${days} Days`);

        if (now.getDate() === 23 && now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() === 0) {
          if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 500]);
          alert("❤️ Happy Monthsary! Another month of long-distance love!");
        }
      } catch (e) {
        setRelTimeText('Calculating...');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [relationshipStartDate]);

  useEffect(() => {
    if (activeTab === 'chat') {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  useEffect(() => {
    if (activeTab !== 'location' || !mapContainerRef.current) return;

    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const loadLeafletScript = () => {
      if ((window as any).L) {
        initStreetViewMap();
      } else {
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.onload = () => initStreetViewMap();
        document.body.appendChild(script);
      }
    };

    const initStreetViewMap = () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
      }

      const L = (window as any).L;
      const phCoords = [14.1102, 121.1413];
      const seCoords = [56.5517, 14.1384];

      const map = L.map(mapContainerRef.current!, {
        zoomControl: false,
        attributionControl: false
      }).setView([14.1102, 121.1413], 12);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      const createPinHtml = (label: string, color: string, subText: string) => `
        <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
          <span style="background: #101625; color: ${color}; font-size: 10px; font-weight: bold; padding: 2px 8px; border-radius: 12px; border: 1px solid ${color}; box-shadow: 0 4px 10px rgba(0,0,0,0.5); white-space: nowrap; margin-bottom: 2px;">
            ${subText}
          </span>
          <div style="width: 42px; height: 42px; border-radius: 50%; background: ${color}; color: white; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; border: 3px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
            ${label}
          </div>
        </div>
      `;

      const phIcon = L.divIcon({
        className: 'custom-ph-pin',
        html: createPinHtml('JAY', '#ec4899', `⚡ ${batteryLevel}% (You)`),
        iconSize: [60, 70],
        iconAnchor: [30, 35]
      });

      const seIcon = L.divIcon({
        className: 'custom-se-pin',
        html: createPinHtml('GF', '#a855f7', `🕒 ${partnerLocalTime || 'Sweden'}`),
        iconSize: [60, 70],
        iconAnchor: [30, 35]
      });

      L.marker(phCoords, { icon: phIcon }).addTo(map).bindPopup("<b>Jay</b><br>Sto. Tomas, Batangas, Philippines");
      L.marker(seCoords, { icon: seIcon }).addTo(map).bindPopup("<b>Partner</b><br>Sweden");

      leafletMapRef.current = map;
    };

    loadLeafletScript();
  }, [activeTab, batteryLevel, partnerLocalTime]);

  const checkCoupleStatus = async (userEmail: string) => {
    const { data } = await supabase
      .from('couples')
      .select('*')
      .or(`user1_email.eq.${userEmail},user2_email.eq.${userEmail}`)
      .single();

    if (data) {
      setMyCoupleCode(data.couple_code);
      setIsPaired(true);
    } else {
      setIsPaired(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    if (authMode === 'register') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        alert(error.message);
      } else {
        alert('Account created successfully! Please check your Gmail inbox to confirm your email before signing in.');
        setAuthMode('login');
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        alert(error.message);
      }
    }
    setLoading(false);
  };

  const generateNewCode = async () => {
    if (!session?.user?.email) return;
    setLoading(true);
    const generatedCode = 'HL-' + Math.floor(1000 + Math.random() * 9000);
    
    await supabase.from('couples').upsert([
      { couple_code: generatedCode, user1_email: session.user.email }
    ], { onConflict: 'user1_email' });

    setMyCoupleCode(generatedCode);
    setLoading(false);
    alert(`Your Couple Code is: ${generatedCode}. Share this with your partner!`);
  };

  const handlePairingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email) return;
    setLoading(true);

    const cleanCode = coupleCodeInput.trim().toUpperCase();

    const { data, error } = await supabase
      .from('couples')
      .select('*')
      .eq('couple_code', cleanCode)
      .single();

    if (error || !data) {
      alert('Couple Code not found. Please ask your partner to generate one first!');
    } else {
      await supabase
        .from('couples')
        .update({ user2_email: session.user.email })
        .eq('couple_code', cleanCode);

      setMyCoupleCode(cleanCode);
      setIsPaired(true);
      setShowSettings(false);
      alert('Successfully paired with your partner! ❤️');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isPaired || !myCoupleCode) return;

    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((bat: any) => {
        setBatteryLevel(Math.round(bat.level * 100));
        bat.addEventListener('levelchange', () => {
          setBatteryLevel(Math.round(bat.level * 100));
        });
      });
    }

    const channel = supabase.channel(ROOM_NAME);

    channel
      .on('broadcast', { event: 'HEARTLINK_PAYLOAD' }, (payload: any) => {
        const { type, data } = payload.payload;

        if (type === 'TOUCH' || type === 'SORRY') {
          setLastReceived(data.message);
          triggerHapticPattern(data.hapticType);
          setMessages((prev) => [...prev, { sender: 'Partner', text: data.message, timestamp: Date.now() }]);
        } else if (type === 'CHAT') {
          setMessages((prev) => [...prev, data]);
          if ('vibrate' in navigator) navigator.vibrate(100);
        } else if (type === 'POST') {
          setPosts((prev) => [data, ...prev]);
        } else if (type === 'DELETE_POST') {
          setPosts((prev) => prev.filter((p) => p.id !== data.id));
        } else if (type === 'MUSIC_UPLOAD') {
          setPlaylist((prev) => [...prev, data]);
        } else if (type === 'MUSIC_DELETE') {
          setPlaylist((prev) => prev.filter((s) => s.id !== data.id));
        } else if (type === 'MUSIC_SYNC' && isSyncedMusic) {
          setCurrentSong(data.song);
          setIsPlaying(data.isPlaying);
          if (audioRef.current) {
            if (data.isPlaying) audioRef.current.play().catch(() => {});
            else audioRef.current.pause();
          }
        } else if (type === 'SCHEDULE') {
          setSchedules((prev) => [...prev, data]);
        } else if (type === 'DELETE_SCHEDULE') {
          setSchedules((prev) => prev.filter((s) => s.id !== data.id));
        } else if (type === 'SETTINGS') {
          setTapMeanings(data);
        } else if (type === 'WALLPAPER') {
          setSharedBgImage(data.image);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isPaired, myCoupleCode, isSyncedMusic]);

  const triggerHapticPattern = (type: string) => {
    if (!('vibrate' in navigator)) return;
    switch (type) {
      case 'MISS_YOU': navigator.vibrate([200]); break;
      case 'NEED_YOU': navigator.vibrate([150, 100, 150]); break;
      case 'LOVE_YOU': navigator.vibrate([100, 80, 100, 80, 300]); break;
      case 'SORRY': navigator.vibrate([500, 200, 500, 200, 500]); break;
      default: navigator.vibrate([100]);
    }
  };

  const sendPayload = async (type: string, hapticType: string, message: string) => {
    const channel = supabase.channel(ROOM_NAME);
    const newMsg = { sender: 'You', text: message, timestamp: Date.now() };

    await channel.send({
      type: 'broadcast',
      event: 'HEARTLINK_PAYLOAD',
      payload: { type, data: { hapticType, message, timestamp: Date.now() } },
    });

    setMessages((prev) => [...prev, newMsg]);
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const newMsg = { sender: 'You', text: inputMessage, timestamp: Date.now() };
    const channel = supabase.channel(ROOM_NAME);
    await channel.send({
      type: 'broadcast',
      event: 'HEARTLINK_PAYLOAD',
      payload: { type: 'CHAT', data: { sender: 'Partner', text: inputMessage, timestamp: Date.now() } },
    });

    setMessages((prev) => [...prev, newMsg]);
    setInputMessage('');
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setImagePreview(URL.createObjectURL(file));
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postCaption.trim() && !imagePreview) return;

    const now = new Date();
    const formattedDate = `${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;

    const newPost: Post = {
      id: Date.now().toString(),
      sender: 'You',
      image: imagePreview || 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&auto=format&fit=crop&q=60',
      caption: postCaption,
      date: formattedDate
    };

    const channel = supabase.channel(ROOM_NAME);
    await channel.send({
      type: 'broadcast',
      event: 'HEARTLINK_PAYLOAD',
      payload: { type: 'POST', data: { ...newPost, sender: 'Partner' } },
    });

    setPosts((prev) => [newPost, ...prev]);
    setPostCaption('');
    setImagePreview('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeletePost = async (postId: string) => {
    const channel = supabase.channel(ROOM_NAME);
    await channel.send({
      type: 'broadcast',
      event: 'HEARTLINK_PAYLOAD',
      payload: { type: 'DELETE_POST', data: { id: postId } },
    });

    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const handleWallpaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (uploadEvent) => {
        const base64Image = uploadEvent.target?.result as string;
        setSharedBgImage(base64Image);

        const channel = supabase.channel(ROOM_NAME);
        await channel.send({
          type: 'broadcast',
          event: 'HEARTLINK_PAYLOAD',
          payload: { type: 'WALLPAPER', data: { image: base64Image } }
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const songData: Song = {
        id: Date.now().toString(),
        title: file.name.replace(/\.[^/.]+$/, ""),
        url: URL.createObjectURL(file)
      };

      const channel = supabase.channel(ROOM_NAME);
      channel.send({
        type: 'broadcast',
        event: 'HEARTLINK_PAYLOAD',
        payload: { type: 'MUSIC_UPLOAD', data: songData }
      });

      setPlaylist((prev) => [...prev, songData]);
      if (musicInputRef.current) musicInputRef.current.value = '';
    }
  };

  const handleDeleteSong = async (songId: string) => {
    const channel = supabase.channel(ROOM_NAME);
    await channel.send({
      type: 'broadcast',
      event: 'HEARTLINK_PAYLOAD',
      payload: { type: 'MUSIC_DELETE', data: { id: songId } }
    });

    setPlaylist((prev) => prev.filter((s) => s.id !== songId));
    if (currentSong?.id === songId) {
      setCurrentSong(null);
      setIsPlaying(false);
      if (audioRef.current) audioRef.current.pause();
    }
  };

  const playSong = async (song: Song) => {
    setCurrentSong(song);
    setIsPlaying(true);
    if (audioRef.current) {
      audioRef.current.src = song.url;
      audioRef.current.play().catch(() => {});
    }

    if (isSyncedMusic) {
      const channel = supabase.channel(ROOM_NAME);
      await channel.send({
        type: 'broadcast',
        event: 'HEARTLINK_PAYLOAD',
        payload: { type: 'MUSIC_SYNC', data: { song, isPlaying: true } }
      });
    }
  };

  const togglePlayPause = async () => {
    if (!currentSong && playlist.length > 0) {
      playSong(playlist[0]);
      return;
    }
    const newPlayingState = !isPlaying;
    setIsPlaying(newPlayingState);

    if (audioRef.current) {
      if (newPlayingState) audioRef.current.play().catch(() => {});
      else audioRef.current.pause();
    }

    if (isSyncedMusic) {
      const channel = supabase.channel(ROOM_NAME);
      await channel.send({
        type: 'broadcast',
        event: 'HEARTLINK_PAYLOAD',
        payload: { type: 'MUSIC_SYNC', data: { song: currentSong, isPlaying: newPlayingState } }
      });
    }
  };

  const handleTap = () => {
    if ('vibrate' in navigator) navigator.vibrate(40);
    setTapCount((prev) => {
      const newCount = prev + 1;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (newCount === 1) sendPayload('TOUCH', 'MISS_YOU', `❤️ Sent 1 Tap: ${tapMeanings.tap1}`);
        else if (newCount === 2) sendPayload('TOUCH', 'NEED_YOU', `🥺 Sent 2 Taps: ${tapMeanings.tap2}`);
        else if (newCount >= 3) sendPayload('TOUCH', 'LOVE_YOU', `💖 Sent 3 Taps: ${tapMeanings.tap3}`);
        setTapCount(0);
      }, 350);
      return newCount;
    });
  };

  const handleTouchStart = () => {
    setIsHolding(true);
    holdTimerRef.current = setTimeout(() => {
      if ('vibrate' in navigator) navigator.vibrate([400, 200, 400]);
      sendPayload('SORRY', 'SORRY', `💔 Sent Hold 5s: ${tapMeanings.hold5s}`);
      setIsHolding(false);
    }, 5000);
  };

  const handleTouchEnd = () => {
    setIsHolding(false);
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
  };

  const saveSettings = async () => {
    setTapMeanings(tempMeanings);
    setShowSettings(false);

    const channel = supabase.channel(ROOM_NAME);
    await channel.send({
      type: 'broadcast',
      event: 'HEARTLINK_PAYLOAD',
      payload: { type: 'SETTINGS', data: tempMeanings },
    });
  };

  const addSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newTime) return;

    const schedItem: ScheduleItem = {
      id: Date.now().toString(),
      title: newTitle,
      time: newTime,
      sign: newSign,
    };

    const channel = supabase.channel(ROOM_NAME);
    await channel.send({
      type: 'broadcast',
      event: 'HEARTLINK_PAYLOAD',
      payload: { type: 'SCHEDULE', data: schedItem },
    });

    setSchedules((prev) => [...prev, schedItem]);
    setNewTitle('');
    setNewTime('');
  };

  const handleDeleteSchedule = async (schedId: string) => {
    const channel = supabase.channel(ROOM_NAME);
    await channel.send({
      type: 'broadcast',
      event: 'HEARTLINK_PAYLOAD',
      payload: { type: 'DELETE_SCHEDULE', data: { id: schedId } },
    });

    setSchedules((prev) => prev.filter((s) => s.id !== schedId));
  };

  if (!session) {
    return (
      <main className="h-[100dvh] w-full bg-[#080c14] text-white flex items-center justify-center p-4 font-sans select-none overflow-y-auto">
        <div className="w-full max-w-sm space-y-6 bg-[#101625] p-6 rounded-3xl border border-slate-800 shadow-2xl">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-400">
              HEARTLINK
            </h1>
            <p className="text-xs text-slate-400">
              {authMode === 'login' ? 'Sign In to your sanctuary' : 'Create your account'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-3 text-xs">
            <div>
              <label className="text-slate-400 block mb-1 font-medium">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-pink-500 text-sm"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1 font-medium">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-pink-500 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-rose-600 to-pink-500 text-white py-3.5 rounded-xl font-bold text-xs shadow-lg shadow-pink-500/20 active:scale-95 transition mt-2 cursor-pointer"
            >
              {loading ? 'Processing...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="text-center pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="text-xs text-pink-400 font-bold hover:text-pink-300 py-3 px-6 w-full cursor-pointer bg-transparent border-0 outline-none"
            >
              {authMode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main 
      className="h-[100dvh] w-full max-w-md mx-auto text-white flex flex-col justify-between overflow-hidden select-none font-sans relative bg-cover bg-center"
      style={{ backgroundImage: sharedBgImage ? `url(${sharedBgImage})` : 'none', backgroundColor: '#080c14' }}
    >
      {sharedBgImage && <div className="absolute inset-0 bg-[#080c14]/80 pointer-events-none z-0"></div>}

      <audio ref={audioRef} onEnded={() => setIsPlaying(false)} />

      {/* 1. FIXED TOP HEADER BAR */}
      <div className="w-full bg-[#101625]/90 backdrop-blur-md border-b border-slate-800 px-5 py-3.5 flex justify-between items-center shadow-md z-20 shrink-0 h-14">
        <h1 className="font-extrabold text-xl tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-rose-500 to-pink-400">HEARTLINK</h1>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1.5 border ${
            isPaired ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
          }`}>
            <span className={`w-2 h-2 rounded-full animate-pulse ${isPaired ? 'bg-emerald-500' : 'bg-amber-500'}`}></span> 
            {isPaired ? 'Connected' : 'Unpaired'}
          </span>
          <button
            onClick={() => { setTempMeanings(tapMeanings); setShowSettings(true); }}
            className="text-slate-400 hover:text-pink-400 text-lg transition p-1 cursor-pointer"
            title="Settings"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* 2. FIXED MIDDLE VIEWPORT CONTAINER */}
      <div className="flex-1 w-full overflow-hidden relative flex flex-col z-10">
        
        {/* TAB 1: TAPS */}
        {activeTab === 'taps' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-5 overflow-y-auto space-y-8">
            <div className="h-12 flex items-center justify-center text-center">
              {lastReceived ? (
                <div className="animate-bounce bg-pink-500/10 border border-pink-500/30 text-pink-300 px-6 py-2 rounded-full text-xs font-semibold shadow-lg">
                  Received: {lastReceived}
                </div>
              ) : null}
            </div>

            <div className="relative flex flex-col items-center justify-center">
              <div className="absolute w-60 h-60 bg-rose-600/20 rounded-full blur-2xl animate-pulse"></div>
              <button
                onClick={handleTap}
                onMouseDown={handleTouchStart}
                onMouseUp={handleTouchEnd}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                className={`relative w-52 h-52 rounded-full bg-gradient-to-tr from-rose-600 via-pink-500 to-rose-400 shadow-2xl shadow-rose-600/50 active:scale-90 transition-all duration-150 flex flex-col items-center justify-center outline-none border-4 cursor-pointer ${
                  isHolding ? 'border-amber-400 animate-pulse scale-95' : 'border-white/20'
                }`}
              >
                <span className="text-6xl drop-shadow-lg">❤️</span>
                <span className="text-xs font-bold mt-2 tracking-widest text-white/90">TAP</span>
              </button>

              {isHolding && (
                <span className="absolute -bottom-8 text-xs text-amber-400 font-semibold tracking-wide animate-pulse">
                  Sending Apology Signal... (5s)
                </span>
              )}

              {tapCount > 0 && (
                <span className="absolute top-2 right-2 bg-white text-rose-600 font-extrabold w-10 h-10 rounded-full flex items-center justify-center text-base shadow-xl animate-ping">
                  {tapCount}
                </span>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CHAT */}
        {activeTab === 'chat' && (
          <div className="absolute inset-0 flex flex-col justify-between overflow-hidden pb-16">
            <div className="flex-1 overflow-y-auto space-y-3 p-4">
              {messages.length === 0 ? (
                <p className="text-center text-slate-500 text-xs italic mt-20">No messages or signals recorded yet.</p>
              ) : (
                messages.map((msg, index) => {
                  const isMe = msg.sender === 'You';
                  return (
                    <div key={index} className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                      {!isMe && (
                        <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center text-[10px] font-bold text-white shadow shrink-0">
                          GF
                        </div>
                      )}
                      <div className={`px-4 py-2.5 rounded-3xl text-xs max-w-[75%] shadow-md break-words ${
                        isMe 
                          ? 'bg-blue-600 text-white rounded-br-sm' 
                          : 'bg-[#1e293b] text-slate-200 rounded-bl-sm border border-slate-700/50'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatBottomRef} />
            </div>

            <form onSubmit={sendChatMessage} className="absolute bottom-2 left-3 right-3 bg-[#101625]/90 border border-slate-800 p-2 rounded-full flex items-center gap-2 shadow-2xl z-10">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Message..."
                className="flex-1 bg-[#080c14] border border-slate-800 rounded-full px-4 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500 transition"
              />
              <button type="submit" className="bg-blue-600 text-white w-9 h-9 rounded-full flex items-center justify-center hover:bg-blue-500 transition shadow-md shrink-0 cursor-pointer">
                ➤
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: MOMENTS */}
        {activeTab === 'moments' && (
          <div className="absolute inset-0 flex flex-col justify-between p-4 overflow-hidden">
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 pb-2">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Our Day Moments & Memories</h2>
              
              {posts.length === 0 ? (
                <p className="text-slate-500 text-xs italic text-center py-10">No moments posted yet. Select a photo from your gallery!</p>
              ) : (
                posts.map((post) => (
                  <div key={post.id} className="bg-[#101625]/90 border border-slate-800 rounded-2xl overflow-hidden shadow-md space-y-2 pb-3">
                    <div className="flex justify-between items-center px-4 pt-3">
                      <span className="text-[11px] font-bold text-pink-400">{post.sender}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-medium">{post.date}</span>
                        <button
                          onClick={() => handleDeletePost(post.id)}
                          className="text-slate-500 hover:text-rose-400 text-xs transition px-1 cursor-pointer"
                          title="Delete Post"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    {post.image && (
                      <div className="w-full h-48 bg-slate-900 overflow-hidden flex items-center justify-center">
                        <img src={post.image} alt="Moment" className="w-full h-full object-cover" />
                      </div>
                    )}
                    {post.caption && (
                      <p className="text-xs text-slate-200 px-4 pt-1 leading-relaxed">{post.caption}</p>
                    )}
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleCreatePost} className="bg-[#101625]/90 backdrop-blur-md border border-slate-800 p-3 rounded-2xl space-y-2.5 shrink-0 shadow-md">
              <div className="flex justify-between items-center">
                <p className="text-[11px] font-semibold text-slate-300">Upload from Gallery</p>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleImageSelect}
                  className="text-[10px] text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-semibold file:bg-pink-600 file:text-white hover:file:bg-pink-500 file:cursor-pointer"
                />
              </div>

              {imagePreview && (
                <div className="relative w-full h-16 bg-slate-900 rounded-xl overflow-hidden border border-slate-700 flex items-center justify-center">
                  <img src={imagePreview} alt="Preview" className="h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImagePreview('')}
                    className="absolute top-1 right-1 bg-black/70 text-white rounded-full w-4 h-4 text-[9px] flex items-center justify-center cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={postCaption}
                  onChange={(e) => setPostCaption(e.target.value)}
                  placeholder="Write a caption..."
                  className="flex-1 bg-[#080c14] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                />
                <button type="submit" className="bg-pink-600 text-white px-4 rounded-xl font-semibold text-xs hover:bg-pink-500 transition shadow-md cursor-pointer">
                  Post
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 4: LOCATION */}
        {activeTab === 'location' && (
          <div className="absolute inset-0 flex flex-col p-4 overflow-y-auto space-y-3">
            <div className="w-full bg-[#101625]/90 border border-slate-800 p-3 rounded-2xl flex justify-between items-center shadow-md shrink-0">
              <div>
                <p className="text-[10px] text-slate-400 font-medium">Distance Between</p>
                <p className="text-xs font-bold text-pink-400">📍 {distanceKm}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-medium">Sweden Local Time</p>
                <p className="text-xs font-bold text-purple-400">🕒 {partnerLocalTime || 'Loading...'}</p>
              </div>
            </div>

            <div className="relative w-full flex-1 min-h-[320px] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl z-0">
              <div ref={mapContainerRef} className="w-full h-full min-h-[320px]"></div>
              
              <p className="absolute bottom-2 left-2 z-[400] text-[9px] text-slate-700 font-semibold bg-white/90 px-2.5 py-1 rounded-full border border-slate-300 shadow">
                Life360 Street Map View
              </p>
            </div>
          </div>
        )}

        {/* TAB 5: MUSIC PORTAL */}
        {activeTab === 'music' && (
          <div className="absolute inset-0 flex flex-col justify-between p-4 overflow-hidden space-y-3">
            <div className="flex justify-between items-center bg-[#101625]/90 border border-slate-800 px-4 py-2.5 rounded-2xl shrink-0">
              <div>
                <p className="text-xs font-bold text-pink-400">🎵 Music Sync Room</p>
                <p className="text-[10px] text-slate-400">Shared couple radio station</p>
              </div>
              <button
                onClick={() => setIsSyncedMusic(!isSyncedMusic)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition cursor-pointer ${
                  isSyncedMusic ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                }`}
              >
                Sync: {isSyncedMusic ? 'ON 🟢' : 'OFF ⚪'}
              </button>
            </div>

            <div className="space-y-2 flex-1 overflow-y-auto pr-1">
              {playlist.length === 0 ? (
                <p className="text-slate-500 text-xs italic text-center py-8">No music uploaded yet. Upload your favorite songs!</p>
              ) : (
                playlist.map((song) => (
                  <div key={song.id} className={`bg-[#101625]/90 border p-3 rounded-2xl flex justify-between items-center shadow-md transition ${
                    currentSong?.id === song.id ? 'border-pink-500/80 bg-pink-500/5' : 'border-slate-800'
                  }`}>
                    <div className="flex items-center gap-3 overflow-hidden">
                      <button
                        onClick={() => playSong(song)}
                        className="w-8 h-8 rounded-full bg-pink-600 text-white flex items-center justify-center text-xs shrink-0 shadow cursor-pointer"
                      >
                        {currentSong?.id === song.id && isPlaying ? '⏸' : '▶'}
                      </button>
                      <p className="text-xs font-semibold truncate text-white">{song.title}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteSong(song.id)}
                      className="text-slate-500 hover:text-rose-400 text-xs transition px-2 cursor-pointer"
                      title="Delete Song"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="bg-[#101625]/90 backdrop-blur-md border border-slate-800 p-3 rounded-2xl space-y-2.5 shrink-0 shadow-md">
              {currentSong && (
                <div className="flex justify-between items-center bg-[#080c14] px-3 py-2 rounded-xl border border-slate-800">
                  <div className="overflow-hidden">
                    <p className="text-[10px] text-pink-400 font-semibold uppercase">Now Playing</p>
                    <p className="text-xs font-bold text-white truncate">{currentSong.title}</p>
                  </div>
                  <button
                    onClick={togglePlayPause}
                    className="bg-pink-600 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow cursor-pointer"
                  >
                    {isPlaying ? '⏸' : '▶'}
                  </button>
                </div>
              )}

              <div className="flex justify-between items-center pt-1">
                <span className="text-[11px] font-semibold text-slate-300">Add Audio File (MP3)</span>
                <input
                  type="file"
                  accept="audio/*"
                  ref={musicInputRef}
                  onChange={handleMusicUpload}
                  className="text-[10px] text-slate-400 file:mr-2 file:py-1 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-semibold file:bg-pink-600 file:text-white hover:file:bg-pink-500 file:cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: SCHEDULE & MILESTONES */}
        {activeTab === 'schedule' && (
          <div className="absolute inset-0 flex flex-col p-4 overflow-y-auto space-y-3">
            <div className="p-4 bg-gradient-to-br from-rose-950/80 to-[#101625] border border-rose-500/30 rounded-2xl shadow-md shrink-0">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-[10px] text-rose-400 font-semibold uppercase tracking-wider">Love Milestones Counter</p>
                  <h3 className="text-lg font-bold text-white mt-0.5">{relTimeText || 'Calculating...'}</h3>
                  <p className="text-[10px] text-slate-400 mt-1">Start Date: <span className="text-rose-300">{relationshipStartDate}</span></p>
                </div>
                <div className="w-10 h-10 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-500 text-lg animate-pulse">
                  ❤️
                </div>
              </div>
            </div>

            <form onSubmit={addSchedule} className="bg-[#101625]/90 border border-slate-800 p-3 rounded-2xl space-y-2.5 shrink-0 shadow-md">
              <p className="text-[11px] font-semibold text-slate-300">📅 Add Schedule / Haptic Alarm</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Event (e.g. Work, Flight, Sleep)"
                  className="flex-1 bg-[#080c14] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                />
                <select
                  value={newSign}
                  onChange={(e) => setNewSign(e.target.value)}
                  className="bg-[#080c14] border border-slate-800 rounded-xl px-2 text-xs text-white"
                >
                  <option value="📌">📌</option>
                  <option value="💼">💼</option>
                  <option value="✈️">✈️</option>
                  <option value="🌙">🌙</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="flex-1 bg-[#080c14] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                />
                <button type="submit" className="bg-pink-600 text-white px-4 rounded-xl font-semibold text-xs hover:bg-pink-500 transition cursor-pointer">
                  Save
                </button>
              </div>
            </form>

            <div className="space-y-2 flex-1 overflow-y-auto pr-1 pb-16">
              <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Shared Schedule List</h3>
              {schedules.length === 0 ? (
                <p className="text-slate-500 text-xs italic text-center py-6">No scheduled events yet.</p>
              ) : (
                schedules.map((item) => (
                  <div key={item.id} className="bg-[#101625]/90 border border-slate-800 p-3 rounded-2xl flex justify-between items-center shadow-md">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{item.sign}</span>
                      <div>
                        <p className="text-xs font-bold text-white">{item.title}</p>
                        <p className="text-[10px] text-slate-400">{new Date(item.time).toLocaleString()}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteSchedule(item.id)}
                      className="text-slate-500 hover:text-rose-400 text-xs transition px-2 cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

      </div>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="absolute inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-md">
          <div className="bg-[#101625] border border-slate-700 w-full max-w-sm rounded-3xl p-5 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-pink-400">⚙️ Settings & Customization</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white text-sm font-bold cursor-pointer">✕</button>
            </div>

            <div className="bg-[#080c14] border border-slate-800 p-4 rounded-2xl space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-pink-400">🖼️ Live Shared Wallpaper</p>
                  <p className="text-[10px] text-slate-400">Sync background photo across devices</p>
                </div>
                <label className="px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white text-[10px] font-semibold rounded-xl cursor-pointer transition">
                  Change BG
                  <input type="file" accept="image/*" onChange={handleWallpaperUpload} className="hidden" />
                </label>
              </div>
            </div>

            <div className="bg-[#080c14] border border-slate-800 p-4 rounded-2xl space-y-3">
              <p className="text-xs font-bold text-pink-400">🔗 Couple Pairing Connection</p>
              
              {!pairingAction ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-400">Connect with your partner to sync taps and location.</p>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={generateNewCode}
                      disabled={loading}
                      className="flex-1 bg-pink-600 text-white py-2.5 rounded-xl font-semibold text-xs hover:bg-pink-500 transition shadow-md cursor-pointer"
                    >
                      Generate Code (Send)
                    </button>
                    <button
                      onClick={() => setPairingAction('enter')}
                      className="flex-1 bg-slate-800 text-slate-200 py-2.5 rounded-xl font-semibold text-xs hover:bg-slate-700 transition cursor-pointer"
                    >
                      Enter Code (Receive)
                    </button>
                  </div>
                </div>
              ) : pairingAction === 'enter' ? (
                <form onSubmit={handlePairingSubmit} className="space-y-2 pt-1">
                  <p className="text-[11px] text-slate-400">Enter your partner's code below:</p>
                  <input
                    type="text"
                    required
                    value={coupleCodeInput}
                    onChange={(e) => setCoupleCodeInput(e.target.value.toUpperCase())}
                    placeholder="e.g. HL-1234"
                    className="w-full bg-[#101625] border border-slate-800 rounded-xl px-3 py-2 text-center text-xs font-bold text-white focus:outline-none focus:border-pink-500 tracking-wider"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPairingAction(null)}
                      className="flex-1 bg-slate-800 text-slate-300 py-2 rounded-xl text-xs font-medium cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 bg-pink-600 text-white py-2 rounded-xl font-semibold text-xs hover:bg-pink-500 transition cursor-pointer"
                    >
                      Connect
                    </button>
                  </div>
                </form>
              ) : null}

              {myCoupleCode && (
                <div className="text-center pt-2 border-t border-slate-800/80">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Your Active Couple Code</p>
                  <p className="text-xl font-black text-rose-500 tracking-widest mt-0.5">{myCoupleCode}</p>
                </div>
              )}
            </div>

            <div className="bg-[#080c14] border border-slate-800 p-4 rounded-2xl space-y-2">
              <p className="text-xs font-bold text-pink-400">📅 Relationship Start Date</p>
              <input
                type="date"
                value={relationshipStartDate}
                onChange={(e) => setRelationshipStartDate(e.target.value)}
                className="w-full bg-[#101625] border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
            </div>

            <div className="space-y-3 text-xs pt-1 border-t border-slate-800">
              <p className="text-xs font-bold text-slate-300 pt-1">💬 Customize Tap Signals</p>
              <div>
                <label className="text-slate-400 block mb-1 font-medium">1 Tap Signal:</label>
                <input
                  type="text"
                  value={tempMeanings.tap1}
                  onChange={(e) => setTempMeanings({...tempMeanings, tap1: e.target.value})}
                  className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 font-medium">2 Taps Signal:</label>
                <input
                  type="text"
                  value={tempMeanings.tap2}
                  onChange={(e) => setTempMeanings({...tempMeanings, tap2: e.target.value})}
                  className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 font-medium">3 Taps Signal:</label>
                <input
                  type="text"
                  value={tempMeanings.tap3}
                  onChange={(e) => setTempMeanings({...tempMeanings, tap3: e.target.value})}
                  className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1 font-medium">Hold (5s) Signal:</label>
                <input
                  type="text"
                  value={tempMeanings.hold5s}
                  onChange={(e) => setTempMeanings({...tempMeanings, hold5s: e.target.value})}
                  className="w-full bg-[#080c14] border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-pink-500"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => supabase.auth.signOut()}
                className="w-full bg-slate-800 text-slate-400 py-2.5 rounded-xl text-xs font-semibold hover:text-rose-400 transition mb-2 cursor-pointer"
              >
                Sign Out Account
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 bg-slate-800 text-slate-300 py-2.5 rounded-xl font-medium text-xs hover:bg-slate-700 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                className="flex-1 bg-pink-600 text-white py-2.5 rounded-xl font-semibold text-xs hover:bg-pink-500 transition shadow-md cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. FIXED BOTTOM NAVIGATION BAR (6 TABS) */}
      <div className="w-full bg-[#101625]/90 backdrop-blur-md border-t border-slate-800 py-2 px-3 flex justify-between items-center z-20 shrink-0 h-16 shadow-2xl">
        <button
          onClick={() => setActiveTab('taps')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ${activeTab === 'taps' ? 'text-pink-500 scale-105' : 'text-slate-400'}`}
        >
          <span className="text-base">❤️</span>
          <span className="text-[9px] font-semibold">Taps</span>
        </button>

        <button
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ${activeTab === 'chat' ? 'text-pink-500 scale-105' : 'text-slate-400'}`}
        >
          <span className="text-base">💬</span>
          <span className="text-[9px] font-semibold">Chat</span>
        </button>

        <button
          onClick={() => setActiveTab('moments')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ${activeTab === 'moments' ? 'text-pink-500 scale-105' : 'text-slate-400'}`}
        >
          <span className="text-base">📸</span>
          <span className="text-[9px] font-semibold">Moments</span>
        </button>

        <button
          onClick={() => setActiveTab('location')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ${activeTab === 'location' ? 'text-pink-500 scale-105' : 'text-slate-400'}`}
        >
          <span className="text-base">🌍</span>
          <span className="text-[9px] font-semibold">Location</span>
        </button>

        <button
          onClick={() => setActiveTab('music')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ${activeTab === 'music' ? 'text-pink-500 scale-105' : 'text-slate-400'}`}
        >
          <span className="text-base">🎵</span>
          <span className="text-[9px] font-semibold">Music</span>
        </button>

        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex flex-col items-center gap-1 transition cursor-pointer ${activeTab === 'schedule' ? 'text-pink-500 scale-105' : 'text-slate-400'}`}
        >
          <span className="text-base">📅</span>
          <span className="text-[9px] font-semibold">Events</span>
        </button>
      </div>

    </main>
  );
}