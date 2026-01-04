import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DataContext = createContext();

// Cache duration: 2 minutes (120000ms) - data persists across page navigations
const CACHE_DURATION = 120000;

export const DataProvider = ({ children }) => {
  const [videos, setVideos] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [violations, setViolations] = useState([]);
  const [challans, setChallans] = useState([]);
  const [stats, setStats] = useState({
    total_videos: 0,
    total_photos: 0,
    total_violations: 0,
    total_challans: 0,
    violations_by_type: {}
  });

  // Settings persisted to localStorage for quick configuration
  const defaultSettings = {
    detectionTypes: {
      triple_ride: true,
      cell_phone: true,
      overspeed: true,
      no_helmet: true,
      helmet: true
    },
    confidenceThreshold: 0.5,
    model: 'best.pt',
    refreshRate: 2000,
    notifications: {
      enabled: true,
      sound: true
    }
  };

  const [settings, setSettings] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem('tw_settings'));
      return s ? { ...defaultSettings, ...s } : defaultSettings;
    } catch (e) {
      return defaultSettings;
    }
  });

  // Persist whenever settings change
  React.useEffect(() => {
    try {
      localStorage.setItem('tw_settings', JSON.stringify(settings));
    } catch (e) {}
  }, [settings]);

  const updateSettings = (patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };


  const [loading, setLoading] = useState(false);
  // Global date filter - allow date selection to persist across pages/tabs
  const [selectedDate, setSelectedDate] = useState(null);
  const cacheTimestamps = useRef({
    videos: 0,
    photos: 0,
    violations: 0,
    challans: 0,
    stats: 0
  });

  // Track which date filter (if any) was used to populate the cached data for each resource.
  // This allows us to detect when the requested date changed (or was cleared) and force a refetch.
  const cacheFilterDates = useRef({
    videos: null,
    photos: null,
    violations: null,
    challans: null,
    stats: null
  });

  const isCacheValid = useCallback((key) => {
    const now = Date.now();
    return cacheTimestamps.current[key] > 0 && 
           (now - cacheTimestamps.current[key]) < CACHE_DURATION;
  }, []);

  const loadVideos = useCallback(async (force = false, date = null) => {
    // If cache is valid and the previously cached request used the same date filter, we can reuse it.
    // Otherwise (date changed or cleared), fetch new data.
    if (!force && isCacheValid('videos') && cacheFilterDates.current.videos === date) {
      return; // Use cached data for the same date
    }

    try {
      const params = {};
      if (date) {
        params.date = date;
      }
      const response = await axios.get(`${API}/videos`, {
        withCredentials: true,
        params: params,
        timeout: 10000
      });
      setVideos(response.data || []);
      cacheTimestamps.current.videos = Date.now();
      cacheFilterDates.current.videos = date || null;
    } catch (error) {
      // Only log non-timeout errors to reduce console noise
      if (error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK') {
        console.error('Error loading videos:', error.message || error);
      }
      // Keep existing data on error
    }
  }, [isCacheValid]);

  const loadPhotos = useCallback(async (force = false, date = null, includeVideoFrames = false) => {
    // If cache is valid and the previously cached request used the same date filter, we can reuse it.
    // Otherwise (date changed or cleared), fetch new data.
    if (!force && isCacheValid('photos') && cacheFilterDates.current.photos === date) {
      return; // Use cached data for the same date
    }

    try {
      const params = {};
      if (date) {
        params.date = date;
      }
      // By default exclude video-extracted frames from the Photos list (only show user-uploaded photos)
      if (!includeVideoFrames) {
        params.is_video_frame = false;
      }

      const response = await axios.get(`${API}/photos`, {
        withCredentials: true,
        params: params,
        timeout: 10000
      });
      setPhotos(response.data || []);
      cacheTimestamps.current.photos = Date.now();
      cacheFilterDates.current.photos = date || null;
    } catch (error) {
      // Only log non-timeout errors to reduce console noise
      if (error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK') {
        console.error('Error loading photos:', error.message || error);
      }
      // Keep existing data on error
    }
  }, [isCacheValid]);

  const loadViolations = useCallback(async (force = false, date = null) => {
    // If cache is valid and the previously cached request used the same date filter, we can reuse it.
    // Otherwise (date changed or cleared), fetch new data.
    if (!force && isCacheValid('violations') && cacheFilterDates.current.violations === date) {
      return; // Use cached data for the same date
    }

    try {
      const params = {};
      if (date) {
        params.date = date;
      }
      const response = await axios.get(`${API}/violations`, {
        withCredentials: true,
        params: params,
        timeout: 10000
      });
      setViolations(response.data || []);
      cacheTimestamps.current.violations = Date.now();
      cacheFilterDates.current.violations = date || null;
    } catch (error) {
      // Only log non-timeout errors to reduce console noise
      if (error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK') {
        console.error('Error loading violations:', error.message || error);
      }
      // Keep existing data on error
    }
  }, [isCacheValid]);

  const loadChallans = useCallback(async (force = false, date = null) => {
    if (!force && isCacheValid('challans')) {
      return; // Use cached data
    }

    try {
      const params = {};
      if (date) {
        params.date = date;
      }
      const response = await axios.get(`${API}/challans`, {
        withCredentials: true,
        params: params,
        timeout: 10000
      });
      setChallans(response.data || []);
      cacheTimestamps.current.challans = Date.now();
    } catch (error) {
      // Only log non-timeout errors to reduce console noise
      if (error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK') {
        console.error('Error loading challans:', error.message || error);
      }
      // Keep existing data on error
    }
  }, [isCacheValid]);

  const loadStats = useCallback(async (force = false) => {
    if (!force && isCacheValid('stats')) {
      return; // Use cached data
    }

    try {
      const response = await axios.get(`${API}/stats`, {
        withCredentials: true,
        timeout: 5000
      });
      setStats(response.data);
      cacheTimestamps.current.stats = Date.now();
    } catch (error) {
      // Only log non-timeout errors to reduce console noise
      if (error.code !== 'ECONNABORTED' && error.code !== 'ERR_NETWORK') {
        console.error('Error loading stats:', error.message || error);
      }
      // Update with current counts as fallback
      setStats(prev => ({
        ...prev,
        total_videos: videos.length,
        total_photos: photos.length,
        total_violations: violations.length,
        total_challans: challans.length
      }));
    }
  }, [isCacheValid, videos.length, photos.length, violations.length, challans.length]);

  // Load all data - optimized to only load what's needed
  const loadAllData = useCallback(async (force = false, options = {}) => {
    const { 
      loadVideos: shouldLoadVideos = true,
      loadPhotos: shouldLoadPhotos = true,
      loadViolations: shouldLoadViolations = true,
      loadChallans: shouldLoadChallans = false,
      loadStats: shouldLoadStats = true,
      date = null
    } = options;

    setLoading(true);
    
    try {
      const promises = [];
      if (shouldLoadVideos) promises.push(loadVideos(force, date));
      if (shouldLoadPhotos) promises.push(loadPhotos(force, date));
      if (shouldLoadViolations) promises.push(loadViolations(force, date));
      if (shouldLoadChallans) promises.push(loadChallans(force, date));
      
      await Promise.all(promises);
      
      // Load stats in background (non-blocking)
      if (shouldLoadStats) {
        loadStats(force).catch(() => {}); // Don't block on stats
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [loadVideos, loadPhotos, loadViolations, loadChallans, loadStats]);

  // Initialize data on mount
  React.useEffect(() => {
    loadAllData(false, { loadChallans: false }); // Don't load challans on initial load
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    videos,
    photos,
    violations,
    challans,
    stats,
    loading,
    settings,
    updateSettings,
    selectedDate,
    setSelectedDate,
    loadVideos,
    loadPhotos,
    loadViolations,
    loadChallans,
    loadStats,
    loadAllData,
    setVideos,
    setPhotos,
    setViolations,
    setChallans,
    setStats,
    refreshData: (force = true) => loadAllData(force, { loadChallans: true })
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within DataProvider');
  }
  return context;
};

