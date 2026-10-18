'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface Song {
  id: string;
  title: string;
  url: string;
  storagePath?: string;
}

interface Post {
  id: string;
  sender: string;
  image: string;
  imagePath?: string;
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
  id: string;
  sender: string;
  text: string;
  timestamp: number;
}

type SharedDataType =
  | 'chat'
  | 'signal'
  | 'post'
  | 'song'
  | 'schedule'
  | 'settings'
  | 'wallpaper'
  | 'relationship'
  | 'playback'
  | 'location';

interface SharedRecord {
  id: number;
  data_type: SharedDataType;
  item_id: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface SharedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  updatedAt: number;
  userId: string;
}

interface LeafletMap {
  remove: () => void;
  setView: (coordinates: number[], zoom: number) => LeafletMap;
  fitBounds: (coordinates: [number[], number[]], options: { padding: [number, number]; maxZoom: number }) => LeafletMap;
  getZoom: () => number;
}

interface LeafletMarker {
  addTo: (map: LeafletMap) => LeafletMarker;
  setLatLng: (coordinates: number[]) => LeafletMarker;
  bindPopup: (content: string) => LeafletMarker;
  remove: () => void;
}

interface LeafletRuntime {
  map: (container: HTMLElement, options: {
    zoomControl: boolean;
    attributionControl: boolean;
    scrollWheelZoom: boolean;
  }) => LeafletMap;
  tileLayer: (url: string, options: { maxZoom: number; attribution: string }) => { addTo: (map: LeafletMap) => void };
  divIcon: (options: {
    className: string;
    html: string;
    iconSize: [number, number];
    iconAnchor: [number, number];
  }) => unknown;
  marker: (coordinates: number[], options: { icon: unknown }) => LeafletMarker;
}

const LOCATION_MAX_AGE_MS = 2 * 60 * 1000;

function isLocationFresh(location: SharedLocation | null, now: number) {
  if (!location || now < location.updatedAt) return false;
  return now - location.updatedAt < LOCATION_MAX_AGE_MS;
}

