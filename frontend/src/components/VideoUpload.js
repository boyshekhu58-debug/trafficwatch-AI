import React, { useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Upload, Loader2 } from 'lucide-react';

const VideoUpload = ({ onUpload, loading }) => {
  const fileInputRef = useRef(null);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Basic validation: allow common video formats and limit size
    const allowedExts = ['.mp4', '.mov', '.avi', '.mkv'];
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
    await onUpload(file, progressCb);
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
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="video-file-input"
        />
      </div>
    </Card>
  );
};

export default VideoUpload;
