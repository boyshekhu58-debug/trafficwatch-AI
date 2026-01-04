import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Video, Square, Camera, Download, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { playNotificationSound } from '../utils/notificationSound';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LiveDetection = ({ onRecordingComplete, onViolationsDetected }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [hasPermission, setHasPermission] = useState(null);
  
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const recordingStartTimeRef = useRef(null);

  useEffect(() => {
    // Ensure video plays when stream is set
    if (videoRef.current && streamRef.current && isStreaming) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(err => {
        console.error('Error playing video:', err);
      });
    }
  }, [isStreaming]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      stopStream();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStreaming(false);
  };

  const startWebcam = async () => {
    try {
      // Try user-facing camera first (front camera for seeing your face)
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user' // Front camera to see your face
          },
          audio: false
        });
      } catch (userError) {
        // Fallback to any available camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      }
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Ensure video plays
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(err => {
            console.error('Error playing video:', err);
          });
        };
        // Force play
        videoRef.current.play().catch(err => {
          console.error('Error playing video:', err);
        });
      }
      setIsStreaming(true);
      setHasPermission(true);
      toast.success('Camera access granted');
    } catch (error) {
      console.error('Error accessing webcam:', error);
      setHasPermission(false);
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        toast.error('Camera permission denied. Please allow camera access.');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        toast.error('No camera found. Please connect a camera.');
      } else {
        toast.error('Error accessing camera: ' + error.message);
      }
    }
  };

  const startRecording = async () => {
    if (!streamRef.current) {
      toast.error('Please start webcam first');
      return;
    }

    try {
      const options = {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 2500000
      };

      // Fallback to default if codec not supported
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm';
      }

      const mediaRecorder = new MediaRecorder(streamRef.current, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        await handleRecordingComplete(blob);
      };

      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);
      recordingStartTimeRef.current = Date.now();
      
      // Start timer
      timerRef.current = setInterval(() => {
        if (recordingStartTimeRef.current) {
          const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
          setRecordingTime(elapsed);
        }
      }, 1000);

      toast.success('Recording started');
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Error starting recording: ' + error.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Stop timer immediately
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      
      // Stop recording
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Reset timer display
      recordingStartTimeRef.current = null;
      setRecordingTime(0);
      
      toast.info('Recording stopped. Processing...');
    }
  };

  const handleRecordingComplete = async (blob) => {
    try {
      const formData = new FormData();
      
      // Create a File object - backend will handle the format
      // Use webm type since that's what MediaRecorder produces
      const file = new File([blob], `live_recording_${Date.now()}.webm`, {
        type: blob.type || 'video/webm'
      });
      
      formData.append('file', file);

      // Upload video
      const uploadResponse = await axios.post(`${API}/videos/upload`, formData, {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      toast.success('Recording uploaded successfully!');

      // Auto-save if enabled - download as MP4 (even though it's webm, browser will handle it)
      if (autoSave) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        // Save with .mp4 extension - browser will download it
        link.download = `live_recording_${Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        // Clean up after a delay to ensure download starts
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 100);
        toast.info('Recording saved to downloads');
      }

      // Start processing
      await axios.post(`${API}/videos/${uploadResponse.data.id}/process`, null, {
        withCredentials: true
      });

      toast.info('Processing started...');
      
      if (onRecordingComplete) {
        onRecordingComplete(uploadResponse.data.id);
      }

      // Poll for completion
      const videoId = uploadResponse.data.id;
      const checkStatus = setInterval(async () => {
        try {
          const videoRes = await axios.get(`${API}/videos/${videoId}`, { withCredentials: true });
          if (videoRes.data.status === 'completed' || videoRes.data.status === 'failed') {
            clearInterval(checkStatus);
            
            if (videoRes.data.status === 'completed') {
              const violationCount = videoRes.data.total_violations || 0;
              playNotificationSound('success');
              toast.success(`Processing complete! Found ${violationCount} violation(s).`);
              
              if (violationCount > 0 && onViolationsDetected) {
                setTimeout(() => {
                  onViolationsDetected();
                }, 1500);
              }
            } else {
              playNotificationSound('error');
              toast.error('Video processing failed');
            }
          }
        } catch (error) {
          clearInterval(checkStatus);
        }
      }, 2000);

    } catch (error) {
      console.error('Error uploading recording:', error);
      toast.error('Error uploading recording: ' + (error.response?.data?.detail || error.message));
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm p-6 rounded-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-xl p-2">
            <Camera className="w-6 h-6 text-indigo-500 dark:text-indigo-300" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">Live Detection</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Start a live camera feed and automatically detect traffic violations in real time.
            </p>
          </div>
        </div>

        {/* Video Preview */}
        <div
          className="relative bg-slate-900 rounded-2xl overflow-hidden mb-6"
          style={{ aspectRatio: '16/9', minHeight: '400px' }}
        >
          {isStreaming ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
              style={{ 
                width: '100%', 
                height: '100%',
                display: 'block',
                backgroundColor: '#000'
              }}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center bg-slate-900"
              style={{ minHeight: '400px' }}
            >
              <div className="text-center">
                <Camera className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-300">Camera feed will appear here</p>
              </div>
            </div>
          )}
          
          {/* Recording Indicator */}
          {isRecording && (
            <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 px-4 py-2 rounded-full z-10 shadow">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
              <span className="text-white font-semibold">
                REC {formatTime(recordingTime)}
              </span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            {!isStreaming ? (
              <Button onClick={startWebcam} className="bg-blue-600 hover:bg-blue-700 text-white" size="lg">
                <Camera className="w-5 h-5 mr-2" />
                Start Webcam
              </Button>
            ) : (
              <>
                {!isRecording ? (
                  <Button onClick={startRecording} className="bg-red-600 hover:bg-red-700 text-white" size="lg">
                    <Video className="w-5 h-5 mr-2" />
                    Start Recording
                  </Button>
                ) : (
                  <Button
                    onClick={stopRecording}
                    className="bg-red-600 hover:bg-red-700 text-white"
                    size="lg"
                  >
                    <Square className="w-5 h-5 mr-2" />
                    Stop Recording
                  </Button>
                )}
                <Button onClick={stopStream} variant="outline" className="border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800" size="lg">
                  Stop Webcam
                </Button>
              </>
            )}
          </div>

          {/* Auto-save Option - Show before recording starts */}
          <div className="flex items-center space-x-2 bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <Checkbox
              id="auto-save"
              checked={autoSave}
              onCheckedChange={(checked) => setAutoSave(checked)}
              className="border-slate-400 dark:border-slate-600"
              disabled={!isStreaming}
            />
            <label
              htmlFor="auto-save"
              className={`text-sm font-medium cursor-pointer flex items-center gap-2 ${
                isStreaming ? 'text-slate-700 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              <Download className="w-4 h-4" />
              Auto-save recording as MP4 file {!isStreaming && '(start webcam first)'}
            </label>
          </div>

          {/* Permission Status */}
          {hasPermission === false && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/40 rounded-xl p-4">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-200">
                <AlertTriangle className="w-5 h-5" />
                <p className="text-sm">
                  Camera permission denied. Please allow camera access in your browser settings and refresh the page.
                </p>
              </div>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <h4 className="text-slate-900 dark:text-white font-semibold mb-2">How it works</h4>
            <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1 list-disc list-inside">
              <li>Click "Start Webcam" to begin camera feed</li>
              <li>Click "Start Recording" to start capturing video</li>
              <li>Enable "Auto-save" to automatically download the recording</li>
              <li>Click "Stop Recording" when finished</li>
              <li>The recording will be automatically processed for violations</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default LiveDetection;

