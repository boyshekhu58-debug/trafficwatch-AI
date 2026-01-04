#!/usr/bin/env python3
"""
Cleanup script to remove unnecessary files and cache to speed up the system.
Run this script to clean up:
- Python cache files (__pycache__)
- Old processed videos/photos (optional)
- Build artifacts
- Temporary files
"""

import os
import shutil
from pathlib import Path
from datetime import datetime, timedelta

ROOT_DIR = Path(__file__).parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"

def delete_pycache(directory):
    """Delete all __pycache__ directories"""
    deleted = 0
    for root, dirs, files in os.walk(directory):
        if '__pycache__' in root:
            try:
                shutil.rmtree(root)
                deleted += 1
                print(f"✓ Deleted: {root}")
            except Exception as e:
                print(f"✗ Error deleting {root}: {e}")
    return deleted

def delete_old_processed_files(directory, days_old=30, keep_recent=10):
    """Delete old processed files, keeping the most recent ones"""
    if not os.path.exists(directory):
        return 0
    
    files = []
    for file in os.listdir(directory):
        file_path = os.path.join(directory, file)
        if os.path.isfile(file_path):
            mtime = os.path.getmtime(file_path)
            files.append((file_path, mtime))
    
    # Sort by modification time (newest first)
    files.sort(key=lambda x: x[1], reverse=True)
    
    deleted = 0
    cutoff_time = (datetime.now() - timedelta(days=days_old)).timestamp()
    
    for i, (file_path, mtime) in enumerate(files):
        # Keep the most recent files
        if i < keep_recent:
            continue
        
        # Delete if older than cutoff
        if mtime < cutoff_time:
            try:
                os.remove(file_path)
                deleted += 1
                print(f"✓ Deleted old file: {os.path.basename(file_path)}")
            except Exception as e:
                print(f"✗ Error deleting {file_path}: {e}")
    
    return deleted

def cleanup_backend():
    """Clean backend cache and old files"""
    print("\n🧹 Cleaning Backend...")
    
    # Delete __pycache__
    pycache_count = delete_pycache(BACKEND_DIR)
    print(f"  Deleted {pycache_count} __pycache__ directories")
    
    # Clean old processed videos (keep last 10, delete older than 30 days)
    processed_dir = BACKEND_DIR / "processed"
    if processed_dir.exists():
        deleted = delete_old_processed_files(processed_dir, days_old=30, keep_recent=10)
        print(f"  Deleted {deleted} old processed videos")
    
    # Clean old processed photos
    processed_photos_dir = BACKEND_DIR / "processed_photos"
    if processed_photos_dir.exists():
        deleted = delete_old_processed_files(processed_photos_dir, days_old=30, keep_recent=20)
        print(f"  Deleted {deleted} old processed photos")
    
    # Clean old challan images (keep recent ones)
    challans_dir = BACKEND_DIR / "processed_challans"
    if challans_dir.exists():
        deleted = delete_old_processed_files(challans_dir, days_old=60, keep_recent=50)
        print(f"  Deleted {deleted} old challan files")
    
    # Delete old zip files
    zip_file = BACKEND_DIR / "processed_challans.zip"
    if zip_file.exists():
        try:
            os.remove(zip_file)
            print(f"  ✓ Deleted old zip file: {zip_file.name}")
        except Exception as e:
            print(f"  ✗ Error deleting zip: {e}")

def cleanup_frontend():
    """Clean frontend build artifacts and cache"""
    print("\n🧹 Cleaning Frontend...")
    
    # Delete build directory (can be regenerated)
    build_dir = FRONTEND_DIR / "build"
    if build_dir.exists():
        try:
            shutil.rmtree(build_dir)
            print(f"  ✓ Deleted build directory (can be regenerated with 'npm run build')")
        except Exception as e:
            print(f"  ✗ Error deleting build: {e}")
    
    # Note: node_modules is large but needed, so we don't delete it
    # Users can run 'npm install' if needed

def cleanup_test_reports():
    """Clean old test reports"""
    print("\n🧹 Cleaning Test Reports...")
    
    test_reports_dir = ROOT_DIR / "test_reports"
    if test_reports_dir.exists():
        deleted = delete_old_processed_files(test_reports_dir, days_old=7, keep_recent=3)
        print(f"  Deleted {deleted} old test report files")

def get_directory_size(path):
    """Get total size of directory in MB"""
    total = 0
    try:
        for dirpath, dirnames, filenames in os.walk(path):
            for filename in filenames:
                filepath = os.path.join(dirpath, filename)
                if os.path.exists(filepath):
                    total += os.path.getsize(filepath)
    except Exception:
        pass
    return total / (1024 * 1024)  # Convert to MB

def main():
    print("=" * 60)
    print("🧹 TrafficAI Cleanup Script")
    print("=" * 60)
    
    # Show sizes before cleanup
    print("\n📊 Current Directory Sizes:")
    if (BACKEND_DIR / "processed").exists():
        size = get_directory_size(BACKEND_DIR / "processed")
        print(f"  Processed videos: {size:.2f} MB")
    if (BACKEND_DIR / "processed_photos").exists():
        size = get_directory_size(BACKEND_DIR / "processed_photos")
        print(f"  Processed photos: {size:.2f} MB")
    if (BACKEND_DIR / "processed_challans").exists():
        size = get_directory_size(BACKEND_DIR / "processed_challans")
        print(f"  Processed challans: {size:.2f} MB")
    
    # Run cleanup
    cleanup_backend()
    cleanup_frontend()
    cleanup_test_reports()
    
    print("\n" + "=" * 60)
    print("✅ Cleanup Complete!")
    print("=" * 60)
    print("\n💡 Tips to speed up processing:")
    print("  - Video processing now skips frames (processes every 3rd frame)")
    print("  - Frontend polling optimized for faster updates")
    print("  - Run this cleanup script periodically to free up space")
    print()

if __name__ == "__main__":
    main()