function decodeVapidPublicKey(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`;
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0)).buffer;
}

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
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
  const [musicError, setMusicError] = useState('');
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
  const selectedImageFileRef = useRef<File | null>(null);
  const signedUrlCacheRef = useRef(new Map<string, { url: string; expiresAt: number }>());
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [ownLocation, setOwnLocation] = useState<SharedLocation | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<SharedLocation | null>(null);
  const [locationError, setLocationError] = useState('');
  const [locationNow, setLocationNow] = useState(0);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [pushError, setPushError] = useState('');
  const [partnerLocalTime, setPartnerLocalTime] = useState('');
  const [isMapReady, setIsMapReady] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const leafletMarkersRef = useRef<{ own: LeafletMarker | null; partner: LeafletMarker | null }>({
    own: null,
    partner: null,
  });
  const hasFittedLocationsRef = useRef(false);
  const lastSavedLocationRef = useRef<{ latitude: number; longitude: number; savedAt: number } | null>(null);
  const isSavingLocationRef = useRef(false);

  const reportSyncError = (action: string, error: unknown) => {
    console.error(`Failed to ${action}:`, error);
    const message = error instanceof Error ? error.message : String(error);
    alert(`Couldn't ${action}. ${message}`);
  };

  const startAudioPlayback = useCallback((song: Song) => {
    const audio = audioRef.current;
    if (!audio) {
      setMusicError('The audio player is not ready. Please try again.');
      return false;
    }

    if (audio.getAttribute('src') !== song.url) audio.src = song.url;
    setMusicError('');
    void audio.play().catch((error: unknown) => {
      console.error('Unable to play selected audio:', error);
      setIsPlaying(false);
      setMusicError(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Chrome blocked playback. Tap Play to start the track on this device.'
        : 'Could not play this audio file. Check the upload and your connection.');
    });
    return true;
  }, []);

  const distanceKm = (() => {
    if (!ownLocation
      || !partnerLocation
      || !isLocationFresh(ownLocation, locationNow)
      || !isLocationFresh(partnerLocation, locationNow)) {
      return 'Waiting for both live locations';
    }

    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDifference = radians(partnerLocation.latitude - ownLocation.latitude);
    const longitudeDifference = radians(partnerLocation.longitude - ownLocation.longitude);
    const haversine = Math.sin(latitudeDifference / 2) ** 2
      + Math.cos(radians(ownLocation.latitude))
      * Math.cos(radians(partnerLocation.latitude))
      * Math.sin(longitudeDifference / 2) ** 2;
    const distance = 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    return `${Math.round(distance).toLocaleString()} km`;
  })();

  const saveSharedRecord = useCallback(async (
    type: SharedDataType,
    itemId: string,
    payload: Record<string, unknown>,
  ) => {
    if (!myCoupleCode) throw new Error('Pair your account before saving shared data.');

    const { error } = await supabase.from('couple_app_data').upsert({
      couple_code: myCoupleCode,
      data_type: type,
      item_id: itemId,
      payload,
    }, { onConflict: 'couple_code,data_type,item_id' });

    if (error) throw error;
  }, [myCoupleCode]);

  const deleteSharedRecord = async (type: SharedDataType, itemId: string) => {
    if (!myCoupleCode) throw new Error('Pair your account before deleting shared data.');

    const { error } = await supabase
      .from('couple_app_data')
      .delete()
      .eq('couple_code', myCoupleCode)
      .eq('data_type', type)
      .eq('item_id', itemId);

    if (error) throw error;
  };

  const getSharedMediaUrl = async (path: string) => {
    const cached = signedUrlCacheRef.current.get(path);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

    const { data, error } = await supabase.storage
      .from('heartlink-media')
      .createSignedUrl(path, 86_400);

    if (error) throw error;
    signedUrlCacheRef.current.set(path, { url: data.signedUrl, expiresAt: Date.now() + 86_400_000 });
    return data.signedUrl;
  };

  const uploadSharedMedia = async (file: File, folder: string, itemId: string) => {
    if (!myCoupleCode) throw new Error('Pair your account before uploading shared media.');

    const extension = file.name.match(/\.[a-z0-9]{1,8}$/i)?.[0] ?? '';
    const path = `${myCoupleCode}/${folder}/${itemId}${extension}`;
    const { error } = await supabase.storage
      .from('heartlink-media')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) throw error;
    try {
      return { path, url: await getSharedMediaUrl(path) };
    } catch (urlError) {
      const { error: cleanupError } = await supabase.storage.from('heartlink-media').remove([path]);
      if (cleanupError) console.error('Unable to remove uploaded media after signing failed:', cleanupError);
      throw urlError;
    }
  };

  function triggerHapticPattern(type: string) {
    if (!('vibrate' in navigator)) return;
    switch (type) {
      case 'MISS_YOU': navigator.vibrate([200]); break;
      case 'NEED_YOU': navigator.vibrate([150, 100, 150]); break;
      case 'LOVE_YOU': navigator.vibrate([100, 80, 100, 80, 300]); break;
      case 'SORRY': navigator.vibrate([500, 200, 500, 200, 500]); break;
      default: navigator.vibrate([100]);
    }
  }

  useEffect(() => {
    const checkCoupleStatus = async () => {
      const { data, error } = await supabase.rpc('get_heartlink_couple');
      if (error) {
        reportSyncError('check your couple pairing (run the updated supabase-sync.sql first)', error);
        setIsPaired(false);
        return;
      }

      setMyCoupleCode(data ?? '');
      setIsPaired(Boolean(data));
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.email) void checkCoupleStatus();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.email) void checkCoupleStatus();
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
      } catch {
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
      } catch {
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
    if (!audioRef.current || !currentSong) return;
    if (audioRef.current.getAttribute('src') !== currentSong.url) {
      audioRef.current.src = currentSong.url;
    }
    if (isPlaying) {
      startAudioPlayback(currentSong);
    } else {
      audioRef.current.pause();
    }
  }, [currentSong, isPlaying, startAudioPlayback]);

  useEffect(() => {
    if (activeTab !== 'location' || !mapContainerRef.current) return;

    let isActive = true;
    const leafletWindow = window as Window & { L?: LeafletRuntime };
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    const initializeMap = () => {
      if (!isActive || !mapContainerRef.current || !leafletWindow.L || leafletMapRef.current) return;
      const map = leafletWindow.L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true,
        scrollWheelZoom: true,
      }).setView([20, 0], 2);
      leafletWindow.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map);
      leafletMapRef.current = map;
      setIsMapReady(true);
    };

    if (leafletWindow.L) {
      initializeMap();
    } else {
      let script = document.querySelector<HTMLScriptElement>('script[data-heartlink-leaflet]');
      if (!script) {
        script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.dataset.heartlinkLeaflet = 'true';
        document.body.appendChild(script);
      }
      script.addEventListener('load', initializeMap);
      script.addEventListener('error', () => {
        if (isActive) setLocationError('The map could not load. Check your internet connection and try again.');
      });
      if (leafletWindow.L) initializeMap();
    }

    return () => {
      isActive = false;
      leafletMapRef.current?.remove();
      leafletMapRef.current = null;
      setIsMapReady(false);
      leafletMarkersRef.current = { own: null, partner: null };
      hasFittedLocationsRef.current = false;
    };
  }, [activeTab]);

  useEffect(() => {
    const map = leafletMapRef.current;
    const L = (window as Window & { L?: LeafletRuntime }).L;
    if (activeTab !== 'location' || !isMapReady || !map || !L) return;

    const freshOwnLocation = isLocationFresh(ownLocation, locationNow)
      ? ownLocation
      : null;
    const freshPartnerLocation = isLocationFresh(partnerLocation, locationNow)
      ? partnerLocation
      : null;
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
    const updateMarker = (
      kind: 'own' | 'partner',
      location: SharedLocation | null,
      label: string,
      color: string,
      subText: string,
      popupLabel: string,
    ) => {
      const oldMarker = leafletMarkersRef.current[kind];
      if (!location) {
        oldMarker?.remove();
        leafletMarkersRef.current[kind] = null;
        return;
      }

      const icon = L.divIcon({
        className: `custom-${kind}-pin`,
        html: createPinHtml(label, color, subText),
        iconSize: [60, 70],
        iconAnchor: [30, 35],
      });
      const marker = oldMarker ?? L.marker([location.latitude, location.longitude], { icon }).addTo(map);
      marker.setLatLng([location.latitude, location.longitude]);
      marker.bindPopup(
        `<b>${popupLabel}</b><br>Accuracy: ±${Math.round(location.accuracy)} m<br>Updated: ${new Date(location.updatedAt).toLocaleTimeString()}`,
      );
      leafletMarkersRef.current[kind] = marker;
    };

    updateMarker(
      'own',
      freshOwnLocation,
      'YOU',
      '#ec4899',
      `±${Math.round(freshOwnLocation?.accuracy ?? 0)} m (You)`,
      'Your location',
    );
    updateMarker(
      'partner',
      freshPartnerLocation,
      'GF',
      '#a855f7',
      freshPartnerLocation
        ? `Updated ${new Date(freshPartnerLocation.updatedAt).toLocaleTimeString()}`
        : 'Not sharing live location',
      'Partner location',
    );

    if (freshOwnLocation && freshPartnerLocation && !hasFittedLocationsRef.current) {
      map.fitBounds([
        [freshOwnLocation.latitude, freshOwnLocation.longitude],
        [freshPartnerLocation.latitude, freshPartnerLocation.longitude],
      ], { padding: [32, 32], maxZoom: 5 });
      hasFittedLocationsRef.current = true;
    } else if (freshOwnLocation && !freshPartnerLocation && !hasFittedLocationsRef.current) {
      map.setView([freshOwnLocation.latitude, freshOwnLocation.longitude], 15);
      hasFittedLocationsRef.current = true;
    } else if (freshPartnerLocation && !freshOwnLocation && !hasFittedLocationsRef.current) {
      map.setView([freshPartnerLocation.latitude, freshPartnerLocation.longitude], 15);
      hasFittedLocationsRef.current = true;
    }
  }, [activeTab, isMapReady, ownLocation, partnerLocation, locationNow]);

  useEffect(() => {
    if (!isSharingLocation || !isPaired || !session?.user?.id || !myCoupleCode) return;
    const watchId = navigator.geolocation.watchPosition((position) => {
      const { latitude, longitude, accuracy } = position.coords;
      const now = Date.now();
      const previous = lastSavedLocationRef.current;
      const distanceMoved = previous
        ? 6371000 * 2 * Math.asin(Math.sqrt(
          Math.sin(((latitude - previous.latitude) * Math.PI) / 360) ** 2
            + Math.cos((previous.latitude * Math.PI) / 180)
            * Math.cos((latitude * Math.PI) / 180)
            * Math.sin(((longitude - previous.longitude) * Math.PI) / 360) ** 2,
        ))
        : Number.POSITIVE_INFINITY;
      const location: SharedLocation = {
        latitude,
        longitude,
        accuracy,
        updatedAt: now,
        userId: session.user.id,
      };

      setOwnLocation(location);
      setLocationNow(now);
      if (isSavingLocationRef.current
        || (previous && distanceMoved < 20 && now - previous.savedAt < 20_000)) return;

      isSavingLocationRef.current = true;
      void saveSharedRecord('location', session.user.id, {
        latitude,
        longitude,
        accuracy,
        user_id: session.user.id,
      }).then(() => {
        lastSavedLocationRef.current = { latitude, longitude, savedAt: now };
      }).catch((error: unknown) => {
        console.error('Unable to share current location:', error);
        setLocationError('Could not sync your location. Check the database setup and your connection.');
        setIsSharingLocation(false);
      }).finally(() => {
        isSavingLocationRef.current = false;
      });
    }, (error) => {
      console.error('Unable to read current location:', error);
      setLocationError(error.code === error.PERMISSION_DENIED
        ? 'Location permission was denied. Allow location access in Chrome settings to share.'
        : 'Could not get your location. Check GPS and try again.');
      setIsSharingLocation(false);
    }, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20_000,
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isSharingLocation, isPaired, session?.user?.id, myCoupleCode, saveSharedRecord]);

  useEffect(() => {
    const initialUpdate = window.setTimeout(() => setLocationNow(Date.now()), 0);
    const interval = setInterval(() => setLocationNow(Date.now()), 10_000);
    return () => {
      window.clearTimeout(initialUpdate);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isPaired || !myCoupleCode || !session?.user?.email) return;

    let isActive = true;
    let latestLoad = 0;
    const currentEmail = session.user.email.toLowerCase();

    const loadSharedData = async () => {
      const loadId = ++latestLoad;
      const records: SharedRecord[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('couple_app_data')
          .select('id,data_type,item_id,payload,created_at,updated_at')
          .eq('couple_code', myCoupleCode)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1)
          .returns<SharedRecord[]>();

        if (error) {
          if (isActive) reportSyncError('load shared data (run supabase-sync.sql in Supabase SQL Editor first)', error);
          return;
        }
        records.push(...(data ?? []));
        if (!data || data.length < pageSize) break;
        if (!isActive || loadId !== latestLoad) return;
      }
      if (!isActive || loadId !== latestLoad) return;

      try {
        const storedMessages = records
          .filter((record) => record.data_type === 'chat' || record.data_type === 'signal')
          .map((record) => {
            const payload = record.payload;
            return {
              id: record.item_id,
              sender: String(payload.sender_email ?? '').toLowerCase() === currentEmail ? 'You' : 'Partner',
              text: String(payload.text ?? ''),
              timestamp: Number(payload.timestamp ?? Date.parse(record.created_at)),
            };
          })
          .sort((a, b) => a.timestamp - b.timestamp);
        const lastSignal = records
          .filter((record) => record.data_type === 'signal'
            && String(record.payload.sender_email ?? '').toLowerCase() !== currentEmail)
          .at(-1)?.payload;
        const locations = records
          .filter((record) => record.data_type === 'location')
          .map((record): SharedLocation | null => {
            const payload = record.payload;
            const latitude = Number(payload.latitude);
            const longitude = Number(payload.longitude);
            const accuracy = Number(payload.accuracy);
            const updatedAt = Date.parse(record.updated_at);
            if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
              || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
              || !Number.isFinite(updatedAt)) return null;
            return {
              latitude,
              longitude,
              accuracy: Number.isFinite(accuracy) ? accuracy : 0,
              updatedAt,
              userId: String(payload.user_id ?? ''),
            };
          })
          .filter((location): location is SharedLocation => location !== null);
        const ownPosition = locations.find((location) => location.userId === session.user.id) ?? null;
        const partnerPosition = locations.find((location) => location.userId !== session.user.id) ?? null;

        const storedPosts = await Promise.all(records
          .filter((record) => record.data_type === 'post')
          .map(async (record) => {
            const payload = record.payload;
            const imagePath = typeof payload.imagePath === 'string' ? payload.imagePath : undefined;
            return {
              id: record.item_id,
              sender: String(payload.sender_email ?? '').toLowerCase() === currentEmail ? 'You' : 'Partner',
              image: imagePath ? await getSharedMediaUrl(imagePath) : String(payload.image ?? ''),
              imagePath,
              caption: String(payload.caption ?? ''),
              date: String(payload.date ?? ''),
              createdAt: record.created_at,
            };
          }));

        const storedSongs = await Promise.all(records
          .filter((record) => record.data_type === 'song')
          .map(async (record) => {
            const payload = record.payload;
            const storagePath = String(payload.storagePath ?? '');
            return {
              id: record.item_id,
              title: String(payload.title ?? ''),
              url: storagePath ? await getSharedMediaUrl(storagePath) : '',
              storagePath,
            };
          }));

        const settings = records.find((record) => record.data_type === 'settings')?.payload;
        const musicSyncPreferenceKey = `heartlink:music-sync:${session.user.id}`;
        const localMusicSyncPreference = window.localStorage.getItem(musicSyncPreferenceKey);
        if (localMusicSyncPreference === 'true' || localMusicSyncPreference === 'false') {
          setIsSyncedMusic(localMusicSyncPreference === 'true');
        } else if (typeof settings?.isSyncedMusic === 'boolean') {
          setIsSyncedMusic(settings.isSyncedMusic);
          window.localStorage.setItem(musicSyncPreferenceKey, String(settings.isSyncedMusic));
        }
        const schedules = records
          .filter((record) => record.data_type === 'schedule')
          .map((record) => ({
            id: record.item_id,
            title: String(record.payload.title ?? ''),
            time: String(record.payload.time ?? ''),
            sign: String(record.payload.sign ?? '📌'),
          }));

        const wallpaper = records.find((record) => record.data_type === 'wallpaper')?.payload;
        const wallpaperUrl = typeof wallpaper?.path === 'string' ? await getSharedMediaUrl(wallpaper.path) : '';
        const relationship = records.find((record) => record.data_type === 'relationship')?.payload;
        const playback = records.find((record) => record.data_type === 'playback')?.payload;
        const playingSong = storedSongs.find((song) => song.id === playback?.songId) ?? null;

        if (!isActive || loadId !== latestLoad) return;
        setMessages(storedMessages);
        setLastReceived(typeof lastSignal?.text === 'string' ? lastSignal.text : '');
        setOwnLocation(ownPosition);
        setPartnerLocation(partnerPosition);
        setPosts(storedPosts.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
        setPlaylist(storedSongs);
        if (settings?.tapMeanings && typeof settings.tapMeanings === 'object') {
          setTapMeanings(settings.tapMeanings as typeof tapMeanings);
          setTempMeanings(settings.tapMeanings as typeof tapMeanings);
        }
        setSchedules(schedules);
        setSharedBgImage(wallpaperUrl);
        if (typeof relationship?.startDate === 'string') setRelationshipStartDate(relationship.startDate);
        const followsPlayback = playback?.user_id
          ? playback.user_id !== session.user.id
          : settings?.isSyncedMusic !== false;
        if (followsPlayback) {
          setCurrentSong(playingSong);
          setIsPlaying(Boolean(playback?.isPlaying));
        } else {
          setCurrentSong((current) => current ?? playingSong);
        }
      } catch (error) {
        if (isActive) reportSyncError('load shared media and settings', error);
      }
    };

    void loadSharedData();

    const channel = supabase
      .channel(`shared-data-${myCoupleCode}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'couple_app_data',
        filter: `couple_code=eq.${myCoupleCode}`,
      }, (payload) => {
        const changedRecord = payload.new as SharedRecord | undefined;
        if (changedRecord?.data_type === 'signal') {
          const senderEmail = String(changedRecord.payload.sender_email ?? '').toLowerCase();
          if (senderEmail !== currentEmail) {
            setLastReceived(String(changedRecord.payload.text ?? ''));
            triggerHapticPattern(String(changedRecord.payload.hapticType ?? ''));
          }
        } else if (changedRecord?.data_type === 'chat') {
          const senderEmail = String(changedRecord.payload.sender_email ?? '').toLowerCase();
          if (senderEmail !== currentEmail && 'vibrate' in navigator) navigator.vibrate(100);
        }
        void loadSharedData();
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reportSyncError('connect live data sync', new Error(`Supabase Realtime status: ${status}`));
        }
      });

    return () => {
      isActive = false;
      void supabase.removeChannel(channel);
    };
  }, [isPaired, myCoupleCode, session?.user?.email, session?.user?.id]);

  useEffect(() => {
    if (!isPaired || !session || !('serviceWorker' in navigator) || !('PushManager' in window)) return;

    let isActive = true;
    void navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (isActive) setIsPushEnabled(Boolean(subscription));
      })
      .catch((error: unknown) => {
        console.error('Unable to check push notification status:', error);
      });

    return () => {
      isActive = false;
    };
  }, [isPaired, session]);

  const enablePushNotifications = async () => {
    setPushError('');
    if (!isPaired || !session) {
      setPushError('Pair your account before enabling notifications.');
      return;
    }
    if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) {
      setPushError('This browser does not support web push notifications.');
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setPushError('Push notifications are not configured. Add the VAPID keys to your Vercel environment variables.');
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushError(permission === 'denied'
          ? 'Notifications are blocked. Allow them in Chrome site settings, then try again.'
          : 'Notification permission was not granted.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidPublicKey(publicKey),
      });
      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        await subscription.unsubscribe();
        throw new Error(result.error ?? 'Could not save the push subscription.');
      }

      setIsPushEnabled(true);
    } catch (error) {
      console.error('Unable to enable partner notifications:', error);
      setPushError(error instanceof Error ? error.message : 'Could not enable notifications.');
    }
  };

  const disablePushNotifications = async () => {
    if (!session || !('serviceWorker' in navigator)) return;
    setPushError('');

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setIsPushEnabled(false);
        return;
      }

      const response = await fetch('/api/push/subscribe', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? 'Could not remove the push subscription.');
      }

      const unsubscribed = await subscription.unsubscribe();
      if (!unsubscribed) throw new Error('Chrome did not remove the push subscription.');
      setIsPushEnabled(false);
    } catch (error) {
      console.error('Unable to disable partner notifications:', error);
      setPushError(error instanceof Error ? error.message : 'Could not disable notifications.');
    }
  };

  const notifyPartner = async (kind: 'message' | 'signal', text: string) => {
    if (!session) return;
    try {
      const response = await fetch('/api/push/notify', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ kind, text }),
      });
      const result = await response.json() as { sent?: number; reason?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? 'The push service could not accept the notification.');
      if (!result.sent) {
        const reason = result.reason ?? 'No active push subscription was found.';
        setPushError(reason);
        alert(`Your ${kind === 'message' ? 'message' : 'tap'} was saved, but no push notification was sent: ${reason}`);
      }
    } catch (error) {
      console.error('Unable to notify your partner:', error);
      const message = error instanceof Error ? error.message : 'Push notification failed.';
      setPushError(message);
      alert(`Your ${kind === 'message' ? 'message' : 'tap'} was saved, but the notification failed: ${message}`);
    }
  };

  const toggleLocationSharing = async () => {
    if (isSharingLocation) {
      setIsSharingLocation(false);
      setOwnLocation(null);
      lastSavedLocationRef.current = null;
      if (session?.user?.id) {
        try {
          await deleteSharedRecord('location', session.user.id);
        } catch (error) {
          reportSyncError('remove your shared location', error);
        }
      }
      return;
    }

    if (!navigator.geolocation) {
      setLocationError('This browser does not support location sharing.');
      return;
    }
    setLocationError('');
    setIsSharingLocation(true);
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
    try {
      const generatedCode = 'HL-' + Math.floor(1000 + Math.random() * 9000);
      const { data, error } = await supabase.rpc('create_heartlink_couple', {
        target_code: generatedCode,
      });
      if (error) throw error;

      setMyCoupleCode(data);
      setIsPaired(true);
      alert(`Your Couple Code is: ${data}. Share this with your partner!`);
    } catch (error) {
      reportSyncError('create a couple code', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePairingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email) return;
    setLoading(true);

    const cleanCode = coupleCodeInput.trim().toUpperCase();
    try {
      const { data, error } = await supabase.rpc('join_heartlink_couple', {
        target_code: cleanCode,
      });
      if (error) throw error;

      setMyCoupleCode(data);
      setIsPaired(true);
      setShowSettings(false);
      alert('Successfully paired with your partner! ❤️');
    } catch (error) {
      reportSyncError('join your partner using that couple code', error);
    } finally {
      setLoading(false);
    }
  };

  const sendPayload = async (type: string, hapticType: string, message: string) => {
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    try {
      await saveSharedRecord('signal', id, {
        text: message,
        timestamp,
        sender_email: session?.user?.email ?? '',
        hapticType,
        signalType: type,
      });
      setLastReceived(message);
      setMessages((prev) => prev.some((item) => item.id === id)
        ? prev
        : [...prev, { id, sender: 'You', text: message, timestamp }]);
      void notifyPartner('signal', message);
    } catch (error) {
      reportSyncError('save your tap signal', error);
    }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputMessage.trim();
    if (!text) return;

    const timestamp = Date.now();
    const id = crypto.randomUUID();
    try {
      await saveSharedRecord('chat', id, {
        text,
        timestamp,
        sender_email: session?.user?.email ?? '',
      });
      setMessages((prev) => prev.some((item) => item.id === id)
        ? prev
        : [...prev, { id, sender: 'You', text, timestamp }]);
      setInputMessage('');
      void notifyPartner('message', text);
    } catch (error) {
      reportSyncError('save your message', error);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
      selectedImageFileRef.current = file;
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postCaption.trim() && !imagePreview) return;

    const now = new Date();
    const formattedDate = `${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;

    const id = crypto.randomUUID();
    let uploadedPath: string | undefined;
    try {
      let image = 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?w=600&auto=format&fit=crop&q=60';
      if (selectedImageFileRef.current) {
        const uploaded = await uploadSharedMedia(selectedImageFileRef.current, 'moments', id);
        image = uploaded.url;
        uploadedPath = uploaded.path;
      }

      const newPost: Post = {
        id,
        sender: 'You',
        image,
        imagePath: uploadedPath,
        caption: postCaption,
        date: formattedDate,
      };
      await saveSharedRecord('post', id, {
        sender_email: session?.user?.email ?? '',
        imagePath: uploadedPath,
        image: uploadedPath ? undefined : image,
        caption: postCaption,
        date: formattedDate,
      });

      setPosts((prev) => [newPost, ...prev.filter((post) => post.id !== id)]);
      setPostCaption('');
      if (imagePreview.startsWith('blob:')) URL.revokeObjectURL(imagePreview);
      selectedImageFileRef.current = null;
      setImagePreview('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from('heartlink-media').remove([uploadedPath]);
        if (cleanupError) console.error('Unable to remove moment media after save failed:', cleanupError);
      }
      reportSyncError('save your moment', error);
    }
  };

  const handleDeletePost = async (postId: string) => {
    const post = posts.find((item) => item.id === postId);
    try {
      await deleteSharedRecord('post', postId);
      setPosts((prev) => prev.filter((item) => item.id !== postId));
      if (post?.imagePath) {
        const { error } = await supabase.storage.from('heartlink-media').remove([post.imagePath]);
        if (error) reportSyncError('delete the moment photo', error);
      }
    } catch (error) {
      reportSyncError('delete your moment', error);
    }
  };

  const handleWallpaperUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let uploadedPath: string | undefined;
    try {
      const uploaded = await uploadSharedMedia(file, 'wallpapers', crypto.randomUUID());
      uploadedPath = uploaded.path;
      await saveSharedRecord('wallpaper', 'current', { path: uploaded.path });
      setSharedBgImage(uploaded.url);
    } catch (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from('heartlink-media').remove([uploadedPath]);
        if (cleanupError) console.error('Unable to remove wallpaper media after save failed:', cleanupError);
      }
      reportSyncError('save the shared wallpaper', error);
    }
  };

  const handleMusicUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const id = crypto.randomUUID();
    let uploadedPath: string | undefined;
    try {
      const uploaded = await uploadSharedMedia(file, 'music', id);
      uploadedPath = uploaded.path;
      const songData: Song = {
        id,
        title: file.name.replace(/\.[^/.]+$/, ''),
        url: uploaded.url,
        storagePath: uploaded.path,
      };
      await saveSharedRecord('song', id, {
        title: songData.title,
        storagePath: uploaded.path,
      });
      setPlaylist((prev) => [...prev.filter((song) => song.id !== id), songData]);
      if (musicInputRef.current) musicInputRef.current.value = '';
    } catch (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from('heartlink-media').remove([uploadedPath]);
        if (cleanupError) console.error('Unable to remove audio media after save failed:', cleanupError);
      }
      reportSyncError('save the audio file', error);
    }
  };

  const handleDeleteSong = async (songId: string) => {
    const song = playlist.find((item) => item.id === songId);
    try {
      await deleteSharedRecord('song', songId);
      setPlaylist((prev) => prev.filter((item) => item.id !== songId));
      if (currentSong?.id === songId) {
        setCurrentSong(null);
        setIsPlaying(false);
        if (audioRef.current) audioRef.current.pause();
        await deleteSharedRecord('playback', 'current');
      }
      if (song?.storagePath) {
        const { error } = await supabase.storage.from('heartlink-media').remove([song.storagePath]);
        if (error) reportSyncError('delete the audio file', error);
      }
    } catch (error) {
      reportSyncError('delete the audio file', error);
    }
  };

  const playSong = (song: Song) => {
    const playbackStarted = startAudioPlayback(song);
    setCurrentSong(song);
    setIsPlaying(playbackStarted);
    if (isSyncedMusic) {
      void saveSharedRecord('playback', 'current', {
        songId: song.id,
        isPlaying: playbackStarted,
        user_id: session?.user?.id,
      }).catch((error: unknown) => {
        reportSyncError('save music playback progress', error);
      });
    }
  };

  const togglePlayPause = () => {
    if (!currentSong && playlist.length > 0) {
      playSong(playlist[0]);
      return;
    }
    if (!currentSong) return;

    const newPlayingState = !isPlaying;
    if (newPlayingState) {
      if (!startAudioPlayback(currentSong)) return;
    } else {
      audioRef.current?.pause();
    }
    setIsPlaying(newPlayingState);

    if (isSyncedMusic) {
      void saveSharedRecord('playback', 'current', {
        songId: currentSong.id,
        isPlaying: newPlayingState,
        user_id: session?.user?.id,
      }).catch((error: unknown) => {
        reportSyncError('save music playback progress', error);
      });
    }
  };

  const toggleMusicSync = async () => {
    const nextValue = !isSyncedMusic;
    try {
      if (currentSong && (nextValue || isPlaying)) {
        await saveSharedRecord('playback', 'current', {
          songId: currentSong.id,
          isPlaying: nextValue && isPlaying,
          user_id: session?.user?.id,
        });
      }
      if (session?.user?.id) {
        window.localStorage.setItem(`heartlink:music-sync:${session.user.id}`, String(nextValue));
      }
      setIsSyncedMusic(nextValue);
    } catch (error) {
      reportSyncError('save music sync settings', error);
    }
  };

  const handleSongEnded = () => {
    setIsPlaying(false);
    if (isSyncedMusic && currentSong) {
      void saveSharedRecord('playback', 'current', {
        songId: currentSong.id,
        isPlaying: false,
        user_id: session?.user?.id,
      }).catch((error: unknown) => {
        console.error('Unable to sync the end of the song:', error);
      });
    }
  };

  const updateRelationshipStartDate = async (startDate: string) => {
    try {
      await saveSharedRecord('relationship', 'start-date', { startDate });
      setRelationshipStartDate(startDate);
    } catch (error) {
      reportSyncError('save the relationship start date', error);
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
    try {
      await saveSharedRecord('settings', 'current', {
        tapMeanings: tempMeanings,
      });
      setTapMeanings(tempMeanings);
      setShowSettings(false);
    } catch (error) {
      reportSyncError('save your shared settings', error);
    }
  };

  const addSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newTime) return;

    const schedItem: ScheduleItem = {
      id: crypto.randomUUID(),
      title: newTitle,
      time: newTime,
      sign: newSign,
    };

    try {
      await saveSharedRecord('schedule', schedItem.id, {
        title: schedItem.title,
        time: schedItem.time,
        sign: schedItem.sign,
      });
      setSchedules((prev) => [...prev.filter((item) => item.id !== schedItem.id), schedItem]);
      setNewTitle('');
      setNewTime('');
    } catch (error) {
      reportSyncError('save your schedule item', error);
    }
  };

  const handleDeleteSchedule = async (schedId: string) => {
    try {
      await deleteSharedRecord('schedule', schedId);
      setSchedules((prev) => prev.filter((item) => item.id !== schedId));
    } catch (error) {
      reportSyncError('delete your schedule item', error);
    }
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

      <audio ref={audioRef} onEnded={handleSongEnded} />

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
                messages.map((msg) => {
                  const isMe = msg.sender === 'You';
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} items-end gap-2`}>
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

            <div className="shrink-0 rounded-2xl border border-slate-800 bg-[#101625]/90 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-white">Share precise location</p>
                  <p className="text-[10px] text-slate-400">
                    {isSharingLocation
                      ? 'Sharing while Heartlink stays open'
                      : 'Off by default. Your paired partner can see it while it is fresh.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleLocationSharing()}
                  disabled={!isPaired}
                  aria-pressed={isSharingLocation}
                  className={`shrink-0 rounded-xl border px-3 py-2 text-[10px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    isSharingLocation
                      ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                      : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  }`}
                >
                  {isSharingLocation ? 'Stop sharing' : 'Share location'}
                </button>
              </div>
              {!isPaired && <p className="text-[10px] text-amber-300">Pair your account first.</p>}
              {locationError && <p role="alert" className="text-[10px] text-rose-300">{locationError}</p>}
              <p className="text-[10px] text-slate-500">
                Exact GPS is visible only to your paired account. PWA sharing pauses when Chrome suspends or closes Heartlink; old locations are hidden after 2 minutes.
              </p>
            </div>

            <div className="relative w-full flex-1 min-h-[320px] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl z-0">
              <div ref={mapContainerRef} className="w-full h-full min-h-[320px]"></div>
              
              <p className="absolute bottom-2 left-2 z-[400] text-[9px] text-slate-700 font-semibold bg-white/90 px-2.5 py-1 rounded-full border border-slate-300 shadow">
                OpenStreetMap · Last update expires after 2 min
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
                <p className="text-[10px] text-slate-400">
                  {isSyncedMusic
                    ? 'Your music is shared with your partner'
                    : 'Your music stays on this device'}
                </p>
              </div>
              <button
                onClick={toggleMusicSync}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition cursor-pointer ${
                  isSyncedMusic ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
                }`}
              >
                Sync: {isSyncedMusic ? 'ON 🟢' : 'OFF ⚪'}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 shrink-0">
              {isSyncedMusic
                ? 'Browser autoplay rules may require your partner to tap Play on their device.'
                : 'Turning Sync off pauses shared playback for your partner; your local playback continues.'}
            </p>

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
              {musicError && <p role="alert" className="text-[10px] text-rose-300">{musicError}</p>}

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

            <div className="bg-[#080c14] border border-slate-800 p-4 rounded-2xl space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-pink-400">🔔 Partner notifications</p>
                  <p className="text-[10px] text-slate-400">
                    {isPushEnabled ? 'This device can receive push alerts.' : 'Allow messages and tap alerts on this device.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void (isPushEnabled ? disablePushNotifications() : enablePushNotifications())}
                  disabled={!isPaired}
                  className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-bold transition disabled:opacity-50 ${
                    isPushEnabled
                      ? 'bg-slate-800 text-slate-300'
                      : 'bg-pink-600 text-white hover:bg-pink-500'
                  }`}
                >
                  {isPushEnabled ? 'Disable' : 'Enable'}
                </button>
              </div>
              {pushError && <p role="alert" className="text-[10px] text-rose-300">{pushError}</p>}
              <p className="text-[10px] text-slate-500">
                Each partner must enable notifications on their own device. Delivery requires internet and browser notification permission.
              </p>
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
                  <p className="text-[11px] text-slate-400">Enter your partner&apos;s code below:</p>
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
                onChange={(e) => updateRelationshipStartDate(e.target.value)}
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