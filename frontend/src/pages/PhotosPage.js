import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import PhotoUpload from '../components/PhotoUpload';
import DateFilter from '../components/DateFilter';
import { useData } from '../contexts/DataContext';
import { playNotificationSound } from '../utils/notificationSound';
import { format } from 'date-fns';


const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const PhotosPage = () => {
  const { photos, loadPhotos, refreshData, selectedDate, setSelectedDate } = useData();
  const [uploading, setUploading] = useState(false); // Only for upload, not processing
  const photoPollingIntervals = useRef({});
  const processingPhotos = useRef(new Set()); // Track photos being processed

  // Function to download processed image - uses the correct backend endpoint
  const downloadProcessedImage = useCallback(async (photoId, filename) => {
    try {
      // Use the correct backend endpoint that exists
      const response = await axios.get(`${API}/photos/${photoId}/download`, {
        withCredentials: true,
        responseType: 'blob',
        timeout: 20000 // 20 second timeout
      });
      
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
        // Fallback to opening in new tab if blob is empty
        window.open(`${API}/photos/${photoId}/download`, '_blank');
      }
    } catch (error) {
      console.error('Error downloading processed image:', error);
      // Fallback: open in new tab
      window.open(`${API}/photos/${photoId}/download`, '_blank');
    }
  }, []);




  // Photos-only lists for Uploaded and Processed columns


  const processedPhotos = React.useMemo(() => {
    // Only show photos that were uploaded manually by users.
    // For backward compatibility, if `uploaded_via` is not present, fall back to legacy checks (exclude video frames by flag, filename, or source_video_id).
    const completed = (photos || []).filter(p => p.status === 'completed' && (
      p.uploaded_via === 'upload' || (!p.uploaded_via && !(p.is_video_frame === true || p.source_video_id || (p.filename && p.filename.startsWith('frame_'))))
    )).slice();
    if (!selectedDate) return completed.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return completed.sort((a, b) => {
      const aMatch = (a.created_at && new Date(a.created_at).toISOString().split('T')[0] === dateKey) ? 0 : 1;
      const bMatch = (b.created_at && new Date(b.created_at).toISOString().split('T')[0] === dateKey) ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });
  }, [photos, selectedDate]);

  const [previewUrl, setPreviewUrl] = useState(null);
  // Background processing function - non-blocking
  const startBackgroundProcessing = useCallback((photoId) => {
    if (processingPhotos.current.has(photoId)) {
      return; // Already processing
    }
    
    processingPhotos.current.add(photoId);
    const startTime = Date.now();
    let pollCount = 0;
    
    // Poll for completion - optimized for speed (reduced from 800ms to 1500ms to reduce server load)
    photoPollingIntervals.current[photoId] = setInterval(async () => {
      try {
        pollCount++;
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        
        const photoRes = await axios.get(`${API}/photos/${photoId}`, { 
          withCredentials: true,
          timeout: 2000 // Reduced timeout
        });
        
        if (photoRes.data.status === 'completed' || photoRes.data.status === 'failed') {
          processingPhotos.current.delete(photoId);
          clearInterval(photoPollingIntervals.current[photoId]);
          delete photoPollingIntervals.current[photoId];
          
          if (photoRes.data.status === 'completed') {
            const violationCount = photoRes.data.total_violations || 0;
            toast.success(`✓ Processing complete! ${violationCount} violation(s) found.`, { duration: 3000 });
            playNotificationSound('success');
            
            // Don't auto-download - let user download manually if needed
            // This prevents errors if processed image isn't ready yet
          } else {
            toast.error('Processing failed');
            playNotificationSound('error');
          }
          refreshData();
        } else if (pollCount % 3 === 0 && elapsed > 5) {
          // Show progress every 3 polls after 5 seconds
          toast.info(`Processing... (${elapsed}s)`, { duration: 1500, id: `processing-${photoId}` });
        }
      } catch (error) {
        if (error.response?.status === 404) {
          processingPhotos.current.delete(photoId);
          clearInterval(photoPollingIntervals.current[photoId]);
          delete photoPollingIntervals.current[photoId];
          toast.error('Photo not found');
        }
        // Continue polling on other errors
      }
    }, 1500); // Poll every 1.5s (balanced between speed and server load)
  }, [refreshData]);

  // Load photos when date filter changes (uses cache if available)
  useEffect(() => {
    const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
    loadPhotos(false, dateStr);
    const intervals = photoPollingIntervals.current;
    return () => {
      Object.values(intervals).forEach(interval => {
        if (interval) clearInterval(interval);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, loadPhotos]);

  // Photos split into originals and processed for two-column view (already computed above)

  // Resume processing for any photos that are still processing
  useEffect(() => {
    photos.forEach(photo => {
      if (photo.status === 'processing' && !processingPhotos.current.has(photo.id)) {
        startBackgroundProcessing(photo.id);
      }
    });
  }, [photos, startBackgroundProcessing]);

  const handlePhotoUpload = async (file) => {
    setUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Upload photo
      const response = await axios.post(`${API}/photos/upload`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 30000 // Reduced timeout for faster feedback
      });
      
      const photoId = response.data.id;
      toast.success('Photo uploaded! Processing in background...', { duration: 2000 });
      
      // Release UI immediately - processing happens in background
      setUploading(false);
      refreshData(); // Show the new photo immediately
      
      // Start processing in background (fire and forget)
      axios.post(`${API}/photos/${photoId}/process`, null, {
        withCredentials: true,
        timeout: 10000 // Increased timeout to allow processing to start properly
      }).catch(err => {
        // Processing might still start even if request times out
        if (err.code !== 'ECONNABORTED') {
          console.error('Processing trigger error:', err.message);
        }
      });
      
      // Start background polling immediately
      startBackgroundProcessing(photoId);
      
    } catch (error) {
      setUploading(false);
      console.error('Upload error:', error);
      const errorMessage = error.response?.data?.detail || 
                          error.response?.data?.message || 
                          error.message || 
                          'Unknown error occurred';
      toast.error(`Upload failed: ${errorMessage}`);
    }
  };



  return (
    <div className="p-6">
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <PhotoUpload onUpload={handlePhotoUpload} loading={uploading} />
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
                  items={photos}
                  dateKey="created_at"
                />
                </div>
                <button
                  className="px-3 py-1 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                  onClick={async () => {
                    if (!window.confirm('Delete ALL uploaded photos and their records? This cannot be undone.')) return;
                    try {
                      await axios.delete(`${API}/photos/clear`, { withCredentials: true, timeout: 30000 });
                      toast.success('All photos cleared');
                      refreshData();
                    } catch (err) {
                      console.error('Clear photos failed', err);
                      toast.error('Failed to clear photos');
                    }
                  }}
                >
                  Delete All
                </button>
              </div>
            </div>
            {selectedDate && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                Showing photos from {format(selectedDate, 'dd MMMM yyyy')} ({processedPhotos.filter(p => p.created_at && new Date(p.created_at).toISOString().split('T')[0] === format(selectedDate, 'yyyy-MM-dd')).length} matched of {photos.length} photo{photos.length !== 1 ? 's' : ''})
              </p>
            )}
            <div>
              {/* Processed Photos column (single-column list) */}
              <div>
                <h5 className="text-sm font-semibold text-slate-800 dark:text-white mb-2">Processed Photos</h5>
                {processedPhotos.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">No processed photos found</p>
                ) : (
                  <div className="space-y-4 w-full">
                    {processedPhotos.map(photo => (
                      <div
                        key={`processed-photo-${photo.id}`}
                        role="button"
                        tabIndex={0}
                        aria-label={`Preview ${photo.filename}`}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setPreviewUrl(`${API}/photos/${photo.id}/download?type=processed`);
                          }
                        }}
                        className="w-full bg-slate-800 dark:bg-slate-800 rounded-lg p-3 flex items-center gap-4 justify-between hover:bg-slate-750 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
                        onClick={() => setPreviewUrl(`${API}/photos/${photo.id}/download?type=processed`)}
                      >
                        <div className="flex items-center gap-4">
                          <img
                            src={`${API}/photos/${photo.id}/download?type=processed`}
                            alt={photo.filename}
                            className="w-24 h-16 rounded object-cover"
                            loading="lazy"
                          />

                          <div>
                            <p title={photo.filename} className="text-white font-medium text-sm truncate max-w-[40rem]">
                              {photo.filename}
                            </p>
                            <div className="text-xs text-slate-400 mt-1">{photo.width}x{photo.height}</div>
                          </div>
                        </div>

                        <div>
                          <Button
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); downloadProcessedImage(photo.id, photo.filename); }}
                            className="bg-blue-600 hover:bg-blue-700 rounded-lg w-9 h-9 flex items-center justify-center"
                            aria-label={`Download processed image ${photo.filename}`}
                          >
                            <Download className="w-4 h-4 text-white" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Preview modal */}
            {previewUrl && (
              <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6" onClick={() => setPreviewUrl(null)}>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-2xl max-w-[80%] max-h-[80%] overflow-auto" onClick={(e) => e.stopPropagation()}>
                  <img src={previewUrl} alt="Preview" className="max-w-full max-h-[70vh] rounded" />
                  <div className="mt-3 text-right">
                    <Button
                      size="sm"
                      onClick={() => setPreviewUrl(null)}
                      className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700"
                    >
                      Close
                    </Button>
                  </div>
                </div>
              </div>
            )}

          </Card>
        </div>
      </div>
    </div>
  );
};

export default PhotosPage;

