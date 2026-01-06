import React, { useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2, Image as ImageIcon } from 'lucide-react';

const PhotoUpload = ({ onUpload, loading }) => {
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        alert('Invalid file type. Please upload JPG, PNG, BMP, or WEBP images.');
        return;
      }
      
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('File size too large. Please upload an image smaller than 10MB.');
        return;
      }
      
      onUpload(file);
    }
  };

  return (
    <Card className="bg-white border-slate-200 p-6 shadow-sm">
      <h3 className="text-lg font-bold text-slate-900 mb-4">Upload Photo</h3>
      <div className="space-y-4">
        <div
          data-testid="photo-upload-dropzone"
          onClick={() => !loading && fileInputRef.current?.click()}
          className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-slate-50 transition-all shadow-sm"
        >
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <p className="text-slate-700">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="bg-white rounded-full p-4 shadow">
                <ImageIcon className="w-8 h-8 text-slate-900" />
              </div>
              <div>
                <p className="text-slate-900 font-medium">Click to upload photo</p>
                <p className="text-xs text-slate-500 mt-1">JPG, PNG, BMP, WEBP supported (max 10MB)</p>
              </div>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/bmp,image/webp"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="photo-file-input"
        />
      </div>
    </Card>
  );
};

export default PhotoUpload;

