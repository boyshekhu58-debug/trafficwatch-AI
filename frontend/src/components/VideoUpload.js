import React, { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Upload, Loader2 } from 'lucide-react';

const VideoUpload = ({ onUpload, loading }) => {
  const fileInputRef = useRef(null);
  const [progress, setProgress] = useState(0);

  // Camera recording state
  const [recording, setRecording] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [fastProcess, setFastProcess] = useState(false);
  const videoRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: true });
      mediaStreamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
    } catch (err) {
      console.error('Camera start failed', err);
      alert('Could not access camera. Please allow camera permissions or use the file picker.');
    }
  };

  const stopCamera = () => {
    const stream = mediaStreamRef.current;
    if (stream) stream.getTracks().forEach(t => t.stop());
    mediaStreamRef.current = null;
    setCameraActive(false);
  };

  const flipCamera = async () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
    stopCamera();
    await startCamera();
  };

  const startRecording = () => {
    if (!mediaStreamRef.current) return startCamera().then(() => startRecording());
    recordedChunksRef.current = [];
    const options = { mimeType: 'video/webm;codecs=vp9' };
    const mr = new MediaRecorder(mediaStreamRef.current, options);
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (e) => { if (e.data && e.data.size) recordedChunksRef.current.push(e.data); };
    mr.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const file = new File([blob], 'recording.webm', { type: 'video/webm' });
      await handleRecordedFile(file);
    };
    mr.start();
    setRecording(true);
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
    setRecording(false);
    // keep camera open so user can re-record or flip
  };

  const handleRecordedFile = async (file) => {
    const progressCb = (p) => setProgress(p);
    await onUpload(file, progressCb, { fast: fastProcess });
    setProgress(0);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
    const name = file.name || '';
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    const MAX_SIZE = 500 * 1024 * 1024; // 500MB

    if (!allowedExts.includes(ext) && !file.type.startsWith('video/')) {
      alert('Unsupported video format. Supported: MP4, MOV, AVI, MKV');
      return;
    }

    if (file.size > MAX_SIZE) {
      alert('Video too large. Please trim or compress and try again (max 500MB).');
      return;
    }

    const progressCb = (p) => setProgress(p);
    await onUpload(file, progressCb, { fast: fastProcess });
    setProgress(0);
  };

  return (
    <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm p-6 rounded-2xl">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Upload Video</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Upload traffic footage for automatic violation analysis.
      </p>
      <div className="space-y-4">
        <div
          data-testid="upload-dropzone"
          onClick={() => !loading && fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/60 dark:hover:bg-slate-800 transition-all"
        >
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <p className="text-slate-500 dark:text-slate-300">Uploading...</p>
              {progress > 0 && <p className="text-xs text-slate-400 mt-1">{progress}%</p>}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="bg-blue-500/10 rounded-full p-4">
                <Upload className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <p className="text-slate-900 dark:text-white font-medium">Click to select video</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Supported formats: MP4, AVI, MOV (max 500MB)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Recording/camera controls */}
        <div className="flex items-center gap-2">
          {!cameraActive ? (
            <>
              <button type="button" onClick={startCamera} className="px-3 py-1 bg-blue-600 text-white rounded">Use Camera</button>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-1 bg-slate-100 rounded">Choose File</button>
            </>
          ) : (
            <>
              {recording ? (
                <button type="button" onClick={stopRecording} className="px-3 py-1 bg-red-600 text-white rounded">Stop</button>
              ) : (
                <button type="button" onClick={startRecording} className="px-3 py-1 bg-green-600 text-white rounded">Record</button>
              )}
              <button type="button" onClick={flipCamera} className="px-3 py-1 bg-slate-100 rounded">Flip</button>
              <button type="button" onClick={stopCamera} className="px-3 py-1 bg-red-600 text-white rounded">Close</button>
            </>
          )}

          <label className="inline-flex items-center gap-2 text-xs">
            <input type="checkbox" checked={fastProcess} onChange={(e) => setFastProcess(e.target.checked)} />
            <span>Quick processing</span>
          </label>
        </div>

        {cameraActive && (
          <div className="mt-3">
            <video ref={videoRef} autoPlay playsInline muted className="w-[280px] h-auto rounded" />
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="video-file-input"
        />
      </div>
    </Card>
  );
};

export default VideoUpload;
