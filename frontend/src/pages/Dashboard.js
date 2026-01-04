import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Upload,
  Video,
  AlertTriangle,
  Activity,
  LogOut,
  Gauge,
  Play,
  Download,
  Image as ImageIcon,
  FileText,
  BarChart3,
  Camera,
  Moon,
  Sun
} from 'lucide-react';
import VideoUpload from '../components/VideoUpload';
import PhotoUpload from '../components/PhotoUpload';
import ViolationsList from '../components/ViolationsList';
import EChallanList from '../components/EChallanList';
import ChallansList from '../components/ChallansList';
import CalibrationPanel from '../components/CalibrationPanel';
import StatsPanel from '../components/StatsPanel';
import AnalyticsPanel from '../components/AnalyticsPanel';
import LiveDetection from '../components/LiveDetection';
import VehicleTracker from '../components/VehicleTracker';
import { playNotificationSound } from '../utils/notificationSound';
import { useTheme } from '@/components/ThemeProvider.jsx';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = ({ user, setUser }) => {
  const [videos, setVideos] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [violations, setViolations] = useState([]);
  const [stats, setStats] = useState({
    total_videos: 0,
    total_photos: 0,
    total_violations: 0,
    total_challans: 0,
    violations_by_type: {}
  }); // Initialize with default values for instant display
  const [loading, setLoading] = useState(false);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('videos');
  const [violationDate, setViolationDate] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [lastLoadTime, setLastLoadTime] = useState(0);
  const videoPollingIntervals = useRef({});
  const photoPollingIntervals = useRef({});
  const { theme, toggleTheme } = useTheme();

  // Cache data for 30 seconds to avoid unnecessary reloads
  const CACHE_DURATION = 30000;

  useEffect(() => {
    loadData(null, selectedDate);
    
    // Cleanup polling intervals on unmount
    return () => {
      Object.values(videoPollingIntervals.current).forEach(interval => clearInterval(interval));
      Object.values(photoPollingIntervals.current).forEach(interval => clearInterval(interval));
    };
  }, []);

  // Reload data when tab changes, but only if cache is stale
  useEffect(() => {
    const now = Date.now();
    if (dataLoaded && (now - lastLoadTime) < CACHE_DURATION) {
      // Data is fresh, don't reload
      return;
    }
    // Only reload if we haven't loaded data yet or cache is stale
    if (!dataLoaded || (now - lastLoadTime) >= CACHE_DURATION) {
      loadData(false, selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedDate]);

  const loadData = async (force = false, date = null) => {
    const now = Date.now();
    // Skip if data is fresh and not forcing
    if (!force && dataLoaded && (now - lastLoadTime) < CACHE_DURATION) {
      return;
    }

    try {
      setLoading(true);
      // Load stats separately and non-blocking for faster initial load
      const loadStats = async () => {
        try {
          const statsRes = await axios.get(`${API}/stats`, { 
            withCredentials: true,
            timeout: 5000 // 5 second timeout for stats
          });
          setStats(statsRes.data);
        } catch (error) {
          console.error('Error loading stats:', error);
          // Update stats with current data counts
          setStats(prev => ({
            ...prev,
            total_videos: videos.length,
            total_photos: photos.length,
            total_violations: violations.length
          }));
        }
      };

      const params = {};
      if (date) params.date = date;

      // Load main data first (videos, photos, violations) - these are critical
      const [videosRes, photosRes, violationsRes] = await Promise.all([
        axios.get(`${API}/videos`, { withCredentials: true, timeout: 10000, params }),
        axios.get(`${API}/photos`, { withCredentials: true, timeout: 10000, params }),
        axios.get(`${API}/violations`, { withCredentials: true, timeout: 10000, params })
      ]);
      
      setVideos(videosRes.data || []);
      setPhotos(photosRes.data || []);
      setViolations(violationsRes.data || []);
      setDataLoaded(true);
      setLastLoadTime(now);
      setLoading(false);

      // Load stats in background (non-blocking)
      loadStats();
    } catch (error) {
      console.error('Error loading data:', error);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, null, { withCredentials: true });
      setUser(null);
      window.location.href = '/';
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const handleVideoUpload = async (file) => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/videos/upload`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      toast.success('Video uploaded successfully!');
      
      // Start processing
      await axios.post(`${API}/videos/${response.data.id}/process`, null, {
        withCredentials: true
      });
      
      toast.info('Processing started...');
      loadData(true); // Force reload
      
      // Poll for completion - optimized interval (3 seconds for videos since they take longer)
      const videoId = response.data.id;
      videoPollingIntervals.current[videoId] = setInterval(async () => {
        try {
          const videoRes = await axios.get(`${API}/videos/${videoId}`, { 
            withCredentials: true,
            timeout: 3000
          });
          if (videoRes.data.status === 'completed' || videoRes.data.status === 'failed') {
            clearInterval(videoPollingIntervals.current[videoId]);
            delete videoPollingIntervals.current[videoId];
            
            if (videoRes.data.status === 'completed') {
              const violationCount = videoRes.data.total_violations || 0;
              toast.success(`Video processing complete! Found ${violationCount} violation(s).`);
              playNotificationSound('success');
              
              // If violations found, show additional notification
              if (violationCount > 0) {
                setTimeout(() => {
                  toast.info('Review violations in the Violations tab', { duration: 5000 });
                }, 1000);
              }
            } else {
              toast.error('Video processing failed');
              playNotificationSound('error');
            }
            loadData(true); // Force reload
          }
        } catch (error) {
          clearInterval(videoPollingIntervals.current[videoId]);
          delete videoPollingIntervals.current[videoId];
        }
      }, 3000); // Poll every 3 seconds for videos (reduced server load, faster than before)
    } catch (error) {
      toast.error('Upload failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (file) => {
    setPhotoLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await axios.post(`${API}/photos/upload`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      toast.success('Photo uploaded successfully!');
      
      // Start processing
      await axios.post(`${API}/photos/${response.data.id}/process`, null, {
        withCredentials: true
      });
      
      toast.info('Processing photo...');
      loadData(true); // Force reload
      
      // Poll for completion - optimized interval (1.5 seconds for photos)
      const photoId = response.data.id;
      photoPollingIntervals.current[photoId] = setInterval(async () => {
        try {
          const photoRes = await axios.get(`${API}/photos/${photoId}`, { 
            withCredentials: true,
            timeout: 2000
          });
          if (photoRes.data.status === 'completed' || photoRes.data.status === 'failed') {
            clearInterval(photoPollingIntervals.current[photoId]);
            delete photoPollingIntervals.current[photoId];
            
            if (photoRes.data.status === 'completed') {
              const violationCount = photoRes.data.total_violations || 0;
              toast.success(`Photo processing complete! Found ${violationCount} violation(s).`);
              playNotificationSound('success');
              
              // If violations found, show additional notification
              if (violationCount > 0) {
                setTimeout(() => {
                  toast.info('Review violations in the Violations tab', { duration: 5000 });
                }, 1000);
              }
            } else {
              toast.error('Photo processing failed');
              playNotificationSound('error');
            }
            loadData(true); // Force reload
          }
        } catch (error) {
          clearInterval(photoPollingIntervals.current[photoId]);
          delete photoPollingIntervals.current[photoId];
        }
      }, 1500); // Poll every 1.5 seconds for photos (balanced speed/server load)
      
    } catch (error) {
      toast.error('Upload failed: ' + (error.response?.data?.detail || error.message));
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleDownload = async (videoId) => {
    try {
      window.open(`${API}/videos/${videoId}/download`, '_blank');
    } catch (error) {
      toast.error('Download failed');
    }
  };

  const handleDownloadPhoto = async (photoId) => {
    try {
      window.open(`${API}/photos/${photoId}/download`, '_blank');
    } catch (error) {
      toast.error('Download failed');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-50 shadow-sm bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className="bg-white/10 rounded-xl p-2">
                <Activity className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-xs text-blue-100 uppercase tracking-[0.2em]">
                  TRAFFICWATCH AI
                </p>
                <h1 className="text-xl font-semibold text-white">
                  Violation Detection System
                </h1>
              </div>
            </div>

            {/* Top navigation – visually mirrors the design while still using tabs underneath */}
            <nav className="hidden md:flex items-center gap-1 text-sm font-medium text-blue-50">
              <button
                onClick={() => setActiveTab('videos')}
                className={`px-3 py-2 rounded-full transition ${
                  activeTab === 'videos'
                    ? 'bg-white text-blue-600 shadow'
                    : 'hover:bg-white/10'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('videos')}
                className={`px-3 py-2 rounded-full transition ${
                  activeTab === 'videos'
                    ? 'bg-white/10'
                    : 'hover:bg-white/10'
                }`}
              >
                Upload Video
              </button>
              <button
                onClick={() => setActiveTab('live')}
                className={`px-3 py-2 rounded-full transition ${
                  activeTab === 'live'
                    ? 'bg-white/10'
                    : 'hover:bg-white/10'
                }`}
              >
                Live Detection
              </button>
              <button
                onClick={() => setActiveTab('violations')}
                className={`px-3 py-2 rounded-full transition ${
                  activeTab === 'violations'
                    ? 'bg-white/10'
                    : 'hover:bg-white/10'
                }`}
              >
                Violations
              </button>
              <button
                onClick={() => setActiveTab('echallan')}
                className={`px-3 py-2 rounded-full transition ${
                  activeTab === 'echallan'
                    ? 'bg-white/10'
                    : 'hover:bg-white/10'
                }`}
              >
                Challans
              </button>
              <button
                onClick={() => setActiveTab('track')}
                className={`px-3 py-2 rounded-full transition ${
                  activeTab === 'track'
                    ? 'bg-white/10'
                    : 'hover:bg-white/10'
                }`}
              >
                Track Vehicle
              </button>
            </nav>

            <div className="flex items-center gap-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-white">{user.name}</p>
                <p className="text-xs text-blue-100">{user.email}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="text-blue-50 hover:bg-white/10 rounded-full"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>
              <Button
                data-testid="logout-button"
                onClick={handleLogout}
                variant="outline"
                size="sm"
                className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats Overview - Always show, updates in background */}
        <StatsPanel stats={stats} />

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
          <TabsList className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full p-1 shadow-sm">
            <TabsTrigger
              value="videos"
              data-testid="videos-tab"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-full"
            >
              <Video className="w-4 h-4 mr-2" />
              Videos
            </TabsTrigger>
            <TabsTrigger
              value="photos"
              data-testid="photos-tab"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-full"
            >
              <ImageIcon className="w-4 h-4 mr-2" />
              Photos
            </TabsTrigger>
            <TabsTrigger
              value="violations"
              data-testid="violations-tab"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-full"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Violations
            </TabsTrigger>
            <TabsTrigger
              value="echallan"
              data-testid="echallan-tab"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-full"
            >
              <FileText className="w-4 h-4 mr-2" />
              E-Challan
            </TabsTrigger>
            <TabsTrigger
              value="track"
              data-testid="track-tab"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-full"
            >
              <Camera className="w-4 h-4 mr-2" />
              Track Vehicle
            </TabsTrigger>
            <TabsTrigger
              value="analytics"
              data-testid="analytics-tab"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-full"
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger
              value="live"
              data-testid="live-tab"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-full"
            >
              <Camera className="w-4 h-4 mr-2" />
              Live Detection
            </TabsTrigger>
            <TabsTrigger
              value="calibration"
              data-testid="calibration-tab"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white rounded-full"
            >
              <Gauge className="w-4 h-4 mr-2" />
              Calibration
            </TabsTrigger>
          </TabsList>

          {/* Videos Tab */}
          <TabsContent value="videos" className="mt-6">
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <VideoUpload onUpload={handleVideoUpload} loading={loading} />
              </div>
              <div className="lg:col-span-2">
                <Card className="bg-slate-900 border-slate-800 p-6">
                  <h3 className="text-lg font-bold text-white mb-4">Uploaded Videos</h3>
                  <div className="space-y-3">
                    {videos.length === 0 ? (
                      <p className="text-slate-400 text-center py-8">No videos uploaded yet</p>
                    ) : (
                      videos.map((video) => (
                        <div
                          key={video.id}
                          data-testid={`video-item-${video.id}`}
                          className="bg-slate-800 rounded-lg p-4 flex items-center justify-between hover:bg-slate-750 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="bg-blue-600/20 rounded-lg p-2">
                              <Play className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                              <p className="text-white font-medium text-sm">{video.filename}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className={`text-xs px-2 py-1 rounded ${
                                  video.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                                  video.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
                                  video.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                  'bg-slate-700 text-slate-400'
                                }`}>
                                  {video.status}
                                </span>
                                <span className="text-xs text-slate-400">{video.duration.toFixed(1)}s</span>
                                {video.total_violations > 0 && (
                                  <span className="text-xs text-red-400">{video.total_violations} violations</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {video.status === 'completed' && (
                            <Button
                              data-testid={`download-video-${video.id}`}
                              size="sm"
                              onClick={() => handleDownload(video.id)}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Photos Tab */}
          <TabsContent value="photos" className="mt-6">
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <PhotoUpload onUpload={handlePhotoUpload} loading={photoLoading} />
              </div>
              <div className="lg:col-span-2">
                <Card className="bg-slate-900 border-slate-800 p-6">
                  <h3 className="text-lg font-bold text-white mb-4">Uploaded Photos</h3>
                  <div className="space-y-3">
                    {photos.length === 0 ? (
                      <p className="text-slate-400 text-center py-8">No photos uploaded yet</p>
                    ) : (
                      photos.map((photo) => (
                        <div
                          key={photo.id}
                          data-testid={`photo-item-${photo.id}`}
                          className="bg-slate-800 rounded-lg p-4 flex items-center justify-between hover:bg-slate-750 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="bg-blue-600/20 rounded-lg p-2">
                              <ImageIcon className="w-5 h-5 text-blue-400" />
                            </div>
                            <div>
                              <p className="text-white font-medium text-sm">{photo.filename}</p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className={`text-xs px-2 py-1 rounded ${
                                  photo.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                                  photo.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
                                  photo.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                  'bg-slate-700 text-slate-400'
                                }`}>
                                  {photo.status}
                                </span>
                                <span className="text-xs text-slate-400">{photo.width}x{photo.height}</span>
                                {photo.total_violations > 0 && (
                                  <span className="text-xs text-red-400">{photo.total_violations} violation(s)</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {photo.status === 'completed' && (
                            <Button
                              data-testid={`download-photo-${photo.id}`}
                              size="sm"
                              onClick={() => handleDownloadPhoto(photo.id)}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Violations Tab */}
          <TabsContent value="violations" className="mt-6">
            <ViolationsList 
              violations={violations} 
              videos={videos} 
              selectedDate={violationDate}
              onDateChange={setViolationDate}
            />
          </TabsContent>

          {/* E-Challan Tab */}
          <TabsContent value="echallan" className="mt-6">
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="lg:col-span-1">
                <EChallanList violations={violations} videos={videos} onChallanGenerated={loadData} />
              </div>
              <div className="lg:col-span-1">
                <ChallansList selectedDate={null} />
              </div>
            </div>
          </TabsContent>

          {/* Track Vehicle Tab */}
          <TabsContent value="track" className="mt-6">
            <VehicleTracker />
          </TabsContent>

          {/* Analytics Tab - Only load when tab is active for better performance */}
          <TabsContent value="analytics" className="mt-6">
            {activeTab === 'analytics' && <AnalyticsPanel />}
          </TabsContent>

          {/* Live Detection Tab */}
          <TabsContent value="live" className="mt-6">
            <LiveDetection
              onRecordingComplete={(videoId) => {
                loadData(true); // Force reload
              }}
              onViolationsDetected={() => {
                // Redirect to violations tab if violations found
                setActiveTab('violations');
                toast.info('Violations detected! Review them in the Violations tab.');
              }}
            />
          </TabsContent>

          {/* Calibration Tab */}
          <TabsContent value="calibration" className="mt-6">
            <CalibrationPanel onCalibrate={loadData} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
