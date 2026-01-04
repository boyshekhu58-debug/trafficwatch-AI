import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Download, Image } from 'lucide-react';
import VideoUpload from '../components/VideoUpload';
import DateFilter from '../components/DateFilter';
import { useData } from '../contexts/DataContext';
import { playNotificationSound } from '../utils/notificationSound';
import { format } from 'date-fns';

// Note: The extract frames flow now supports a `save_frames` query parameter. If false, frames are processed transiently and not saved to Photos.

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const VideosPage = () => {
  const { videos, loadVideos, refreshData, selectedDate, setSelectedDate } = useData();
  const [loading, setLoading] = useState(false);
  const videoPollingIntervals = useRef({});

  // Load videos when date filter changes (uses cache if available)
  useEffect(() => {
    const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
    loadVideos(false, dateStr);
    const intervals = videoPollingIntervals.current;
    return () => {
      Object.values(intervals).forEach(interval => clearInterval(interval));
    };
  }, [selectedDate, loadVideos]);

  // Videos-only list for Processed column (we show processed videos only)
  const processedVideos = React.useMemo(() => {
    const completed = (videos || []).filter(v => v.status === 'completed').slice();
    if (!selectedDate) return completed.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return completed.sort((a, b) => {
      const aMatch = (a.created_at && new Date(a.created_at).toISOString().split('T')[0] === dateKey) ? 0 : 1;
      const bMatch = (b.created_at && new Date(b.created_at).toISOString().split('T')[0] === dateKey) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [videos, selectedDate]);

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
      
      await axios.post(`${API}/videos/${response.data.id}/process`, null, {
        withCredentials: true
      });
      
      toast.info('Processing started...');
      refreshData(); // Refresh all data
      
      const videoId = response.data.id;
      videoPollingIntervals.current[videoId] = setInterval(async () => {
        try {
          const videoRes = await axios.get(`${API}/videos/${videoId}`, { withCredentials: true });
          if (videoRes.data.status === 'completed' || videoRes.data.status === 'failed') {
            clearInterval(videoPollingIntervals.current[videoId]);
            delete videoPollingIntervals.current[videoId];
            
            if (videoRes.data.status === 'completed') {
              const violationCount = videoRes.data.total_violations || 0;
              toast.success(`Video processing complete! Found ${violationCount} violation(s).`);
              playNotificationSound('success');
            } else {
              toast.error('Video processing failed');
              playNotificationSound('error');
            }
            refreshData(); // Refresh all data
          }
        } catch (error) {
          clearInterval(videoPollingIntervals.current[videoId]);
          delete videoPollingIntervals.current[videoId];
        }
      }, 2000);
    } catch (error) {
      toast.error('Upload failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (videoId) => {
    try {
      window.open(`${API}/videos/${videoId}/download`, '_blank');
    } catch (error) {
      toast.error('Download failed');
    }
  };

  const handleExtractFrames = async (videoId) => {
    const intervalInput = window.prompt('Interval between frames in seconds', '1');
    if (intervalInput === null) return;
    const interval = parseFloat(intervalInput) || 1;
    const save = window.confirm('Save extracted frames to Photos? OK = save (appear in Photos, marked internal). Cancel = process transiently (do NOT save frames).');
    try {
      const res = await axios.post(`${API}/videos/${videoId}/extract_frames?interval_sec=${encodeURIComponent(interval)}&save_frames=${save}`, null, { withCredentials: true });
      toast.success(`Extraction started (saved: ${res.data.saved || 0}, processed: ${res.data.processed || 0})`);
      refreshData();
    } catch (err) {
      console.error('Extraction failed', err);
      toast.error('Failed to start extraction');
    }
  };

  // Frames panel state & handlers
  const [selectedVideoId, setSelectedVideoId] = useState(null);
  const [framesByVideo, setFramesByVideo] = useState({});
  const [framesLoading, setFramesLoading] = useState(false);

  const handleToggleFrames = async (videoId) => {
    if (selectedVideoId === videoId) {
      setSelectedVideoId(null);
      return;
    }
    // If cached, just show
    if (framesByVideo[videoId]) {
      setSelectedVideoId(videoId);
      return;
    }
    setFramesLoading(true);
    try {
      // Request frames for this video (backend will match explicit source_video_id and fallback legacy 'frame_' files in video's time window)
      const res = await axios.get(`${API}/frames?video_id=${videoId}`, { withCredentials: true });
      setFramesByVideo(prev => ({ ...prev, [videoId]: res.data }));
      setSelectedVideoId(videoId);
      // Give feedback about number of frames found
      if (Array.isArray(res.data)) {
        if (res.data.length === 0) toast.info('No saved frames found for this video');
        else toast.success(`${res.data.length} frame(s) loaded`);
      }
    } catch (err) {
      console.error('Failed to load frames', err);
      toast.error('Failed to load frames');
    } finally {
      setFramesLoading(false);
    }
  };

  const downloadFrame = async (photoId, filename) => {
    try {
      const response = await axios.get(`${API}/photos/${photoId}/download`, { withCredentials: true, responseType: 'blob' });
      if (response.data && response.data.size > 0) {
        const blob = new Blob([response.data], { type: response.headers['content-type'] || 'image/jpeg' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || `processed_${photoId}.jpg`;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }, 100);
      } else {
        window.open(`${API}/photos/${photoId}/download`, '_blank');
      }
    } catch (err) {
      console.error('Frame download failed', err);
      window.open(`${API}/photos/${photoId}/download`, '_blank');
    }
  };



  return (
    <div className="p-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <VideoUpload onUpload={handleVideoUpload} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <div />
              <div className="flex items-center gap-2">
                <div className="w-64">
                  <DateFilter 
                    selectedDate={selectedDate} 
                    onDateChange={setSelectedDate}
                    items={videos}
                    dateKey="created_at"
                  />
                </div>
                <button
                  className="px-3 py-1 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                  onClick={async () => {
                    if (!window.confirm('Delete ALL uploaded videos and their records? This cannot be undone.')) return;
                    try {
                      await axios.delete(`${API}/videos/clear`, { withCredentials: true, timeout: 30000 });
                      toast.success('All videos cleared');
                      refreshData();
                    } catch (err) {
                      console.error('Clear videos failed', err);
                      toast.error('Failed to clear videos');
                    }
                  }}
                >
                  Delete All
                </button>
              </div>
            </div>
            {selectedDate && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Showing videos from {format(selectedDate, 'dd MMMM yyyy')} ({processedVideos.filter(v => v.created_at && new Date(v.created_at).toISOString().split('T')[0] === format(selectedDate, 'yyyy-MM-dd')).length} matched of {(videos || []).length} video{(videos || []).length !== 1 ? 's' : ''})
              </p>
            )}
            <div className="space-y-3">
              <div>
                <h5 className="text-sm font-semibold text-slate-800 dark:text-white mb-2">Processed Videos</h5>
                {processedVideos.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">No processed videos found</p>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 space-y-3">
                      {processedVideos.map(video => (
                        <div key={`processed-video-${video.id}`} className="bg-slate-800 dark:bg-slate-800 rounded-lg p-3 flex items-center justify-between hover:bg-slate-750 transition-colors">
                          <div className="flex items-center gap-3">
                            <video className="w-40 h-24 rounded object-cover" controls src={`${API}/videos/${video.id}/download`} />
                            <div>
                              <p className="text-white font-medium text-sm">{video.filename}</p>
                              <div className="text-xs text-slate-400">{video.duration?.toFixed(1)}s • {video.total_violations || 0} violations</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={() => handleDownload(video.id)} className="bg-blue-600 hover:bg-blue-700">
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button size="sm" onClick={() => handleToggleFrames(video.id)} className={`bg-sky-600 hover:bg-sky-700 ${selectedVideoId === video.id ? 'ring-2 ring-sky-400' : ''}`}>
                              Frames
                            </Button>
                            <Button size="sm" onClick={() => handleExtractFrames(video.id)} className="bg-emerald-600 hover:bg-emerald-700">
                              <Image className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="col-span-1 bg-slate-800 dark:bg-slate-800 rounded-lg p-3">
                      <h6 className="text-sm font-semibold text-white mb-3">Auto extracted frames</h6>
                      {selectedVideoId && (() => {
                        const v = processedVideos.find(x => x.id === selectedVideoId);
                        return v ? (
                          <div className="mb-2">
                            <div className="text-xs text-slate-300">Frames for</div>
                            <div className="flex items-center gap-2 mt-1">
                              <video className="w-24 h-12 rounded object-cover" controls src={`${API}/videos/${v.id}/download`} />
                              <div className="text-sm text-white">{v.filename}</div>
                            </div>
                          </div>
                        ) : null;
                      })()}

                      {framesLoading ? (
                        <p className="text-sm text-slate-400">Loading frames...</p>
                      ) : !selectedVideoId ? (
                        <p className="text-sm text-slate-400">Select a video to view its extracted frames</p>
                      ) : (framesByVideo[selectedVideoId] && framesByVideo[selectedVideoId].length > 0 ? (
                        <div className="space-y-2 overflow-y-auto max-h-96">
                          {framesByVideo[selectedVideoId].map(photo => (
                            <div key={photo.id} className="flex items-center gap-2 bg-slate-700 p-2 rounded">
                              <img alt={photo.filename} src={`${API}/photos/${photo.id}/download`} className="w-20 h-12 object-cover rounded" />
                              <div className="flex-1">
                                <div className="text-xs text-white">{photo.filename}</div>
                                <div className="text-xs text-slate-400">{photo.created_at ? new Date(photo.created_at).toLocaleString() : ''}</div>
                              </div>
                              <Button size="xs" onClick={() => downloadFrame(photo.id, photo.filename)} className="bg-blue-600 hover:bg-blue-700">
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">No frames saved for this video.</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default VideosPage;

