import { useEffect, useState, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import LandingPage from "./pages/LandingPage";
import HomePage from "./pages/HomePage";
import VideosPage from "./pages/VideosPage";
import PhotosPage from "./pages/PhotosPage";
import ViolationsPage from "./pages/ViolationsPage";
import EChallanPage from "./pages/EChallanPage";
import LiveDetectionPage from "./pages/LiveDetectionPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import CalibrationPage from "./pages/CalibrationPage";

import SettingsPage from "./pages/SettingsPage";
import NotificationsPage from "./pages/NotificationsPage";
import Layout from "./components/Layout";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider.jsx";
import { DataProvider } from "./contexts/DataContext";
import { TooltipProvider } from '@/components/ui/tooltip';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    // Check for session_id in URL fragment
    const hash = window.location.hash;
    if (hash && hash.includes('session_id=')) {
      const sessionId = hash.split('session_id=')[1].split('&')[0];
      await handleSessionId(sessionId);
      // Clean URL
      window.history.replaceState(null, '', window.location.pathname);
      return;
    }

    // Check existing session
    try {
      const response = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(response.data);
    } catch (error) {
      // 401 is expected when not authenticated - silently handle it
      if (error.response?.status !== 401) {
        console.error('Auth check error:', error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const handleSessionId = async (sessionId) => {
    try {
      await axios.post(`${API}/auth/session`, null, {
        params: { session_id: sessionId },
        withCredentials: true
      });
      const response = await axios.get(`${API}/auth/me`, { withCredentials: true });
      setUser(response.data);
    } catch (error) {
      console.error('Auth error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <DataProvider>
        <div className="App">
          <Toaster position="top-right" />
          <TooltipProvider>
            <BrowserRouter>
              <Routes>
            <Route path="/" element={user ? <Navigate to="/dashboard" /> : <LandingPage />} />
            <Route
              path="/dashboard"
              element={user ? (
                <Layout user={user} setUser={setUser}>
                  <HomePage />
                </Layout>
              ) : (
                <Navigate to="/" />
              )}
            />
            <Route
              path="/dashboard/videos"
              element={user ? (
                <Layout user={user} setUser={setUser}>
                  <VideosPage />
                </Layout>
              ) : (
                <Navigate to="/" />
              )}
            />
            <Route
              path="/dashboard/photos"
              element={user ? (
                <Layout user={user} setUser={setUser}>
                  <PhotosPage />
                </Layout>
              ) : (
                <Navigate to="/" />
              )}
            />
            <Route
              path="/dashboard/violations"
              element={user ? (
                <Layout user={user} setUser={setUser}>
                  <ViolationsPage />
                </Layout>
              ) : (
                <Navigate to="/" />
              )}
            />
            <Route
              path="/dashboard/echallan"
              element={user ? (
                <Layout user={user} setUser={setUser}>
                  <EChallanPage />
                </Layout>
              ) : (
                <Navigate to="/" />
              )}
            />
            <Route
              path="/dashboard/live"
              element={user ? (
                <Layout user={user} setUser={setUser}>
                  <LiveDetectionPage />
                </Layout>
              ) : (
                <Navigate to="/" />
              )}
            />

            <Route
              path="/dashboard/analytics"
              element={user ? (
                <Layout user={user} setUser={setUser}>
                  <AnalyticsPage />
                </Layout>
              ) : (
                <Navigate to="/" />
              )}
            />

            <Route
              path="/dashboard/notifications"
              element={user ? (
                <Layout user={user} setUser={setUser}>
                  <NotificationsPage />
                </Layout>
              ) : (
                <Navigate to="/" />
              )}
            />
            <Route
              path="/dashboard/settings"
              element={user ? (
                <Layout user={user} setUser={setUser}>
                  <SettingsPage />
                </Layout>
              ) : (
                <Navigate to="/" />
              )}
            />
            <Route
              path="/dashboard/calibration"
              element={user ? (
                <Layout user={user} setUser={setUser}>
                  <CalibrationPage />
                </Layout>
              ) : (
                <Navigate to="/" />
              )}
            />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </div>
      </DataProvider>
    </ThemeProvider>
  );
}

export default App;
